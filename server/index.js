require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const initDB  = require('./db/init');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// Stripe webhook needs the raw request body for signature verification —
// must be mounted BEFORE express.json() consumes it.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./routes/stripeWebhook'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Request logger (dev) ───────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()}  ${req.method}  ${req.path}`);
    next();
  });
}

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/users',           require('./routes/users'));
app.use('/api/projects',        require('./routes/projects'));
app.use('/api/milestones',      require('./routes/milestones'));
app.use('/api/change-requests', require('./routes/changeRequests'));
app.use('/api/reports',         require('./routes/reports'));
app.use('/api/notifications',   require('./routes/notifications'));
app.use('/api/activity-logs',   require('./routes/activityLogs'));
app.use('/api/tasks',           require('./routes/tasks'));
app.use('/api/server-deals',         require('./routes/serverDeals'));
app.use('/api/server-subscriptions', require('./routes/serverSubscriptions'));
app.use('/api/invoices',             require('./routes/invoices'));
app.use('/api/public',               require('./routes/publicCheckout'));
app.use('/api/contact-requests',     require('./routes/contactRequests'));

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 ────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ───────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ───────────────────────────────────────────────────────
(async () => {
  await initDB();
  const { startScheduler } = require('./services/notificationScheduler');
  startScheduler();
  // Stripe now owns billing cadence/charging end-to-end (subscriptions
  // auto-renew on their own schedule) — NexPortal only tracks subscription
  // state via webhooks, so the old invoice-generation scheduler stays off.
  // Left running, it would generate + charge a second, duplicate invoice on
  // top of Stripe's own automatic renewal invoice.
  app.listen(PORT, () => {
    console.log(`🚀  NexPortal API running on http://localhost:${PORT}`);
    console.log(`   CLIENT_URL = ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  });
})();
