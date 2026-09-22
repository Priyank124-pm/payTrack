const express = require('express');
const pool = require('../db/pool');
const stripeService = require('../services/stripeService');
const invoiceService = require('../services/invoiceService');
const { logActivity } = require('../services/logger');
const { notify } = require('../services/notifyService');

const router = express.Router();

// `current_period_start`/`current_period_end` used to live on the Subscription
// object itself; newer Stripe API versions moved them onto each subscription
// item instead. Which shape a webhook payload uses depends on the API
// version the *webhook endpoint* is configured with in the Dashboard (not
// the stripe-node SDK version), so read both shapes defensively rather than
// assuming one — this is what was crashing `handleSubscriptionCreated` with
// "Invalid time value" when the top-level fields were absent.
function getSubscriptionPeriod(stripeSub) {
  const start = stripeSub.current_period_start ?? stripeSub.items?.data?.[0]?.current_period_start;
  const end   = stripeSub.current_period_end   ?? stripeSub.items?.data?.[0]?.current_period_end;
  if (!start || !end) return null;
  return {
    periodStart: new Date(start * 1000).toISOString().split('T')[0],
    periodEnd:   new Date(end * 1000).toISOString().split('T')[0],
  };
}

// No `authenticate` here — Stripe signs requests with `stripe-signature`,
// not a JWT. Must be mounted with express.raw() (see server/index.js),
// BEFORE the global express.json() parser, or signature verification fails.
router.post('/', async (req, res) => {
  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Dedupe — Stripe redelivers on timeout/non-2xx, and may send the same event twice.
  try {
    await pool.query(
      'INSERT INTO stripe_webhook_events (id, stripe_event_id, event_type) VALUES (UUID(), ?, ?)',
      [event.id, event.type]
    );
  } catch (e) {
    console.log(`[Stripe webhook] Duplicate event ${event.id}, skipping`);
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': await handleCheckoutCompleted(event.data.object); break;
      case 'customer.subscription.created': await handleSubscriptionCreated(event.data.object); break;
      case 'customer.subscription.updated': await handleSubscriptionUpdated(event.data.object); break;
      case 'invoice.payment_succeeded': await handleInvoicePaymentSucceeded(event.data.object); break;
      case 'invoice.payment_failed': await handleInvoicePaymentFailed(event.data.object); break;
      case 'customer.subscription.deleted': await handleSubscriptionDeleted(event.data.object); break;
      default: /* ignore other event types */ break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[Stripe webhook] Handler error for ${event.type}:`, err);
    // Still 200 — the DB write already happened; retrying won't fix an application bug,
    // and we don't want Stripe hammering the endpoint with redeliveries.
    res.json({ received: true, error: true });
  }
});

async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription' || !session.subscription) return;

  let dealId = session.metadata?.deal_id;
  let project = null;

  if (!dealId && session.metadata?.source === 'public_signup') {
    // Public-site self-serve plan purchase — nothing exists yet. Only create
    // the project/deal once payment is confirmed (here), so an abandoned
    // Stripe checkout never leaves a stray "paid" deal behind.
    const created = await createDealFromPublicSignup(session);
    if (!created) return;
    dealId = created.deal.id;
    project = created.project;
  }
  if (!dealId) return;

  const [existing] = await pool.query('SELECT id FROM server_subscriptions WHERE deal_id = ?', [dealId]);
  if (existing.length) return; // already created (e.g. redelivered event)

  const [[deal]] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [dealId]);
  if (!deal) return;
  if (!project) {
    const [[p]] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
    project = p;
  }

  await activateSubscription({ deal, project, session });
}

// ── Public site: create the project + deal lazily, only on confirmed payment ──
// By this point Stripe's own hosted checkout has already collected the
// customer's email, so we don't need a placeholder to fill in later.
async function createDealFromPublicSignup(session) {
  const [existingDeal] = await pool.query('SELECT * FROM server_deals WHERE stripe_checkout_session_id = ?', [session.id]);
  if (existingDeal.length) {
    const [[project]] = await pool.query('SELECT * FROM projects WHERE id = ?', [existingDeal[0].project_id]);
    return { deal: existingDeal[0], project };
  }

  const { plan, amount, billing_interval: billingInterval } = session.metadata;
  if (!plan || !amount) return null;

  const [[admin]] = await pool.query(`SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`);
  if (!admin) {
    console.error('[Stripe webhook] No super_admin found to own the auto-created project — skipping');
    return null;
  }

  const email = session.customer_details?.email || 'Unknown';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO projects (id, name, client, type, portal, manager_id, status)
       VALUES (UUID(), ?, ?, 'Monthly', 'Direct', ?, 'server')`,
      [`${plan} Hosting`, email, admin.id]
    );
    const [[project]] = await conn.query('SELECT * FROM projects WHERE manager_id = ? ORDER BY created_at DESC LIMIT 1', [admin.id]);

    await conn.query(
      `INSERT INTO server_deals (id, project_id, plan_name, monthly_price, setup_fee, billing_interval, status, notes, stripe_checkout_session_id)
       VALUES (UUID(), ?, ?, ?, 0, ?, 'client_agreed', 'Auto-created from website checkout', ?)`,
      [project.id, plan, amount, billingInterval, session.id]
    );
    const [[deal]] = await conn.query('SELECT * FROM server_deals WHERE project_id = ? ORDER BY created_at DESC LIMIT 1', [project.id]);

    await conn.query(
      `INSERT INTO server_deal_status_history (id, deal_id, from_status, to_status, reason)
       VALUES (UUID(), ?, NULL, 'client_agreed', 'Website checkout completed')`,
      [deal.id]
    );

    await conn.commit();
    return { deal, project };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Shared: turn a completed Checkout Session into a live subscription ────
// Used by both the admin-created-deal path and the public-signup path above.
async function activateSubscription({ deal, project, session }) {
  // Stripe owns billing end-to-end from here — the subscription stays
  // active and auto-charges the saved card on its own recurring schedule.
  // NexPortal only tracks state, mirroring renewals via the
  // `customer.subscription.updated`/`invoice.payment_*` webhooks below.
  const stripeSub = await stripeService.stripe.subscriptions.retrieve(session.subscription);

  const clientEmail = session.customer_details?.email || null;
  const period = getSubscriptionPeriod(stripeSub);
  if (!period) throw new Error(`Could not determine billing period for subscription ${session.subscription}`);
  const { periodStart, periodEnd } = period;

  await pool.query(
    `INSERT INTO server_subscriptions
       (id, deal_id, project_id, stripe_subscription_id, stripe_customer_id, client_email,
        status, monthly_price, billing_interval, current_period_start, current_period_end, next_invoice_date)
     VALUES (UUID(), ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [deal.id, deal.project_id, session.subscription, session.customer, clientEmail,
     deal.monthly_price, deal.billing_interval, periodStart, periodEnd, periodEnd]
  );
  const [[newSub]] = await pool.query('SELECT id FROM server_subscriptions WHERE deal_id = ?', [deal.id]);

  // Checkout already collected the first cycle's payment via Stripe's own
  // subscription-mode Invoice — mirror it into our own invoices table
  // (already paid) so it shows up in Invoice History / the Payments
  // dashboard immediately, same as every later Stripe-billed renewal (see
  // findOrCreateLocalInvoice below). Read amounts/line items straight off
  // the Stripe invoice (ground truth for what was actually charged) rather
  // than recomputing them ourselves.
  if (session.invoice) {
    try {
      const stripeInvoice = await stripeService.retrieveInvoice(session.invoice);
      const paidNow = stripeInvoice.status === 'paid' || session.payment_status === 'paid';
      await invoiceService.recordInitialInvoice({
        subscriptionId: newSub.id, projectId: deal.project_id,
        periodStart, periodEnd,
        subtotal: (stripeInvoice.subtotal || 0) / 100,
        total: (stripeInvoice.total || 0) / 100,
        amountPaid: (stripeInvoice.amount_paid || 0) / 100,
        lineItems: (stripeInvoice.lines?.data || []).map(l => ({
          description: l.description || deal.plan_name,
          amount: (l.amount || 0) / 100,
        })),
        stripeInvoiceId: stripeInvoice.id,
        stripeHostedUrl: stripeInvoice.hosted_invoice_url,
        stripePaymentIntentId: stripeInvoice.payment_intent,
        paid: paidNow,
      });
    } catch (e) {
      console.error('[Stripe webhook] Failed to record initial invoice:', e.message);
    }
  }

  await logActivity({
    user: { id: null, name: 'Stripe', role: 'system' },
    action: 'subscribed', entity: 'server_subscription', entityId: deal.id,
    detail: `Subscription started for '${project?.name}' (${deal.plan_name})`,
  });
  if (project?.manager_id) {
    await notify(project.manager_id, {
      type: 'server_subscription_started', entityType: 'server_deal', entityId: deal.id,
      title: 'Client subscribed to server plan',
      body: `${project.client} completed checkout for '${deal.plan_name}' on ${project.name}`,
    });
  }
}

async function handleSubscriptionCreated(stripeSub) {
  // checkout.session.completed is the primary creation path (it has deal/project
  // metadata readily available); this handler just fills in period dates if the
  // row already exists and they're not set yet.
  const period = getSubscriptionPeriod(stripeSub);
  if (!period) return; // activateSubscription already set these via a fresh retrieve()

  await pool.query(
    `UPDATE server_subscriptions
     SET current_period_start = COALESCE(current_period_start, ?),
         current_period_end   = COALESCE(current_period_end, ?)
     WHERE stripe_subscription_id = ?`,
    [period.periodStart, period.periodEnd, stripeSub.id]
  );
}

// Keeps "Sub. Start"/"Next Billing" (SubscribedClients.js) and the Server
// Payments "upcoming" tab accurate now that Stripe — not a local scheduler —
// decides when the subscription renews.
async function handleSubscriptionUpdated(stripeSub) {
  const period = getSubscriptionPeriod(stripeSub);
  if (!period) return;
  await pool.query(
    `UPDATE server_subscriptions
     SET current_period_start = ?, current_period_end = ?, next_invoice_date = ?
     WHERE stripe_subscription_id = ?`,
    [period.periodStart, period.periodEnd, period.periodEnd, stripeSub.id]
  );
}

// Every Stripe-generated invoice (first cycle via Checkout, every renewal
// after) gets mirrored into our own `invoices` table here rather than at
// creation time, since Stripe generates them on its own schedule now — this
// is what lets NexPortal keep Invoice History / Server Payments KPIs
// accurate while only tracking, not driving, the billing itself.
async function findOrCreateLocalInvoice(stripeInvoice, { paidNow }) {
  const [[existing]] = await pool.query('SELECT * FROM invoices WHERE stripe_invoice_id = ?', [stripeInvoice.id]);
  if (existing) return existing;
  if (!stripeInvoice.subscription) return null; // not tied to one of our subscriptions

  const [[subscription]] = await pool.query(
    'SELECT * FROM server_subscriptions WHERE stripe_subscription_id = ?', [stripeInvoice.subscription]
  );
  if (!subscription) return null;

  const periodStart = new Date((stripeInvoice.period_start || stripeInvoice.created) * 1000).toISOString().split('T')[0];
  const periodEnd   = new Date((stripeInvoice.period_end   || stripeInvoice.created) * 1000).toISOString().split('T')[0];

  return invoiceService.recordInitialInvoice({
    subscriptionId: subscription.id, projectId: subscription.project_id,
    periodStart, periodEnd,
    subtotal: (stripeInvoice.subtotal || 0) / 100,
    total: (stripeInvoice.total || 0) / 100,
    amountPaid: (stripeInvoice.amount_paid || 0) / 100,
    lineItems: (stripeInvoice.lines?.data || []).map(l => ({
      description: l.description || 'Server Maintenance',
      amount: (l.amount || 0) / 100,
    })),
    stripeInvoiceId: stripeInvoice.id,
    stripeHostedUrl: stripeInvoice.hosted_invoice_url,
    stripePaymentIntentId: stripeInvoice.payment_intent,
    paid: paidNow,
  });
}

async function handleInvoicePaymentSucceeded(stripeInvoice) {
  const invoice = await findOrCreateLocalInvoice(stripeInvoice, { paidNow: true });
  if (!invoice) return;

  if (invoice.status !== 'paid') {
    await invoiceService.markInvoicePaid(invoice.id, {
      stripePaymentIntentId: stripeInvoice.payment_intent || null,
      amountPaid: (stripeInvoice.amount_paid || 0) / 100,
    });
  }
  await logActivity({
    user: { id: null, name: 'Stripe', role: 'system' },
    action: 'paid', entity: 'invoice', entityId: invoice.id,
    detail: `Invoice ${invoice.invoice_number} paid`,
  });
}

async function handleInvoicePaymentFailed(stripeInvoice) {
  const invoice = await findOrCreateLocalInvoice(stripeInvoice, { paidNow: false });
  if (!invoice) return;

  await pool.query(`UPDATE invoices SET status = 'overdue' WHERE id = ?`, [invoice.id]);
  await pool.query(`UPDATE server_subscriptions SET status = 'past_due' WHERE id = ?`, [invoice.subscription_id]);
  await logActivity({
    user: { id: null, name: 'Stripe', role: 'system' },
    action: 'payment_failed', entity: 'invoice', entityId: invoice.id,
    detail: `Payment failed for invoice ${invoice.invoice_number}`,
  });
}

async function handleSubscriptionDeleted(stripeSub) {
  await pool.query(
    `UPDATE server_subscriptions SET status = 'canceled', canceled_at = NOW() WHERE stripe_subscription_id = ?`,
    [stripeSub.id]
  );
}

module.exports = router;
