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
  const [filterPM,    setFilterPM]    = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const pms = profiles.filter(u => u.role === 'project_manager');

  // Only active (non-archived, non-maintenance/server/production) projects
  const activeProjects = (isAdmin ? projects : projects.filter(p => p.manager_id === effectiveManagerId))
    .filter(p => !p.archived && p.status === 'active');

  const visProjects = activeProjects.filter(p => {
    if (filterPM !== 'all' && p.manager_id !== filterPM) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.client.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const allRows = visProjects.map(pr => {
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
  });

  // Only projects with NO payment in the last 30 days
  const rows = allRows
    .filter(r => r.days === null || r.days >= 30)
    .sort((a, b) => {
      // No payment ever → bottom; otherwise sort by most overdue first
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return b.days - a.days;
    });

  const withPayment    = rows.filter(r => r.last);   // last payment exists but > 30 days
  const withoutPayment = rows.filter(r => !r.last);  // never received payment

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <div className="page-title">Last Payments</div>
          <div className="text-muted" style={{ marginTop:3 }}>
            Active projects with no payment received in the last 30 days · {rows.length} project{rows.length !== 1 ? 's' : ''} need attention
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
          {isAdmin && pms.length > 0 && (
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Filter by PM</label>
              <select className="form-control form-control-sm" value={filterPM} onChange={e => setFilterPM(e.target.value)}>
                <option value="all">All PMs</option>
                {pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Search</label>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none', display:'flex' }}>
                <Icon name="search" size={13} />
              </span>
              <input
                className="form-control form-control-sm"
                style={{ paddingLeft:28, minWidth:160 }}
                placeholder="Project or client…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {rows.length > 0 && (() => {
        const overdue60  = withPayment.filter(r => r.days >= 60).length;
        const overdue90  = withPayment.filter(r => r.days >= 90).length;
        return (
          <div className="stats-grid" style={{ marginBottom:16 }}>
            {[
              { label:'Total Overdue',      value: rows.length,            color:'var(--danger)',  icon:'⚠️' },
              { label:'30–60 Days',         value: withPayment.filter(r => r.days >= 30 && r.days < 60).length, color:'var(--warning)', icon:'🕐' },
              { label:'> 60 Days',          value: overdue60,              color:'#F97316',        icon:'🔴' },
              { label:'No Payment Ever',    value: withoutPayment.length,  color:'var(--text3)',   icon:'📭' },
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
            <th>Last Payment Date</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9}><EmptyState icon="✅" message="All active projects have received payment in the last 30 days" /></td></tr>
            )}

            {/* Projects with payments */}
            {withPayment.map(row => {
              const hasC      = COMMISSION_PORTALS.includes(row.portal);
              const lastGross = parseFloat(row.last?.achieved) || 0;
              const lastNet   = calcNet(lastGross, row.portal);
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
                  <td className="mono" style={{ fontSize:12, color:'var(--text2)' }}>
                    {new Date(row.last.year, row.last.month - 1).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                  </td>
                </tr>
              );
            })}

            {/* Separator row */}
            {withoutPayment.length > 0 && withPayment.length > 0 && (
              <tr>
                <td colSpan={9} style={{ background:'var(--surface2)', fontSize:11, color:'var(--text3)', padding:'6px 14px', fontWeight:600, textTransform:'uppercase', letterSpacing:.8 }}>
                  Never received any payment
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
                  <td style={{ color:'var(--text4)', fontSize:12 }}>—</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
