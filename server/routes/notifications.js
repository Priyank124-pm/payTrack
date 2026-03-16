const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const { runNotifications } = require('../services/notificationScheduler');

const router = express.Router();
router.use(authenticate);

// ── POST /api/notifications/run ────────────────────────────────
// Admin can manually trigger the notification check (useful for testing)
router.post('/run', isAdmin, async (req, res) => {
  try {
    await runNotifications();
    res.json({ message: 'Notification check completed. Check server logs for details.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/notifications/overdue ────────────────────────────
// Returns list of overdue milestones (for admin dashboard display)
router.get('/overdue', isAdmin, async (req, res) => {
  const pool = require('../db/pool');
  const today = new Date().toISOString().split('T')[0];
  try {
    const [rows] = await pool.query(`
      SELECT m.id, m.label, m.amount, m.target_date, m.status,
             p.name AS project_name, p.portal,
             pm.name AS pm_name, pm.email AS pm_email
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN users pm   ON pm.id = p.manager_id
      WHERE m.target_date < ?
        AND m.status NOT IN ('Paid')
        AND p.all_payments_received = 0
      ORDER BY m.target_date ASC
    `, [today]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
