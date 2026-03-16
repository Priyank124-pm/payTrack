const nodemailer = require('nodemailer');

// ── Transporter (configure via .env) ─────────────────────────
// Supports Gmail, SMTP, or any provider.
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,  // For Gmail use an App Password
  },
});

const FROM = process.env.SMTP_FROM || `NexPortal <${process.env.SMTP_USER}>`;

// ── Verify on startup ─────────────────────────────────────────
transporter.verify((err) => {
  if (err) console.warn('⚠️  Email not configured:', err.message);
  else     console.log('✅  Email (SMTP) ready');
});

// ── Send helper ───────────────────────────────────────────────
async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[EMAIL SKIP] No SMTP configured. Would send to: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: FROM, to, subject, html });
}

// ── Email templates ───────────────────────────────────────────
function overdueTemplate({ recipientName, milestones }) {
  const rows = milestones.map(m => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;font-weight:600;">${m.project_name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;">${m.label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;font-family:monospace;">$${Number(m.amount).toLocaleString()}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;color:#DC2626;font-weight:600;">${m.target_date}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;">
        <span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Overdue</span>
      </td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#F5F7FA;">
    <div style="max-width:640px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 32px;display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:white;">N</div>
        <div>
          <div style="color:white;font-size:20px;font-weight:800;letter-spacing:-.5px;">NexPortal</div>
          <div style="color:rgba(255,255,255,.75);font-size:12px;">Payment Reminder</div>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px;">
        <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:flex;gap:10px;align-items:flex-start;">
          <span style="font-size:18px;">⚠️</span>
          <div>
            <div style="font-weight:700;color:#92400E;margin-bottom:3px;">Overdue Payment Alert</div>
            <div style="color:#B45309;font-size:13px;">The following milestones have passed their target date and are still unpaid.</div>
          </div>
        </div>

        <p style="color:#374151;font-size:14px;margin-bottom:20px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="color:#6B7280;font-size:13px;line-height:1.6;margin-bottom:22px;">
          You have <strong style="color:#DC2626;">${milestones.length} overdue payment${milestones.length > 1 ? 's' : ''}</strong> that require your attention. Please follow up with the clients and update the status in NexPortal.
        </p>

        <!-- Table -->
        <table style="width:100%;border-collapse:collapse;border:1px solid #E2E6EF;border-radius:10px;overflow:hidden;font-size:13px;">
          <thead>
            <tr style="background:#F0F2F7;">
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Project</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Milestone</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Amount</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Due Date</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p style="color:#9CA3AF;font-size:12px;margin-top:24px;line-height:1.6;">
          Log in to NexPortal to update milestone statuses and mark payments as received.
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#F5F7FA;border-top:1px solid #E2E6EF;padding:16px 32px;text-align:center;">
        <p style="color:#9CA3AF;font-size:11px;margin:0;">
          This is an automated reminder from NexPortal. Do not reply to this email.
        </p>
      </div>
    </div>
  </body>
  </html>
  `;
}

function dueSoonTemplate({ recipientName, milestones }) {
  const rows = milestones.map(m => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;font-weight:600;">${m.project_name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;">${m.label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;font-family:monospace;">$${Number(m.amount).toLocaleString()}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #E2E6EF;color:#D97706;font-weight:600;">${m.target_date}</td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#F5F7FA;">
    <div style="max-width:640px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 32px;display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:white;">N</div>
        <div>
          <div style="color:white;font-size:20px;font-weight:800;">NexPortal</div>
          <div style="color:rgba(255,255,255,.75);font-size:12px;">Payment Due Soon</div>
        </div>
      </div>
      <div style="padding:28px 32px;">
        <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
          <div style="font-weight:700;color:#92400E;">📅 Payment Due in 3 Days</div>
          <div style="color:#B45309;font-size:13px;margin-top:3px;">The following milestones are due soon.</div>
        </div>
        <p style="color:#374151;font-size:14px;margin-bottom:20px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="color:#6B7280;font-size:13px;line-height:1.6;margin-bottom:22px;">
          You have <strong>${milestones.length} payment${milestones.length > 1 ? 's' : ''}</strong> due within the next 3 days.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #E2E6EF;border-radius:10px;overflow:hidden;font-size:13px;">
          <thead>
            <tr style="background:#F0F2F7;">
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Project</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Milestone</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Amount</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;">Due Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="background:#F5F7FA;border-top:1px solid #E2E6EF;padding:16px 32px;text-align:center;">
        <p style="color:#9CA3AF;font-size:11px;margin:0;">Automated reminder from NexPortal.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

module.exports = { sendMail, overdueTemplate, dueSoonTemplate };
