const express  = require('express');
const bcrypt   = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool     = require('../db/pool');
const { authenticate, isAdmin, isSuperAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/logger');

const router = express.Router();
router.use(authenticate);

// ── GET /api/users ─────────────────────────────────────────────
// All authenticated users can list users (needed for coordinator dropdowns etc.)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.manager_id, u.created_at,
              m.name AS manager_name
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       ORDER BY u.role, u.name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/:id ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, role, manager_id, created_at FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/users ────────────────────────────────────────────
router.post('/',
  isAdmin,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    body('role').isIn(['sub_admin','project_manager','coordinator']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // Only super_admin can create sub_admins
    if (req.body.role === 'sub_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can create Sub Admins' });
    }

    const { name, email, password, role, manager_id } = req.body;
    try {
      // Check email uniqueness
      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) return res.status(409).json({ error: 'Email already in use' });

      const hashed = await bcrypt.hash(password, 10);
      const [result] = await pool.query(
        `INSERT INTO users (id, name, email, password, role, manager_id)
         VALUES (UUID(), ?, ?, ?, ?, ?)`,
        [name, email, hashed, role, manager_id || null]
      );

      // Fetch the created user
      const [rows] = await pool.query(
        'SELECT id, name, email, role, manager_id, created_at FROM users WHERE email = ?',
        [email]
      );
      await logActivity({ user: req.user, action: 'create', entity: 'user', entityId: rows[0].id, detail: `Created user '${name}' (${role})` });
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── PATCH /api/users/:id ───────────────────────────────────────
router.patch('/:id',
  isAdmin,
  [
    body('name').optional().trim().notEmpty(),
    body('role').optional().isIn(['sub_admin','project_manager','coordinator']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (req.body.role === 'sub_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can assign Sub Admin role' });
    }

    const { name, role, manager_id } = req.body;
    const fields = [], values = [];
    if (name !== undefined)       { fields.push('name = ?');       values.push(name); }
    if (role !== undefined)       { fields.push('role = ?');       values.push(role); }
    if (manager_id !== undefined) { fields.push('manager_id = ?'); values.push(manager_id || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    try {
      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
      const [rows] = await pool.query(
        'SELECT id, name, email, role, manager_id, created_at FROM users WHERE id = ?',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      await logActivity({ user: req.user, action: 'update', entity: 'user', entityId: req.params.id, detail: `Updated user '${rows[0].name}'` });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── DELETE /api/users/:id ──────────────────────────────────────
router.delete('/:id', isSuperAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  try {
    const [target] = await pool.query('SELECT name, role FROM users WHERE id = ?', [req.params.id]);
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    await logActivity({ user: req.user, action: 'delete', entity: 'user', entityId: req.params.id, detail: `Deleted user '${target[0]?.name}' (${target[0]?.role})` });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/users/:id/change-password ──────────────────────
// Admin-only: set a new password for any user without requiring the current one
router.patch('/:id/change-password', isAdmin,
  [body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const [target] = await pool.query('SELECT id, name, role FROM users WHERE id = ?', [req.params.id]);
      if (!target.length) return res.status(404).json({ error: 'User not found' });

      const hashed = await bcrypt.hash(req.body.newPassword, 10);
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
      await logActivity({ user: req.user, action: 'change_password', entity: 'user', entityId: req.params.id, detail: `Admin changed password for '${target[0].name}'` });
      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /api/users/seed-admin ─────────────────────────────────
// One-time endpoint to create the first super admin (disabled after first user exists)
router.post('/seed-admin', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id FROM users LIMIT 1');
    if (rows.length) return res.status(400).json({ error: 'Admin already exists. Use the app to manage users.' });

    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password required' });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (id, name, email, password, role) VALUES (UUID(), ?, ?, ?, 'super_admin')`,
      [name, email, hashed]
    );
    res.status(201).json({ message: 'Super Admin created. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
