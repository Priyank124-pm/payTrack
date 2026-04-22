import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Avatar, EmptyState, Spinner, RoleBadge } from '../components/UI';
import { logsAPI } from '../api';

const ACTION_META = {
  login:           { label: 'Login',           cls: 'badge-indigo' },
  change_password: { label: 'Pwd Change',      cls: 'badge-yellow' },
  create:          { label: 'Create',          cls: 'badge-green'  },
  update:          { label: 'Update',          cls: 'badge-blue'   },
  delete:          { label: 'Delete',          cls: 'badge-red'    },
  archive:         { label: 'Archive',         cls: 'badge-gray'   },
  unarchive:       { label: 'Restore',         cls: 'badge-purple' },
  mark_received:   { label: 'Mark Received',   cls: 'badge-green'  },
  bulk_import:     { label: 'Bulk Import',     cls: 'badge-green'  },
  bulk_delete:     { label: 'Bulk Delete',     cls: 'badge-red'    },
  approve:         { label: 'Approve',         cls: 'badge-green'  },
  reject:          { label: 'Reject',          cls: 'badge-red'    },
};

const ENTITY_ICON = {
  project:        '📁',
  milestone:      '📅',
  change_request: '📝',
  user:           '👤',
  session:        '🔑',
};

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const ROLES = ['super_admin', 'sub_admin', 'project_manager', 'coordinator'];
const ENTITIES = ['project', 'milestone', 'change_request', 'user', 'session'];
const ACTIONS  = Object.keys(ACTION_META);
const PAGE_SIZE = 50;

export default function ActivityLogs() {
  const [logs,      setLogs]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [pages,     setPages]     = useState(1);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [logUsers,  setLogUsers]  = useState([]);

  // Filters
  const [search,    setSearch]    = useState('');
  const [filterRole,   setFilterRole]   = useState('');
  const [filterUser,   setFilterUser]   = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setError('');
    try {
      const params = { page: pg, limit: PAGE_SIZE };
      if (search)       params.search    = search;
      if (filterRole)   params.role      = filterRole;
      if (filterUser)   params.user_id   = filterUser;
      if (filterEntity) params.entity    = filterEntity;
      if (filterAction) params.action    = filterAction;
      if (fromDate)     params.from_date = fromDate;
      if (toDate)       params.to_date   = toDate;

      const res = await logsAPI.list(params);
      setLogs(res.logs);
      setTotal(res.total);
      setPages(res.pages);
      setPage(pg);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, filterRole, filterUser, filterEntity, filterAction, fromDate, toDate]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    logsAPI.users().then(setLogUsers).catch(() => {});
  }, []);

  const clearFilters = () => {
    setSearch(''); setFilterRole(''); setFilterUser('');
    setFilterEntity(''); setFilterAction(''); setFromDate(''); setToDate('');
  };

  const hasFilters = search || filterRole || filterUser || filterEntity || filterAction || fromDate || toDate;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">Activity Logs</div>
          <div className="text-muted" style={{ marginTop: 3 }}>
            {total} event{total !== 1 ? 's' : ''} recorded
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load(page)}>
          {loading ? <Spinner /> : <><Icon name="restore" size={13} />Refresh</>}
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Search */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Search</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none', display: 'flex' }}>
                <Icon name="search" size={13} />
              </span>
              <input
                className="form-control form-control-sm"
                style={{ paddingLeft: 28, minWidth: 180 }}
                placeholder="User name or detail…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Role */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Role</label>
            <select className="form-control form-control-sm" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* User */}
          {logUsers.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">User</label>
              <select className="form-control form-control-sm" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="">All Users</option>
                {logUsers.map(u => <option key={u.user_id} value={u.user_id}>{u.user_name}</option>)}
              </select>
            </div>
          )}

          {/* Entity */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Entity</label>
            <select className="form-control form-control-sm" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
              <option value="">All Entities</option>
              {ENTITIES.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Action */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Action</label>
            <select className="form-control form-control-sm" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
              <option value="">All Actions</option>
              {ACTIONS.map(a => <option key={a} value={a}>{ACTION_META[a].label}</option>)}
            </select>
          </div>

          {/* Date range */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From</label>
            <input type="date" className="form-control form-control-sm" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To</label>
            <input type="date" className="form-control form-control-sm" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>

          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ alignSelf: 'flex-end' }}>
              <Icon name="close" size={12} />Clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}><Icon name="warning" size={13} />{error}</div>}

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Time</th>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }}><Spinner large /></td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon="📋" message="No activity recorded yet" /></td></tr>
              )}
              {!loading && logs.map(log => {
                const meta = ACTION_META[log.action] || { label: log.action, cls: 'badge-gray' };
                const icon = ENTITY_ICON[log.entity] || '🔹';
                return (
                  <tr key={log.id}>
                    <td>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {fmtTime(log.created_at)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={log.user_name} id={log.user_id || log.user_name} size={24} />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{log.user_name}</span>
                      </div>
                    </td>
                    <td><RoleBadge role={log.user_role} /></td>
                    <td>
                      <span className={`badge ${meta.cls}`} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12 }}>{icon} {log.entity.replace(/_/g, ' ')}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 360 }}>
                      {log.detail || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: '1px solid var(--border1)', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Page {page} of {pages} · {total} total
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => load(page - 1)}>← Prev</button>
              {Array.from({ length: Math.min(7, pages) }, (_, i) => {
                const pg = page <= 4 ? i + 1 : page - 3 + i;
                if (pg < 1 || pg > pages) return null;
                return (
                  <button
                    key={pg}
                    className={`btn btn-sm ${pg === page ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => load(pg)}
                  >
                    {pg}
                  </button>
                );
              })}
              <button className="btn btn-sm btn-ghost" disabled={page >= pages} onClick={() => load(page + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
