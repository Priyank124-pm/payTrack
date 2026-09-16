const pool = require('../db/pool');
const invoiceService = require('./invoiceService');

// ── (a) Generate + send the next cycle's invoice for subscriptions due today ──
// invoiceService.createMonthlyInvoice folds in any still-unpaid prior
// invoices as carry-forward line items (spec §7) before dispatchInvoice
// creates the matching Stripe invoice + emails it (spec §5).
async function runInvoiceGeneration() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [subs] = await pool.query(
    `SELECT * FROM server_subscriptions WHERE status IN ('active','past_due') AND next_invoice_date <= ?`,
    [todayStr]
  );

  for (const sub of subs) {
    const [already] = await pool.query(
      'SELECT id FROM invoices WHERE subscription_id = ? AND due_date = ?',
      [sub.id, sub.next_invoice_date]
    );
    if (already.length) continue;

    try {
      const invoice = await invoiceService.createMonthlyInvoice(sub);
      await invoiceService.dispatchInvoice(invoice);
      console.log(`[Billing] Generated & sent invoice ${invoice.invoice_number} for subscription ${sub.id}`);
    } catch (err) {
      console.error(`[Billing] Failed to generate invoice for subscription ${sub.id}:`, err.message);
    }
  }
}

// ── (b) Reminder sweep — day+INVOICE_GRACE_DAYS after due_date, unpaid ──
// Idempotent via payment_reminders (one send per invoice per day); an
// invoice superseded by carry-forward flips to `carried_forward` status
// and drops out of this WHERE clause, so it stops getting chased.
async function runReminderSweep() {
  const graceDays = parseInt(process.env.INVOICE_GRACE_DAYS || '1', 10);
  const [invoices] = await pool.query(
    `SELECT * FROM invoices
     WHERE status IN ('pending','sent','overdue')
       AND due_date <= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [graceDays]
  );

  for (const inv of invoices) {
    const [already] = await pool.query(
      `SELECT id FROM payment_reminders WHERE invoice_id = ? AND DATE(sent_at) = CURDATE()`,
      [inv.id]
    );
    if (already.length) continue;

    try {
      const daysOverdue = Math.max(1, Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86400000));
      const sent = await invoiceService.sendReminder(inv, daysOverdue);
      if (inv.status !== 'overdue') {
        await pool.query(`UPDATE invoices SET status = 'overdue' WHERE id = ?`, [inv.id]);
      }
      if (sent) console.log(`[Billing] Reminder sent for invoice ${inv.invoice_number}`);
    } catch (err) {
      console.error(`[Billing] Failed to send reminder for invoice ${inv.id}:`, err.message);
    }
  }
}

async function runDailyBillingSweep() {
  console.log('[Billing] Running daily sweep...');
  await runInvoiceGeneration();
  await runReminderSweep();
  console.log('[Billing] Daily sweep complete.');
}

// ── Simple cron-style scheduler (same hand-rolled pattern as
// services/notificationScheduler.js — no node-cron dependency) ──
function startBillingScheduler() {
  const RUN_HOUR = parseInt(process.env.BILLING_HOUR || '8', 10);

  function scheduleNext() {
    const now  = new Date();
    const next = new Date();
    next.setHours(RUN_HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const msUntilNext = next - now;
    console.log(`[Billing] Next run scheduled at ${next.toLocaleString()} (in ${Math.round(msUntilNext / 60000)} min)`);

    setTimeout(async () => {
      await runDailyBillingSweep();
      scheduleNext();
    }, msUntilNext);
  }

  scheduleNext();
  return { runNow: runDailyBillingSweep };
}

module.exports = { startBillingScheduler, runDailyBillingSweep };
