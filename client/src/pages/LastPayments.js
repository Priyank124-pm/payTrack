import React, { useState } from 'react';
import { Icon, Avatar, fmt, EmptyState, MONTHS } from '../components/UI';
import { calcNet, COMMISSION_PORTALS } from '../hooks/useData';
import { useAuth } from '../context/AuthContext';

// Approximate days since a year/month (uses last day of that month as reference)
function daysSince(year, month) {
  const today = new Date();
  const ref   = new Date(year, month, 0); // last day of that month
  return Math.max(0, Math.floor((today - ref) / 86400000));
}

function ageBadge(days) {
  if (days <  30) return { color: 'var(--success)', bg: '#D1FAE5' };
  if (days <  60) return { color: 'var(--warning)', bg: '#FEF3C7' };
  if (days < 120) return { color: '#F97316',        bg: '#FFEDD5' };
  return               { color: 'var(--danger)',    bg: '#FEE2E2' };
}

export default function LastPayments({ projects, milestones, profiles }) {
  const { isAdmin, effectiveManagerId } = useAuth();
  const [filterPM, setFilterPM] = useState('all');

  const pms = profiles.filter(u => u.role === 'project_manager');

  const myProjects = isAdmin
    ? projects
    : projects.filter(p => p.manager_id === effectiveManagerId);

  const visProjects = filterPM === 'all'
    ? myProjects
    : myProjects.filter(p => p.manager_id === filterPM);

  const rows = visProjects.map(pr => {
    const allMs     = milestones.filter(m => m.project_id === pr.id);
    const paidMs    = allMs.filter(m => parseFloat(m.achieved) > 0);
    const sorted    = [...paidMs].sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );
    const last      = sorted[0] || null;
    const totalGross= allMs.reduce((s, m) => s + (parseFloat(m.achieved) || 0), 0);
    const totalNet  = calcNet(totalGross, pr.portal);
    const days      = last ? daysSince(last.year, last.month) : null;
    return { ...pr, last, totalGross, totalNet, days };
  }).sort((a, b) => {
    if (!a.last && !b.last) return 0;
    if (!a.last) return 1;
    if (!b.last) return -1;
    if (a.last.year !== b.last.year) return b.last.year - a.last.year;
    return b.last.month - a.last.month;
  });

  const withPayment    = rows.filter(r => r.last);
  const withoutPayment = rows.filter(r => !r.last);

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <div className="page-title">Last Payments</div>
          <div className="text-muted" style={{ marginTop:3 }}>
            Most recent payment received per project · {withPayment.length} projects paid · {withoutPayment.length} awaiting
          </div>
        </div>
        {isAdmin && pms.length > 0 && (
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Filter by PM</label>
            <select className="form-control form-control-sm" value={filterPM} onChange={e => setFilterPM(e.target.value)}>
              <option value="all">All PMs</option>
              {pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {withPayment.length > 0 && (() => {
        const recentDays = withPayment.filter(r => r.days < 30).length;
        const overdueDays= withPayment.filter(r => r.days >= 60).length;
        const totalNet   = rows.reduce((s, r) => s + r.totalNet, 0);
        return (
          <div className="stats-grid" style={{ marginBottom:16 }}>
            {[
              { label:'Total Net Received', value: fmt(totalNet),   color:'var(--success)', icon:'💰' },
              { label:'Paid < 30 days',     value: recentDays,      color:'var(--success)', icon:'✅' },
              { label:'Overdue > 60 days',  value: overdueDays,     color:'var(--danger)',  icon:'⚠️' },
              { label:'No Payment Yet',     value: withoutPayment.length, color:'var(--text3)', icon:'🕐' },
            ].map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-icon" style={{ background: s.color + '18' }}><span style={{ fontSize:17 }}>{s.icon}</span></div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Main table */}
      <div className="card">
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Project</th>
            <th>Client</th>
            <th>Portal</th>
            {isAdmin && <th>PM</th>}
            <th>Last Payment</th>
            <th>Last Amount</th>
            <th>Net Amount</th>
            <th>Total Net Received</th>
            <th>Age</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9}><EmptyState icon="💳" message="No projects found" /></td></tr>
            )}

            {/* Projects with payments */}
            {withPayment.map(row => {
              const hasC      = COMMISSION_PORTALS.includes(row.portal);
              const lastGross = parseFloat(row.last?.achieved) || 0;
              const lastNet   = calcNet(lastGross, row.portal);
              const badge     = ageBadge(row.days);
              const pm        = pms.find(u => u.id === row.manager_id);
              return (
                <tr key={row.id}>
                  <td style={{ fontWeight:700 }}>{row.name}</td>
                  <td style={{ color:'var(--text2)', fontSize:13 }}>{row.client}</td>
                  <td>
                    <span className="tag">{row.portal}</span>
                    {hasC && <span className="badge badge-yellow" style={{ fontSize:10, marginLeft:4 }}>-20%</span>}
                  </td>
                  {isAdmin && (
                    <td>
                      {pm
                        ? <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <Avatar name={pm.name} id={pm.id} size={22}/>
                            <span style={{ fontSize:12 }}>{pm.name}</span>
                          </div>
                        : '—'}
                    </td>
                  )}
                  <td>
                    <span className="mono" style={{ fontSize:12 }}>
                      {MONTHS[row.last.month - 1]?.label} {row.last.year}
                    </span>
                    {row.last.label && (
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{row.last.label}</div>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize:12 }}>{fmt(lastGross)}</td>
                  <td className="mono" style={{ fontSize:12, color: hasC ? 'var(--warning)' : 'var(--text2)', fontWeight: hasC ? 600 : 400 }}>
                    {fmt(lastNet)}
                    {hasC && <div style={{ fontSize:10, color:'var(--text4)' }}>after 20% fee</div>}
                  </td>
                  <td className="mono" style={{ fontSize:13, color:'var(--success)', fontWeight:700 }}>
                    {fmt(row.totalNet)}
                  </td>
                  <td>
                    <span style={{
                      display:'inline-block', padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700,
                      color: badge.color, background: badge.bg,
                    }}>
                      {row.days === 0 ? 'Today' : `${row.days}d ago`}
                    </span>
                  </td>
                </tr>
              );
            })}

            {/* Separator row */}
            {withoutPayment.length > 0 && withPayment.length > 0 && (
              <tr>
                <td colSpan={9} style={{ background:'var(--bg2)', fontSize:11, color:'var(--text3)', padding:'6px 14px', fontWeight:600, textTransform:'uppercase', letterSpacing:.8 }}>
                  No payment received yet
                </td>
              </tr>
            )}

            {/* Projects with no payments */}
            {withoutPayment.map(row => {
              const pm = pms.find(u => u.id === row.manager_id);
              return (
                <tr key={row.id} style={{ opacity:.65 }}>
                  <td style={{ fontWeight:700 }}>{row.name}</td>
                  <td style={{ color:'var(--text2)', fontSize:13 }}>{row.client}</td>
                  <td><span className="tag">{row.portal}</span></td>
                  {isAdmin && (
                    <td>
                      {pm
                        ? <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <Avatar name={pm.name} id={pm.id} size={22}/>
                            <span style={{ fontSize:12 }}>{pm.name}</span>
                          </div>
                        : '—'}
                    </td>
                  )}
                  <td colSpan={4} style={{ color:'var(--text4)', fontSize:12, fontStyle:'italic' }}>No payment recorded</td>
                  <td><span style={{ fontSize:11, color:'var(--text4)' }}>—</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
