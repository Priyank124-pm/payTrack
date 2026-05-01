import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icon, Avatar, EmptyState, Spinner, RoleBadge, Modal } from '../components/UI';
import { tasksAPI } from '../api';

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

// ── Create Task Modal ─────────────────────────────────────────────
function CreateTaskModal({ profiles, onClose, onCreate }) {
  const { user: me, isAdmin } = useAuth();
  const [title, setTitle]   = useState('');
  const [desc,  setDesc]    = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Admins can assign to PMs + coordinators; PMs only to their coordinators
  const assignable = isAdmin
    ? profiles.filter(u => ['project_manager','coordinator'].includes(u.role))
    : profiles.filter(u => u.role === 'coordinator' && u.manager_id === me.id);

  const save = async () => {
    setError('');
    if (!title.trim()) return setError('Title is required.');
    if (!assignTo)     return setError('Please select an assignee.');
    setSaving(true);
    try {
      const task = await tasksAPI.create({ title: title.trim(), description: desc.trim() || undefined, assigned_to: assignTo });
      onCreate(task);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title="New Task"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <><Icon name="add" size={13} />Create Task</>}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{error}</div>}
      <div className="form-group">
        <label className="form-label">Title *</label>
        <input className="form-control" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Task title…" autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-control" rows={3} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional details…" />
      </div>
      <div className="form-group">
        <label className="form-label">Assign To *</label>
        <select className="form-control" value={assignTo} onChange={e=>setAssignTo(e.target.value)}>
          <option value="">Select person…</option>
          {assignable.map(u => (
            <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g,' ')})</option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

// ── Complete Task Modal ───────────────────────────────────────────
function CompleteModal({ task, onClose, onComplete }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const save = async () => {
    setSaving(true);
    try {
      const updated = await tasksAPI.complete(task.id, note.trim() || undefined);
      onComplete(updated);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title="Complete Task"
      onClose={onClose}
      small
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <><Icon name="check" size={13}/>Mark Complete</>}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{error}</div>}
      <div style={{ marginBottom:12, fontSize:14, fontWeight:600 }}>{task.title}</div>
      <div className="form-group">
        <label className="form-label">Completion Note (optional)</label>
        <textarea className="form-control" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe what was done…" autoFocus />
      </div>
    </Modal>
  );
}

