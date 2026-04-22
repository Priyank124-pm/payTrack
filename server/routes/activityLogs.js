const express = require('express');
const pool    = require('../db/pool');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, isAdmin);

// ── GET /api/activity-logs ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      user_id, role, entity, action,
      from_date, to_date, search,
      page = 1, limit = 50,
    } = req.query;

    const wheres = [];
    const params = [];

    if (user_id)   { wheres.push('user_id = ?');           params.push(user_id); }
    if (role)      { wheres.push('user_role = ?');          params.push(role); }
    if (entity)    { wheres.push('entity = ?');             params.push(entity); }
    if (action)    { wheres.push('action = ?');             params.push(action); }
    if (from_date) { wheres.push('created_at >= ?');        params.push(from_date + ' 00:00:00'); }
    if (to_date)   { wheres.push('created_at <= ?');        params.push(to_date   + ' 23:59:59'); }
    if (search)    { wheres.push('(user_name LIKE ? OR detail LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const lim    = Math.min(200, Math.max(1, parseInt(limit)));

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM activity_logs ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, lim, offset]
    );

    res.json({ logs: rows, total, page: parseInt(page), pages: Math.ceil(total / lim) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/activity-logs/users — distinct users who have logs ─
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT user_id, user_name, user_role FROM activity_logs ORDER BY user_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
