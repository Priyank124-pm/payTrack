import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useProfiles, useProjects, useMilestones, useChangeRequests } from './hooks/useData';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import Projects from './pages/Projects';
import MonthlyProjections from './pages/MonthlyProjections';
import Reports from './pages/Reports';
import LastPayments from './pages/LastPayments';
import ActivityLogs from './pages/ActivityLogs';
import Tasks from './pages/Tasks';
import { Icon, Modal, Spinner, avatarColor } from './components/UI';
import { authAPI, notificationsAPI } from './api';
import './styles/global.css';

// ── Notification Bell ─────────────────────────────────────────
const NOTIF_ICONS = {
  task_assigned:    { icon: '📋', color: '#4F46E5' },
  task_completed:   { icon: '✅', color: '#059669' },
  task_comment:     { icon: '💬', color: '#0284C7' },
  cr_submitted:     { icon: '📝', color: '#D97706' },
  cr_approved:      { icon: '✓',  color: '#059669' },
  cr_rejected:      { icon: '✗',  color: '#DC2626' },
  project_assigned: { icon: '📁', color: '#7C3AED' },
  milestone_overdue:   { icon: '⚠️', color: '#DC2626' },
  milestone_due_soon:  { icon: '⏰', color: '#D97706' },
};

function fmtNotifTime(ts) {
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function NotificationBell() {
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState([]);
  const [count,   setCount]   = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchCount = useCallback(async () => {
    try { const r = await notificationsAPI.count(); setCount(r.count || 0); } catch {}
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try { setNotifs(await notificationsAPI.list()); } catch {}
    finally { setLoading(false); }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30000);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Fetch full list when panel opens
  useEffect(() => { if (open) fetchList(); }, [open, fetchList]);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (n) => {
    if (n.is_read) return;
    await notificationsAPI.markRead(n.id);
    setNotifs(p => p.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
    setCount(c => Math.max(0, c - 1));
  };

  const markAll = async () => {
    await notificationsAPI.readAll();
    setNotifs(p => p.map(x => ({ ...x, is_read: 1 })));
    setCount(0);
  };

  const clearRead = async () => {
    await notificationsAPI.clear();
    setNotifs(p => p.filter(x => !x.is_read));
  };

  const unread = notifs.filter(n => !n.is_read).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position:'relative', background:'none', border:'none', cursor:'pointer', padding:6, borderRadius:8, color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center' }}
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        {count > 0 && (
          <span style={{ position:'absolute', top:2, right:2, background:'#DC2626', color:'white', borderRadius:'50%', minWidth:16, height:16, fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', lineHeight:1 }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:360, maxHeight:480, background:'var(--surface)', border:'1px solid var(--border1)', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.14)', zIndex:1000, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border1)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Notifications {unread > 0 && <span style={{ background:'#DC2626', color:'white', borderRadius:20, fontSize:10, padding:'1px 6px', marginLeft:4 }}>{unread}</span>}</span>
            <div style={{ display:'flex', gap:6 }}>
              {unread > 0 && <button onClick={markAll} style={{ background:'none', border:'none', fontSize:11, color:'var(--primary)', cursor:'pointer', fontWeight:600 }}>Mark all read</button>}
              {notifs.some(n => n.is_read) && <button onClick={clearRead} style={{ background:'none', border:'none', fontSize:11, color:'var(--text3)', cursor:'pointer' }}>Clear read</button>}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY:'auto', flex:1 }}>
            {loading && <div style={{ textAlign:'center', padding:28 }}><Spinner /></div>}
            {!loading && notifs.length === 0 && (
              <div style={{ textAlign:'center', padding:32, color:'var(--text4)', fontSize:13 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🔔</div>
                No notifications yet
              </div>
            )}
            {!loading && notifs.map(n => {
              const meta = NOTIF_ICONS[n.type] || { icon:'🔹', color:'var(--text3)' };
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n)}
                  style={{ display:'flex', gap:10, padding:'11px 16px', borderBottom:'1px solid var(--border1)', cursor:'pointer', background: n.is_read ? 'transparent' : '#EEF2FF', transition:'background .15s' }}
                  onMouseOver={e => e.currentTarget.style.background = n.is_read ? 'var(--bg2)' : '#E0E7FF'}
                  onMouseOut={e  => e.currentTarget.style.background = n.is_read ? 'transparent' : '#EEF2FF'}
                >
                  <div style={{ width:34, height:34, borderRadius:'50%', background: meta.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>
                    {meta.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize:13, color:'var(--text1)', marginBottom:2 }}>{n.title}</div>
                    {n.body && <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{n.body}</div>}
                    <div style={{ fontSize:11, color:'var(--text4)', marginTop:3 }}>{fmtNotifTime(n.created_at)}</div>
                  </div>
                  {!n.is_read && <div style={{ width:7, height:7, borderRadius:'50%', background:'#4F46E5', flexShrink:0, marginTop:4 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Change Password Modal ──────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [form,   setForm]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error,  setError]  = useState('');
  const [success,setSuccess]= useState('');
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setError(''); setSuccess('');
    if (!form.currentPassword || !form.newPassword) return setError('All fields are required.');
    if (form.newPassword.length < 6) return setError('New password must be at least 6 characters.');
    if (form.newPassword !== form.confirmPassword) return setError('New passwords do not match.');
    setSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setSuccess('Password changed successfully!');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(onClose, 1800);
    } catch (e) {
      setError(e.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Change Password"
      onClose={onClose}
      small
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <><Icon name="key" size={13} />Update Password</>}
          </button>
        </>
      }
    >
      {error   && <div className="alert alert-error"  style={{ marginBottom: 14 }}><Icon name="warning" size={13} />{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 14 }}><Icon name="check"   size={13} />{success}</div>}

      <div className="form-group">
        <label className="form-label">Current Password</label>
        <input
          className="form-control"
          type="password"
          value={form.currentPassword}
          onChange={e => setF('currentPassword', e.target.value)}
          placeholder="Enter current password"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">New Password</label>
        <input
          className="form-control"
          type="password"
          value={form.newPassword}
          onChange={e => setF('newPassword', e.target.value)}
          placeholder="Min 6 characters"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Confirm New Password</label>
        <input
          className="form-control"
          type="password"
          value={form.confirmPassword}
          onChange={e => setF('confirmPassword', e.target.value)}
          placeholder="Repeat new password"
        />
        {form.confirmPassword && form.newPassword !== form.confirmPassword && (
          <div className="form-error">Passwords do not match</div>
        )}
        {form.confirmPassword && form.newPassword === form.confirmPassword && form.confirmPassword.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 3, fontWeight: 500 }}>✓ Passwords match</div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AppShell() {
  const { user, loading, signOut, isAdmin } = useAuth();
  const [page,       setPage]       = useState('dashboard');
  const [showChangePw, setShowChangePw] = useState(false);

  const { profiles,   createProfile, updateProfile, deleteProfile }                   = useProfiles();
  const {
    projects, archivedProjects, archivedLoading, loadArchivedProjects,
    createProject, updateProject, deleteProject, markAllReceived,
    archiveProject, unarchiveProject, bulkDeleteProjects, bulkImportProjects,
  } = useProjects();
  const { milestones, addMilestone,  updateMilestone, deleteMilestone }               = useMilestones();
  const { crs,        addCR,         approveCR,   rejectCR }                          = useChangeRequests();

  if (loading) return (
    <div className="loading-screen">
      <div style={{ width: 40, height: 40, border: '3px solid #E2E6EF', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading NexPortal…</div>
    </div>
  );

  if (!user) return <Login />;

  const nav = [
    { id: 'dashboard',   icon: 'dashboard',  label: 'Dashboard' },
    ...(isAdmin ? [{ id: 'users', icon: 'users', label: 'User Management' }] : []),
    { id: 'projects',    icon: 'projects',   label: 'Projects' },
    { id: 'projections',  icon: 'projection', label: 'Monthly Projections' },
    { id: 'lastpayments', icon: 'clock',      label: 'Last Payments' },
    { id: 'reports',      icon: 'report',     label: 'Reports' },
    { id: 'tasks',        icon: 'check',      label: 'Tasks' },
    ...(isAdmin ? [{ id: 'activitylogs', icon: 'log', label: 'Activity Logs' }] : []),
  ];

  const titles = {
    dashboard: 'Dashboard', users: 'User Management',
    projects: 'Projects', projections: 'Monthly Projections',
    lastpayments: 'Last Payments', reports: 'Reports',
    tasks: 'Tasks', activitylogs: 'Activity Logs',
  };

  const pendingCRs = crs.filter(c => c.status === 'pending').length;

  const renderPage = () => {
    switch (page) {
      case 'dashboard':   return <Dashboard projects={projects} milestones={milestones} profiles={profiles} />;
      case 'users':       return isAdmin ? <UserManagement profiles={profiles} onAdd={createProfile} onUpdate={updateProfile} onDelete={deleteProfile} /> : null;
      case 'projects':    return (
        <Projects
          projects={projects} milestones={milestones} profiles={profiles} changeRequests={crs}
          onAdd={createProject} onUpdate={updateProject} onDelete={deleteProject}
          onMarkReceived={markAllReceived} onBulkImport={bulkImportProjects}
          onArchive={archiveProject} onUnarchive={unarchiveProject} onBulkDelete={bulkDeleteProjects}
          archivedProjects={archivedProjects} archivedLoading={archivedLoading} onLoadArchived={loadArchivedProjects}
          onAddCR={addCR} onApproveCR={approveCR} onRejectCR={rejectCR}
        />
      );
      case 'projections': return (
        <MonthlyProjections
          projects={projects} milestones={milestones} profiles={profiles}
          onAdd={addMilestone} onUpdate={updateMilestone} onDelete={deleteMilestone}
        />
      );
      case 'lastpayments':return <LastPayments projects={projects} milestones={milestones} profiles={profiles} />;
      case 'reports':     return <Reports projects={projects} profiles={profiles} />;
      case 'tasks':        return <Tasks profiles={profiles} />;
      case 'activitylogs': return isAdmin ? <ActivityLogs /> : null;
      default:            return null;
    }
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">N</div>
          <div>
            <div className="logo-text">NexPortal</div>
            <div className="logo-sub">Management Suite</div>
          </div>
        </div>

        {/* User info */}
        <div className="sidebar-user">
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColor(user.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="u-name">{user.name}</div>
            <div className="u-role">{user.role.replace(/_/g, ' ')}</div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-label">Navigation</div>
            {nav.map(n => (
              <div key={n.id} className={`nav-item${page === n.id ? ' active' : ''}`} onClick={() => setPage(n.id)}>
                <Icon name={n.icon} size={15} />
                {n.label}
                {n.id === 'projects' && pendingCRs > 0 && isAdmin && (
                  <span style={{ marginLeft: 'auto', background: '#DC2626', color: 'white', borderRadius: '50%', width: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                    {pendingCRs}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Account section */}
          <div className="nav-section">
            <div className="nav-section-label">Account</div>
            <div className="nav-item" onClick={() => setShowChangePw(true)}>
              <Icon name="key" size={15} />
              Change Password
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="nav-item" style={{ color: 'var(--danger)' }} onClick={signOut}>
            <Icon name="logout" size={15} />Sign Out
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <main className="main">
        <div className="topbar">
          <div className="page-title">{titles[page]}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <NotificationBell />
            {/* Avatar button opens change password */}
            <div
              title="Change Password"
              onClick={() => setShowChangePw(true)}
              style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(user.id), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              {user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="content">{renderPage()}</div>
      </main>

      {/* ── Change Password Modal ────────────────────────── */}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppShell /></AuthProvider>;
}
