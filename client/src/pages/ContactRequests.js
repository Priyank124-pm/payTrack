import React, { useState, useEffect, useCallback } from 'react';
import { Icon, StatusBadge, ActionsMenu, EmptyState, Spinner } from '../components/UI';
import { contactRequestsAPI } from '../api';

export default function ContactRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busyId, setBusyId]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await contactRequestsAPI.list()); }
    catch (_) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    setBusyId(id);
    try { await contactRequestsAPI.updateStatus(id, status); load(); }
    catch (e) { alert(e.message); } finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="flex flex-center flex-between mb-4">
        <div>
          <div className="page-title">Contact Requests</div>
          <div className="text-muted" style={{ marginTop: 3 }}>{requests.length} submission{requests.length !== 1 ? 's' : ''} from the website</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Name</th><th>Email</th><th>Company</th><th>Message</th><th>Status</th><th>Submitted</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7}><Spinner large /></td></tr>}
            {!loading && requests.length === 0 && <tr><td colSpan={7}><EmptyState icon="📩" message="No contact requests yet" /></td></tr>}
            {!loading && requests.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>{r.email}</td>
                <td>{r.company || '—'}</td>
                <td style={{ maxWidth: 260, whiteSpace: 'normal' }}>{r.message || <span style={{ color: 'var(--text4)' }}>—</span>}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>
                  {busyId === r.id ? <Spinner /> : (
                    <ActionsMenu items={[
                      r.status !== 'contacted' && { icon: 'send', label: 'Mark Contacted', onClick: () => setStatus(r.id, 'contacted') },
                      r.status !== 'closed' && { icon: 'check', label: 'Mark Closed', onClick: () => setStatus(r.id, 'closed') },
                      r.status !== 'new' && { icon: 'restore', label: 'Reopen (New)', onClick: () => setStatus(r.id, 'new') },
                    ]} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