// ── Task Detail Panel ─────────────────────────────────────────────
function TaskDetail({ task, onUpdate, onClose, canComplete, canDelete, isAdmin }) {
  const { user: me } = useAuth();
  const [comments,    setComments]    = useState([]);
  const [loadingCmts, setLoadingCmts] = useState(true);
  const [newComment,  setNewComment]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [showComplete,setShowComplete]= useState(false);
  const [deleting,    setDeleting]    = useState(false);

  useEffect(() => {
    setLoadingCmts(true);
    tasksAPI.comments(task.id).then(setComments).catch(()=>{}).finally(()=>setLoadingCmts(false));
  }, [task.id]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const updated = await tasksAPI.addComment(task.id, newComment.trim());
      setComments(updated);
      setNewComment('');
    } catch {}
    finally { setSubmitting(false); }
  };

  const handleReopen = async () => {
    try {
      const updated = await tasksAPI.reopen(task.id);
      onUpdate(updated);
    } catch {}
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task and all its comments?')) return;
    setDeleting(true);
    try {
      await tasksAPI.remove(task.id);
      onClose();
    } catch {}
    finally { setDeleting(false); }
  };

  const statusColor = task.status === 'completed' ? 'var(--success)' : '#F59E0B';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Header */}
      <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid var(--border1)' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>{task.title}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ background: statusColor+'20', color: statusColor, border:`1px solid ${statusColor}40`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                {task.status === 'completed' ? '✓ Completed' : '● Open'}
              </span>
              <span style={{ fontSize:11, color:'var(--text3)' }}>Created {fmtTime(task.created_at)}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><Icon name="close" size={13}/></button>
        </div>

        <div style={{ display:'flex', gap:16, marginTop:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.7, marginBottom:3 }}>Assigned By</div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Avatar name={task.assigned_by_name} id={task.assigned_by} size={20}/>
              <span style={{ fontSize:12, fontWeight:600 }}>{task.assigned_by_name}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.7, marginBottom:3 }}>Assigned To</div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Avatar name={task.assigned_to_name} id={task.assigned_to} size={20}/>
              <span style={{ fontSize:12, fontWeight:600 }}>{task.assigned_to_name}</span>
              <RoleBadge role={task.assigned_to_role} />
            </div>
          </div>
          {task.status === 'completed' && (
            <div>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.7, marginBottom:3 }}>Completed By</div>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <Avatar name={task.completed_by_name} id={task.completed_by} size={20}/>
                <span style={{ fontSize:12, fontWeight:600 }}>{task.completed_by_name}</span>
                <span style={{ fontSize:11, color:'var(--text3)' }}>{fmtTime(task.completed_at)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
          {canComplete && task.status === 'open' && (
            <button className="btn btn-sm btn-primary" onClick={()=>setShowComplete(true)}>
              <Icon name="check" size={12}/>Mark Complete
            </button>
          )}
          {canComplete && task.status === 'completed' && (
            <button className="btn btn-sm btn-ghost" onClick={handleReopen}>
              <Icon name="restore" size={12}/>Reopen
            </button>
          )}
          {canDelete && (
            <button className="btn btn-sm btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Spinner/> : <><Icon name="delete" size={12}/>Delete</>}
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {(task.description || task.completion_note) && (
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border1)' }}>
          {task.description && (
            <div style={{ marginBottom: task.completion_note ? 12 : 0 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.7, marginBottom:5 }}>Description</div>
              <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{task.description}</div>
            </div>
          )}
          {task.completion_note && (
            <div style={{ background:'#D1FAE518', border:'1px solid #6EE7B7', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--success)', textTransform:'uppercase', letterSpacing:.7, marginBottom:4 }}>Completion Note</div>
              <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{task.completion_note}</div>
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
        <div style={{ fontWeight:600, fontSize:13, marginBottom:12, color:'var(--text2)' }}>
          Comments ({comments.length})
        </div>
        {loadingCmts
          ? <div style={{ textAlign:'center', padding:20 }}><Spinner/></div>
          : comments.length === 0
            ? <div style={{ color:'var(--text4)', fontSize:12, fontStyle:'italic' }}>No comments yet.</div>
            : comments.map(c => (
                <div key={c.id} style={{ display:'flex', gap:9, marginBottom:14 }}>
                  <Avatar name={c.user_name} id={c.user_id || c.user_name} size={28} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                      <span style={{ fontWeight:600, fontSize:12 }}>{c.user_name}</span>
                      <RoleBadge role={c.user_role} />
                      <span style={{ fontSize:11, color:'var(--text4)' }}>{fmtTime(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.55, whiteSpace:'pre-wrap', background:'var(--bg2)', borderRadius:8, padding:'8px 12px' }}>
                      {c.comment}
                    </div>
                  </div>
                </div>
              ))
        }
      </div>

      {/* Comment input */}
      <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border1)', display:'flex', gap:8, alignItems:'flex-end' }}>
        <textarea
          className="form-control"
          rows={2}
          style={{ flex:1, resize:'none', fontSize:13 }}
          placeholder="Write a comment…"
          value={newComment}
          onChange={e=>setNewComment(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter' && (e.metaKey||e.ctrlKey)) postComment(); }}
        />
        <button className="btn btn-primary btn-sm" onClick={postComment} disabled={submitting || !newComment.trim()}>
          {submitting ? <Spinner/> : 'Send'}
        </button>
      </div>

      {showComplete && (
        <CompleteModal
          task={task}
          onClose={()=>setShowComplete(false)}
          onComplete={updated=>{ onUpdate(updated); setShowComplete(false); }}
        />
      )}
    </div>
  );
}

// ── Main Tasks Page ────────────────────────────────────────────────
export default function Tasks({ profiles }) {
  const { user: me, isAdmin } = useAuth();
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [statusTab,  setStatusTab]  = useState('open');
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const canComplete = isAdmin || me?.role === 'project_manager';
  const canCreate   = isAdmin || me?.role === 'project_manager';
  const canDelete   = isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tasksAPI.list({ status: statusTab });
      setTasks(data);
    } catch {}
    finally { setLoading(false); }
  }, [statusTab]);

  useEffect(() => { load(); }, [load]);

  // Keep selected task in sync when tasks reload
  useEffect(() => {
    if (selected) {
      const fresh = tasks.find(t => t.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [tasks]); // eslint-disable-line

  const handleCreate = task => setTasks(prev => [task, ...prev]);
  const handleUpdate = updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  const handleClose  = () => { setSelected(null); load(); };

  const filtered = tasks.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.title.toLowerCase().includes(q) ||
           t.assigned_to_name.toLowerCase().includes(q) ||
           t.assigned_by_name.toLowerCase().includes(q);
  });

  const openCount      = tasks.filter(t => t.status === 'open').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div style={{ display:'flex', gap:0, height:'calc(100vh - 56px - 48px)', minHeight:500 }}>
      {/* ── Left: Task List ─────────────────────────────────── */}
      <div style={{ width: selected ? '38%' : '100%', minWidth:320, display:'flex', flexDirection:'column', borderRight: selected ? '1px solid var(--border1)' : 'none', transition:'width .2s' }}>
        {/* Header */}
        <div style={{ padding:'0 0 14px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <div className="page-title" style={{ fontSize:17 }}>Tasks</div>
              <div className="text-muted" style={{ marginTop:2 }}>
                {openCount} open · {completedCount} completed
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={load}>
                {loading ? <Spinner/> : <><Icon name="restore" size={13}/>Refresh</>}
              </button>
              {canCreate && (
                <button className="btn btn-primary btn-sm" onClick={()=>setShowCreate(true)}>
                  <Icon name="add" size={13}/>New Task
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, borderBottom:'2px solid var(--border1)', marginBottom:12 }}>
            {[['open','Open'], ['completed','Completed']].map(([id,label]) => (
              <button key={id} onClick={()=>{ setStatusTab(id); setSelected(null); }}
                style={{ background:'none', border:'none', padding:'7px 14px', cursor:'pointer', fontWeight: statusTab===id ? 700 : 500, fontSize:13, color: statusTab===id ? 'var(--primary)' : 'var(--text3)', borderBottom: statusTab===id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom:-2 }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', display:'flex', pointerEvents:'none' }}>
              <Icon name="search" size={13}/>
            </span>
            <input
              className="form-control form-control-sm"
              style={{ paddingLeft:30 }}
              placeholder="Search tasks…"
              value={search}
              onChange={e=>setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Task list */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {loading && <div style={{ textAlign:'center', padding:40 }}><Spinner large/></div>}
          {!loading && filtered.length === 0 && (
            <div className="card card-p" style={{ marginTop:8 }}>
              <EmptyState icon={statusTab==='open' ? '✅' : '📋'} message={statusTab==='open' ? 'No open tasks' : 'No completed tasks'} />
            </div>
          )}
          {!loading && filtered.map(task => {
            const isSelected = selected?.id === task.id;
            return (
              <div
                key={task.id}
                onClick={() => setSelected(isSelected ? null : task)}
                style={{
                  padding:'12px 14px', borderRadius:10, marginBottom:8, cursor:'pointer',
                  background: isSelected ? 'var(--primary-lt)' : 'var(--surface)',
                  border: isSelected ? '1.5px solid var(--primary-md)' : '1.5px solid var(--border1)',
                  transition:'all .15s',
                }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:4, color: isSelected ? 'var(--primary-dk)' : 'var(--text1)' }}>{task.title}</div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <Avatar name={task.assigned_to_name} id={task.assigned_to} size={16}/>
                        <span style={{ fontSize:11, color:'var(--text3)' }}>{task.assigned_to_name}</span>
                      </div>
                      <span style={{ fontSize:10, color:'var(--text4)' }}>·</span>
                      <span style={{ fontSize:11, color:'var(--text4)' }}>by {task.assigned_by_name}</span>
                    </div>
                  </div>
                  {task.status === 'completed' && (
                    <span style={{ fontSize:10, color:'var(--success)', background:'#D1FAE5', borderRadius:20, padding:'2px 7px', fontWeight:700, whiteSpace:'nowrap' }}>Done</span>
                  )}
                </div>
                {task.description && (
                  <div style={{ fontSize:11, color:'var(--text4)', marginTop:5, lineHeight:1.45, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                    {task.description}
                  </div>
                )}
                <div style={{ fontSize:10, color:'var(--text4)', marginTop:6 }}>{fmtTime(task.created_at)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Task Detail ──────────────────────────────── */}
      {selected && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--surface)' }}>
          <TaskDetail
            key={selected.id}
            task={selected}
            onUpdate={updated => { handleUpdate(updated); setSelected(updated); }}
            onClose={handleClose}
            canComplete={canComplete}
            canDelete={canDelete}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          profiles={profiles}
          onClose={()=>setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
