import React, { useState, useEffect } from 'react';
import { fmt, pct, Avatar, ProgressBar, EmptyState, Spinner, MONTHS, YEARS, CURRENT_MONTH, CURRENT_YEAR, Icon } from '../components/UI';
import { calcNet, COMMISSION_PORTALS } from '../hooks/useData';
import { reportsAPI } from '../api';
import { useAuth } from '../context/AuthContext';

function toCSV(rows) {
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
}

export default function Reports({ projects, profiles = [] }) {
  const { isAdmin, effectiveManagerId } = useAuth();
  const [month,    setMonth]    = useState(CURRENT_MONTH);
  const [year,     setYear]     = useState(CURRENT_YEAR);
  const [filterPM, setFilterPM] = useState('all');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const pms = profiles.filter(u => u.role === 'project_manager');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await reportsAPI.monthly(month, year);
      setData(res);
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  };

  useEffect(() => { load(); }, [month, year]); // eslint-disable-line

  const { pmSummary: rawPmSummary = [], projectDetail: rawProjectDetail = [] } = data || {};

  const pmSummary    = filterPM === 'all' ? rawPmSummary    : rawPmSummary.filter(r => r.pm_id === filterPM);
  const projectDetail= filterPM === 'all' ? rawProjectDetail: rawProjectDetail.filter(pd => {
    const pr = projects.find(p => p.id === pd.id);
    return pr?.manager_id === filterPM;
  });

  const downloadCSV = () => {
    const monthLabel = MONTHS[month-1]?.label;
    const rows = [
      [`Monthly Report — ${monthLabel} ${year}`], [],

      // PM Performance
      ['PM Performance'],
      ['PM Name','Projects','Milestones','Gross Target ($)','Net Target ($)','Gross Achieved ($)','Paid','Partial','Pending','Overdue'],
      ...pmSummary.map(r => {
        const gross = parseFloat(r.gross_target) || 0;
        const ach   = parseFloat(r.gross_achieved) || 0;
        const net   = netForRow(r);
        return [r.pm_name, r.project_count, r.milestone_count, gross.toFixed(2), net.toFixed(2), ach.toFixed(2), r.paid_count, r.partial_count, r.pending_count, r.overdue_count];
      }),
      [],

      // Project Detail
      ['Project Detail'],
      ['Project','Client','Portal','PM','Gross Target ($)','Commission ($)','Net Target ($)','Achieved ($)','Progress %','Payment Status'],
      ...projectDetail.map(pd => {
        const gross = parseFloat(pd.month_gross)    || 0;
        const ach   = parseFloat(pd.month_achieved) || 0;
        const net   = calcNet(gross, pd.portal);
        const comm  = gross - net;
        const progress = gross > 0 ? Math.round((ach / gross) * 100) : 0;
        const status = ach >= gross && gross > 0 ? 'Received' : ach > 0 ? 'Partial' : 'Not Received';
        return [pd.name, pd.client, pd.portal, pd.manager_name, gross.toFixed(2), comm.toFixed(2), net.toFixed(2), ach.toFixed(2), progress + '%', status];
      }),
    ];

    const csv  = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `report_${monthLabel}_${year}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const gGross    = pmSummary.reduce((s,r)=>s+(parseFloat(r.gross_target)||0),0);
  const gAchieved = pmSummary.reduce((s,r)=>s+(parseFloat(r.gross_achieved)||0),0);

  // Commission-aware net calculations
  const netForRow = (r) => {
    // sum net targets for this PM's projects
    const myProjects = projects.filter(p=>p.manager_id===r.pm_id);
    const pdRows     = projectDetail.filter(pd=>myProjects.some(mp=>mp.id===pd.id));
    return pdRows.reduce((s,pd)=>{
      const p = myProjects.find(mp=>mp.id===pd.id);
      return s + calcNet(parseFloat(pd.month_gross)||0, p?.portal);
    },0);
  };

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,flexWrap:'wrap',gap:10}}>
        <div className="page-title">Monthly Reports</div>
        <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Month</label>
            <select className="form-control form-control-sm" value={month} onChange={e=>setMonth(+e.target.value)}>
              {MONTHS.map(m=><option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Year</label>
            <select className="form-control form-control-sm" value={year} onChange={e=>setYear(+e.target.value)}>
              {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {isAdmin && pms.length > 0 && (
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">PM</label>
              <select className="form-control form-control-sm" value={filterPM} onChange={e => setFilterPM(e.target.value)}>
                <option value="all">All PMs</option>
                {pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load}>{loading?<Spinner/>:'↻ Refresh'}</button>
          {data && !loading && (
            <button className="btn btn-outline btn-sm" onClick={downloadCSV}>
              <Icon name="download" size={13} />Download CSV
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      {loading && <div style={{padding:40,textAlign:'center'}}><Spinner large/></div>}

      {!loading && data && <>
        {/* KPI row */}
        <div className="stats-grid">
          {[
            {label:'Gross Target',   value:fmt(gGross),                       color:'var(--text2)', icon:'🎯'},
            {label:'Commission',     value:'−'+fmt(gGross-pmSummary.reduce((s,r)=>s+calcNet(parseFloat(r.gross_target)||0,projects.find(p=>p.manager_id===r.pm_id)?.portal||'Direct'),0)), color:'var(--warning)', icon:'📉'},
            {label:'Net Achieved',   value:fmt(gAchieved),                    color:'var(--success)',icon:'✅'},
            {label:'Active Projects',value:projects.filter(p=>!p.all_payments_received).length, color:'var(--purple)', icon:'📁'},
          ].map(s=>(
            <div className="stat-card" key={s.label}>
              <div className="stat-icon" style={{background:s.color+'18'}}><span style={{fontSize:17}}>{s.icon}</span></div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{color:s.color,fontSize:String(s.value).length>8?16:24}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* PM performance table */}
        <div className="card mb-4" style={{marginBottom:14}}>
          <div className="card-header"><span className="card-title">PM Performance — {MONTHS[month-1]?.label} {year}</span></div>
          <div className="table-wrap"><table>
            <thead><tr>
              <th>PM</th><th>Projects</th>
              <th>Gross Target</th><th>Gross Achieved</th>
              <th>Progress</th><th>Paid</th><th>Partial</th><th>Pending</th><th>Overdue</th>
            </tr></thead>
            <tbody>
              {pmSummary.length===0 && <tr><td colSpan={9}><EmptyState icon="📊" message={`No data for ${MONTHS[month-1]?.label} ${year}`}/></td></tr>}
              {pmSummary.map(r => {
                const gross    = parseFloat(r.gross_target)||0;
                const achieved = parseFloat(r.gross_achieved)||0;
                const p        = pct(achieved, gross);
                return (
                  <tr key={r.pm_id}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <Avatar name={r.pm_name} id={r.pm_id} size={26}/>
                        <span style={{fontWeight:600}}>{r.pm_name}</span>
                      </div>
                    </td>
                    <td><span className="badge badge-indigo">{r.project_count}</span></td>
                    <td className="mono" style={{fontSize:12}}>{fmt(gross)}</td>
                    <td className="mono" style={{fontSize:12,color:'var(--success)',fontWeight:600}}>{fmt(achieved)}</td>
                    <td style={{minWidth:90}}><div style={{fontSize:11,color:'var(--text3)'}}>{p}%</div><ProgressBar value={p}/></td>
                    <td><span className="badge badge-green">{r.paid_count}</span></td>
                    <td><span className="badge badge-yellow">{r.partial_count}</span></td>
                    <td><span className="badge badge-gray">{r.pending_count}</span></td>
                    <td><span className="badge badge-red">{r.overdue_count}</span></td>
                  </tr>
                );
              })}
              {pmSummary.length>1 && (
                <tr className="sum-row">
                  <td>Grand Total</td><td/><td/>
                  <td className="mono">{fmt(gGross)}</td>
                  <td className="mono" style={{color:'var(--success)'}}>{fmt(gAchieved)}</td>
                  <td/><td/><td/><td/><td/>
                </tr>
              )}
            </tbody>
          </table></div>
        </div>

        {/* Project detail */}
        {projectDetail.length>0 && (
          <div className="card">
            <div className="card-header"><span className="card-title">Project Detail — {MONTHS[month-1]?.label} {year}</span></div>
            <div className="table-wrap"><table>
              <thead><tr>
                <th>Project</th><th>Client</th><th>Portal</th>
                {isAdmin && <th>PM</th>}
                <th>Month Gross</th><th>Commission</th><th>Month Achieved</th><th>Progress</th>
              </tr></thead>
              <tbody>
                {projectDetail.map(pd => {
                  const pr  = projects.find(p=>p.id===pd.id);
                  const hasC = COMMISSION_PORTALS.includes(pd.portal);
                  const gross = parseFloat(pd.month_gross)||0;
                  const net   = calcNet(gross, pd.portal);
                  const ach   = parseFloat(pd.month_achieved)||0;
                  const p     = pct(ach, gross);
                  return (
                    <tr key={pd.id}>
                      <td style={{fontWeight:600}}>{pd.name}</td>
                      <td style={{color:'var(--text3)'}}>{pd.client}</td>
                      <td>
                        <span className="tag">{pd.portal}</span>
                        {hasC && <span className="badge badge-yellow" style={{fontSize:10,marginLeft:4}}>-20%</span>}
                      </td>
                      {isAdmin && <td style={{fontSize:12,color:'var(--text3)'}}>{pd.manager_name}</td>}
                      <td className="mono" style={{fontSize:12}}>{fmt(gross)}</td>
                      <td className="mono" style={{fontSize:12,color:hasC?'var(--warning)':'var(--text4)'}}>{hasC?'−'+fmt(gross-net):'—'}</td>
                      <td className="mono" style={{fontSize:12,color:'var(--success)',fontWeight:600}}>{fmt(ach)}</td>
                      <td style={{minWidth:80}}><div style={{fontSize:11,color:'var(--text3)'}}>{p}%</div><ProgressBar value={p}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        )}
      </>}
    </div>
  );
}
