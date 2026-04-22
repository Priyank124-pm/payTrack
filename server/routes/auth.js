const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool     = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/logger');

const router = express.Router();

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const [rows] = await pool.query(
        'SELECT id, name, email, password, role, manager_id FROM users WHERE email = ?',
        [email]
      );
      if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      delete user.password;
      const token = signToken(user);
      await logActivity({ user, action: 'login', entity: 'session', detail: 'Signed in' });
      res.json({ token, user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// ── POST /api/auth/change-password ───────────────────────────
router.post('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    try {
      const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });

      const valid = await bcrypt.compare(currentPassword, rows[0].password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
      await logActivity({ user: req.user, action: 'change_password', entity: 'session', detail: 'Changed password' });
      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
