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
    periodStart: isoDate(stripeInvoice.period_start || stripeInvoice.created),
    periodEnd:   isoDate(stripeInvoice.period_end   || stripeInvoice.created),
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

// Pull every paid invoice for our live subscriptions from Stripe and record/mark any we missed.
async function syncPaidInvoices() {
  const [subs] = await pool.query(
    `SELECT stripe_subscription_id FROM server_subscriptions WHERE stripe_subscription_id IS NOT NULL`);
  const summary = { subscriptions: subs.length, recorded: 0, markedPaid: 0, errors: [] };

  for (const { stripe_subscription_id: subId } of subs) {
    try {
      for await (const inv of stripeService.stripe.invoices.list({ subscription: subId, status: 'paid', limit: 100 })) {
        const { invoice, created } = await findOrCreateLocalInvoice(inv, { paidNow: true });
        if (!invoice) continue;
        if (created) summary.recorded++;
        else if (invoice.status !== 'paid') {
          await invoiceService.markInvoicePaid(invoice.id, {
            stripePaymentIntentId: invoicePaymentIntent(inv),
            amountPaid: (inv.amount_paid || 0) / 100,
          });
          summary.markedPaid++;
        }
      }
    } catch (e) {
      summary.errors.push(`${subId}: ${e.message}`);
    }
  }
  return summary;
}

module.exports = { findOrCreateLocalInvoice, syncPaidInvoices, invoicePaymentIntent, invoiceTax };
