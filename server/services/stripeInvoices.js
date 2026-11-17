// Mirrors Stripe invoices into our own `invoices` table (used by the webhook and the manual sync).
const pool           = require('../db/pool');
const stripeService  = require('./stripeService');
const invoiceService = require('./invoiceService');

// Stripe moved several Invoice fields in newer API versions (the version a webhook endpoint
// sends depends on the endpoint's Dashboard setting, not the SDK). Read both shapes.
const invoiceSubscriptionId = (inv) => {
  const sub = inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;
  return sub && typeof sub === 'object' ? sub.id : sub;
};
const invoicePaymentIntent = (inv) => {
  const pi = inv.payment_intent ?? null;
  return pi && typeof pi === 'object' ? pi.id : pi;
};
const invoiceTax = (inv) => {
  if (inv.tax != null) return inv.tax / 100;
  return ((inv.total_taxes ?? inv.total_tax_amounts) || []).reduce((s, t) => s + (t.amount || 0), 0) / 100;
};
const isoDate = (unix) => new Date(unix * 1000).toISOString().split('T')[0];

// The invoice-level period_start/period_end is the PREVIOUS cycle on renewal invoices (Stripe
// bills in advance), so the service period comes from the subscription line item. The charge
// date is the invoice's creation (auto-charged invoices have no due_date), and paid_at is when
// Stripe actually collected it — not when we happened to record it.
const invoiceDates = (inv) => {
  const lines = inv.lines?.data || [];
  const line  = lines.find(l => l.type === 'subscription') || lines[0];
  const paid  = inv.status_transitions?.paid_at;
  return {
    periodStart: isoDate(line?.period?.start || inv.period_start || inv.created),
    periodEnd:   isoDate(line?.period?.end   || inv.period_end   || inv.created),
    dueDate:     isoDate(inv.due_date || inv.created),
    paidAt:      paid ? new Date(paid * 1000) : null,
  };
};

// `current_period_start`/`current_period_end` used to live on the Subscription
// object itself; newer Stripe API versions moved them onto each subscription
// item instead. Which shape a webhook payload uses depends on the API
// version the *webhook endpoint* is configured with in the Dashboard (not
// the stripe-node SDK version), so read both shapes defensively.
function getSubscriptionPeriod(stripeSub) {
  const start = stripeSub.current_period_start ?? stripeSub.items?.data?.[0]?.current_period_start;
  const end   = stripeSub.current_period_end   ?? stripeSub.items?.data?.[0]?.current_period_end;
  if (!start || !end) return null;
  return { periodStart: isoDate(start), periodEnd: isoDate(end) };
}

// Stripe has more subscription states than our ENUM — collapse them. Unknown ones (e.g. paused) keep the local status.
const LOCAL_SUB_STATUS = {
  active: 'active', trialing: 'active',
  past_due: 'past_due', unpaid: 'past_due', incomplete: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled',
};
const willRenew = (stripeSub) => LOCAL_SUB_STATUS[stripeSub.status] !== 'canceled' && !stripeSub.cancel_at_period_end;

// Write Stripe's view of a subscription (status + billing period) onto our row.
// next_invoice_date is cleared when Stripe won't charge again (canceled / cancel at period end).
async function applySubscriptionState(stripeSub) {
  const period = getSubscriptionPeriod(stripeSub);
  const status = LOCAL_SUB_STATUS[stripeSub.status] || null;
  await pool.query(
    `UPDATE server_subscriptions
     SET status               = COALESCE(?, status),
         current_period_start = COALESCE(?, current_period_start),
         current_period_end   = COALESCE(?, current_period_end),
         next_invoice_date    = ?,
         canceled_at          = IF(? = 'canceled', COALESCE(canceled_at, NOW()), canceled_at)
     WHERE stripe_subscription_id = ?`,
    [status, period?.periodStart || null, period?.periodEnd || null,
     willRenew(stripeSub) ? period?.periodEnd || null : null, status, stripeSub.id]
  );
}

// The next charge Stripe will actually make for a subscription (amount incl. tax/discounts, date).
// Also refreshes the local row so a missed webhook can't leave it stale. Returns null if it won't renew.
async function fetchUpcomingCharge(stripeSubscriptionId) {
  const stripeSub = await stripeService.stripe.subscriptions.retrieve(stripeSubscriptionId);
  await applySubscriptionState(stripeSub);
  if (!willRenew(stripeSub)) return null;

  let inv;
  try {
    inv = await stripeService.stripe.invoices.retrieveUpcoming({ subscription: stripeSubscriptionId });
  } catch (e) {
    if (e.code === 'invoice_upcoming_none') return null;
    throw e;
  }
  const period = getSubscriptionPeriod(stripeSub);
  return {
    subtotal: (inv.subtotal || 0) / 100,
    total:    (inv.total || 0) / 100,
    tax:      invoiceTax(inv),
    currency: inv.currency,
    due_date: inv.next_payment_attempt ? isoDate(inv.next_payment_attempt) : period?.periodEnd || null,
    status:   LOCAL_SUB_STATUS[stripeSub.status] === 'past_due' ? 'past_due' : 'upcoming',
  };
}

