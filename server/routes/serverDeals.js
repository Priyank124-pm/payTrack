const express = require('express');
const { body, validationResult } = require('express-validator');
const pool    = require('../db/pool');
const { authenticate, isAdmin, getEffectiveManagerId } = require('../middleware/auth');
const { logActivity }             = require('../services/logger');
const { notify, notifyMany, getAdminIds } = require('../services/notifyService');
const stripeService                = require('../services/stripeService');
const { sendMail, dealCheckoutLinkTemplate, dealReminderTemplate } = require('../services/emailService');

const router = express.Router();
router.use(authenticate);

// ── GET /api/server-deals ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const managerId = getEffectiveManagerId(req.user);
    let sql = `
      SELECT sd.*,
             p.name AS project_name, p.client AS client_name,
             p.manager_id, u.name AS pm_name, du.name AS deleted_by_name
      FROM server_deals sd
      JOIN projects p ON p.id = sd.project_id
      LEFT JOIN users u ON u.id = p.manager_id
      LEFT JOIN users du ON du.id = sd.deleted_by
    `;
    const params = [];
    const wheres = [];
    if (req.user.role === 'coordinator') {
      wheres.push('p.coordinator_id = ?');
      params.push(req.user.id);
    } else if (managerId) {
      wheres.push('p.manager_id = ?');
      params.push(managerId);
    }
    if (req.query.status === 'deleted') {
      wheres.push('sd.deleted_at IS NOT NULL');
    } else {
      wheres.push('sd.deleted_at IS NULL');
      if (req.query.status)  { wheres.push('sd.status = ?');     params.push(req.query.status); }
    }
    if (req.query.projectId) { wheres.push('sd.project_id = ?'); params.push(req.query.projectId); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY sd.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/server-deals/:id ───────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sd.*, p.name AS project_name, p.client AS client_name, p.manager_id, u.name AS pm_name
       FROM server_deals sd
       JOIN projects p ON p.id = sd.project_id
       LEFT JOIN users u ON u.id = p.manager_id
       WHERE sd.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Deal not found' });
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && rows[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    const [history] = await pool.query(
      `SELECT h.*, u.name AS changed_by_name
       FROM server_deal_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.deal_id = ? ORDER BY h.created_at ASC`,
      [req.params.id]
    );
    res.json({ ...rows[0], history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/server-deals ──────────────────────────────────────
router.post('/',
  [
    body('project_id').notEmpty(),
    // Plan/price are typically decided once the client agrees, not at creation — optional here.
    body('plan_name').optional({ checkFalsy: true }).trim(),
    body('monthly_price').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('setup_fee').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('billing_interval').optional().isIn(['month', 'quarter', 'half_year', 'year']),
    body('target_date').optional({ checkFalsy: true }).isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { project_id, plan_name, monthly_price, setup_fee, billing_interval, notes, target_date } = req.body;

    try {
      const [proj] = await pool.query('SELECT * FROM projects WHERE id = ?', [project_id]);
      if (!proj.length) return res.status(404).json({ error: 'Project not found' });
      const managerId = getEffectiveManagerId(req.user);
      if (managerId && proj[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

      const conn = await pool.getConnection();
      let deal;
      try {
        await conn.beginTransaction();
        // One open (non-denied) deal per project at a time.
        const [existing] = await conn.query(
          `SELECT id FROM server_deals WHERE project_id = ? AND status IN ('in_discussion','client_agreed') AND deleted_at IS NULL FOR UPDATE`,
          [project_id]
        );
        if (existing.length) {
          await conn.rollback();
          return res.status(409).json({ error: 'This project already has an open server deal' });
        }
        await conn.query(
          `INSERT INTO server_deals (id, project_id, plan_name, monthly_price, setup_fee, billing_interval, notes, target_date, created_by)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)`,
          [project_id, plan_name?.trim() || null, parseFloat(monthly_price) || 0, parseFloat(setup_fee) || 0, billing_interval || 'month', notes || null, target_date || null, req.user.id]
        );
        const [rows] = await conn.query(
          `SELECT * FROM server_deals WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
          [project_id]
        );
        deal = rows[0];
        await conn.query(
          `INSERT INTO server_deal_status_history (id, deal_id, from_status, to_status, changed_by)
           VALUES (UUID(), ?, NULL, 'in_discussion', ?)`,
          [deal.id, req.user.id]
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      await logActivity({ user: req.user, action: 'create', entity: 'server_deal', entityId: deal.id, detail: `Created server deal for project '${proj[0].name}'` });
      const adminIds = await getAdminIds();
      await notifyMany(adminIds, {
        type: 'server_deal_created', entityType: 'server_deal', entityId: deal.id,
        title: 'New server deal created',
        body:  `New server deal opened for project '${proj[0].name}' by ${req.user.name}`,
      });
      res.status(201).json(deal);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/server-deals/:id ─────────────────────────────────
// Edit plan/price details — used to fill them in (or change them) any time
// before the client has actually subscribed.
router.patch('/:id',
  [
    body('plan_name').optional({ checkFalsy: true }).trim(),
    body('monthly_price').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('setup_fee').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('billing_interval').optional().isIn(['month', 'quarter', 'half_year', 'year']),
    body('target_date').optional({ checkFalsy: true }).isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const [deals] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [req.params.id]);
      if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
      const deal = deals[0];

      const [proj] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
      const managerId = getEffectiveManagerId(req.user);
      if (managerId && proj[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

      const pricingFields = ['plan_name', 'monthly_price', 'setup_fee', 'billing_interval'];
      const touchesPricing = pricingFields.some(k => req.body[k] !== undefined);
      if (touchesPricing) {
        const [subs] = await pool.query('SELECT id FROM server_subscriptions WHERE deal_id = ?', [deal.id]);
        if (subs.length) return res.status(400).json({ error: 'This deal already has an active subscription — pricing can no longer be edited here' });
      }

      const allowed = ['plan_name', 'monthly_price', 'setup_fee', 'billing_interval', 'notes', 'target_date'];
      const fields = [], values = [];
      for (const key of allowed) {
        if (req.body[key] !== undefined) { fields.push(`${key} = ?`); values.push(req.body[key] === '' ? null : req.body[key]); }
      }
      if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

      await pool.query(`UPDATE server_deals SET ${fields.join(', ')} WHERE id = ?`, [...values, deal.id]);
      const [rows] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [deal.id]);
      await logActivity({ user: req.user, action: 'update', entity: 'server_deal', entityId: deal.id, detail: `Updated pricing for deal on project '${proj[0].name}'` });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/server-deals/:id/status ──────────────────────────
router.patch('/:id/status',
  [ body('status').isIn(['in_discussion', 'client_denied', 'client_agreed']) ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, reason } = req.body;
    if (status === 'client_denied' && !reason?.trim()) {
      return res.status(400).json({ error: 'A denial reason is required' });
    }

    try {
      const [deals] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [req.params.id]);
      if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
      const deal = deals[0];

      const [proj] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
      const managerId = getEffectiveManagerId(req.user);
      if (managerId && proj[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

      if (status === 'client_agreed' && (!deal.plan_name?.trim() || !(Number(deal.monthly_price) > 0))) {
        return res.status(400).json({ error: 'Set a plan name and monthly price before marking Client Agreed' });
      }

      // Stripe call happens before opening the DB transaction (avoid holding locks over network I/O).
      let checkoutUrl = null;
      let stripeSessionId = null;
      if (status === 'client_agreed') {
        const session = await stripeService.createCheckoutSession({ deal, project: proj[0], customerEmail: null });
        checkoutUrl = session.url;
        stripeSessionId = session.id;
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `UPDATE server_deals
           SET status = ?, denial_reason = ?, stripe_checkout_session_id = COALESCE(?, stripe_checkout_session_id)
           WHERE id = ?`,
          [status, status === 'client_denied' ? reason.trim() : null, stripeSessionId, deal.id]
        );
        await conn.query(
          `INSERT INTO server_deal_status_history (id, deal_id, from_status, to_status, reason, changed_by)
           VALUES (UUID(), ?, ?, ?, ?, ?)`,
          [deal.id, deal.status, status, status === 'client_denied' ? reason.trim() : null, req.user.id]
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      await logActivity({
        user: req.user, action: 'status_change', entity: 'server_deal', entityId: deal.id,
        detail: `Deal for '${proj[0].name}'${deal.plan_name ? ` ('${deal.plan_name}')` : ''} status: ${deal.status} → ${status}${reason ? ` (${reason})` : ''}`,
      });

      res.json({ message: 'Status updated', status, checkoutUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /api/server-deals/:id/checkout-link ─────────────────────
router.get('/:id/checkout-link', async (req, res) => {
  try {
    const [deals] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [req.params.id]);
    if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
    const deal = deals[0];
    if (deal.status !== 'client_agreed') return res.status(400).json({ error: 'Deal is not in Client Agreed status' });

    const [proj] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && proj[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    let url = null;
    if (deal.stripe_checkout_session_id) {
      try {
        const session = await stripeService.retrieveSession(deal.stripe_checkout_session_id);
        if (session.status === 'open') url = session.url;
      } catch (_e) { /* session no longer retrievable — regenerate below */ }
    }
    if (!url) {
      const session = await stripeService.createCheckoutSession({ deal, project: proj[0], customerEmail: null });
      await pool.query('UPDATE server_deals SET stripe_checkout_session_id = ? WHERE id = ?', [session.id, deal.id]);
      url = session.url;
    }
    res.json({ checkoutUrl: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/server-deals/:id/resend-checkout-email ────────────
router.post('/:id/resend-checkout-email',
  [ body('to').isEmail() ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const [deals] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [req.params.id]);
      if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
      const deal = deals[0];
      if (deal.status !== 'client_agreed' || !deal.stripe_checkout_session_id) {
        return res.status(400).json({ error: 'No checkout link available for this deal' });
      }

      const [proj] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
      const managerId = getEffectiveManagerId(req.user);
      if (managerId && proj[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

      const session = await stripeService.retrieveSession(deal.stripe_checkout_session_id);
      await sendMail({
        to: req.body.to,
        subject: `Set Up Billing — ${proj[0].name} Server Maintenance`,
        html: dealCheckoutLinkTemplate({
          recipientName: proj[0].client, planName: deal.plan_name, amount: deal.monthly_price, checkoutUrl: session.url,
        }),
      });
      await logActivity({ user: req.user, action: 'email_sent', entity: 'server_deal', entityId: deal.id, detail: `Checkout link emailed to ${req.body.to}` });
      res.json({ message: 'Email sent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /api/server-deals/:id/comments ──────────────────────────
router.get('/:id/comments', async (req, res) => {
  try {
    const [deals] = await pool.query('SELECT project_id FROM server_deals WHERE id = ?', [req.params.id]);
    if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
    const [proj] = await pool.query('SELECT manager_id FROM projects WHERE id = ?', [deals[0].project_id]);
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && proj[0]?.manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    const [rows] = await pool.query(
      'SELECT * FROM server_deal_comments WHERE deal_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/server-deals/:id/comments ─────────────────────────
router.post('/:id/comments', async (req, res) => {
  const { comment } = req.body;
  if (!comment?.trim()) return res.status(400).json({ error: 'Comment is required' });
  try {
    const [deals] = await pool.query('SELECT project_id FROM server_deals WHERE id = ?', [req.params.id]);
    if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
    const [proj] = await pool.query('SELECT manager_id FROM projects WHERE id = ?', [deals[0].project_id]);
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && proj[0]?.manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

    await pool.query(
      `INSERT INTO server_deal_comments (id, deal_id, user_id, user_name, user_role, comment)
       VALUES (UUID(), ?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, req.user.name, req.user.role, comment.trim()]
    );
    const [rows] = await pool.query(
      'SELECT * FROM server_deal_comments WHERE deal_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.status(201).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/server-deals/:id/remind ───────────────────────────
// Admin-only nudge to the deal's PM — in-app notification + best-effort email.
router.post('/:id/remind', isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sd.*, p.name AS project_name, p.manager_id, u.name AS pm_name, u.email AS pm_email
       FROM server_deals sd
       JOIN projects p ON p.id = sd.project_id
       LEFT JOIN users u ON u.id = p.manager_id
       WHERE sd.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Deal not found' });
    const deal = rows[0];
    if (!deal.manager_id) return res.status(400).json({ error: 'This project has no assigned PM to remind' });

    const STATUS_LABEL = { in_discussion: 'In Discussion', client_denied: 'Client Denied', client_agreed: 'Client Agreed' };

    await notify(deal.manager_id, {
      type: 'server_deal_reminder', entityType: 'server_deal', entityId: deal.id,
      title: `Reminder: follow up on the server deal for ${deal.project_name}`,
      body:  `${req.user.name} is nudging you about this deal (${STATUS_LABEL[deal.status] || deal.status}).`,
    });

    let emailSent = false;
    if (deal.pm_email) {
      try {
        await sendMail({
          to: deal.pm_email,
          subject: `Reminder: Server Deal for ${deal.project_name}`,
          html: dealReminderTemplate({
            recipientName: deal.pm_name, adminName: req.user.name, projectName: deal.project_name,
            dealStatus: STATUS_LABEL[deal.status] || deal.status,
            targetDate: deal.target_date ? new Date(deal.target_date).toLocaleDateString() : null,
          }),
        });
        emailSent = true;
      } catch (e) {
        console.error('[server-deals] Reminder email failed:', e.message);
      }
    }

    await logActivity({ user: req.user, action: 'remind', entity: 'server_deal', entityId: deal.id, detail: `Reminded ${deal.pm_name || 'PM'} about deal for '${deal.project_name}'` });
    res.json({ message: 'Reminder sent', emailSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/server-deals/:id ────────────────────────────────
// Soft delete — kept in the DB (with a reason) for audit trail, filtered out
// of every other tab, and surfaced on its own "Deleted" tab.
router.delete('/:id',
  isAdmin,
  [ body('reason').trim().notEmpty().withMessage('A reason is required') ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const [deals] = await pool.query('SELECT * FROM server_deals WHERE id = ?', [req.params.id]);
      if (!deals.length) return res.status(404).json({ error: 'Deal not found' });
      const deal = deals[0];
      if (deal.deleted_at) return res.status(400).json({ error: 'Deal is already deleted' });

      const [proj] = await pool.query('SELECT * FROM projects WHERE id = ?', [deal.project_id]);
      const managerId = getEffectiveManagerId(req.user);
      if (managerId && proj[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });

      await pool.query(
        `UPDATE server_deals SET deleted_at = NOW(), deleted_reason = ?, deleted_by = ? WHERE id = ?`,
        [req.body.reason.trim(), req.user.id, deal.id]
      );
      await logActivity({
        user: req.user, action: 'delete', entity: 'server_deal', entityId: deal.id,
        detail: `Deleted server deal for project '${proj[0].name}' — ${req.body.reason.trim()}`,
      });
      res.json({ message: 'Deal deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
