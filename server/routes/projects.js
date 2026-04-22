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
    let sql = `
      SELECT p.*,
             u.name  AS manager_name,
             u.email AS manager_email,
             c.name  AS coordinator_name,
             COALESCE(SUM(m.achieved), 0) AS total_achieved
      FROM projects p
      LEFT JOIN users u    ON u.id = p.manager_id
      LEFT JOIN users c    ON c.id = p.coordinator_id
      LEFT JOIN milestones m ON m.project_id = p.id
    `;
    const params = [];
    if (req.user.role === 'coordinator') {
      sql += ' WHERE p.coordinator_id = ?';
      params.push(req.user.id);
    } else {
      const managerId = getEffectiveManagerId(req.user);
      if (managerId) {
        sql += ' WHERE p.manager_id = ?';
        params.push(managerId);
      }
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
    body('target_payment').optional().isFloat({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, client, type, portal, manager_id, coordinator_id, target_payment } = req.body;

    // Non-admins can only create for their own manager_id
    const effectiveId = getEffectiveManagerId(req.user);
    if (effectiveId && manager_id !== effectiveId) {
      return res.status(403).json({ error: 'You can only create projects for yourself' });
    }

    try {
      await pool.query(
        `INSERT INTO projects (id, name, client, type, portal, manager_id, coordinator_id, target_payment)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
        [name, client, type, portal, manager_id, coordinator_id || null, parseFloat(target_payment) || 0]
      );
      const [rows] = await pool.query(
        `SELECT p.*, u.name AS manager_name, c.name AS coordinator_name, 0 AS total_achieved
         FROM projects p
         LEFT JOIN users u ON u.id = p.manager_id
         LEFT JOIN users c ON c.id = p.coordinator_id
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

// ── POST /api/projects/bulk-import ────────────────────────────
router.post('/bulk-import', isAdmin,
  [ body('rows').isArray({ min: 1 }) ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { rows } = req.body;
    const VALID_PORTALS = ['Upwork','Fiverr','Toptal','PeoplePerHour','Freelancer','Direct'];
    const VALID_TYPES   = ['Monthly','Hourly','Milestone'];
    const HEALTH_MAP    = { green: 'active', amber: 'on_hold', yellow: 'on_hold', red: 'on_hold' };

    const created = [];
    const importErrors = [];

    for (const row of rows) {
      try {
        const projectName = (row.project_name || '').trim();
        const clientName  = (row.client_name  || '').trim();
        const managerName = (row.manager_name || '').trim();

        if (!projectName) { importErrors.push({ project: '(blank)', error: 'Missing Project Name' }); continue; }
        if (!clientName)  { importErrors.push({ project: projectName, error: 'Missing Client Name' }); continue; }
        if (!managerName) { importErrors.push({ project: projectName, error: 'Missing Project Manager' }); continue; }

        const [pms] = await pool.query(
          "SELECT id FROM users WHERE role = 'project_manager' AND LOWER(TRIM(name)) = LOWER(TRIM(?))",
          [managerName]
        );
        if (!pms.length) {
          importErrors.push({ project: projectName, error: `PM "${managerName}" not found` });
          continue;
        }

        const managerId     = pms[0].id;
        const portalRaw     = (row.portal || '').trim();
        const portal        = VALID_PORTALS.find(p => p.toLowerCase() === portalRaw.toLowerCase()) || 'Direct';
        const typeRaw       = (row.type   || '').trim();
        const type          = VALID_TYPES.find(t => t.toLowerCase() === typeRaw.toLowerCase()) || 'Monthly';
        const status        = HEALTH_MAP[(row.project_health || '').toLowerCase()] || 'active';
        const targetPayment = parseFloat(row.target_payment) || 0;

        // Resolve optional coordinator
        let coordinatorId = null;
        const coordName = (row.coordinator_name || '').trim();
        if (coordName) {
          const [coords] = await pool.query(
            "SELECT id FROM users WHERE role = 'coordinator' AND LOWER(TRIM(name)) = LOWER(TRIM(?))",
            [coordName]
          );
          if (!coords.length) {
            importErrors.push({ project: projectName, error: `Coordinator "${coordName}" not found` });
            continue;
          }
          coordinatorId = coords[0].id;
        }

        await pool.query(
          `INSERT INTO projects (id, name, client, type, portal, manager_id, coordinator_id, target_payment, status, all_payments_received)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [projectName, clientName, type, portal, managerId, coordinatorId, targetPayment, status]
        );
        created.push({ project: projectName, manager: managerName, coordinator: coordName || '—' });
      } catch (err) {
        console.error(err);
        importErrors.push({ project: row.project_name || '?', error: err.message });
      }
    }

    res.json({ created: created.length, errors: importErrors });
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

    const allowed = ['name','client','type','portal','manager_id','coordinator_id','target_payment','status','all_payments_received'];
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
