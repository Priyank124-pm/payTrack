const express = require('express');
const pool    = require('../db/pool');
const { authenticate, isAdmin, getEffectiveManagerId } = require('../middleware/auth');
const { logActivity } = require('../services/logger');
const invoiceService  = require('../services/invoiceService');
const { sendMail, invoiceTemplate } = require('../services/emailService');

const router = express.Router();
router.use(authenticate);

function scopeClause(req, managerId, qManagerId) {
  if (req.user.role === 'coordinator') return { clause: 'p.coordinator_id = ?', param: req.user.id };
  if (managerId) return { clause: 'p.manager_id = ?', param: managerId };
  if (qManagerId) return { clause: 'p.manager_id = ?', param: qManagerId };
  return null;
}

// ── GET /api/invoices?tab=pending|upcoming|received&month=&year=&managerId= ──
router.get('/', async (req, res) => {
  try {
    const managerId = getEffectiveManagerId(req.user);
    const { tab = 'pending', month, year, managerId: qManagerId } = req.query;
    const scope = scopeClause(req, managerId, qManagerId);

    if (tab === 'upcoming') {
      let sql = `
        SELECT ss.id AS subscription_id, ss.project_id, ss.monthly_price AS amount, ss.next_invoice_date AS due_date,
               p.name AS project_name, p.client AS client_name, p.manager_id, u.name AS pm_name
        FROM server_subscriptions ss
        JOIN projects p ON p.id = ss.project_id
        LEFT JOIN users u ON u.id = p.manager_id
        WHERE ss.status IN ('active','past_due')
      `;
      const params = [];
      if (scope) { sql += ` AND ${scope.clause}`; params.push(scope.param); }
      sql += ' ORDER BY ss.next_invoice_date ASC';
      const [rows] = await pool.query(sql, params);
      return res.json(rows.map(r => ({ ...r, status: 'upcoming' })));
    }

    const statuses = tab === 'received' ? ['paid'] : ['pending', 'sent', 'overdue'];
    let sql = `
      SELECT i.*, p.name AS project_name, p.client AS client_name, p.manager_id, u.name AS pm_name
      FROM invoices i
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN users u ON u.id = p.manager_id
      WHERE i.status IN (${statuses.map(() => '?').join(',')})
    `;
    const params = [...statuses];
    if (scope) { sql += ` AND ${scope.clause}`; params.push(scope.param); }
    if (month && year) { sql += ' AND MONTH(i.due_date) = ? AND YEAR(i.due_date) = ?'; params.push(month, year); }
    sql += ' ORDER BY i.due_date ASC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/invoices/kpis?month=&year=&managerId= ──────────────
router.get('/kpis', async (req, res) => {
  try {
    const managerId = getEffectiveManagerId(req.user);
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const scope = scopeClause(req, managerId, req.query.managerId);
    const scopeSql = scope ? ` AND ${scope.clause}` : '';
    const scopeParams = scope ? [scope.param] : [];

    const [[expected]] = await pool.query(
      `SELECT COALESCE(SUM(i.total),0) AS val FROM invoices i JOIN projects p ON p.id = i.project_id
       WHERE i.status != 'carried_forward' AND MONTH(i.due_date) = ? AND YEAR(i.due_date) = ?${scopeSql}`,
      [month, year, ...scopeParams]
    );
    const [[received]] = await pool.query(
      `SELECT COALESCE(SUM(i.amount_paid),0) AS val FROM invoices i JOIN projects p ON p.id = i.project_id
       WHERE i.status = 'paid' AND MONTH(i.paid_at) = ? AND YEAR(i.paid_at) = ?${scopeSql}`,
      [month, year, ...scopeParams]
    );
    const [[overdue]] = await pool.query(
      `SELECT COALESCE(SUM(i.total - i.amount_paid),0) AS val FROM invoices i JOIN projects p ON p.id = i.project_id
       WHERE i.status = 'overdue'${scopeSql}`,
      scopeParams
    );
    res.json({ expected: expected.val, received: received.val, overdue: overdue.val });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/invoices/client/:subscriptionId ────────────────────
router.get('/client/:subscriptionId', async (req, res) => {
  try {
    const [[sub]] = await pool.query(
      `SELECT ss.*, p.manager_id, p.name AS project_name, p.client AS client_name
       FROM server_subscriptions ss JOIN projects p ON p.id = ss.project_id WHERE ss.id = ?`,
      [req.params.subscriptionId]
    );
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && sub.manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    const [invoices] = await pool.query('SELECT * FROM invoices WHERE subscription_id = ? ORDER BY due_date DESC', [req.params.subscriptionId]);
    res.json({ subscription: sub, invoices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/invoices/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[invoice]] = await pool.query(
      `SELECT i.*, p.name AS project_name, p.client AS client_name, p.manager_id
       FROM invoices i JOIN projects p ON p.id = i.project_id WHERE i.id = ?`,
      [req.params.id]
    );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && invoice.manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    const [lineItems] = await pool.query('SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...invoice, lineItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/invoices/:id/resend ───────────────────────────────
router.post('/:id/resend', async (req, res) => {
  try {
    const [[invoice]] = await pool.query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const [[proj]] = await pool.query('SELECT * FROM projects WHERE id = ?', [invoice.project_id]);
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && proj.manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    const [[sub]] = await pool.query('SELECT * FROM server_subscriptions WHERE id = ?', [invoice.subscription_id]);
    if (!sub?.client_email) return res.status(400).json({ error: 'No client email on file for this subscription' });
    const [lineItems] = await pool.query('SELECT * FROM invoice_line_items WHERE invoice_id = ?', [invoice.id]);

    await sendMail({
      to: sub.client_email,
      subject: `Invoice ${invoice.invoice_number} — ${proj.name} Server Maintenance`,
      html: invoiceTemplate({ recipientName: proj.client, projectName: proj.name, invoice, lineItems, payNowUrl: invoice.stripe_hosted_invoice_url }),
    });
    await logActivity({ user: req.user, action: 'resend', entity: 'invoice', entityId: invoice.id, detail: `Resent invoice ${invoice.invoice_number}` });
    res.json({ message: 'Invoice resent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/invoices/:id/mark-paid-manual ─────────────────────
router.post('/:id/mark-paid-manual', isAdmin, async (req, res) => {
  try {
    const [[invoice]] = await pool.query('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    await invoiceService.markInvoicePaid(invoice.id, { amountPaid: invoice.total });
    await logActivity({ user: req.user, action: 'mark_paid_manual', entity: 'invoice', entityId: invoice.id, detail: `Manually marked invoice ${invoice.invoice_number} paid` });
    res.json({ message: 'Invoice marked paid' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
