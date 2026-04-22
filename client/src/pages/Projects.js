import React, { useState } from 'react';
import { Modal, Icon, Avatar, fmt, pct, ProgressBar, EmptyState, Spinner } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { PORTALS, COMMISSION_PORTALS, calcNet } from '../hooks/useData';

const TYPES = ['Monthly','Hourly','Milestone'];

// ── CSV helpers ────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = line => {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ' ').trim());
  const rows = lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    })
    .filter(row => Object.values(row).some(v => v));

  return { headers, rows };
}

const HEALTH_DISPLAY = { active: 'Green', on_hold: 'Amber' };

function mapProjectRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const val = row[k.toLowerCase().replace(/\s+/g, ' ').trim()] || '';
      if (val) return val.trim();
    }
    return '';
  };

  const portalRaw = get('platform', 'portal');
  const portal    = PORTALS.find(p => p.toLowerCase() === portalRaw.toLowerCase()) || 'Direct';

  const typeRaw = get('type');
  const type    = TYPES.find(t => t.toLowerCase() === typeRaw.toLowerCase()) || 'Monthly';

  const health = (get('project health', 'health', 'status') || '').toLowerCase();
  const project_health = health || 'green';

  return {
    project_name:     get('project name', 'project'),
    client_name:      get('client name', 'client'),
    manager_name:     get('project manager', 'pm', 'manager'),
    coordinator_name: get('project coordinator', 'coordinator'),
    portal,
    type,
    project_health,
    target_payment:   parseFloat(get('t p', 'tp', 'target payment', 'target', 'amount')) || 0,
  };
}

