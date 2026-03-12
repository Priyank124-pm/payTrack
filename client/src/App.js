import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useProfiles, useProjects, useMilestones, useChangeRequests } from './hooks/useData';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import Projects from './pages/Projects';
import MonthlyProjections from './pages/MonthlyProjections';
import Reports from './pages/Reports';
import { Icon, Avatar, avatarColor } from './components/UI';
import './styles/global.css';

function AppShell() {
  const { user, loading, signOut, isAdmin, isSuperAdmin } = useAuth();
  const [page, setPage] = useState('dashboard');

  const { profiles,   createProfile, updateProfile, deleteProfile }                   = useProfiles();
  const { projects,   createProject, updateProject, deleteProject, markAllReceived }  = useProjects();
  const { milestones, addMilestone,  updateMilestone, deleteMilestone }               = useMilestones();
  const { crs,        addCR,         approveCR,   rejectCR }                          = useChangeRequests();

  if (loading) return (
    <div className="loading-screen">
      <div style={{ width:40, height:40, border:'3px solid #E2E6EF', borderTopColor:'#4F46E5', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
      <div style={{ color:'var(--text3)', fontSize:14 }}>Loading NexPortal…</div>
    </div>
  );

  if (!user) return <Login />;

  const nav = [
    { id:'dashboard',   icon:'dashboard',   label:'Dashboard' },
    ...(isAdmin ? [{ id:'users', icon:'users', label:'User Management' }] : []),
    { id:'projects',    icon:'projects',    label:'Projects' },
    { id:'projections', icon:'projection',  label:'Monthly Projections' },
    { id:'reports',     icon:'report',      label:'Reports' },
  ];

  const titles = { dashboard:'Dashboard', users:'User Management', projects:'Projects', projections:'Monthly Projections', reports:'Reports' };
  const pendingCRs = crs.filter(c=>c.status==='pending').length;

  const renderPage = () => {
    switch(page) {
      case 'dashboard':   return <Dashboard projects={projects} milestones={milestones} />;
      case 'users':       return isAdmin ? <UserManagement profiles={profiles} onAdd={createProfile} onUpdate={updateProfile} onDelete={deleteProfile}/> : null;
      case 'projects':    return <Projects
          projects={projects} milestones={milestones} profiles={profiles} changeRequests={crs}
          onAdd={createProject} onUpdate={updateProject} onDelete={deleteProject}
          onMarkReceived={markAllReceived} onAddCR={addCR} onApproveCR={approveCR} onRejectCR={rejectCR}
        />;
      case 'projections': return <MonthlyProjections
          projects={projects} milestones={milestones} profiles={profiles}
          onAdd={addMilestone} onUpdate={updateMilestone} onDelete={deleteMilestone}
        />;
      case 'reports':     return <Reports projects={projects}/>;
      default:            return null;
    }
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">N</div>
          <div>
            <div className="logo-text">NexPortal</div>
            <div className="logo-sub">Management Suite</div>
          </div>
        </div>

        <div className="sidebar-user">
          <div style={{ width:34, height:34, borderRadius:'50%', background:avatarColor(user.id), display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:13, flexShrink:0 }}>
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="u-name">{user.name}</div>
            <div className="u-role">{user.role.replace(/_/g,' ')}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-label">Navigation</div>
            {nav.map(n => (
              <div key={n.id} className={`nav-item${page===n.id?' active':''}`} onClick={() => setPage(n.id)}>
                <Icon name={n.icon} size={15}/>
                {n.label}
                {n.id==='projects' && pendingCRs>0 && isAdmin && (
                  <span style={{ marginLeft:'auto', background:'#DC2626', color:'white', borderRadius:'50%', width:17, height:17, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700 }}>
                    {pendingCRs}
                  </span>
                )}
              </div>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="nav-item" style={{ color:'var(--danger)' }} onClick={signOut}>
            <Icon name="logout" size={15}/>Sign Out
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="topbar">
          <div className="page-title">{titles[page]}</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:12, color:'var(--text3)' }}>
              {new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            </span>
            <div style={{ width:30, height:30, borderRadius:'50%', background:avatarColor(user.id), display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:700, fontSize:12 }}>
              {user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="content">{renderPage()}</div>
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppShell /></AuthProvider>;
}
