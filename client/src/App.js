import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useProfiles, useProjects, useMilestones, useChangeRequests } from './hooks/useData';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import Projects from './pages/Projects';
import MonthlyProjections from './pages/MonthlyProjections';
import Reports from './pages/Reports';
import LastPayments from './pages/LastPayments';
import { Icon, Modal, Spinner, avatarColor } from './components/UI';
import { authAPI } from './api';
import './styles/global.css';

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
  ];

  const titles = {
    dashboard: 'Dashboard', users: 'User Management',
    projects: 'Projects', projections: 'Monthly Projections',
    lastpayments: 'Last Payments', reports: 'Reports',
  };

  const pendingCRs = crs.filter(c => c.status === 'pending').length;

  const renderPage = () => {
    switch (page) {
      case 'dashboard':   return <Dashboard projects={projects} milestones={milestones} />;
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
