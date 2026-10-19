import React, { useState, useMemo } from 'react';
import { Icon, Avatar, fmt, pct, EmptyState, MONTHS, YEARS, CURRENT_MONTH, CURRENT_YEAR } from '../components/UI';
import { calcNet, COMMISSION_PORTALS, PORTALS } from '../hooks/useData';
import { useAuth } from '../context/AuthContext';
import { downloadCSV } from '../utils/download';

export default function PortalPayments({ projects, milestones, profiles }) {
  const { seesAll } = useAuth();
  const [year,     setYear]     = useState(CURRENT_YEAR);
  const [month,    setMonth]    = useState(CURRENT_MONTH);
  const [filterPM, setFilterPM] = useState('all');
  const [portal,   setPortal]   = useState('all');

  const pms = profiles.filter(u => u.role === 'project_manager');

  // Driven by Monthly Projections: `amount` = projected for the month, `achieved` = received so far.
  const { rows, totals } = useMemo(() => {
    const byProject = new Map(projects.map(p => [p.id, p]));
    const portals = {};

    milestones.forEach(m => {
      const pr = byProject.get(m.project_id);
      if (!pr) return;
      if (m.year !== year) return;
      if (month !== 'all' && m.month !== month) return;
      if (filterPM !== 'all' && (m.pm_id || pr.manager_id) !== filterPM) return;
      const key = m.portal || pr.portal || 'Direct';
      if (portal !== 'all' && key !== portal) return;

      const proj = parseFloat(m.amount) || 0, got = parseFloat(m.achieved) || 0;
      const add = (o) => {
        o.projected += proj; o.projectedNet += calcNet(proj, key);
        o.received  += got;  o.receivedNet  += calcNet(got, key);
        o.count += 1;
      };
      const P  = portals[key] || (portals[key] = { portal: key, projected: 0, projectedNet: 0, received: 0, receivedNet: 0, count: 0, projects: {} });
      const pp = P.projects[pr.id] || (P.projects[pr.id] = { project: pr, pmId: m.pm_id || pr.manager_id, projected: 0, projectedNet: 0, received: 0, receivedNet: 0, count: 0 });
      add(P); add(pp);
    });

    const rows = Object.values(portals).sort((a, b) => b.projected - a.projected);
    const zero = { projected: 0, projectedNet: 0, received: 0, receivedNet: 0, count: 0 };
    const totals = rows.reduce((t, r) => ({
      projected: t.projected + r.projected, projectedNet: t.projectedNet + r.projectedNet,
      received: t.received + r.received, receivedNet: t.receivedNet + r.receivedNet, count: t.count + r.count,
    }), zero);
    return { rows, totals };
  }, [projects, milestones, year, month, filterPM, portal]);

  const periodLabel = month === 'all' ? `${year}` : `${MONTHS[month - 1].label} ${year}`;

  const exportCSV = () => {
    const lines = [['Portal', 'Project', 'Client', 'PM', 'Projected', 'Projected Net', 'Received', 'Received Net']];
    rows.forEach(r => Object.values(r.projects).forEach(({ project: pr, projected, projectedNet, received, receivedNet }) => {
      const pm = pms.find(u => u.id === pr.manager_id);
      lines.push([r.portal, pr.name, pr.client, pm?.name || '', projected.toFixed(2), projectedNet.toFixed(2), received.toFixed(2), receivedNet.toFixed(2)]);
    }));
    lines.push(['TOTAL', '', '', '', totals.projected.toFixed(2), totals.projectedNet.toFixed(2), totals.received.toFixed(2), totals.receivedNet.toFixed(2)]);
    downloadCSV(lines, `portal-projections-${periodLabel.replace(' ', '-')}.csv`);
  };

  const num = { textAlign: 'right' };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <div className="page-title">Filter by Portal</div>
          <div className="text-muted" style={{ marginTop:3 }}>Projects and monthly projections grouped by portal · {periodLabel}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Year</label>
            <select className="form-control form-control-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Month</label>
            <select className="form-control form-control-sm" value={month} onChange={e => setMonth(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
              <option value="all">All months</option>
              {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Portal</label>
            <select className="form-control form-control-sm" value={portal} onChange={e => setPortal(e.target.value)}>
              <option value="all">All portals</option>
              {[...new Set([...PORTALS, ...projects.map(p => p.portal).filter(Boolean)])].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {seesAll && pms.length > 0 && (
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Filter by PM</label>
              <select className="form-control form-control-sm" value={filterPM} onChange={e => setFilterPM(e.target.value)}>
                <option value="all">All PMs</option>
                {pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-sm btn-primary" onClick={exportCSV} disabled={rows.length === 0}>
            <Icon name="download" size={13} /> Export CSV
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom:16 }}>
        {[
          { label:'Projected (Gross)', value: fmt(totals.projected),    color:'var(--primary)', icon:'🎯' },
          { label:'Projected (Net)',   value: fmt(totals.projectedNet), color:'var(--info)',    icon:'📈' },
          { label:'Received (Gross)',  value: fmt(totals.received),     color:'var(--success)', icon:'💰' },
          { label:'Received (Net)',    value: fmt(totals.receivedNet),  color:'var(--success)', icon:'✅' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon" style={{ background: s.color + '18' }}><span style={{ fontSize:17 }}>{s.icon}</span></div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="card"><EmptyState icon="🌐" message={`No projections for ${periodLabel}`} /></div>
      )}

      {rows.map(r => {
        const hasC = COMMISSION_PORTALS.includes(r.portal);
        return (
          <div className="card" key={r.portal} style={{ marginBottom:14 }}>
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="card-title">{r.portal}</span>
                {hasC && <span className="badge badge-yellow" style={{ fontSize:10 }}>-20% fee</span>}
                <span className="badge badge-gray">{Object.keys(r.projects).length} project{Object.keys(r.projects).length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display:'flex', gap:18, fontSize:12 }}>
                <span>Projected <strong className="mono">{fmt(r.projected)}</strong></span>
                <span>Received <strong className="mono" style={{ color:'var(--success)' }}>{fmt(r.received)}</strong></span>
                <span className="text-muted">{pct(r.projected, totals.projected)}% of total</span>
              </div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr>
                <th>Project</th><th>Client</th>{seesAll && <th>PM</th>}
                <th style={num}>Projected</th><th style={num}>Projected Net</th>
                <th style={num}>Received</th><th style={num}>Received Net</th>
              </tr></thead>
              <tbody>
                {Object.values(r.projects).sort((a, b) => b.projected - a.projected).map(({ project: pr, pmId, projected, projectedNet, received, receivedNet }) => {
                  const pm = pms.find(u => u.id === (pmId || pr.manager_id));
                  return (
                    <tr key={pr.id}>
                      <td style={{ fontWeight:700 }}>{pr.name}</td>
                      <td style={{ color:'var(--text2)', fontSize:13 }}>{pr.client}</td>
                      {seesAll && <td>{pm ? <div style={{ display:'flex', alignItems:'center', gap:5 }}><Avatar name={pm.name} id={pm.id} size={20}/><span style={{ fontSize:12 }}>{pm.name}</span></div> : '—'}</td>}
                      <td className="mono" style={num}>{fmt(projected)}</td>
                      <td className="mono" style={num}>{fmt(projectedNet)}</td>
                      <td className="mono" style={num}>{fmt(received)}</td>
                      <td className="mono" style={{ ...num, fontWeight:700, color:'var(--success)' }}>{fmt(receivedNet)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background:'var(--surface2)' }}>
                  <td style={{ fontWeight:800 }}>Total</td><td />{seesAll && <td />}
                  <td className="mono" style={{ ...num, fontWeight:800 }}>{fmt(r.projected)}</td>
                  <td className="mono" style={{ ...num, fontWeight:800 }}>{fmt(r.projectedNet)}</td>
                  <td className="mono" style={{ ...num, fontWeight:800 }}>{fmt(r.received)}</td>
                  <td className="mono" style={{ ...num, fontWeight:800, color:'var(--success)' }}>{fmt(r.receivedNet)}</td>
                </tr>
              </tbody>
            </table></div>
          </div>
        );
      })}
    </div>
  );
}
