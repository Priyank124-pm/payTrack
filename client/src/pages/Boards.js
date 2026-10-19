import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Icon, Avatar, Spinner, EmptyState } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { boardsAPI } from '../api';

const day = d => (d ? String(d).slice(0, 10) : '');
const fmtDate = d => (d ? new Date(day(d) + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) : null);
const fmtSize = n => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const fmtTime = t => new Date(t).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Board create / edit ─────────────────────────────────────────
function BoardModal({ board, profiles, onClose, onSaved }) {
  const [name, setName]   = useState(board?.name || '');
  const [desc, setDesc]   = useState(board?.description || '');
  const [members, setMembers] = useState((board?.members || []).map(m => m.id));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const users = profiles.filter(u => u.role !== 'super_admin' && u.is_active);
  const toggle = id => setMembers(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);

  const save = async () => {
    if (!name.trim()) return setError('Board name is required.');
    setSaving(true); setError('');
    try {
      const body = { name, description: desc, member_ids: members };
      if (board) await boardsAPI.update(board.id, body); else await boardsAPI.create(body);
      onSaved();
    } catch (e) { setError(e.message); setSaving(false); }
  };

  return (
    <Modal title={board ? 'Edit Board' : 'New Board'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : <><Icon name="check" size={13}/>Save</>}</button>
      </>}>
      {error && <div className="alert alert-error" style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{error}</div>}
      <div className="form-group"><label className="form-label">Board Name</label>
        <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Website Redesign" autoFocus /></div>
      <div className="form-group"><label className="form-label">Description</label>
        <textarea className="form-control" rows={2} value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div className="form-group">
        <label className="form-label">Assign to users ({members.length})</label>
        <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8, padding:'4px 12px' }}>
          {users.map(u => (
            <label key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={members.includes(u.id)} onChange={() => toggle(u.id)} />
              <Avatar name={u.name} id={u.id} size={22} /> {u.name}
              <span className="text-muted" style={{ fontSize:11 }}>{u.role.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Task detail / create ────────────────────────────────────────
function TaskModal({ boardId, task, columnId, columns, members, canDelete, isAdmin, me, onClose, onChanged }) {
  const isNew = !task;
  const [form, setForm] = useState({
    title: task?.title || '', description: task?.description || '',
    assigned_to: task?.assigned_to || '', start_date: day(task?.start_date), due_date: day(task?.due_date),
    column_id: task?.column_id || columnId,
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState([]);
  const [files, setFiles]       = useState([]);
  const [text, setText]         = useState('');
  const [busy, setBusy]         = useState(false);
  const fileRef = useRef();
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (isNew) return;
    boardsAPI.comments(task.id).then(setComments).catch(() => {});
    boardsAPI.attachments(task.id).then(setFiles).catch(() => {});
  }, [isNew, task?.id]);

  const save = async () => {
    if (!form.title.trim()) return setError('Title is required.');
    if (form.start_date && form.due_date && form.due_date < form.start_date) return setError('Due date cannot be before start date.');
    setSaving(true); setError('');
    const body = { ...form, assigned_to: form.assigned_to || null, start_date: form.start_date || null, due_date: form.due_date || null };
    try {
      if (isNew) await boardsAPI.createTask(boardId, body);
      else await boardsAPI.updateTask(task.id, body);
      onChanged(true);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this task and its attachments?')) return;
    try { await boardsAPI.removeTask(task.id); onChanged(true); } catch (e) { setError(e.message); }
  };

  const sendComment = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { setComments(await boardsAPI.addComment(task.id, text)); setText(''); onChanged(false); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const upload = async e => {
    if (!e.target.files.length) return;
    setBusy(true); setError('');
    try { setFiles(await boardsAPI.upload(task.id, e.target.files)); onChanged(false); }
    catch (err) { setError(err.message); } finally { setBusy(false); e.target.value = ''; }
  };

  const delFile = async a => {
    if (!window.confirm(`Remove ${a.file_name}?`)) return;
    try { await boardsAPI.removeAttachment(a.id); setFiles(f => f.filter(x => x.id !== a.id)); onChanged(false); }
    catch (err) { setError(err.message); }
  };

  return (
    <Modal large title={isNew ? 'New Task' : 'Task Details'} onClose={onClose}
      footer={<>
        {!isNew && canDelete && <button className="btn btn-danger" style={{ marginRight:'auto' }} onClick={remove}><Icon name="delete" size={13}/>Delete</button>}
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : <><Icon name="check" size={13}/>{isNew ? 'Create Task' : 'Save Changes'}</>}</button>
      </>}>
      {error && <div className="alert alert-error" style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{error}</div>}
      <div className="form-group"><label className="form-label">Title</label>
        <input className="form-control" value={form.title} onChange={e => setF('title', e.target.value)} autoFocus={isNew} /></div>
      <div className="form-group"><label className="form-label">Description</label>
        <textarea className="form-control" rows={3} value={form.description} onChange={e => setF('description', e.target.value)} /></div>
      <div className="grid-2">
        <div className="form-group"><label className="form-label">Start Date</label>
          <input className="form-control" type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Due Date</label>
          <input className="form-control" type="date" value={form.due_date} min={form.start_date || undefined} onChange={e => setF('due_date', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Assignee</label>
          <select className="form-control" value={form.assigned_to} onChange={e => setF('assigned_to', e.target.value)}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div className="form-group"><label className="form-label">Column</label>
          <select className="form-control" value={form.column_id} onChange={e => setF('column_id', e.target.value)}>
            {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
      </div>

      {isNew
        ? <div className="text-muted" style={{ fontSize:12 }}>Save the task first — then you can add comments and attachments.</div>
        : <>
          {/* Attachments */}
          <div style={{ marginTop:8, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div className="form-label" style={{ margin:0 }}>Attachments ({files.length})</div>
              <button className="btn btn-xs btn-ghost" onClick={() => fileRef.current.click()} disabled={busy}><Icon name="attach" size={12}/> Add files</button>
              <input ref={fileRef} type="file" multiple hidden onChange={upload} />
            </div>
            {files.length === 0 && <div className="text-muted" style={{ fontSize:12 }}>No attachments (max 10 MB each).</div>}
            {files.map(a => (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', border:'1px solid var(--border)', borderRadius:8, marginBottom:5, fontSize:12 }}>
                <Icon name="attach" size={13} />
                <button onClick={() => boardsAPI.download(a.id, a.file_name).catch(e => setError(e.message))}
                  style={{ background:'none', border:'none', padding:0, color:'var(--primary)', cursor:'pointer', fontWeight:600, textAlign:'left', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {a.file_name}
                </button>
                <span className="text-muted">{fmtSize(a.size)} · {a.uploader_name}</span>
                {(isAdmin || a.uploaded_by === me.id) && (
                  <button className="btn btn-xs btn-ghost" onClick={() => delFile(a)} title="Remove"><Icon name="close" size={11}/></button>
                )}
              </div>
            ))}
          </div>

          {/* Comments */}
          <div>
            <div className="form-label">Comments ({comments.length})</div>
            <div style={{ maxHeight:200, overflowY:'auto', marginBottom:8 }}>
              {comments.map(c => (
                <div key={c.id} style={{ padding:'8px 10px', background:'var(--surface2)', borderRadius:8, marginBottom:6 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}><strong style={{ color:'var(--text2)' }}>{c.user_name}</strong> · {fmtTime(c.created_at)}</div>
                  <div style={{ fontSize:13, whiteSpace:'pre-wrap' }}>{c.comment}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input className="form-control" placeholder="Write a comment…" value={text}
                onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()} />
              <button className="btn btn-primary" onClick={sendComment} disabled={busy || !text.trim()}><Icon name="send" size={13}/></button>
            </div>
          </div>
        </>}
    </Modal>
  );
}

// ── Board view ──────────────────────────────────────────────────
function BoardView({ boardId, isAdmin, me, onBack, onEdit }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState('');
  const [taskModal, setTaskModal] = useState(null); // { task?, columnId }
  const [dragId, setDragId]   = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [filterMe, setFilterMe] = useState(false);

  const load = useCallback(async () => {
    try { setData(await boardsAPI.get(boardId)); } catch (e) { setError(e.message); }
  }, [boardId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="alert alert-error"><Icon name="warning" size={13}/>{error} <button className="btn btn-sm btn-ghost" onClick={onBack}>Back</button></div>;
  if (!data) return <div style={{ textAlign:'center', padding:40 }}><Spinner large /></div>;

  const { board, columns, members, tasks } = data;
  const visible = filterMe ? tasks.filter(t => t.assigned_to === me.id) : tasks;

  const drop = async (colId, index) => {
    const id = dragId; setDragId(null); setOverCol(null);
    if (!id) return;
    const t = tasks.find(x => x.id === id);
    // optimistic move
    const rest = tasks.filter(x => x.id !== id);
    const colTasks = rest.filter(x => x.column_id === colId).sort((a, b) => a.position - b.position);
    colTasks.splice(index, 0, { ...t, column_id: colId });
    const moved = new Map(colTasks.map((x, i) => [x.id, { ...x, column_id: colId, position: i }]));
    setData(d => ({ ...d, tasks: [...rest.filter(x => !moved.has(x.id)), ...moved.values()] }));
    try { await boardsAPI.updateTask(id, { column_id: colId, position: index }); }
    catch (e) { setError(e.message); load(); }
  };

  const addColumn = async () => {
    const name = window.prompt('Column name');
    if (name?.trim()) try { await boardsAPI.addColumn(boardId, name); load(); } catch (e) { alert(e.message); }
  };
  const renameColumn = async c => {
    const name = window.prompt('Rename column', c.name);
    if (name?.trim() && name !== c.name) try { await boardsAPI.renameColumn(c.id, name); load(); } catch (e) { alert(e.message); }
  };
  const removeColumn = async c => {
    if (!window.confirm(`Delete column "${c.name}"?`)) return;
    try { await boardsAPI.removeColumn(c.id); load(); } catch (e) { alert(e.message); }
  };

  const today = todayISO();

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div>
          <button className="btn btn-xs btn-ghost" onClick={onBack} style={{ marginBottom:4 }}>← All boards</button>
          <div className="page-title">{board.name}</div>
          {board.description && <div className="text-muted" style={{ marginTop:3 }}>{board.description}</div>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex' }}>{members.map(m => <span key={m.id} title={m.name} style={{ marginLeft:-6 }}><Avatar name={m.name} id={m.id} size={26} /></span>)}</div>
          <label style={{ fontSize:12, display:'flex', gap:5, alignItems:'center', cursor:'pointer' }}>
            <input type="checkbox" checked={filterMe} onChange={e => setFilterMe(e.target.checked)} /> My tasks
          </label>
          {isAdmin && <button className="btn btn-sm btn-ghost" onClick={() => onEdit(board, members)}><Icon name="edit" size={13}/> Edit board</button>}
          {isAdmin && <button className="btn btn-sm btn-ghost" onClick={addColumn}><Icon name="add" size={13}/> Column</button>}
        </div>
      </div>

      <div style={{ display:'flex', gap:12, overflowX:'auto', alignItems:'flex-start', paddingBottom:12 }}>
        {columns.map(col => {
          const colTasks = visible.filter(t => t.column_id === col.id).sort((a, b) => a.position - b.position);
          return (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
              onDragLeave={() => setOverCol(c => (c === col.id ? null : c))}
              onDrop={e => { e.preventDefault(); drop(col.id, colTasks.length); }}
              style={{ flex:'0 0 290px', background: overCol === col.id ? 'var(--primary-lt)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:12, padding:10, minHeight:120, transition:'background .12s' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, padding:'0 2px' }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{col.name} <span className="badge badge-gray" style={{ marginLeft:4 }}>{colTasks.length}</span></div>
                {isAdmin && (
                  <div style={{ display:'flex', gap:2 }}>
                    <button className="btn btn-xs btn-ghost" onClick={() => renameColumn(col)} title="Rename"><Icon name="edit" size={11}/></button>
                    <button className="btn btn-xs btn-ghost" onClick={() => removeColumn(col)} title="Delete"><Icon name="delete" size={11}/></button>
                  </div>
                )}
              </div>

              {colTasks.map((t, i) => {
                const overdue = t.due_date && day(t.due_date) < today && col.id !== columns[columns.length - 1].id;
                return (
                  <div key={t.id} draggable
                    onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(col.id, i); }}
                    onClick={() => setTaskModal({ task: t })}
                    style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', marginBottom:8, cursor:'grab', opacity: dragId === t.id ? .4 : 1, boxShadow:'0 1px 2px rgba(0,0,0,.04)' }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>{t.title}</div>
                    {(t.start_date || t.due_date) && (
                      <div style={{ fontSize:11, color: overdue ? 'var(--danger)' : 'var(--text3)', marginBottom:6, fontWeight: overdue ? 600 : 400 }}>
                        📅 {fmtDate(t.start_date) || '—'} → {fmtDate(t.due_date) || '—'}{overdue && ' · overdue'}
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--text3)' }}>
                        {t.comment_count > 0 && <span>💬 {t.comment_count}</span>}
                        {t.attachment_count > 0 && <span>📎 {t.attachment_count}</span>}
                      </div>
                      {t.assigned_to && <span title={t.assigned_to_name}><Avatar name={t.assigned_to_name || '?'} id={t.assigned_to} size={22} /></span>}
                    </div>
                  </div>
                );
              })}

              <button className="btn btn-sm btn-ghost" style={{ width:'100%', justifyContent:'center' }} onClick={() => setTaskModal({ columnId: col.id })}>
                <Icon name="add" size={12}/> Add task
              </button>
            </div>
          );
        })}
      </div>

      {taskModal && (
        <TaskModal
          boardId={boardId} task={taskModal.task} columnId={taskModal.columnId}
          columns={columns} members={members} me={me} isAdmin={isAdmin}
          canDelete={isAdmin || taskModal.task?.created_by === me.id}
          onClose={() => setTaskModal(null)}
          onChanged={close => { load(); if (close) setTaskModal(null); }}
        />
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────
export default function Boards({ profiles }) {
  const { user, isAdmin } = useAuth();
  const [boards, setBoards]   = useState(null);
  const [error, setError]     = useState('');
  const [openId, setOpenId]   = useState(null);
  const [modal, setModal]     = useState(null); // { board? }
  const [viewKey, setViewKey] = useState(0);     // remount the open board after an edit

  const load = useCallback(async () => {
    try { setBoards(await boardsAPI.list()); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saved = () => { setModal(null); setViewKey(k => k + 1); load(); };

  const remove = async b => {
    if (!window.confirm(`Delete board "${b.name}" with all its tasks and attachments?`)) return;
    try { await boardsAPI.remove(b.id); setOpenId(null); load(); } catch (e) { alert(e.message); }
  };

  const modalEl = modal && <BoardModal board={modal.board} profiles={profiles} onClose={() => setModal(null)} onSaved={() => { saved(); }} />;

  if (openId) return (
    <>
      <BoardView key={viewKey} boardId={openId} isAdmin={isAdmin} me={user}
        onBack={() => { setOpenId(null); load(); }}
        onEdit={(board, members) => setModal({ board: { ...board, members } })} />
      {modalEl}
    </>
  );

  return (
    <div>
      <div className="flex flex-center flex-between mb-5">
        <div>
          <div className="page-title">Boards</div>
          <div className="text-muted" style={{ marginTop:3 }}>{boards ? `${boards.length} board${boards.length !== 1 ? 's' : ''}` : ''}</div>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setModal({})}><Icon name="add" />New Board</button>}
      </div>

      {error && <div className="alert alert-error"><Icon name="warning" size={13}/>{error}</div>}
      {!boards && !error && <div style={{ textAlign:'center', padding:40 }}><Spinner large /></div>}
      {boards && boards.length === 0 && <EmptyState icon="🗂️" message={isAdmin ? 'No boards yet — create one and assign users' : 'No boards have been assigned to you yet'} />}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14 }}>
        {(boards || []).map(b => {
          const pct = b.task_count ? Math.round((b.done_count / b.task_count) * 100) : 0;
          return (
            <div key={b.id} className="card" style={{ padding:16, cursor:'pointer' }} onClick={() => setOpenId(b.id)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{b.name}</div>
                {isAdmin && <button className="btn btn-xs btn-ghost" onClick={e => { e.stopPropagation(); remove(b); }} title="Delete board"><Icon name="delete" size={12}/></button>}
              </div>
              {b.description && <div className="text-muted" style={{ fontSize:12, margin:'4px 0 8px' }}>{b.description}</div>}
              <div style={{ height:6, background:'var(--surface2)', borderRadius:4, overflow:'hidden', margin:'10px 0 4px' }}>
                <div style={{ width:`${pct}%`, height:'100%', background:'var(--success)' }} />
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10 }}>{b.done_count}/{b.task_count} tasks done</div>
              <div style={{ display:'flex' }}>
                {b.members.slice(0, 6).map(m => <span key={m.id} title={m.name} style={{ marginLeft:-6 }}><Avatar name={m.name} id={m.id} size={24} /></span>)}
                {b.members.length > 6 && <span className="text-muted" style={{ fontSize:11, marginLeft:6, alignSelf:'center' }}>+{b.members.length - 6}</span>}
                {b.members.length === 0 && <span className="text-muted" style={{ fontSize:11 }}>No users assigned</span>}
              </div>
            </div>
          );
        })}
      </div>
      {modalEl}
    </div>
  );
}
