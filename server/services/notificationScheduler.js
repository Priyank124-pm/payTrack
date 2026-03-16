const pool = require('../db/pool');
const { sendMail, overdueTemplate, dueSoonTemplate } = require('./emailService');

// ── Run the notification check ────────────────────────────────
async function runNotifications() {
  const today    = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // 3 days from now (for "due soon" alerts)
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 3);
  const soonStr = soon.toISOString().split('T')[0];

  console.log(`[Notifications] Running check for ${todayStr}...`);

  try {
    // ── 1. OVERDUE milestones (past date, not Paid) ────────────
    const [overdue] = await pool.query(`
      SELECT
        m.id, m.label, m.amount, m.target_date, m.status,
        p.name  AS project_name,
        p.portal,
        pm.id   AS pm_id,
        pm.name AS pm_name,
        pm.email AS pm_email
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN users pm   ON pm.id = p.manager_id
      WHERE m.target_date < ?
        AND m.status NOT IN ('Paid')
        AND p.all_payments_received = 0
      ORDER BY pm.id, m.target_date
    `, [todayStr]);

    // ── 2. DUE SOON milestones (within 3 days, still Pending) ──
    const [dueSoon] = await pool.query(`
      SELECT
        m.id, m.label, m.amount, m.target_date,
        p.name  AS project_name,
        pm.id   AS pm_id,
        pm.name AS pm_name,
        pm.email AS pm_email
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
      JOIN users pm   ON pm.id = p.manager_id
      WHERE m.target_date BETWEEN ? AND ?
        AND m.status = 'Pending'
        AND p.all_payments_received = 0
      ORDER BY pm.id, m.target_date
    `, [todayStr, soonStr]);

    // ── Group by PM and send one email per PM ──────────────────
    const overdueByPM  = groupByPM(overdue);
    const dueSoonByPM  = groupByPM(dueSoon);

    const allPMIds = new Set([...Object.keys(overdueByPM), ...Object.keys(dueSoonByPM)]);

    for (const pmId of allPMIds) {
      const pmInfo = (overdueByPM[pmId] || dueSoonByPM[pmId])[0];

      // Send overdue email
      if (overdueByPM[pmId]?.length) {
        await sendMail({
          to:      pmInfo.pm_email,
          subject: `⚠️ ${overdueByPM[pmId].length} Overdue Payment(s) — NexPortal`,
          html:    overdueTemplate({ recipientName: pmInfo.pm_name, milestones: overdueByPM[pmId] }),
        });
        console.log(`[Notifications] Overdue email → ${pmInfo.pm_email} (${overdueByPM[pmId].length} milestones)`);
      }

      // Send due-soon email
      if (dueSoonByPM[pmId]?.length) {
        await sendMail({
          to:      pmInfo.pm_email,
          subject: `📅 ${dueSoonByPM[pmId].length} Payment(s) Due in 3 Days — NexPortal`,
          html:    dueSoonTemplate({ recipientName: pmInfo.pm_name, milestones: dueSoonByPM[pmId] }),
        });
        console.log(`[Notifications] Due-soon email → ${pmInfo.pm_email} (${dueSoonByPM[pmId].length} milestones)`);
      }
    }

    // ── Also notify coordinators for their PM's projects ───────
    const [coords] = await pool.query(`
      SELECT id, name, email, manager_id FROM users WHERE role = 'coordinator' AND manager_id IS NOT NULL
    `);

    for (const coord of coords) {
      const coordOverdue  = overdue.filter(m => m.pm_id === coord.manager_id);
      const coordDueSoon  = dueSoon.filter(m => m.pm_id === coord.manager_id);

      if (coordOverdue.length) {
        await sendMail({
          to:      coord.email,
          subject: `⚠️ ${coordOverdue.length} Overdue Payment(s) — NexPortal`,
          html:    overdueTemplate({ recipientName: coord.name, milestones: coordOverdue }),
        });
        console.log(`[Notifications] Overdue email → coordinator ${coord.email}`);
      }
      if (coordDueSoon.length) {
        await sendMail({
          to:      coord.email,
          subject: `📅 ${coordDueSoon.length} Payment(s) Due Soon — NexPortal`,
          html:    dueSoonTemplate({ recipientName: coord.name, milestones: coordDueSoon }),
        });
        console.log(`[Notifications] Due-soon email → coordinator ${coord.email}`);
      }
    }

    console.log(`[Notifications] Check complete.`);
  } catch (err) {
    console.error('[Notifications] Error:', err.message);
  }
}

function groupByPM(rows) {
  return rows.reduce((acc, row) => {
    if (!acc[row.pm_id]) acc[row.pm_id] = [];
    acc[row.pm_id].push(row);
    return acc;
  }, {});
}

// ── Simple cron-style scheduler ───────────────────────────────
// Runs once at startup (if within the configured window) then every 24h.
function startScheduler() {
  const RUN_HOUR = parseInt(process.env.NOTIFICATION_HOUR || '9'); // 9 AM default

  function scheduleNext() {
    const now  = new Date();
    const next = new Date();
    next.setHours(RUN_HOUR, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1); // push to tomorrow if already past

    const msUntilNext = next - now;
    console.log(`[Notifications] Next run scheduled at ${next.toLocaleString()} (in ${Math.round(msUntilNext/60000)} min)`);

    setTimeout(async () => {
      await runNotifications();
      scheduleNext(); // schedule next day
    }, msUntilNext);
  }

  scheduleNext();

  // Also expose a manual trigger for testing
  return { runNow: runNotifications };
}

module.exports = { startScheduler, runNotifications };
