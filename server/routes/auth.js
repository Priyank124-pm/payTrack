const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { body, validationResult } = require('express-validator');
const pool     = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../services/logger');
const { sendMail } = require('../services/emailService');

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

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Valid email required' });

    const { email } = req.body;
    try {
      const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);
      // Always respond with success to prevent email enumeration
      if (!rows.length) return res.json({ message: 'If that email exists, a reset link has been sent.' });

      const user  = rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Remove any existing token for this user
      await pool.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
      await pool.query(
        'INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (UUID(), ?, ?, ?)',
        [user.id, token, expiresAt]
      );

      const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}?reset_token=${token}`;
      await sendMail({
        to: email,
        subject: 'NexPortal — Reset your password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#4F46E5">Password Reset Request</h2>
            <p>Hi <strong>${user.name}</strong>,</p>
            <p>Someone requested a password reset for your NexPortal account. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
            <p style="margin:28px 0">
              <a href="${resetUrl}" style="background:#4F46E5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
                Reset Password
              </a>
            </p>
            <p style="color:#6B7280;font-size:13px">If you did not request this, you can safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
            <p style="color:#9CA3AF;font-size:12px">NexPortal Management Suite</p>
          </div>
        `,
      });

      res.json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Token and a password of at least 6 characters are required' });

    const { token, newPassword } = req.body;
    try {
      const [rows] = await pool.query(
        'SELECT pr.user_id, u.name, u.email, u.role FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.token = ? AND pr.expires_at > NOW()',
        [token]
      );
      if (!rows.length) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

      const { user_id, name, email, role } = rows[0];
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, user_id]);
      await pool.query('DELETE FROM password_resets WHERE user_id = ?', [user_id]);
      await logActivity({ user: { id: user_id, name, role }, action: 'change_password', entity: 'session', detail: 'Reset password via email link' });
      res.json({ message: 'Password reset successfully. You can now sign in.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
