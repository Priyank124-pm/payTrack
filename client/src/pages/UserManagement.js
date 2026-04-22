import React, { useState } from 'react';
import { Modal, Icon, Avatar, RoleBadge, EmptyState, Spinner } from '../components/UI';
import { useAuth } from '../context/AuthContext';

export default function UserManagement({ profiles, onAdd, onUpdate, onDelete }) {
  const { user: me, isSuperAdmin } = useAuth();
  const [modal,       setModal]       = useState(null);
  const [form,        setForm]        = useState({});
  const [error,       setError]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
                    <th>Name</th><th>Email</th><th>Role</th>
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
                        {role==='coordinator' && <td>{pm ? <span className="tag">{pm.name}</span> : <span className="text-muted">—</span>}</td>}
                        <td style={{ textAlign:'right' }}>
                          <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openEdit(u)}><Icon name="edit" size={13} /></button>
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
