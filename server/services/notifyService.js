const pool = require('../db/pool');

async function notify(userId, { type, title, body = null, entityType = null, entityId = null }) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO user_notifications (id, user_id, type, title, body, entity_type, entity_id)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
      [userId, type, title, body || null, entityType || null, entityId || null]
    );
  } catch (e) {
    console.error('Notification insert failed:', e.message);
  }
}

async function notifyMany(userIds, opts) {
  for (const uid of [...new Set(userIds)].filter(Boolean)) {
    await notify(uid, opts);
  }
}

async function getAdminIds() {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE role IN ('super_admin','sub_admin')"
  );
  return rows.map(r => r.id);
}

module.exports = { notify, notifyMany, getAdminIds };
