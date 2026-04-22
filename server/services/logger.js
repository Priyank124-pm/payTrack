const pool = require('../db/pool');

async function logActivity({ user, action, entity, entityId = null, detail = '' }) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (id, user_id, user_name, user_role, action, entity, entity_id, detail)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.role, action, entity, entityId || null, detail]
    );
  } catch (e) {
    // Never let logging break the main request
    console.error('Activity log insert failed:', e.message);
  }
}

module.exports = { logActivity };
