const express = require('express');
const pool    = require('../db/pool');
const { authenticate, isAdmin, getEffectiveManagerId } = require('../middleware/auth');
const { logActivity } = require('../services/logger');
const stripeService   = require('../services/stripeService');

const router = express.Router();
router.use(authenticate);

// ── GET /api/server-subscriptions ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const managerId = getEffectiveManagerId(req.user);
    let sql = `
      SELECT ss.*, sd.plan_name,
             p.name AS project_name, p.client AS client_name, p.manager_id, u.name AS pm_name
      FROM server_subscriptions ss
      JOIN server_deals sd ON sd.id = ss.deal_id
      JOIN projects p      ON p.id  = ss.project_id
      LEFT JOIN users u    ON u.id  = p.manager_id
    `;
    const params = [];
    const wheres = [];
    if (req.user.role === 'coordinator') { wheres.push('p.coordinator_id = ?'); params.push(req.user.id); }
    else if (managerId) { wheres.push('p.manager_id = ?'); params.push(managerId); }
    if (req.query.status)  { wheres.push('ss.status = ?');   params.push(req.query.status); }
    if (req.query.at_risk) { wheres.push('ss.at_risk = 1'); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY ss.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/server-subscriptions/:id ───────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ss.*, sd.plan_name, p.name AS project_name, p.client AS client_name, p.manager_id
       FROM server_subscriptions ss
       JOIN server_deals sd ON sd.id = ss.deal_id
       JOIN projects p      ON p.id  = ss.project_id
       WHERE ss.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found' });
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && rows[0].manager_id !== managerId) return res.status(403).json({ error: 'Access denied' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/server-subscriptions/:id/cancel ──────────────────
// Local status is NOT flipped here — the `customer.subscription.deleted`
// webhook is the sole source of truth, same principle as the checkout flow.
router.patch('/:id/cancel', isAdmin, async (req, res) => {
  const reason = (req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A cancellation reason is required' });
  try {
    const [rows] = await pool.query('SELECT * FROM server_subscriptions WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found' });
    const sub = rows[0];

    await stripeService.cancelSubscription(sub.stripe_subscription_id);
    // Recorded immediately (not waiting on Stripe's webhook) since we already have it in hand.
    await pool.query('UPDATE server_subscriptions SET cancel_reason = ? WHERE id = ?', [reason, sub.id]);
    await logActivity({ user: req.user, action: 'cancel_requested', entity: 'server_subscription', entityId: sub.id, detail: `Cancellation requested for subscription ${sub.stripe_subscription_id} — ${reason}` });
    res.json({ message: 'Cancellation requested — status will update once Stripe confirms' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
