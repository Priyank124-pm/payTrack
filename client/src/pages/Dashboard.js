import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fmt, pct, MONTHS, CURRENT_MONTH, CURRENT_YEAR, EmptyState, StatusBadge, ProgressBar, Icon } from '../components/UI';
import { calcNet, COMMISSION_PORTALS, PORTALS } from '../hooks/useData';

export default function Dashboard({ projects, milestones, profiles = [] }) {
  const { user: me, isAdmin, effectiveManagerId } = useAuth();
  const [filterPM,    setFilterPM]    = useState('all');
  const [filterCoord, setFilterCoord] = useState('all');

  const pms             = profiles.filter(u => u.role === 'project_manager');
  const allCoordinators = profiles.filter(u => u.role === 'coordinator');
  // PC dropdown only shows coordinators belonging to the selected PM
  const visCoordinators = filterPM === 'all'
    ? allCoordinators
    : allCoordinators.filter(c => c.manager_id === filterPM);

  const handlePMChange = (pmId) => {
    setFilterPM(pmId);
    setFilterCoord('all'); // reset PC when PM changes
  };

  const baseProjects = isAdmin ? projects : projects.filter(p => p.manager_id === effectiveManagerId);
  const myProjects   = isAdmin
    ? baseProjects.filter(p => {
        if (filterPM    !== 'all' && p.manager_id    !== filterPM)    return false;
        if (filterCoord !== 'all' && p.coordinator_id !== filterCoord) return false;
        return true;
      })
    : baseProjects;
  const myMilestones = milestones.filter(m => myProjects.some(p => p.id === m.project_id));

  const totalNetTarget  = myProjects.reduce((s,p) => s + calcNet(parseFloat(p.target_payment)||0, p.portal), 0);
  const totalNetAchieved = myMilestones.reduce((s,m) => {
    const p = myProjects.find(pr => pr.id === m.project_id);
    return s + calcNet(parseFloat(m.achieved)||0, p?.portal);
  }, 0);

  const curMs = myMilestones.filter(m => m.month === CURRENT_MONTH && m.year === CURRENT_YEAR);
  const curTarget   = curMs.reduce((s,m) => { const p = myProjects.find(pr=>pr.id===m.project_id); return s+calcNet(parseFloat(m.amount)||0,p?.portal); }, 0);
  const curAchieved = curMs.reduce((s,m) => { const p = myProjects.find(pr=>pr.id===m.project_id); return s+calcNet(parseFloat(m.achieved)||0,p?.portal); }, 0);

  const active    = myProjects.filter(p => !p.all_payments_received);
  const completed = myProjects.filter(p =>  p.all_payments_received);

  const stats = [
    { label:'Total Projects',        value:myProjects.length,             sub:`${active.length} active`,    color:'#4F46E5', icon:'📁' },
    { label:'Net Target (All-time)', value:fmt(totalNetTarget),            sub:'after commission',           color:'#059669', icon:'🎯' },
    { label:'Net Achieved (All-time)',value:fmt(totalNetAchieved),         sub:'from milestones',            color:'#0284C7', icon:'💰' },
    { label:`${MONTHS[CURRENT_MONTH-1]?.label} Target`, value:fmt(curTarget),   sub:'this month', color:'#7C3AED', icon:'📅' },
    { label:`${MONTHS[CURRENT_MONTH-1]?.label} Achieved`,value:fmt(curAchieved),sub:`${pct(curAchieved,curTarget)}% of target`, color:'#D97706', icon:'✅' },
  ];

  const recent = [...myMilestones]
    .sort((a,b) => new Date(b.updated_at||0)-new Date(a.updated_at||0))
    .slice(0,7)
    .map(m => ({ ...m, project: myProjects.find(p=>p.id===m.project_id) }));

  // 24-hour due alerts — milestones with a target_date within the next 24 hours that aren't fully paid
  const now24 = new Date();
  now24.setHours(23, 59, 59, 999);
  const alerts = milestones.filter(m => {
    if (!m.target_date) return false;
    if (m.status === 'Paid') return false;
    const due = new Date(m.target_date);
    const today = new Date(); today.setHours(0,0,0,0);
    return due >= today && due <= now24;
  }).map(m => ({ ...m, project: projects.find(p => p.id === m.project_id) }));

  return (
    <div>
      {/* ── 24-hour due alerts ───────────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ background:'#FFF7ED', border:'1.5px solid #FB923C', borderRadius:10, padding:'12px 16px', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <span style={{ fontSize:16 }}>⏰</span>
            <span style={{ fontWeight:700, fontSize:14, color:'#C2410C' }}>
              {alerts.length} payment{alerts.length > 1 ? 's' : ''} due today!
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {alerts.map(a => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'white', borderRadius:7, padding:'8px 12px', border:'1px solid #FED7AA' }}>
                <div>
                  <span style={{ fontWeight:600, fontSize:13 }}>{a.label}</span>
                  <span style={{ color:'var(--text3)', fontSize:12, marginLeft:8 }}>{a.project?.name}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span className="mono" style={{ fontSize:12, fontWeight:700, color:'#C2410C' }}>{fmt(parseFloat(a.amount)||0)}</span>
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:12 }}>
        <div>
          <div className="page-title">Welcome back, <span style={{ color:'var(--primary)' }}>{me?.name}</span> 👋</div>
          <div className="text-muted" style={{ marginTop:3 }}>{new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
        </div>

        {isAdmin && pms.length > 0 && (
          <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">PM</label>
              <select
                className="form-control form-control-sm"
                value={filterPM}
                onChange={e => handlePMChange(e.target.value)}
              >
                <option value="all">All PMs</option>
                {pms.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>

            {visCoordinators.length > 0 && (
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">PC</label>
                <select
                  className="form-control form-control-sm"
                  value={filterCoord}
                  onChange={e => setFilterCoord(e.target.value)}
                >
                  <option value="all">{filterPM === 'all' ? 'All PCs' : 'All PCs for this PM'}</option>
                  {visCoordinators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {(filterPM !== 'all' || filterCoord !== 'all') && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setFilterPM('all'); setFilterCoord('all'); }}
                style={{ alignSelf:'flex-end' }}
              >
                <Icon name="close" size={12} />Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="stats-grid">
        {stats.map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon" style={{ background:s.color+'18' }}><span style={{ fontSize:17 }}>{s.icon}</span></div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color, fontSize:String(s.value).length>8?17:24 }}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ gap:14 }}>
        {/* Project breakdown */}
        <div className="card card-p">
          <div style={{ fontWeight:700, fontSize:14, marginBottom:13 }}>Projects Breakdown</div>
          {['Monthly','Hourly','Milestone'].map(type => {
            const count = myProjects.filter(p=>p.type===type).length;
            const w = myProjects.length>0 ? (count/myProjects.length)*100 : 0;
            return (
              <div key={type} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:9 }}>
                <span className="tag">{type}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:80, height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ width:`${w}%`, height:'100%', background:'var(--primary)', borderRadius:3 }} />
                  </div>
                  <span className="mono" style={{ fontSize:12, color:'var(--text3)', width:16, textAlign:'right' }}>{count}</span>
                </div>
              </div>
            );
          })}
          <div className="divider" />
          <div style={{ fontWeight:600, fontSize:13, marginBottom:9, color:'var(--text2)' }}>By Portal</div>
          {PORTALS.filter(pt => myProjects.some(p=>p.portal===pt)).map(pt => (
            <div key={pt} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13 }}>{pt}</span>
                {COMMISSION_PORTALS.includes(pt) && <span className="badge badge-yellow" style={{ fontSize:10 }}>-20%</span>}
              </div>
              <span className="badge badge-indigo">{myProjects.filter(p=>p.portal===pt).length}</span>
            </div>
          ))}
          <div className="divider" />
          <div style={{ display:'flex', gap:10 }}>
            {[['Active',active.length,'var(--primary)'],['Completed',completed.length,'var(--success)']].map(([l,v,c])=>(
              <div className="stat-card" key={l} style={{ flex:1, padding:11 }}>
                <div className="stat-label">{l}</div>
                <div className="stat-value" style={{ fontSize:20, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent milestones */}
        <div className="card card-p">
          <div style={{ fontWeight:700, fontSize:14, marginBottom:13 }}>Recent Milestones</div>
          {recent.length === 0
            ? <EmptyState icon="📅" message="Add milestones in Monthly Projections" />
            : recent.map((m,i) => {
              const net = calcNet(parseFloat(m.achieved)||0, m.project?.portal);
              return (
                <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:9, paddingBottom:9, borderBottom: i<recent.length-1?'1px solid var(--border)':'none' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{m.label}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{m.project?.name} · {MONTHS[m.month-1]?.label} {m.year}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginLeft:10 }}>
                    <div className="mono" style={{ fontSize:12, color:'var(--success)', fontWeight:600, marginBottom:3 }}>{fmt(net)}</div>
                    <StatusBadge status={m.status} />
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}
