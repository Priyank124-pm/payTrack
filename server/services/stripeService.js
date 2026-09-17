const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

// Stripe wants integer cents — keep all conversion in one place to avoid float drift.
const toCents = (amount) => Math.round(Number(amount || 0) * 100);

// Stripe's recurring price only knows day/week/month/year — quarterly and
// half-yearly are expressed as a month interval with a count.
const RECURRING_BY_INTERVAL = {
  month:     { interval: 'month', interval_count: 1 },
  quarter:   { interval: 'month', interval_count: 3 },
  half_year: { interval: 'month', interval_count: 6 },
  year:      { interval: 'year',  interval_count: 1 },
};
const toStripeRecurring = (billingInterval) => RECURRING_BY_INTERVAL[billingInterval] || RECURRING_BY_INTERVAL.month;

// `deal.monthly_price` is always the MONTHLY rate — a quarterly/half-yearly/
// yearly plan bills that rate times however many months are in the cycle,
// not the bare monthly figure once per cycle.
const CYCLE_MONTHS = { month: 1, quarter: 3, half_year: 6, year: 12 };
const cycleAmount = (monthlyPrice, billingInterval) => Number(monthlyPrice || 0) * (CYCLE_MONTHS[billingInterval] || 1);

// ── Checkout Session (subscription mode) ───────────────────────
// Recurring monthly/yearly price + an optional one-time setup fee line.
async function createCheckoutSession({ deal, project, customerEmail }) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const lineItems = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: `${deal.plan_name} — ${project.name}` },
        unit_amount: toCents(cycleAmount(deal.monthly_price, deal.billing_interval)),
        recurring: toStripeRecurring(deal.billing_interval),
      },
      quantity: 1,
    },
  ];

  if (Number(deal.setup_fee) > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: `Setup Fee — ${project.name}` },
        unit_amount: toCents(deal.setup_fee),
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: lineItems,
    customer_email: customerEmail || undefined,
    success_url: `${clientUrl}/?checkout=success&deal=${deal.id}`,
    cancel_url:  `${clientUrl}/?checkout=cancel&deal=${deal.id}`,
    metadata: { deal_id: deal.id, project_id: project.id },
    subscription_data: {
      metadata: { deal_id: deal.id, project_id: project.id },
    },
  });

  return session;
}

// ── Public site: fixed-catalog plan checkout (no project/deal involved) ──
// Stripe's own hosted Checkout page collects the customer's email — we never
// ask for it ourselves, so no email is passed in here.
async function createPlanCheckoutSession({ planName, amount, billingInterval, successUrl, cancelUrl, metadata }) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: planName },
        unit_amount: toCents(amount),
        recurring: toStripeRecurring(billingInterval),
      },
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

async function retrieveSession(sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId);
}

async function retrieveCustomer(customerId) {
  return stripe.customers.retrieve(customerId);
}

async function retrieveInvoice(invoiceId) {
  return stripe.invoices.retrieve(invoiceId);
}

async function cancelSubscription(stripeSubscriptionId) {
  return stripe.subscriptions.cancel(stripeSubscriptionId);
}

// The Checkout subscription exists to capture the customer + payment method
// on file — NexPortal drives actual billing cadence/amount itself (so carry-
// forward totals can be folded in), so Stripe's own automatic invoicing on
// that subscription is paused right after it's created.
async function pauseSubscriptionCollection(stripeSubscriptionId) {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    pause_collection: { behavior: 'void' },
  });
}

// One Stripe Invoice per NexPortal invoice (base price + any carried-forward
// line items already folded into `lineItems` by invoiceService). Uses
// collection_method 'send_invoice' so the client pays via the hosted "Pay
// Now" link rather than an automatic off-session charge.
async function createAndSendInvoice({ customerId, lineItems, daysUntilDue = 1 }) {
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    auto_advance: true,
  });

  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: toCents(item.amount),
      currency: 'usd',
      description: item.description,
    });
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await stripe.invoices.sendInvoice(invoice.id);
  return finalized;
}

function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  stripe,
  toCents,
  cycleAmount,
  createCheckoutSession,
  createPlanCheckoutSession,
  retrieveSession,
  retrieveCustomer,
  retrieveInvoice,
  cancelSubscription,
  pauseSubscriptionCollection,
  createAndSendInvoice,
  constructWebhookEvent,
};
