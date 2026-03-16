import React, { useState } from 'react';
import { Modal, Icon, Avatar, fmt, pct, ProgressBar, EmptyState, Spinner } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { PORTALS, COMMISSION_PORTALS, calcNet } from '../hooks/useData';

const TYPES = ['Monthly','Hourly','Milestone'];

export default function Projects({ projects, milestones, profiles, changeRequests, onAdd, onUpdate, onDelete, onMarkReceived, onAddCR, onApproveCR, onRejectCR }) {
  const { user:me, isAdmin, isSuperAdmin, effectiveManagerId } = useAuth();
  const [modal, setModal]    = useState(null);
  const [form,  setForm]     = useState({});
  const [crForm,setCRForm]   = useState({});
  const [error, setError]    = useState('');
  const [saving,setSaving]   = useState(false);
  const setF  = (k,v) => setForm(p=>({...p,[k]:v}));
  const setCRF = (k,v)=> setCRForm(p=>({...p,[k]:v}));

  const pms = profiles.filter(u=>u.role==='project_manager');
  const myProjects = isAdmin ? projects : projects.filter(p=>p.manager_id===effectiveManagerId);

  const getAchieved = pid => milestones.filter(m=>m.project_id===pid).reduce((s,m)=>s+(parseFloat(m.achieved)||0),0);
  const pendingCRs  = pid => changeRequests.filter(c=>c.project_id===pid&&c.status==='pending');

  const openAdd = () => {
    const defPM = me?.role==='project_manager'?me.id:me?.role==='coordinator'?me.manager_id:pms[0]?.id||'';
    setForm({ name:'',client:'',type:'Monthly',portal:'Upwork',manager_id:defPM,target_payment:'' });
    setError(''); setModal('add');
  };
  const openEdit = pr => { setForm({...pr}); setError(''); setModal('edit'); };

  const save = async () => {
    if (!form.name||!form.client) return setError('Name and client required.');
    setSaving(true); setError('');
    try {
      if (modal==='add') await onAdd(form);
      else await onUpdate(form.id,{name:form.name,client:form.client,type:form.type,portal:form.portal,manager_id:form.manager_id,target_payment:parseFloat(form.target_payment)||0});
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

  return (
    <div>
      <div className="flex flex-center flex-between mb-4">
        <div>
          <div className="page-title">Projects</div>
          <div className="text-muted" style={{ marginTop:3 }}>{myProjects.length} projects</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Icon name="add" />New Project</button>
      </div>

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

      <div className="card">
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Project</th><th>Client</th><th>Type</th><th>Portal</th>
            {isAdmin && <th>PM</th>}
            <th>Target</th><th>Net Target</th><th>Achieved</th><th>Progress</th><th>Status</th>
            <th style={{ textAlign:'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {myProjects.length===0 && <tr><td colSpan={11}><EmptyState icon="📁" message="No projects yet" /></td></tr>}
            {myProjects.map(pr => {
              const achieved    = getAchieved(pr.id);
              const netTarget   = calcNet(parseFloat(pr.target_payment)||0, pr.portal);
              const netAchieved = calcNet(achieved, pr.portal);
              const pm          = pms.find(u=>u.id===pr.manager_id);
              const hasC        = COMMISSION_PORTALS.includes(pr.portal);
              const p           = pct(netAchieved, netTarget);
              const crCount     = pendingCRs(pr.id).length;
              return (
                <tr key={pr.id}>
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
                      {isSuperAdmin && <button className="btn btn-sm btn-danger btn-icon" onClick={()=>{if(window.confirm('Delete project and all its data?'))onDelete(pr.id)}}><Icon name="delete" size={13}/></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      {/* Change Requests table */}
      {isAdmin && changeRequests.length>0 && (
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
            <div className="form-group"><label className="form-label">Target Payment ($) <span style={{fontWeight:400,color:'var(--text4)'}}>— optional</span></label><input className="form-control" type="number" min="0" value={form.target_payment||''} onChange={e=>setF('target_payment',e.target.value)} placeholder="Leave blank if unknown"/></div>
          </div>
          <div className="info-box mt-3" style={{ marginTop:12 }}><Icon name="info" size={13}/>Milestones are managed in <strong>Monthly Projections</strong>.</div>
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
