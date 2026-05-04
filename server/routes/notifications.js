const express = require('express');
const pool    = require('../db/pool');
const { authenticate, isAdmin } = require('../middleware/auth');
const { runNotifications }      = require('../services/notificationScheduler');

const router = express.Router();
router.use(authenticate);

// ── GET /api/notifications ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/notifications/count ─────────────────────────────
router.get('/count', async (req, res) => {
  try {
    const [[{ cnt }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM user_notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ count: Number(cnt) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────
router.patch('/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ message: 'All marked read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    await pool.query(
      'UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/notifications/clear ──────────────────────────
router.delete('/clear', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM user_notifications WHERE user_id = ? AND is_read = 1',
      [req.user.id]
    );
    res.json({ message: 'Cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/notifications/run (admin) ──────────────────────
router.post('/run', isAdmin, async (req, res) => {
  try {
    await runNotifications();
    res.json({ message: 'Notification check completed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/notifications/overdue (admin) ────────────────────
router.get('/overdue', isAdmin, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const [rows] = await pool.query(`
      SELECT m.id, m.label, m.amount, m.target_date, m.status,
             p.name AS project_name, p.portal,
             pm.name AS pm_name, pm.email AS pm_email
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN users pm   ON pm.id = p.manager_id
      WHERE m.target_date < ? AND m.status NOT IN ('Paid') AND p.all_payments_received = 0
      ORDER BY m.target_date ASC
    `, [today]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
