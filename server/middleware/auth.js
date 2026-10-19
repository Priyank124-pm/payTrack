const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');
const { ADMIN_ROLES, seesAll, withAccess } = require('../services/access');

// Verify JWT and attach user to req
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query(
      'SELECT id, name, email, role, manager_id, is_active, permissions, data_scope FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    if (!rows[0].is_active) return res.status(403).json({ error: 'Your account has been disabled. Contact an administrator.' });
    req.user = withAccess(rows[0]);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Role guard — pass allowed roles array
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

const isAdmin    = authorize('super_admin', 'sub_admin');
const isSuperAdmin = authorize('super_admin');

// Resolve the effective manager ID for PM / coordinator
const getEffectiveManagerId = (user) => {
  if (seesAll(user)) return null;                       // "all data" access → no filter
  if (ADMIN_ROLES.includes(user.role)) return user.id;  // admin limited to own
  if (user.role === 'coordinator')      return user.manager_id;
  if (user.role === 'project_manager') return user.id;
  return null; // admins → no filter
};

module.exports = { authenticate, authorize, isAdmin, isSuperAdmin, getEffectiveManagerId };
