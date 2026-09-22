const pool = require('../db/pool');

async function generateInvoiceNumber(conn) {
  const year = new Date().getUTCFullYear();
  const [[{ cnt }]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM invoices WHERE invoice_number LIKE ?`,
    [`INV-${year}-%`]
  );
  return `INV-${year}-${String(cnt + 1).padStart(4, '0')}`;
}

// ── Mirror a Stripe-generated invoice into our own table ────────
// Stripe now owns billing end-to-end (subscriptions auto-renew and
// auto-charge on their own schedule) — this just records what Stripe
// actually charged, for every cycle (first one via Checkout, every renewal
// after via the `invoice.payment_succeeded`/`invoice.payment_failed`
// webhooks), so Invoice History / Server Payments KPIs stay accurate.
//
// Amounts/line items are read from Stripe's own invoice object (the source
// of truth for what was actually charged), never recomputed on our side.
async function recordInitialInvoice({
  subscriptionId, projectId, periodStart, periodEnd,
  subtotal, total, amountPaid, lineItems,
  stripeInvoiceId, stripeHostedUrl, stripePaymentIntentId, paid,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const invoiceNumber = await generateInvoiceNumber(conn);
    const status = paid ? 'paid' : 'sent';

    await conn.query(
      `INSERT INTO invoices
         (id, subscription_id, project_id, invoice_number, period_start, period_end, due_date,
          subtotal, total, amount_paid, status, stripe_invoice_id, stripe_payment_intent_id,
          stripe_hosted_invoice_url, paid_at, sent_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [subscriptionId, projectId, invoiceNumber, periodStart, periodEnd, periodStart,
       subtotal, total, paid ? amountPaid : 0, status, stripeInvoiceId || null, stripePaymentIntentId || null,
       stripeHostedUrl || null, paid ? new Date() : null]
    );
    const [[invoice]] = await conn.query('SELECT * FROM invoices WHERE invoice_number = ?', [invoiceNumber]);

    for (const li of lineItems) {
      await conn.query(
        `INSERT INTO invoice_line_items (id, invoice_id, description, amount) VALUES (UUID(), ?, ?, ?)`,
        [invoice.id, li.description, li.amount]
      );
    }

    await conn.commit();
    return invoice;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Mark an invoice paid, cascading to any invoices carried into it ──
async function markInvoicePaid(invoiceId, { stripePaymentIntentId, amountPaid } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[invoice]] = await conn.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!invoice) { await conn.rollback(); return null; }

    const paidAmount = amountPaid != null ? amountPaid : invoice.total;
    await conn.query(
      `UPDATE invoices SET status = 'paid', amount_paid = ?, stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id), paid_at = NOW() WHERE id = ?`,
      [paidAmount, stripePaymentIntentId || null, invoiceId]
    );

    // Cascade paid status back through any invoices this one absorbed via carry-forward.
    let frontier = [invoiceId];
    while (frontier.length) {
      const placeholders = frontier.map(() => '?').join(',');
      const [prior] = await conn.query(
        `SELECT id, total FROM invoices WHERE carried_forward_to IN (${placeholders})`,
        frontier
      );
      if (!prior.length) break;
      for (const p of prior) {
        await conn.query(`UPDATE invoices SET status = 'paid', amount_paid = ?, paid_at = NOW() WHERE id = ?`, [p.total, p.id]);
      }
      frontier = prior.map(p => p.id);
    }

    await conn.query(
      'UPDATE server_subscriptions SET consecutive_missed_cycles = 0, at_risk = 0 WHERE id = ?',
      [invoice.subscription_id]
    );

    await conn.commit();
    return invoice;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  generateInvoiceNumber,
  recordInitialInvoice,
  markInvoicePaid,
};
