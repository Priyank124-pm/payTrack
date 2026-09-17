const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authenticate, isAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/logger');
const { notifyMany, getAdminIds } = require('../services/notifyService');

const router = express.Router();

// ── POST /api/contact-requests ──────────────────────────────────
// Public — hit by anonymous visitors from the "Contact Us" / "Talk to our
// team" CTAs on the landing page. No `authenticate` here.
router.post('/',
  [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('company').optional({ checkFalsy: true }).trim(),
    body('message').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, company, message } = req.body;
    try {
      await pool.query(
        `INSERT INTO contact_requests (id, name, email, company, message) VALUES (UUID(), ?, ?, ?, ?)`,
        [name, email, company || null, message || null]
      );
      const [[request]] = await pool.query(
        'SELECT * FROM contact_requests WHERE email = ? ORDER BY created_at DESC LIMIT 1', [email]
      );

      await logActivity({
        user: { id: null, name: 'Website', role: 'system' },
        action: 'create', entity: 'contact_request', entityId: request.id,
        detail: `New contact request from ${name} (${email})`,
      });
      const adminIds = await getAdminIds();
      await notifyMany(adminIds, {
        type: 'contact_request', entityType: 'contact_request', entityId: request.id,
        title: 'New contact request from the website',
        body: `${name} (${email}) wants to talk`,
      });

      res.status(201).json({ message: 'Thanks — we\'ll be in touch shortly.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not submit your request' });
    }
  }
);

// ── GET /api/contact-requests ────────────────────────────────────
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM contact_requests ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/contact-requests/:id/status ──────────────────────
router.patch('/:id/status',
  authenticate, isAdmin,
  [ body('status').isIn(['new', 'contacted', 'closed']) ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const [result] = await pool.query('UPDATE contact_requests SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
      const [[request]] = await pool.query('SELECT * FROM contact_requests WHERE id = ?', [req.params.id]);
      res.json(request);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
