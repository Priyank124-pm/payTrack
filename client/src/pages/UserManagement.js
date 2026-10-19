import React, { useState } from 'react';
import { Modal, Icon, Avatar, RoleBadge, EmptyState, Spinner } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../api';

// Pages an admin can switch on/off per user (must match CONFIGURABLE_PAGES on the server)
const ACCESS_PAGES = [
  { id:'projects',       label:'Projects' },
  { id:'projections',    label:'Monthly Projections' },
  { id:'projectlookup',  label:'Project Lookup' },
  { id:'lastpayments',   label:'Last Payments' },
  { id:'reports',        label:'Reports' },
  { id:'portalpayments', label:'Filter by Portal' },
  { id:'tasks',          label:'Tasks' },
  { id:'boards',         label:'Boards (Kanban)' },
  { id:'servermgmt',     label:'Server Management' },
];

export default function UserManagement({ profiles, onAdd, onUpdate, onDelete }) {
  const { user: me, isSuperAdmin } = useAuth();
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState({});
  const [error,       setError]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Admin change-password state
  const [pwTarget,  setPwTarget]  = useState(null); // the user whose password is being changed
  const [pwForm,    setPwForm]    = useState({ newPassword:'', confirmPassword:'' });
  const [pwError,   setPwError]   = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSaving,  setPwSaving]  = useState(false);

  const openChangePw = (u) => {
    setPwTarget(u);
    setPwForm({ newPassword:'', confirmPassword:'' });
    setPwError(''); setPwSuccess('');
  };

  const saveChangePw = async () => {
    setPwError(''); setPwSuccess('');
    if (pwForm.newPassword.length < 6) return setPwError('Password must be at least 6 characters.');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwError('Passwords do not match.');
    setPwSaving(true);
    try {
      await usersAPI.changePassword(pwTarget.id, pwForm.newPassword);
      setPwSuccess('Password updated successfully!');
      setTimeout(() => setPwTarget(null), 1800);
    } catch (e) { setPwError(e.message); }
    finally { setPwSaving(false); }
  };

  // Access modal state
  const [accessTarget, setAccessTarget] = useState(null);
  const [accessPages,  setAccessPages]  = useState([]);
  const [accessAll,    setAccessAll]    = useState(false);
  const [accessError,  setAccessError]  = useState('');
  const [accessSaving, setAccessSaving] = useState(false);

  const canManageAccess = u => u.role !== 'super_admin' && (u.role !== 'sub_admin' || isSuperAdmin);

  const openAccess = u => {
    setAccessTarget(u);
    setAccessPages(u.permissions ?? ACCESS_PAGES.map(p => p.id));
    setAccessAll(u.data_scope ? u.data_scope === 'all' : ['super_admin','sub_admin'].includes(u.role));
    setAccessError('');
  };
  const togglePage = id => setAccessPages(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const saveAccess = async () => {
    setAccessSaving(true); setAccessError('');
    try {
      const all = ACCESS_PAGES.every(p => accessPages.includes(p.id));
      await onUpdate(accessTarget.id, { permissions: all ? null : accessPages, data_scope: accessAll ? 'all' : 'own' });
      setAccessTarget(null);
    } catch (e) { setAccessError(e.message); }
    finally { setAccessSaving(false); }
  };
  const toggleActive = async u => {
    const next = !u.is_active;
    if (!window.confirm(next ? `Enable ${u.name}?` : `Disable ${u.name}? They will be signed out and unable to log in.`)) return;
    try { await onUpdate(u.id, { is_active: next }); } catch (e) { alert(e.message); }
  };

  const pms = profiles.filter(u => u.role === 'project_manager');
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openAdd  = () => { setForm({ name:'', email:'', password:'', role:'project_manager', manager_id:'' }); setError(''); setModal('add'); };
  const openEdit = u  => { setForm({ ...u, password:'' }); setError(''); setModal('edit'); };

  const save = async () => {
    if (!form.name || !form.email) return setError('Name and email required.');
    if (modal==='add' && !form.password) return setError('Password required for new users.');
    setSaving(true); setError('');
    try {
      if (modal === 'add') await onAdd(form);
      else await onUpdate(form.id, { name:form.name, role:form.role, manager_id:form.manager_id||null });
      setModal(null);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this user?')) return;
    try { await onDelete(id); } catch(e) { alert(e.message); }
  };

  const groups = [
    { role:'sub_admin',        label:'Sub Admins' },
    { role:'project_manager',  label:'Project Managers' },
    { role:'coordinator',      label:'Coordinators' },
  ];

  return (
    <div>
      <div className="flex flex-center flex-between mb-5">
        <div>
          <div className="page-title">User Management</div>
          <div className="text-muted" style={{ marginTop:3 }}>{profiles.length} total users</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', pointerEvents:'none', display:'flex' }}>
              <Icon name="search" size={13} />
            </span>
            <input
              className="form-control form-control-sm"
              style={{ paddingLeft:28, minWidth:180 }}
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={openAdd}><Icon name="add" />Add User</button>
        </div>
      </div>

      {groups.map(({ role, label }) => {
        const list = profiles.filter(u => {
          if (u.role !== role) return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
          }
          return true;
        });
        return (
          <div className="card" key={role} style={{ marginBottom:14 }}>
            <div className="card-header">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span className="card-title">{label}</span>
                <span className="badge badge-gray">{list.length}</span>
              </div>
            </div>
            {list.length === 0
              ? <div style={{ padding:'14px 18px' }}><EmptyState icon="👤" message={`No ${label.toLowerCase()} yet`} /></div>
              : <div className="table-wrap"><table>
                  <thead><tr>
                    <th>Name</th><th>Email</th><th>Role</th><th>Access</th>
                    {role==='coordinator' && <th>Assigned PM</th>}
                    <th style={{ textAlign:'right' }}>Actions</th>
                  </tr></thead>
                  <tbody>{list.map(u => {
                    const pm = pms.find(p => p.id === u.manager_id);
                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <Avatar name={u.name} id={u.id} size={28} />
                            <span style={{ fontWeight:600 }}>{u.name}</span>
                            {u.id===me?.id && <span className="badge badge-indigo" style={{ fontSize:10 }}>You</span>}
                          </div>
                        </td>
                        <td><span className="mono text-muted">{u.email}</span></td>
                        <td><RoleBadge role={u.role} /></td>
                        <td>
                          {!u.is_active
                            ? <span className="badge badge-red">Disabled</span>
                            : u.permissions
                              ? <span className="badge badge-yellow" title={u.permissions.join(', ') || 'No pages'}>Custom · {u.permissions.length} pages</span>
                              : <span className="badge badge-green">Full</span>}
                          {u.data_scope && <span className={`badge ${u.data_scope === 'all' ? 'badge-blue' : 'badge-gray'}`} style={{ marginLeft:4 }}>{u.data_scope === 'all' ? 'All data' : 'Own data'}</span>}
                        </td>
                        {role==='coordinator' && <td>{pm ? <span className="tag">{pm.name}</span> : <span className="text-muted">—</span>}</td>}
                        <td style={{ textAlign:'right' }}>
                          <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openEdit(u)} title="Edit user"><Icon name="edit" size={13} /></button>
                            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openChangePw(u)} title="Change password"><Icon name="key" size={13} /></button>
                            {canManageAccess(u) && <>
                              <button className="btn btn-sm btn-ghost" onClick={() => openAccess(u)} title="Manage page access">Access</button>
                              {u.id !== me?.id && (
                                <button className={`btn btn-sm ${u.is_active ? 'btn-ghost' : 'btn-primary'}`} onClick={() => toggleActive(u)}>
                                  {u.is_active ? 'Disable' : 'Enable'}
                                </button>
                              )}
                            </>}
                            {u.id !== me?.id && isSuperAdmin &&
                              <button className="btn btn-sm btn-danger btn-icon" onClick={() => handleDelete(u.id)}><Icon name="delete" size={13} /></button>
                            }
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
            }
          </div>
        );
      })}

      {/* ── Admin: Change Password Modal ─────────────────────── */}
      {pwTarget && (
        <Modal
          title={`Change Password — ${pwTarget.name}`}
          onClose={() => setPwTarget(null)}
          small
          footer={<>
            <button className="btn btn-ghost" onClick={() => setPwTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveChangePw} disabled={pwSaving}>
              {pwSaving ? <Spinner /> : <><Icon name="key" size={13}/>Update Password</>}
            </button>
          </>}
        >
          {pwError   && <div className="alert alert-error"   style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{pwError}</div>}
          {pwSuccess && <div className="alert alert-success" style={{ marginBottom:14 }}><Icon name="check"   size={13}/>{pwSuccess}</div>}
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:14, background:'var(--bg2)', borderRadius:8, padding:'8px 12px' }}>
            Setting a new password for <strong>{pwTarget.name}</strong> ({pwTarget.email}). The user will need to use this password on their next login.
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              className="form-control"
              type="password"
              value={pwForm.newPassword}
              onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
              placeholder="Min 6 characters"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              className="form-control"
              type="password"
              value={pwForm.confirmPassword}
              onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="Repeat new password"
            />
            {pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
              <div className="form-error">Passwords do not match</div>
            )}
            {pwForm.confirmPassword && pwForm.newPassword === pwForm.confirmPassword && pwForm.confirmPassword.length > 0 && (
              <div style={{ fontSize:11, color:'var(--success)', marginTop:3, fontWeight:500 }}>✓ Passwords match</div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Manage page access ───────────────────────────────── */}
      {accessTarget && (
        <Modal
          title={`Page Access — ${accessTarget.name}`}
          onClose={() => setAccessTarget(null)}
          small
          footer={<>
            <button className="btn btn-ghost" onClick={() => setAccessTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveAccess} disabled={accessSaving}>
              {accessSaving ? <Spinner /> : <><Icon name="check" size={13}/>Save Access</>}
            </button>
          </>}
        >
          {accessError && <div className="alert alert-error" style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{accessError}</div>}
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>
            Choose which sections <strong>{accessTarget.name}</strong> can open. Unchecked sections are hidden and blocked.
          </div>
          <div style={{ display:'flex', gap:10, marginBottom:10 }}>
            <button className="btn btn-xs btn-ghost" onClick={() => setAccessPages(ACCESS_PAGES.map(p => p.id))}>Select all</button>
            <button className="btn btn-xs btn-ghost" onClick={() => setAccessPages([])}>Clear all</button>
          </div>
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', marginBottom:12, background:'var(--surface2)', borderRadius:8, cursor:'pointer', fontSize:13 }}>
            <input type="checkbox" style={{ marginTop:3 }} checked={accessAll} onChange={e => setAccessAll(e.target.checked)} />
            <span>
              <strong>Can see all users' data</strong>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                Checked: sees every PM's projects, payments, tasks and boards. Unchecked: sees only their own.
              </div>
            </span>
          </label>
          <div className="form-label">Sections</div>
          {ACCESS_PAGES.map(pg => (
            <label key={pg.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={accessPages.includes(pg.id)} onChange={() => togglePage(pg.id)} />
              {pg.label}
            </label>
          ))}
        </Modal>
      )}

      {modal && (
        <Modal title={modal==='add'?'Add User':'Edit User'} onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : <><Icon name="check" />Save</>}</button>
          </>}>
          {error && <div className="alert alert-error"><Icon name="warning" size={13} />{error}</div>}
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Full Name</label><input className="form-control" value={form.name||''} onChange={e=>setF('name',e.target.value)} placeholder="Jane Smith" /></div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" value={form.email||''} onChange={e=>setF('email',e.target.value)} placeholder="jane@co.com" readOnly={modal==='edit'} /></div>
          </div>
          {modal==='add' && <div className="form-group"><label className="form-label">Password</label><input className="form-control" type="password" value={form.password||''} onChange={e=>setF('password',e.target.value)} placeholder="Min 6 chars" /></div>}
          <div className="form-group"><label className="form-label">Role</label>
            <select className="form-control" value={form.role||'project_manager'} onChange={e=>setF('role',e.target.value)}>
              {isSuperAdmin && <option value="sub_admin">Sub Admin</option>}
              <option value="project_manager">Project Manager</option>
              <option value="coordinator">Coordinator</option>
            </select>
          </div>
          {form.role==='coordinator' && (
            <div className="form-group"><label className="form-label">Assigned PM</label>
              <select className="form-control" value={form.manager_id||''} onChange={e=>setF('manager_id',e.target.value)}>
                <option value="">— Select PM —</option>
                {pms.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
