const express = require('express');
const { body, query, validationResult } = require('express-validator');
const pool    = require('../db/pool');
const { authenticate, getEffectiveManagerId } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Helper — verify user can access a project
async function canAccessProject(user, projectId) {
  const [rows] = await pool.query('SELECT manager_id, coordinator_id FROM projects WHERE id = ?', [projectId]);
  if (!rows.length) return false;
  if (user.role === 'coordinator') return rows[0].coordinator_id === user.id;
  const managerId = getEffectiveManagerId(user);
  if (!managerId) return true; // admins access all
  return rows[0].manager_id === managerId;
}

// ── GET /api/milestones?project_id=&month=&year= ───────────────
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT m.*, p.name AS project_name, p.portal, p.client
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
    `;
    const params = [];
    const wheres = [];

    if (req.user.role === 'coordinator') {
      wheres.push('p.coordinator_id = ?');
      params.push(req.user.id);
    } else {
      const managerId = getEffectiveManagerId(req.user);
      if (managerId) {
        wheres.push('p.manager_id = ?');
        params.push(managerId);
      }
    }
    if (req.query.project_id) {
      wheres.push('m.project_id = ?');
      params.push(req.query.project_id);
    }
    if (req.query.month) {
      wheres.push('m.month = ?');
      params.push(parseInt(req.query.month));
    }
    if (req.query.year) {
      wheres.push('m.year = ?');
      params.push(parseInt(req.query.year));
    }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY m.target_date ASC, m.created_at ASC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/milestones ───────────────────────────────────────
router.post('/',
  [
    body('project_id').notEmpty(),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2020, max: 2099 }),
    body('label').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
    body('achieved').optional().isFloat({ min: 0 }),
    body('status').optional().isIn(['Pending','Partial','Paid','Overdue']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { project_id, month, year, label, amount, target_date, achieved, status } = req.body;

    const ok = await canAccessProject(req.user, project_id);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    try {
      await pool.query(
        `INSERT INTO milestones (id, project_id, month, year, label, amount, target_date, achieved, status, created_by)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [project_id, month, year, label, parseFloat(amount), target_date || null,
         parseFloat(achieved || 0), status || 'Pending', req.user.id]
      );
      const [rows] = await pool.query(
        `SELECT m.*, p.portal, p.name AS project_name, p.client
         FROM milestones m JOIN projects p ON p.id = m.project_id
         WHERE m.project_id = ? AND m.label = ?
         ORDER BY m.created_at DESC LIMIT 1`,
        [project_id, label]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/milestones/:id ──────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const [ms] = await pool.query('SELECT * FROM milestones WHERE id = ?', [req.params.id]);
    if (!ms.length) return res.status(404).json({ error: 'Milestone not found' });

    const ok = await canAccessProject(req.user, ms[0].project_id);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    const allowed = ['label','amount','target_date','achieved','status','month','year'];
    const fields = [], values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(['amount','achieved'].includes(key) ? parseFloat(req.body[key]) : req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    await pool.query(`UPDATE milestones SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    const [rows] = await pool.query(
      `SELECT m.*, p.portal, p.name AS project_name
       FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE m.id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/milestones/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [ms] = await pool.query('SELECT project_id FROM milestones WHERE id = ?', [req.params.id]);
    if (!ms.length) return res.status(404).json({ error: 'Milestone not found' });

    const ok = await canAccessProject(req.user, ms[0].project_id);
    if (!ok) return res.status(403).json({ error: 'Access denied' });

    await pool.query('DELETE FROM milestones WHERE id = ?', [req.params.id]);
    res.json({ message: 'Milestone deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
