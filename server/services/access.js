// Page-level access control.
// Admin-only pages (users, activitylogs) are never configurable — they follow the role.
// Every other page can be switched on/off per user by an admin. A user with no
// stored permissions (NULL) gets the full default set for their role.
const ADMIN_ROLES = ['super_admin', 'sub_admin'];

const CONFIGURABLE_PAGES = [
  'projects', 'projections', 'projectlookup', 'lastpayments', 'reports',
  'portalpayments', 'tasks', 'boards', 'servermgmt',
];

function parsePermissions(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(p => CONFIGURABLE_PAGES.includes(p)) : null;
  } catch { return null; }
}

// Pages this user may open (configurable ones only)
function effectivePages(user) {
  if (user.role === 'super_admin') return [...CONFIGURABLE_PAGES];
  const stored = parsePermissions(user.permissions);
  return stored === null ? [...CONFIGURABLE_PAGES] : stored;
}

const hasPage = (user, page) => effectivePages(user).includes(page);

// Express guard
const requirePage = (page) => (req, res, next) =>
  hasPage(req.user, page) ? next() : res.status(403).json({ error: 'You do not have access to this section' });

// Data visibility: 'all' = every user's records, 'own' = only their own.
// NULL (never configured) keeps the role default: admins see all, everyone else sees their own.
const seesAll = (user) => user.data_scope === 'all' || (!user.data_scope && ADMIN_ROLES.includes(user.role));

module.exports = { seesAll, ADMIN_ROLES, CONFIGURABLE_PAGES, parsePermissions, effectivePages, hasPage, requirePage };