function downloadSampleCSV() {
  const rows = [
    'Project Name,Client Name,Platform,Project Health,Type,T P,Project Manager,Project Coordinator',
    'Mallorca,Lukas,Upwork,Green,Monthly,1280,John Smith,Alice Cooper',
    'Swivics,Gareth,Fiverr,Green,Monthly,,Jane Doe,Bob Martin',
    'Hotel App,Alex,Fiverr,Amber,Milestone,,John Smith,',
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'projects_sample.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Projects({
  projects, milestones, profiles, changeRequests,
  onAdd, onUpdate, onDelete, onMarkReceived, onBulkImport,
  onArchive, onUnarchive, onBulkDelete,
  archivedProjects, archivedLoading, onLoadArchived,
  onAddCR, onApproveCR, onRejectCR,
}) {
  const { user:me, isAdmin, isSuperAdmin, effectiveManagerId } = useAuth();
  const [modal,        setModal]        = useState(null);
  const [form,         setForm]         = useState({});
  const [crForm,       setCRForm]       = useState({});
  const [error,        setError]        = useState('');
  const [saving,       setSaving]       = useState(false);
  // Archive tab
  const [activeTab,    setActiveTab]    = useState('active');
  // Search
  const [searchQuery,  setSearchQuery]  = useState('');
  // Multi-select
  const [selected,     setSelected]     = useState(new Set());
  // CSV import state
  const [csvRows,      setCsvRows]      = useState([]);
  const [csvError,     setCsvError]     = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult,    setCsvResult]    = useState(null);
  const setF  = (k,v) => setForm(p=>({...p,[k]:v}));
  const setCRF = (k,v)=> setCRForm(p=>({...p,[k]:v}));

  const closeCsvModal = () => { setModal(null); setCsvRows([]); setCsvError(''); setCsvResult(null); };

  const handleTabChange = tab => {
    setActiveTab(tab);
    setSelected(new Set());
    if (tab === 'archived') onLoadArchived();
  };

  const toggleSelect = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = (list) => setSelected(prev =>
    prev.size === list.length && list.length > 0 ? new Set() : new Set(list.map(p => p.id))
  );

  const handleArchive = async id => {
    if (!window.confirm('Archive this project? It will be hidden from projections and can be restored later.')) return;
    await onArchive(id);
  };
  const handleRestore = async id => {
    await onUnarchive(id);
  };
  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!window.confirm(`Permanently delete ${ids.length} project(s) and all their data? This cannot be undone.`)) return;
    await onBulkDelete(ids);
    setSelected(new Set());
  };

  const handleCsvFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(''); setCsvRows([]);
    const reader = new FileReader();
    reader.onload = evt => {
      const { rows } = parseCSV(evt.target.result);
      if (!rows.length) { setCsvError('No data rows found in CSV.'); return; }
      const mapped = rows.map(mapProjectRow).filter(r => r.project_name);
      if (!mapped.length) { setCsvError('No valid rows with a "Project Name" column found.'); return; }
      setCsvRows(mapped);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvRows.length) return;
    setCsvImporting(true); setCsvError('');
    try {
      const result = await onBulkImport({ rows: csvRows });
      setCsvResult(result);
    } catch (e) {
      setCsvError(e.message);
    } finally {
      setCsvImporting(false);
    }
  };

  const pms = profiles.filter(u=>u.role==='project_manager');
  const allMyProjects = isAdmin ? projects : projects.filter(p=>p.manager_id===effectiveManagerId);
  const myProjects = searchQuery
    ? allMyProjects.filter(p => {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q);
      })
    : allMyProjects;
  const filteredArchived = searchQuery
    ? archivedProjects.filter(p => {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q);
      })
    : archivedProjects;

  const getAchieved = pid => milestones.filter(m=>m.project_id===pid).reduce((s,m)=>s+(parseFloat(m.achieved)||0),0);
  const pendingCRs  = pid => changeRequests.filter(c=>c.project_id===pid&&c.status==='pending');

  const coordinators = profiles.filter(u => u.role === 'coordinator');

  const openAdd = () => {
    const defPM = me?.role==='project_manager'?me.id:me?.role==='coordinator'?me.manager_id:pms[0]?.id||'';
    setForm({ name:'',client:'',type:'Monthly',portal:'Upwork',manager_id:defPM,coordinator_id:'',target_payment:'' });
    setError(''); setModal('add');
  };
  const openEdit = pr => { setForm({...pr, coordinator_id: pr.coordinator_id||''}); setError(''); setModal('edit'); };

  const save = async () => {
    if (!form.name||!form.client) return setError('Name and client required.');
    setSaving(true); setError('');
    try {
      if (modal==='add') await onAdd(form);
      else await onUpdate(form.id,{name:form.name,client:form.client,type:form.type,portal:form.portal,manager_id:form.manager_id,coordinator_id:form.coordinator_id||null,target_payment:parseFloat(form.target_payment)||0});
      setModal(null);
    } catch(e){setError(e.message);}
    finally{setSaving(false);}
  };

  const openCR = pid => { setCRForm({project_id:pid,title:'',amount:'',description:''}); setError(''); setModal('cr'); };
  const saveCR = async () => {
    if (!crForm.title||!crForm.amount) return setError('Title and amount required.');
    setSaving(true); setError('');
    try { await onAddCR(crForm); setModal(null); } catch(e){setError(e.message);} finally{setSaving(false);}
  };

  const TAB_STYLE = (active) => ({
    padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none', background:'none',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    color: active ? 'var(--primary)' : 'var(--text3)',
  });

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-center flex-between mb-4">
        <div>
          <div className="page-title">Projects</div>
          <div className="text-muted" style={{ marginTop:3 }}>
            {activeTab==='active' ? myProjects.length : filteredArchived.length} projects
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none', display:'flex' }}>
              <Icon name="search" size={13} />
            </span>
            <input
              className="form-control form-control-sm"
              style={{ paddingLeft:28, minWidth:180 }}
              placeholder="Search project or client…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {isAdmin && (
            <button className="btn btn-outline" onClick={() => { setCsvRows([]); setCsvError(''); setCsvResult(null); setModal('csv'); }}>
              <Icon name="upload" size={13} />Import CSV
            </button>
          )}
          <button className="btn btn-primary" onClick={openAdd}><Icon name="add" />New Project</button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      {isAdmin && (
        <div style={{ display:'flex', borderBottom:'2px solid var(--border1)', marginBottom:14 }}>
          <button style={TAB_STYLE(activeTab==='active')}   onClick={() => handleTabChange('active')}>
            Active Projects ({myProjects.length})
          </button>
          <button style={TAB_STYLE(activeTab==='archived')} onClick={() => handleTabChange('archived')}>
            <Icon name="archive" size={13} /> Archived ({filteredArchived.length})
          </button>
        </div>
      )}

      {/* ── Info / warnings (active tab only) ────────────────── */}
      {activeTab==='active' && <>
        <div className="info-box mb-4" style={{ marginBottom:12 }}>
          <Icon name="info" size={13} />
          <span>Achieved payments are auto-calculated from <strong>Monthly Projections</strong>. Mark a project "Done" once all payments are received — it hides from projections until a Change Request is added.</span>
        </div>
        {isAdmin && changeRequests.filter(c=>c.status==='pending').length>0 && (
          <div className="warn-box mb-4" style={{ marginBottom:12 }}>
            <Icon name="warning" size={13} />
            <strong>{changeRequests.filter(c=>c.status==='pending').length} pending Change Request(s)</strong>&nbsp;awaiting approval.
          </div>
        )}
      </>}

      {/* ── Bulk-delete bar ───────────────────────────────────── */}
      {isSuperAdmin && selected.size > 0 && (
        <div style={{ background:'var(--danger)', color:'white', padding:'9px 16px', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontWeight:600 }}>{selected.size} project{selected.size!==1?'s':''} selected</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-sm" style={{ background:'rgba(255,255,255,.15)', color:'white', border:'1px solid rgba(255,255,255,.3)' }} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn btn-sm" style={{ background:'white', color:'var(--danger)', fontWeight:700 }} onClick={handleBulkDelete}>
              <Icon name="delete" size={13} />Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* ══ ACTIVE TAB ══════════════════════════════════════════ */}
      {activeTab==='active' && (
        <div className="card">
          <div className="table-wrap"><table>
            <thead><tr>
              {isSuperAdmin && <th style={{width:36}}><input type="checkbox" checked={selected.size===myProjects.length&&myProjects.length>0} onChange={()=>toggleAll(myProjects)}/></th>}
              <th>Project</th><th>Client</th><th>Type</th><th>Portal</th>
              {isAdmin && <th>PM</th>}
              {isAdmin && <th>Coordinator</th>}
              <th>Target</th><th>Net Target</th><th>Achieved</th><th>Progress</th><th>Status</th>
              <th style={{ textAlign:'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {myProjects.length===0 && <tr><td colSpan={15}><EmptyState icon="📁" message="No active projects" /></td></tr>}
              {myProjects.map(pr => {
                const achieved    = getAchieved(pr.id);
                const netTarget   = calcNet(parseFloat(pr.target_payment)||0, pr.portal);
                const netAchieved = calcNet(achieved, pr.portal);
                const pm          = pms.find(u=>u.id===pr.manager_id);
                const hasC        = COMMISSION_PORTALS.includes(pr.portal);
                const p           = pct(netAchieved, netTarget);
                const crCount     = pendingCRs(pr.id).length;
                return (
                  <tr key={pr.id} style={selected.has(pr.id)?{background:'var(--primary-lt)'}:{}}>
                    {isSuperAdmin && <td><input type="checkbox" checked={selected.has(pr.id)} onChange={()=>toggleSelect(pr.id)}/></td>}
                    <td>
                      <div style={{ fontWeight:700 }}>{pr.name}</div>
                      {crCount>0 && <span className="badge badge-yellow" style={{ fontSize:10,marginTop:3 }}>⏳ {crCount} CR pending</span>}
                    </td>
                    <td style={{ color:'var(--text2)' }}>{pr.client}</td>
                    <td><span className="tag">{pr.type}</span></td>
                    <td>
                      <span className="tag">{pr.portal}</span>
                      {hasC && <span className="badge badge-yellow" style={{ fontSize:10,marginLeft:4 }}>-20%</span>}
                    </td>
                    {isAdmin && <td>{pm?<div style={{display:'flex',alignItems:'center',gap:5}}><Avatar name={pm.name} id={pm.id} size={22}/><span style={{fontSize:12}}>{pm.name}</span></div>:'—'}</td>}
                    {isAdmin && <td style={{fontSize:12,color:'var(--text2)'}}>{pr.coordinator_name||<span style={{color:'var(--text4)'}}>—</span>}</td>}
                    <td className="mono" style={{ fontSize:12 }}>{fmt(pr.target_payment)}</td>
                    <td className="mono" style={{ fontSize:12,color:hasC?'var(--warning)':'inherit',fontWeight:hasC?600:400 }}>{fmt(netTarget)}</td>
                    <td className="mono" style={{ fontSize:12,color:'var(--success)',fontWeight:600 }}>{fmt(netAchieved)}</td>
                    <td style={{ minWidth:90 }}>
                      <div style={{ fontSize:11,color:'var(--text3)' }}>{p}%</div>
                      <ProgressBar value={p} />
                    </td>
                    <td>
                      {pr.all_payments_received
                        ? <span className="badge badge-green">✓ Done</span>
                        : <span className={`badge badge-${pr.status==='on_hold'?'yellow':'indigo'}`}>{pr.status}</span>
                      }
                    </td>
                    <td style={{ textAlign:'right' }}>
                      <div style={{ display:'flex',gap:4,justifyContent:'flex-end' }}>
                        {!pr.all_payments_received && <button className="btn btn-xs btn-success" onClick={()=>{if(window.confirm('Mark all payments received? Project will hide from projections.'))onMarkReceived(pr.id)}}>✓ Done</button>}
                        {pr.all_payments_received  && <button className="btn btn-xs btn-outline"  onClick={()=>openCR(pr.id)}><Icon name="cr" size={11}/>CR</button>}
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={()=>openEdit(pr)}><Icon name="edit" size={13}/></button>
                        {isAdmin && <button className="btn btn-sm btn-ghost btn-icon" title="Archive" onClick={()=>handleArchive(pr.id)}><Icon name="archive" size={13}/></button>}
                        {isSuperAdmin && <button className="btn btn-sm btn-danger btn-icon" onClick={()=>{if(window.confirm('Delete project and all its data?'))onDelete(pr.id)}}><Icon name="delete" size={13}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}

      {/* ══ ARCHIVED TAB ════════════════════════════════════════ */}
      {activeTab==='archived' && (
        <div className="card">
          <div className="table-wrap"><table>
            <thead><tr>
              {isSuperAdmin && <th style={{width:36}}><input type="checkbox" checked={selected.size===filteredArchived.length&&filteredArchived.length>0} onChange={()=>toggleAll(filteredArchived)}/></th>}
              <th>Project</th><th>Client</th><th>Type</th><th>Portal</th>
              {isAdmin && <th>PM</th>}
              {isAdmin && <th>Coordinator</th>}
              <th>Target</th><th style={{ textAlign:'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {archivedLoading && <tr><td colSpan={12} style={{textAlign:'center',padding:24}}><Spinner/></td></tr>}
              {!archivedLoading && filteredArchived.length===0 && <tr><td colSpan={12}><EmptyState icon="🗂️" message="No archived projects"/></td></tr>}
              {filteredArchived.map(pr => {
                const pm = pms.find(u=>u.id===pr.manager_id);
                return (
                  <tr key={pr.id} style={{opacity:.85, ...(selected.has(pr.id)?{background:'var(--primary-lt)'}:{})}}>
                    {isSuperAdmin && <td><input type="checkbox" checked={selected.has(pr.id)} onChange={()=>toggleSelect(pr.id)}/></td>}
                    <td style={{fontWeight:700}}>{pr.name}</td>
                    <td style={{color:'var(--text2)'}}>{pr.client}</td>
                    <td><span className="tag">{pr.type}</span></td>
                    <td><span className="tag">{pr.portal}</span></td>
                    {isAdmin && <td style={{fontSize:12}}>{pm?.name||'—'}</td>}
                    {isAdmin && <td style={{fontSize:12,color:'var(--text2)'}}>{pr.coordinator_name||'—'}</td>}
                    <td className="mono" style={{fontSize:12}}>{fmt(pr.target_payment)}</td>
                    <td style={{textAlign:'right'}}>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button className="btn btn-xs btn-outline" onClick={()=>handleRestore(pr.id)}>
                          <Icon name="restore" size={11}/>Restore
                        </button>
                        {isSuperAdmin && <button className="btn btn-sm btn-danger btn-icon" onClick={()=>{if(window.confirm('Permanently delete this project and all its data?'))onDelete(pr.id)}}><Icon name="delete" size={13}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Change Requests table */}
      {isAdmin && activeTab==='active' && changeRequests.length>0 && (
        <div className="card" style={{ marginTop:14 }}>
          <div className="card-header"><span className="card-title">Change Requests</span></div>
          <div className="table-wrap"><table>
            <thead><tr><th>Project</th><th>Title</th><th>Amount</th><th>By</th><th>Status</th><th style={{ textAlign:'right' }}>Actions</th></tr></thead>
            <tbody>{changeRequests.map(cr => {
              const pr = projects.find(p=>p.id===cr.project_id);
              return (
                <tr key={cr.id}>
                  <td style={{ fontWeight:600 }}>{pr?.name||'—'}</td>
                  <td>{cr.title}</td>
                  <td className="mono" style={{ fontSize:12 }}>{fmt(cr.amount)}</td>
                  <td style={{ fontSize:12,color:'var(--text3)' }}>{cr.created_by_name||'—'}</td>
                  <td><span className={`badge ${cr.status==='approved'?'badge-green':cr.status==='rejected'?'badge-red':'badge-yellow'}`}>{cr.status}</span></td>
                  <td style={{ textAlign:'right' }}>
                    {cr.status==='pending' && (
                      <div style={{ display:'flex',gap:5,justifyContent:'flex-end' }}>
                        <button className="btn btn-xs btn-success" onClick={()=>onApproveCR(cr.id)}><Icon name="check" size={11}/>Approve</button>
                        <button className="btn btn-xs btn-danger"  onClick={()=>onRejectCR(cr.id)}><Icon name="close" size={11}/>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(modal==='add'||modal==='edit') && (
        <Modal title={modal==='add'?'New Project':'Edit Project'} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<Spinner/>:<><Icon name="check"/>Save</>}</button></>}>
          {error && <div className="alert alert-error"><Icon name="warning" size={13}/>{error}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Project Name</label><input className="form-control" value={form.name||''} onChange={e=>setF('name',e.target.value)} placeholder="Alpha Dashboard"/></div>
            <div className="form-group"><label className="form-label">Client</label><input className="form-control" value={form.client||''} onChange={e=>setF('client',e.target.value)} placeholder="Acme Corp"/></div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-control" value={form.type||'Monthly'} onChange={e=>setF('type',e.target.value)}>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Portal</label>
              <select className="form-control" value={form.portal||'Upwork'} onChange={e=>setF('portal',e.target.value)}>
                {PORTALS.map(pt=><option key={pt}>{pt}</option>)}
              </select>
              {COMMISSION_PORTALS.includes(form.portal) && <div className="form-hint" style={{ color:'var(--warning)' }}>⚠ 20% commission deducted</div>}
            </div>
            <div className="form-group"><label className="form-label">Project Manager</label>
              <select className="form-control" value={form.manager_id||''} disabled={!isAdmin} onChange={e=>setF('manager_id',e.target.value)}>
                {pms.map(pm=><option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Project Coordinator <span style={{fontWeight:400,color:'var(--text4)'}}>— optional</span></label>
              <select className="form-control" value={form.coordinator_id||''} onChange={e=>setF('coordinator_id',e.target.value)}>
                <option value="">None</option>
                {coordinators.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Target Payment ($) <span style={{fontWeight:400,color:'var(--text4)'}}>— optional</span></label><input className="form-control" type="number" min="0" value={form.target_payment||''} onChange={e=>setF('target_payment',e.target.value)} placeholder="Leave blank if unknown"/></div>
          </div>
          <div className="info-box mt-3" style={{ marginTop:12 }}><Icon name="info" size={13}/>Milestones are managed in <strong>Monthly Projections</strong>.</div>
        </Modal>
      )}

      {/* CSV Import Modal */}
      {modal==='csv' && (
        <Modal
          title="Import Projects from CSV"
          onClose={closeCsvModal}
          large
          footer={
            <>
              <button className="btn btn-ghost" onClick={closeCsvModal}>
                {csvResult ? 'Close' : 'Cancel'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={downloadSampleCSV} style={{ marginRight:'auto' }}>
                <Icon name="download" size={12} />Sample CSV
              </button>
              {!csvResult && csvRows.length > 0 && (
                <button className="btn btn-primary" onClick={handleCsvImport} disabled={csvImporting}>
                  {csvImporting ? <Spinner /> : <><Icon name="upload" size={13} />Import {csvRows.length} project{csvRows.length !== 1 ? 's' : ''}</>}
                </button>
              )}
            </>
          }
        >
          {!csvResult ? (
            <>
              <div className="info-box" style={{ marginBottom:14 }}>
                <Icon name="info" size={13} />
                <span>Upload one CSV for all PMs. Required: <strong>Project Name</strong>, <strong>Client Name</strong>, <strong>Platform</strong>, <strong>Project Manager</strong>. Optional: <strong>Project Coordinator</strong>, <strong>Project Health</strong> (Green/Amber), <strong>Type</strong> (Monthly/Hourly/Milestone), <strong>T P</strong> (target payment).</span>
              </div>

              <div className="form-group" style={{ marginBottom:14 }}>
                <label className="form-label">Select CSV File</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="form-control"
                  onChange={handleCsvFile}
                  style={{ padding:'6px 10px', cursor:'pointer' }}
                />
              </div>

              {csvError && (
                <div className="alert alert-error" style={{ marginBottom:12 }}>
                  <Icon name="warning" size={13} />{csvError}
                </div>
              )}

              {csvRows.length > 0 && (
                <>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', marginBottom:8 }}>
                    Preview — {csvRows.length} row{csvRows.length !== 1 ? 's' : ''} ready to import
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border1)' }}>
                          {['Project Name','Client','Portal','Type','Health','Target ($)','Project Manager','Coordinator'].map(h => (
                            <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((row, i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--border0)' }}>
                            <td style={{ padding:'6px 10px', fontWeight:600 }}>{row.project_name || <span style={{ color:'var(--danger)' }}>missing</span>}</td>
                            <td style={{ padding:'6px 10px', color:'var(--text2)' }}>{row.client_name || '—'}</td>
                            <td style={{ padding:'6px 10px' }}><span className="tag">{row.portal}</span></td>
                            <td style={{ padding:'6px 10px' }}><span className="tag">{row.type}</span></td>
                            <td style={{ padding:'6px 10px' }}>
                              <span className={`badge ${row.project_health==='green'?'badge-green':'badge-yellow'}`}>
                                {HEALTH_DISPLAY[row.project_health==='green'?'active':'on_hold']}
                              </span>
                            </td>
                            <td style={{ padding:'6px 10px' }} className="mono">{row.target_payment > 0 ? fmt(row.target_payment) : '—'}</td>
                            <td style={{ padding:'6px 10px' }}>{row.manager_name || <span style={{ color:'var(--danger)' }}>missing</span>}</td>
                            <td style={{ padding:'6px 10px', color:'var(--text3)' }}>{row.coordinator_name || <span style={{ color:'var(--text4)' }}>—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <div>
              {csvResult.created > 0 && (
                <div className="alert alert-success" style={{ marginBottom:12 }}>
                  <Icon name="check" size={14} />
                  <strong>{csvResult.created} project{csvResult.created !== 1 ? 's' : ''}</strong> imported successfully.
                </div>
              )}
              {csvResult.errors.length > 0 && (
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--danger)', marginBottom:8 }}>
                    {csvResult.errors.length} row{csvResult.errors.length !== 1 ? 's' : ''} failed:
                  </div>
                  <div style={{ border:'1px solid var(--border1)', borderRadius:6, overflow:'hidden' }}>
                    {csvResult.errors.map((e, i) => (
                      <div key={i} style={{ padding:'7px 12px', fontSize:12, borderBottom: i < csvResult.errors.length-1 ? '1px solid var(--border0)' : 'none', display:'flex', gap:10 }}>
                        <span style={{ fontWeight:600 }}>{e.project}</span>
                        <span style={{ color:'var(--danger)' }}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* CR Modal */}
      {modal==='cr' && (
        <Modal title="Add Change Request" onClose={()=>setModal(null)} small
          footer={<><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveCR} disabled={saving}>{saving?<Spinner/>:<><Icon name="check"/>Submit</>}</button></>}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="info-box mb-4" style={{ marginBottom:12 }}><Icon name="info" size={13}/>Once approved by admin, the project target increases and it reappears in Monthly Projections.</div>
          <div className="form-group"><label className="form-label">Title</label><input className="form-control" value={crForm.title||''} onChange={e=>setCRF('title',e.target.value)} placeholder="Phase 2 Addition"/></div>
          <div className="form-group"><label className="form-label">Additional Amount ($)</label><input className="form-control" type="number" value={crForm.amount||''} onChange={e=>setCRF('amount',e.target.value)} placeholder="2000"/></div>
          <div className="form-group"><label className="form-label">Description (optional)</label><textarea className="form-control" rows={3} value={crForm.description||''} onChange={e=>setCRF('description',e.target.value)} placeholder="Describe the scope change..."/></div>
        </Modal>
      )}
    </div>
  );
}
