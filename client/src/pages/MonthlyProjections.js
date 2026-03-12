import React, { useState } from 'react';
import { Icon, Avatar, fmt, pct, ProgressBar, EmptyState, Spinner, StatusBadge, MONTHS, YEARS, CURRENT_MONTH, CURRENT_YEAR, todayStr } from '../components/UI';
import { COMMISSION_PORTALS, calcNet } from '../hooks/useData';
import { useAuth } from '../context/AuthContext';

export default function MonthlyProjections({ projects, milestones, profiles, onAdd, onUpdate, onDelete }) {
  const { user:me, isAdmin, effectiveManagerId } = useAuth();
  const [month,    setMonth]    = useState(CURRENT_MONTH);
  const [year,     setYear]     = useState(CURRENT_YEAR);
  const [filterPM, setFilterPM] = useState('all');
  const [editId,   setEditId]   = useState(null);
  const [editBuf,  setEditBuf]  = useState({});
  const [addingTo, setAddingTo] = useState(null);
  const [newM,     setNewM]     = useState({});
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const pms          = profiles.filter(u => u.role==='project_manager');
  const isCurrentMonth = month===CURRENT_MONTH && year===CURRENT_YEAR;

  const visProjects = projects.filter(pr => {
    if (!isAdmin && pr.manager_id !== effectiveManagerId) return false;
    if (filterPM!=='all' && pr.manager_id!==filterPM) return false;
    if (isCurrentMonth && pr.all_payments_received) return false;
    return true;
  });

  const projRows = visProjects.map(pr => ({
    ...pr,
    rows: milestones.filter(m => m.project_id===pr.id && m.month===month && m.year===year),
  }));

  const allRows   = projRows.flatMap(p => p.rows);
  const gGross    = allRows.reduce((s,m) => s+(parseFloat(m.amount)||0), 0);
  const gNet      = allRows.reduce((s,m) => { const pr=projects.find(p=>p.id===m.project_id); return s+calcNet(parseFloat(m.amount)||0,pr?.portal); }, 0);
  const gAchieved = allRows.reduce((s,m) => { const pr=projects.find(p=>p.id===m.project_id); return s+calcNet(parseFloat(m.achieved)||0,pr?.portal); }, 0);

  const setB = (k,v) => setEditBuf(p=>({...p,[k]:v}));
  const setN = (k,v) => setNewM(p=>({...p,[k]:v}));

  const startEdit  = m => { setEditId(m.id); setEditBuf({...m}); setError(''); };
  const cancelEdit = () => { setEditId(null); setEditBuf({}); };

  const saveEdit = async () => {
    setSaving(true);
    try { await onUpdate(editBuf.id, editBuf); cancelEdit(); }
    catch(e){setError(e.message);}
    finally{setSaving(false);}
  };

  const openAdd  = pid => { setAddingTo(pid); setNewM({label:'',amount:'',target_date:todayStr(),achieved:'',status:'Pending'}); setError(''); };
  const cancelAdd= () => { setAddingTo(null); setNewM({}); };

  const saveAdd = async pid => {
    if (!newM.label||!newM.amount) return setError('Label and amount required.');
    setSaving(true);
    try {
      await onAdd({project_id:pid,month,year,label:newM.label,amount:newM.amount,target_date:newM.target_date,achieved:newM.achieved||0,status:newM.status||'Pending'});
      cancelAdd();
    } catch(e){setError(e.message);}
    finally{setSaving(false);}
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this milestone?')) return;
    await onDelete(id);
  };

  const MFields = ({ vals, onChange, pid, isEdit }) => {
    const pr    = projects.find(p=>p.id===(pid||editBuf.project_id));
    const gross = parseFloat(vals.amount)||0;
    const net   = calcNet(gross, pr?.portal);
    const hasC  = COMMISSION_PORTALS.includes(pr?.portal);
    return (
      <div>
        <div className="m-grid">
          <div className="form-group">
            <label className="form-label">Label / Week</label>
            <input className="form-control form-control-sm" value={vals.label||''} onChange={e=>onChange('label',e.target.value)} placeholder="Week 1"/>
          </div>
          <div className="form-group">
            <label className="form-label">Gross Amount ($)</label>
            <input className="form-control form-control-sm" type="number" value={vals.amount||''} onChange={e=>onChange('amount',e.target.value)}/>
            {hasC && gross>0 && <div className="commission-row"><span>−20%:</span><span className="mono" style={{fontWeight:600}}>−{fmt(gross-net)}</span></div>}
          </div>
          <div className="form-group">
            <label className="form-label">Target Date</label>
            <input className="form-control form-control-sm" type="date" value={vals.target_date||''} onChange={e=>onChange('target_date',e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Achieved ($)</label>
            <input className="form-control form-control-sm" type="number" value={vals.achieved||''} onChange={e=>onChange('achieved',e.target.value)}/>
            {hasC && parseFloat(vals.achieved)>0 && <div style={{fontSize:11,color:'var(--success)',marginTop:2}}>Net: {fmt(calcNet(parseFloat(vals.achieved)||0,pr?.portal))}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-control form-control-sm" value={vals.status||'Pending'} onChange={e=>onChange('status',e.target.value)}>
              <option>Pending</option><option>Partial</option><option>Paid</option><option>Overdue</option>
            </select>
          </div>
          <div style={{display:'flex',gap:5,alignItems:'flex-end',paddingBottom:0}}>
            <button className="btn btn-sm btn-primary btn-icon" onClick={isEdit?saveEdit:()=>saveAdd(pid)} disabled={saving}>{saving?<Spinner/>:<Icon name="save" size={12}/>}</button>
            <button className="btn btn-sm btn-ghost btn-icon" onClick={isEdit?cancelEdit:cancelAdd}><Icon name="close" size={12}/></button>
          </div>
        </div>
        {hasC && gross>0 && (
          <div className="success-box mt-3" style={{marginTop:7}}>
            <Icon name="money" size={12}/>
            <span>Gross <strong>{fmt(gross)}</strong> → Net after 20% commission: <strong>{fmt(net)}</strong></span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-center flex-between mb-4" style={{flexWrap:'wrap',gap:10}}>
        <div>
          <div className="page-title">Monthly Projections</div>
          <div className="text-muted" style={{marginTop:3}}>{MONTHS[month-1]?.label} {year} · {allRows.length} milestones</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
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
          {isAdmin && (
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">PM</label>
              <select className="form-control form-control-sm" value={filterPM} onChange={e=>setFilterPM(e.target.value)}>
                <option value="all">All PMs</option>
                {pms.map(pm=><option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error mb-4" style={{marginBottom:10}}><Icon name="warning" size={13}/>{error}</div>}
      {visProjects.length===0 && <div className="card card-p"><EmptyState icon="📅" message="No active projects for this period"/></div>}

      {projRows.map(pr => {
        const pmP     = pms.find(u=>u.id===pr.manager_id);
        const hasC    = COMMISSION_PORTALS.includes(pr.portal);
        const gT      = pr.rows.reduce((s,m)=>s+(parseFloat(m.amount)||0),0);
        const netT    = pr.rows.reduce((s,m)=>s+calcNet(parseFloat(m.amount)||0,pr.portal),0);
        const netA    = pr.rows.reduce((s,m)=>s+calcNet(parseFloat(m.achieved)||0,pr.portal),0);
        const comm    = gT-netT;
        const p       = pct(netA,netT);
        const isAddHere = addingTo===pr.id;

        return (
          <div className="card" key={pr.id} style={{marginBottom:14}}>
            <div className="card-header">
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{pr.name}</div>
                <div style={{display:'flex',gap:7,marginTop:4,flexWrap:'wrap',alignItems:'center'}}>
                  <span className="text-muted" style={{fontSize:12}}>{pr.client}</span>
                  <span className="tag">{pr.type}</span>
                  <span className="tag">{pr.portal}</span>
                  {hasC && <span className="badge badge-yellow" style={{fontSize:10}}>-20% commission</span>}
                  {isAdmin && pmP && <div style={{display:'flex',alignItems:'center',gap:4}}><Avatar name={pmP.name} id={pmP.id} size={16}/><span className="text-muted">{pmP.name}</span></div>}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                {pr.rows.length>0 && (
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'var(--text3)',marginBottom:2}}>Net Target / Achieved</div>
                    <div className="mono" style={{fontSize:13}}>
                      <span style={{fontWeight:600}}>{fmt(netT)}</span>
                      <span style={{color:'var(--border2)',margin:'0 5px'}}>/</span>
                      <span style={{color:'var(--success)',fontWeight:700}}>{fmt(netA)}</span>
                    </div>
                    <ProgressBar value={p}/>
                  </div>
                )}
                <button className="btn btn-sm btn-primary" onClick={()=>isAddHere?cancelAdd():openAdd(pr.id)}>
                  <Icon name={isAddHere?'close':'add'} size={12}/>{isAddHere?'Cancel':'Add'}
                </button>
              </div>
            </div>

            <div style={{padding:'14px 18px'}}>
              {hasC && gT>0 && (
                <div className="warn-box mb-4" style={{marginBottom:10}}>
                  <Icon name="percent" size={13}/>
                  <span>Total commission (20% of {fmt(gT)}): <strong>−{fmt(comm)}</strong> → Net: <strong>{fmt(netT)}</strong></span>
                </div>
              )}

              {pr.rows.length===0 && !isAddHere && (
                <div style={{color:'var(--text4)',fontSize:12,padding:'4px 0',fontStyle:'italic'}}>
                  No milestones for {MONTHS[month-1]?.label} {year} — click <strong>Add</strong>.
                </div>
              )}

              {pr.rows.map(m => {
                const gross = parseFloat(m.amount)||0;
                const net   = calcNet(gross,pr.portal);
                const netAch= calcNet(parseFloat(m.achieved)||0,pr.portal);
                return (
                  <div className={`m-row${editId===m.id?' editing':''}`} key={m.id}>
                    {editId===m.id
                      ? <MFields vals={editBuf} onChange={setB} isEdit/>
                      : (
                        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
                          <div style={{display:'flex',gap:18,flex:1,flexWrap:'wrap'}}>
                            <div style={{minWidth:120}}>
                              <div style={{fontWeight:600,fontSize:13}}>{m.label}</div>
                              <div className="mono text-muted" style={{fontSize:11,marginTop:2}}>{m.target_date||'—'}</div>
                            </div>
                            <div>
                              <div className="form-label">Gross</div>
                              <div className="mono" style={{fontSize:13}}>{fmt(gross)}</div>
                              {hasC && <div style={{fontSize:11,color:'var(--warning)'}}>Net: {fmt(net)}</div>}
                            </div>
                            <div>
                              <div className="form-label">Achieved</div>
                              <div className="mono" style={{fontSize:13,color:'var(--success)',fontWeight:600}}>{fmt(hasC?netAch:parseFloat(m.achieved)||0)}</div>
                              {hasC && parseFloat(m.achieved)>0 && <div style={{fontSize:11,color:'var(--text3)'}}>Gross: {fmt(m.achieved)}</div>}
                            </div>
                            <div><StatusBadge status={m.status}/></div>
                          </div>
                          <div style={{display:'flex',gap:5}}>
                            <button className="btn btn-sm btn-ghost btn-icon" onClick={()=>startEdit(m)}><Icon name="edit" size={12}/></button>
                            <button className="btn btn-sm btn-danger btn-icon" onClick={()=>handleDelete(m.id)}><Icon name="delete" size={12}/></button>
                          </div>
                        </div>
                      )
                    }
                  </div>
                );
              })}

              {isAddHere && (
                <div className="m-row adding">
                  <div style={{fontSize:11,color:'var(--success)',fontWeight:600,marginBottom:9,textTransform:'uppercase',letterSpacing:1}}>+ New — {MONTHS[month-1]?.label} {year}</div>
                  <MFields vals={newM} onChange={setN} pid={pr.id}/>
                </div>
              )}

              {pr.rows.length>0 && (
                <div className="subtotal-bar">
                  {[
                    ...(hasC?[['Gross',fmt(gT),'var(--text3)'],['Commission','−'+fmt(comm),'var(--warning)']]:[] ),
                    ['Net Target',fmt(netT),'var(--text2)'],
                    ['Net Achieved',fmt(netA),'var(--success)'],
                    ['Variance',fmt(netA-netT),netA>=netT?'var(--success)':'var(--danger)'],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:'right'}}>
                      <div className="subtotal-label">{l}</div>
                      <div className="subtotal-value" style={{color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {allRows.length>0 && (
        <div className="card card-p" style={{background:'var(--primary-lt)',border:'1.5px solid var(--primary-md)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:14}}>
            <div style={{fontWeight:700,fontSize:15,color:'var(--primary-dk)'}}>Grand Total — {MONTHS[month-1]?.label} {year}</div>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              {[
                ['Commission',fmt(gGross-gNet),'var(--warning)'],
                ['Net Target',fmt(gNet),'var(--text2)'],
                ['Net Achieved',fmt(gAchieved),'var(--success)'],
                ['Rate',pct(gAchieved,gNet)+'%','var(--primary)'],
              ].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'right'}}>
                  <div style={{fontSize:10,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.8,marginBottom:2}}>{l}</div>
                  <div className="mono" style={{fontSize:19,fontWeight:800,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
