const pool = require('../db/pool');
const stripeService = require('./stripeService');
const { sendMail, invoiceTemplate, reminderTemplate } = require('./emailService');

// ── Date helpers (UTC, calendar-date only — no time component) ─
const MONTHS_BY_INTERVAL = { month: 1, quarter: 3, half_year: 6 };

function addInterval(dateStr, interval) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + (MONTHS_BY_INTERVAL[interval] || 1));
  return d.toISOString().split('T')[0];
}

function formatPeriodLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

async function generateInvoiceNumber(conn) {
  const year = new Date().getUTCFullYear();
  const [[{ cnt }]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM invoices WHERE invoice_number LIKE ?`,
    [`INV-${year}-%`]
  );
  return `INV-${year}-${String(cnt + 1).padStart(4, '0')}`;
}

// ── Create the invoice for a subscription's current billing cycle ──
// Folds in any still-unpaid prior invoices as "Carried Over" line items
// (spec §7) and marks them `carried_forward` rather than deleting them.
async function createMonthlyInvoice(subscription) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const periodStart = subscription.next_invoice_date
      ? new Date(subscription.next_invoice_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const periodEnd = addInterval(periodStart, subscription.billing_interval);
    const dueDate   = periodStart;

    const [outstanding] = await conn.query(
      `SELECT * FROM invoices WHERE subscription_id = ? AND status IN ('pending','sent','overdue') ORDER BY due_date ASC`,
      [subscription.id]
    );

    // subscription.monthly_price is always the MONTHLY rate — a quarterly/
    // half-yearly/yearly plan bills that rate times the months in the cycle.
    const baseAmount   = stripeService.cycleAmount(subscription.monthly_price, subscription.billing_interval);
    const carriedTotal = outstanding.reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.amount_paid)), 0);
    const total        = baseAmount + carriedTotal;
    const invoiceNumber = await generateInvoiceNumber(conn);

    await conn.query(
      `INSERT INTO invoices (id, subscription_id, project_id, invoice_number, period_start, period_end, due_date, subtotal, total, status)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [subscription.id, subscription.project_id, invoiceNumber, periodStart, periodEnd, dueDate, baseAmount, total]
    );
    const [[newInvoice]] = await conn.query('SELECT * FROM invoices WHERE invoice_number = ?', [invoiceNumber]);

    await conn.query(
      `INSERT INTO invoice_line_items (id, invoice_id, description, amount) VALUES (UUID(), ?, ?, ?)`,
      [newInvoice.id, `Server Maintenance — ${formatPeriodLabel(periodStart)}`, baseAmount]
    );

    for (const old of outstanding) {
      const remaining = Number(old.total) - Number(old.amount_paid);
      await conn.query(
        `INSERT INTO invoice_line_items (id, invoice_id, description, amount, source_invoice_id, is_carry_forward)
         VALUES (UUID(), ?, ?, ?, ?, 1)`,
        [newInvoice.id, `Carried Over — Invoice #${old.invoice_number}`, remaining, old.id]
      );
      await conn.query(
        `UPDATE invoices SET status = 'carried_forward', carried_forward_to = ? WHERE id = ?`,
        [newInvoice.id, old.id]
      );
    }

    // At-risk tracking: a cycle that required carrying something forward counts as "missed".
    const threshold = parseInt(process.env.AT_RISK_MISSED_CYCLES_THRESHOLD || '2', 10);
    if (outstanding.length) {
      const [[sub]] = await conn.query('SELECT consecutive_missed_cycles FROM server_subscriptions WHERE id = ?', [subscription.id]);
      const missed = (sub?.consecutive_missed_cycles || 0) + 1;
      await conn.query(
        'UPDATE server_subscriptions SET consecutive_missed_cycles = ?, at_risk = ?, next_invoice_date = ? WHERE id = ?',
        [missed, missed >= threshold ? 1 : 0, periodEnd, subscription.id]
      );
    } else {
      await conn.query(
        'UPDATE server_subscriptions SET next_invoice_date = ? WHERE id = ?',
        [periodEnd, subscription.id]
      );
    }

    await conn.commit();
    return { ...newInvoice, hasCarryForward: outstanding.length > 0 };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Record the invoice for the FIRST billing cycle, already paid via Checkout ──
// Stripe Checkout (subscription mode) charges the customer immediately and
// creates its own Stripe Invoice for that first cycle — this mirrors it into
// our own invoices table (already `paid`) so it shows up in history/KPIs
// exactly like every subsequent scheduler-generated invoice does.
//
// Amounts/line items are read from Stripe's own invoice object (the source
// of truth for what was actually charged), not recomputed from the deal —
// so a pricing bug on our side (or a price change after checkout was sent)
// can never make our record disagree with what the customer was really billed.
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

// ── Create the matching Stripe Invoice (hosted "Pay Now" link) and email it ──
// Called right after createMonthlyInvoice for a freshly generated invoice.
async function dispatchInvoice(invoice) {
  const [[subscription]] = await pool.query('SELECT * FROM server_subscriptions WHERE id = ?', [invoice.subscription_id]);
  const [[project]]      = await pool.query('SELECT * FROM projects WHERE id = ?', [invoice.project_id]);
  const [lineItems]      = await pool.query('SELECT * FROM invoice_line_items WHERE invoice_id = ?', [invoice.id]);

  const stripeInvoice = await stripeService.createAndSendInvoice({
    customerId: subscription.stripe_customer_id,
    lineItems,
  });

  await pool.query(
    `UPDATE invoices SET status = 'sent', stripe_invoice_id = ?, stripe_hosted_invoice_url = ?, sent_at = NOW() WHERE id = ?`,
    [stripeInvoice.id, stripeInvoice.hosted_invoice_url, invoice.id]
  );

  if (subscription.client_email) {
    await sendMail({
      to: subscription.client_email,
      subject: `Invoice for ${project.name} — Server Maintenance (${formatPeriodLabel(invoice.period_start)})`,
      html: invoiceTemplate({
        recipientName: project.client,
        projectName: project.name,
        invoice: { ...invoice, total: invoice.total },
        lineItems,
        payNowUrl: stripeInvoice.hosted_invoice_url,
      }),
    });
  }

  return { ...invoice, status: 'sent', stripe_invoice_id: stripeInvoice.id, stripe_hosted_invoice_url: stripeInvoice.hosted_invoice_url };
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

// ── Send an overdue-payment reminder email for one invoice ──────
async function sendReminder(invoice, daysOverdue) {
  const [[subscription]] = await pool.query('SELECT * FROM server_subscriptions WHERE id = ?', [invoice.subscription_id]);
  const [[project]]      = await pool.query('SELECT * FROM projects WHERE id = ?', [invoice.project_id]);
  if (!subscription?.client_email) return false;

  await sendMail({
    to: subscription.client_email,
    subject: `Reminder: Payment Due for ${project.name} — Server Maintenance`,
    html: reminderTemplate({
      recipientName: project.client,
      projectName: project.name,
      invoice,
      daysOverdue,
      payNowUrl: invoice.stripe_hosted_invoice_url,
    }),
  });
  await pool.query(
    `INSERT INTO payment_reminders (id, invoice_id, reminder_type, sent_to) VALUES (UUID(), ?, 'day_after_due', ?)`,
    [invoice.id, subscription.client_email]
  );
  return true;
}

module.exports = {
  addInterval,
  formatPeriodLabel,
  generateInvoiceNumber,
  createMonthlyInvoice,
  recordInitialInvoice,
  dispatchInvoice,
  markInvoicePaid,
  sendReminder,
};
