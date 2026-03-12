const express = require('express');
const { body, validationResult } = require('express-validator');
const pool    = require('../db/pool');
const { authenticate, isAdmin, getEffectiveManagerId } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /api/change-requests ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const managerId = getEffectiveManagerId(req.user);
    let sql = `
      SELECT cr.*,
             p.name  AS project_name,
             p.portal,
             u.name  AS created_by_name
      FROM change_requests cr
      JOIN projects p ON p.id = cr.project_id
      LEFT JOIN users u ON u.id = cr.created_by
    `;
    const params = [];
    if (managerId) {
      sql += ' WHERE p.manager_id = ?';
      params.push(managerId);
    }
    sql += ' ORDER BY cr.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/change-requests ──────────────────────────────────
router.post('/',
  [
    body('project_id').notEmpty(),
    body('title').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { project_id, title, amount, description } = req.body;

    // Verify project exists and user has access
    const managerId = getEffectiveManagerId(req.user);
    const [proj] = await pool.query('SELECT manager_id FROM projects WHERE id = ?', [project_id]);
    if (!proj.length) return res.status(404).json({ error: 'Project not found' });
    if (managerId && proj[0].manager_id !== managerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await pool.query(
        `INSERT INTO change_requests (id, project_id, title, amount, description, created_by)
         VALUES (UUID(), ?, ?, ?, ?, ?)`,
        [project_id, title, parseFloat(amount), description || null, req.user.id]
      );
      const [rows] = await pool.query(
        `SELECT cr.*, p.name AS project_name, u.name AS created_by_name
         FROM change_requests cr
         JOIN projects p ON p.id = cr.project_id
         LEFT JOIN users u ON u.id = cr.created_by
         WHERE cr.project_id = ? AND cr.title = ?
         ORDER BY cr.created_at DESC LIMIT 1`,
        [project_id, title]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/change-requests/:id/approve ────────────────────
router.patch('/:id/approve', isAdmin, async (req, res) => {
  try {
    const [crs] = await pool.query('SELECT * FROM change_requests WHERE id = ?', [req.params.id]);
    if (!crs.length) return res.status(404).json({ error: 'Change request not found' });
    if (crs[0].status !== 'pending') return res.status(400).json({ error: 'CR is not pending' });

    const cr = crs[0];
    const conn = await require('../db/pool').getConnection();
    try {
      await conn.beginTransaction();
      // Approve CR
      await conn.query(
        `UPDATE change_requests SET status = 'approved', reviewed_by = ? WHERE id = ?`,
        [req.user.id, cr.id]
      );
      // Add amount to project target + reactivate
      await conn.query(
        `UPDATE projects
         SET target_payment = target_payment + ?,
             all_payments_received = 0,
             status = 'active'
         WHERE id = ?`,
        [parseFloat(cr.amount), cr.project_id]
      );
      await conn.commit();
      res.json({ message: 'Change request approved and project reactivated' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/change-requests/:id/reject ─────────────────────
router.patch('/:id/reject', isAdmin, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE change_requests SET status = 'rejected', reviewed_by = ? WHERE id = ? AND status = 'pending'`,
      [req.user.id, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Pending CR not found' });
    res.json({ message: 'Change request rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
