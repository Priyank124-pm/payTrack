const express = require('express');
const { body, query, validationResult } = require('express-validator');
const pool    = require('../db/pool');
const { authenticate, isAdmin, isSuperAdmin, getEffectiveManagerId } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const COMMISSION_PORTALS = ['Fiverr', 'Upwork'];

// ── GET /api/projects ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const managerId = getEffectiveManagerId(req.user);
    let sql = `
      SELECT p.*,
             u.name  AS manager_name,
             u.email AS manager_email,
             COALESCE(SUM(m.achieved), 0) AS total_achieved
      FROM projects p
      LEFT JOIN users u    ON u.id = p.manager_id
      LEFT JOIN milestones m ON m.project_id = p.id
    `;
    const params = [];
    if (managerId) {
      sql += ' WHERE p.manager_id = ?';
      params.push(managerId);
    }
    sql += ' GROUP BY p.id ORDER BY p.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/projects/:id ──────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS manager_name,
              COALESCE(SUM(m.achieved), 0) AS total_achieved
       FROM projects p
       LEFT JOIN users u ON u.id = p.manager_id
       LEFT JOIN milestones m ON m.project_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });

    // Access check for non-admins
    const managerId = getEffectiveManagerId(req.user);
    if (managerId && rows[0].manager_id !== managerId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/projects ─────────────────────────────────────────
router.post('/',
  [
    body('name').trim().notEmpty(),
    body('client').trim().notEmpty(),
    body('type').isIn(['Monthly','Hourly','Milestone']),
    body('portal').trim().notEmpty(),
    body('manager_id').notEmpty(),
    body('target_payment').isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, client, type, portal, manager_id, target_payment } = req.body;

    // Non-admins can only create for their own manager_id
    const effectiveId = getEffectiveManagerId(req.user);
    if (effectiveId && manager_id !== effectiveId) {
      return res.status(403).json({ error: 'You can only create projects for yourself' });
    }

    try {
      await pool.query(
        `INSERT INTO projects (id, name, client, type, portal, manager_id, target_payment)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [name, client, type, portal, manager_id, parseFloat(target_payment)]
      );
      const [rows] = await pool.query(
        `SELECT p.*, u.name AS manager_name, 0 AS total_achieved
         FROM projects p LEFT JOIN users u ON u.id = p.manager_id
         WHERE p.name = ? AND p.client = ? ORDER BY p.created_at DESC LIMIT 1`,
        [name, client]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/projects/:id ────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Project not found' });

    const managerId = getEffectiveManagerId(req.user);
    if (managerId && existing[0].manager_id !== managerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowed = ['name','client','type','portal','manager_id','target_payment','status','all_payments_received'];
    const fields = [], values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    await pool.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS manager_name, COALESCE(SUM(m.achieved),0) AS total_achieved
       FROM projects p LEFT JOIN users u ON u.id = p.manager_id
       LEFT JOIN milestones m ON m.project_id = p.id
       WHERE p.id = ? GROUP BY p.id`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/projects/:id/mark-received ─────────────────────
router.patch('/:id/mark-received', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: 'Project not found' });

    const managerId = getEffectiveManagerId(req.user);
    if (managerId && existing[0].manager_id !== managerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      `UPDATE projects SET all_payments_received = 1, status = 'completed' WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Project marked as all payments received' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/projects/:id ───────────────────────────────────
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
