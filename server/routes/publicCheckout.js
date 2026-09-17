const express = require('express');
const { body, validationResult } = require('express-validator');
const stripeService = require('../services/stripeService');

const router = express.Router();
// No `authenticate` — this is hit by anonymous visitors on the public site,
// same pattern as routes/auth.js's /login.

// Server-side price catalog — never trust a client-submitted amount.
const PUBLIC_PLANS = {
  Starter:      { amount: 99,  billing_interval: 'month' },
  Professional: { amount: 199, billing_interval: 'month' },
  Business:     { amount: 399, billing_interval: 'month' },
};

// ── POST /api/public/checkout ───────────────────────────────────
router.post('/checkout',
  [ body('plan').isIn(Object.keys(PUBLIC_PLANS)) ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { plan } = req.body;
    const catalog = PUBLIC_PLANS[plan];
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

    try {
      const session = await stripeService.createPlanCheckoutSession({
        planName: `${plan} — Managed Hosting`,
        amount: catalog.amount,
        billingInterval: catalog.billing_interval,
        successUrl: `${siteUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${siteUrl}/#pricing`,
        metadata: {
          // Nothing is created yet — the project/deal are created lazily by
          // the webhook only once payment is confirmed (see stripeWebhook.js),
          // so an abandoned checkout never leaves a stray record behind.
          source: 'public_signup',
          plan,
          amount: String(catalog.amount),
          billing_interval: catalog.billing_interval,
        },
      });
      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not start checkout' });
    }
  }
);

module.exports = router;
