// All API calls go through this module.
// The React proxy (package.json → "proxy") forwards /api/* to http://localhost:4000 in dev.
// In production set REACT_APP_API_URL to your server domain.

const BASE = process.env.REACT_APP_API_URL || '';

const getToken = () => localStorage.getItem('nexportal_token');

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.errors?.[0]?.msg || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const patch= (path, body)  => request('PATCH',  path, body);
const del  = (path)        => request('DELETE', path);

// ── Auth ───────────────────────────────────────────────────────
export const authAPI = {
  login:          (email, password) => post('/api/auth/login', { email, password }),
  me:             ()                => get('/api/auth/me'),
  changePassword: (body)            => post('/api/auth/change-password', body),
};

// ── Users ──────────────────────────────────────────────────────
export const usersAPI = {
  list:       ()          => get('/api/users'),
  create:     (body)      => post('/api/users', body),
  update:     (id, body)  => patch(`/api/users/${id}`, body),
  remove:     (id)        => del(`/api/users/${id}`),
  seedAdmin:  (body)      => post('/api/users/seed-admin', body),
};

// ── Projects ───────────────────────────────────────────────────
export const projectsAPI = {
  list:         (params={})=> { const qs=new URLSearchParams(params).toString(); return get(`/api/projects${qs?'?'+qs:''}`); },
  get:          (id)       => get(`/api/projects/${id}`),
  create:       (body)     => post('/api/projects', body),
  update:       (id, body) => patch(`/api/projects/${id}`, body),
  markReceived: (id)       => patch(`/api/projects/${id}/mark-received`),
  archive:      (id)       => patch(`/api/projects/${id}/archive`),
  unarchive:    (id)       => patch(`/api/projects/${id}/unarchive`),
  remove:       (id)       => del(`/api/projects/${id}`),
  bulkImport:   (body)     => post('/api/projects/bulk-import', body),
  bulkDelete:   (ids)      => post('/api/projects/bulk-delete', { ids }),
};

// ── Milestones ─────────────────────────────────────────────────
export const milestonesAPI = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/api/milestones${qs ? '?' + qs : ''}`);
  },
  create: (body)        => post('/api/milestones', body),
  update: (id, body)    => patch(`/api/milestones/${id}`, body),
  remove: (id)          => del(`/api/milestones/${id}`),
};

// ── Change Requests ────────────────────────────────────────────
export const changeRequestsAPI = {
  list:    ()   => get('/api/change-requests'),
  create:  (body) => post('/api/change-requests', body),
  approve: (id)   => patch(`/api/change-requests/${id}/approve`),
  reject:  (id)   => patch(`/api/change-requests/${id}/reject`),
};

// ── Reports ────────────────────────────────────────────────────
export const reportsAPI = {
  monthly: (month, year) => get(`/api/reports/monthly?month=${month}&year=${year}`),
};

// ── Activity Logs ──────────────────────────────────────────────
export const logsAPI = {
  list:  (params = {}) => { const qs = new URLSearchParams(params).toString(); return get(`/api/activity-logs${qs ? '?' + qs : ''}`); },
  users: ()            => get('/api/activity-logs/users'),
};

// ── Tasks ──────────────────────────────────────────────────────
export const tasksAPI = {
  list:     (params = {}) => { const qs = new URLSearchParams(params).toString(); return get(`/api/tasks${qs ? '?' + qs : ''}`); },
  create:   (body)        => post('/api/tasks', body),
  update:   (id, body)    => patch(`/api/tasks/${id}`, body),
  complete: (id, note)    => patch(`/api/tasks/${id}/complete`, { note }),
  reopen:   (id)          => patch(`/api/tasks/${id}/reopen`, {}),
  remove:   (id)          => del(`/api/tasks/${id}`),
  comments: (id)          => get(`/api/tasks/${id}/comments`),
  addComment: (id, comment) => post(`/api/tasks/${id}/comments`, { comment }),
};