// Returns { invoice, created } — invoice is null when it isn't one of our subscriptions.
async function findOrCreateLocalInvoice(stripeInvoice, { paidNow }) {
  const [[existing]] = await pool.query('SELECT * FROM invoices WHERE stripe_invoice_id = ?', [stripeInvoice.id]);
  if (existing) return { invoice: existing, created: false };

  const stripeSubId = invoiceSubscriptionId(stripeInvoice);
  if (!stripeSubId) {
    console.warn(`[Stripe] Invoice ${stripeInvoice.id} has no subscription reference — not recorded`);
    return { invoice: null, created: false };
  }
  const [[subscription]] = await pool.query('SELECT * FROM server_subscriptions WHERE stripe_subscription_id = ?', [stripeSubId]);
  if (!subscription) {
    console.warn(`[Stripe] Invoice ${stripeInvoice.id}: no local subscription for ${stripeSubId} — not recorded`);
    return { invoice: null, created: false };
  }

  const invoice = await invoiceService.recordInitialInvoice({
    subscriptionId: subscription.id, projectId: subscription.project_id,
    ...invoiceDates(stripeInvoice),
    subtotal: (stripeInvoice.subtotal || 0) / 100,
    total: (stripeInvoice.total || 0) / 100,
    amountPaid: (stripeInvoice.amount_paid || 0) / 100,
    lineItems: (stripeInvoice.lines?.data || []).map(l => ({
      description: l.description || 'Server Maintenance',
      amount: (l.amount || 0) / 100,
    })),
    stripeInvoiceId: stripeInvoice.id,
    stripeHostedUrl: stripeInvoice.hosted_invoice_url,
    stripePaymentIntentId: invoicePaymentIntent(stripeInvoice),
    paid: paidNow,
    currency: stripeInvoice.currency || subscription.currency || 'usd',
    tax: invoiceTax(stripeInvoice),
  });
  return { invoice, created: true };
}

// Pull every paid invoice for our live subscriptions from Stripe and record/mark any we missed,
// correct the dates on ones already recorded, and refresh each subscription's status/billing period.
async function syncPaidInvoices() {
  const [subs] = await pool.query(
    `SELECT stripe_subscription_id FROM server_subscriptions WHERE stripe_subscription_id IS NOT NULL`);
  const summary = { subscriptions: subs.length, recorded: 0, markedPaid: 0, datesFixed: 0, errors: [] };

  for (const { stripe_subscription_id: subId } of subs) {
    try {
      await applySubscriptionState(await stripeService.stripe.subscriptions.retrieve(subId));
      for await (const inv of stripeService.stripe.invoices.list({ subscription: subId, status: 'paid', limit: 100 })) {
        const { invoice, created } = await findOrCreateLocalInvoice(inv, { paidNow: true });
        if (!invoice) continue;
        if (created) { summary.recorded++; continue; }
        if (invoice.status !== 'paid') {
          await invoiceService.markInvoicePaid(invoice.id, {
            stripePaymentIntentId: invoicePaymentIntent(inv),
            amountPaid: (inv.amount_paid || 0) / 100,
            paidAt: invoiceDates(inv).paidAt,
          });
          summary.markedPaid++;
        }
        const { periodStart, periodEnd, dueDate, paidAt } = invoiceDates(inv);
        const [r] = await pool.query(
          `UPDATE invoices SET period_start = ?, period_end = ?, due_date = ?, paid_at = COALESCE(?, paid_at)
           WHERE id = ? AND NOT (period_start <=> ? AND period_end <=> ? AND due_date <=> ? AND (? IS NULL OR paid_at <=> ?))`,
          [periodStart, periodEnd, dueDate, paidAt, invoice.id, periodStart, periodEnd, dueDate, paidAt, paidAt]
        );
        if (r.affectedRows) summary.datesFixed++;
      }
    } catch (e) {
      summary.errors.push(e.code === 'resource_missing'
        ? `${subId}: not found in the connected Stripe account`
        : `${subId}: ${e.message}`);
    }
  }
  return summary;
}

module.exports = {
  findOrCreateLocalInvoice, syncPaidInvoices, invoicePaymentIntent, invoiceTax, invoiceDates,
  getSubscriptionPeriod, applySubscriptionState, fetchUpcomingCharge,
};
