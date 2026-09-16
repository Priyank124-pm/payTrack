const express = require('express');
const pool = require('../db/pool');
const stripeService = require('../services/stripeService');
const invoiceService = require('../services/invoiceService');
const { logActivity } = require('../services/logger');
const { notify } = require('../services/notifyService');

const router = express.Router();

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

  const dealId = session.metadata?.deal_id;
  if (!dealId) return;

  const [existing] = await pool.query('SELECT id FROM server_subscriptions WHERE deal_id = ?', [dealId]);
  if (existing.length) return; // already created (e.g. redelivered event)

  const [[deal]] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [dealId]);
  if (!deal) return;

  const stripeSub = await stripeService.stripe.subscriptions.retrieve(session.subscription);
  await stripeService.pauseSubscriptionCollection(session.subscription);

  const clientEmail = session.customer_details?.email || null;
  const periodStart = new Date(stripeSub.current_period_start * 1000).toISOString().split('T')[0];
  const periodEnd   = new Date(stripeSub.current_period_end * 1000).toISOString().split('T')[0];

  await pool.query(
    `INSERT INTO server_subscriptions
       (id, deal_id, project_id, stripe_subscription_id, stripe_customer_id, client_email,
        status, monthly_price, billing_interval, current_period_start, current_period_end, next_invoice_date)
     VALUES (UUID(), ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [deal.id, deal.project_id, session.subscription, session.customer, clientEmail,
     deal.monthly_price, deal.billing_interval, periodStart, periodEnd, periodEnd]
  );
  const [[newSub]] = await pool.query('SELECT id FROM server_subscriptions WHERE deal_id = ?', [deal.id]);

  // Checkout already collected the first cycle's payment (+ setup fee) via
  // Stripe's own subscription-mode Invoice — mirror it into our own invoices
  // table (already paid) so it shows up in Invoice History / the Payments
  // dashboard immediately, same as every later scheduler-generated invoice.
  // Read amounts/line items straight off the Stripe invoice (ground truth for
  // what was actually charged) rather than recomputing them ourselves.
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

  const [[proj]] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
  await logActivity({
    user: { id: null, name: 'Stripe', role: 'system' },
    action: 'subscribed', entity: 'server_subscription', entityId: deal.id,
    detail: `Subscription started for '${proj?.name}' (${deal.plan_name})`,
  });
  if (proj?.manager_id) {
    await notify(proj.manager_id, {
      type: 'server_subscription_started', entityType: 'server_deal', entityId: deal.id,
      title: 'Client subscribed to server plan',
      body: `${proj.client} completed checkout for '${deal.plan_name}' on ${proj.name}`,
    });
  }
}

async function handleSubscriptionCreated(stripeSub) {
  // checkout.session.completed is the primary creation path (it has deal/project
  // metadata readily available); this handler just fills in period dates if the
  // row already exists and they're not set yet.
  await pool.query(
    `UPDATE server_subscriptions
     SET current_period_start = COALESCE(current_period_start, ?),
         current_period_end   = COALESCE(current_period_end, ?)
     WHERE stripe_subscription_id = ?`,
    [
      new Date(stripeSub.current_period_start * 1000).toISOString().split('T')[0],
      new Date(stripeSub.current_period_end * 1000).toISOString().split('T')[0],
      stripeSub.id,
    ]
  );
}

async function handleInvoicePaymentSucceeded(stripeInvoice) {
  const [[invoice]] = await pool.query('SELECT * FROM invoices WHERE stripe_invoice_id = ?', [stripeInvoice.id]);
  if (!invoice) return; // not one of our scheduler-generated invoices (e.g. a stray Stripe-side invoice)

  await invoiceService.markInvoicePaid(invoice.id, {
    stripePaymentIntentId: stripeInvoice.payment_intent || null,
    amountPaid: (stripeInvoice.amount_paid || 0) / 100,
  });
  await logActivity({
    user: { id: null, name: 'Stripe', role: 'system' },
    action: 'paid', entity: 'invoice', entityId: invoice.id,
    detail: `Invoice ${invoice.invoice_number} paid`,
  });
}

async function handleInvoicePaymentFailed(stripeInvoice) {
  const [[invoice]] = await pool.query('SELECT * FROM invoices WHERE stripe_invoice_id = ?', [stripeInvoice.id]);
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
