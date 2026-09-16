import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Avatar, StatusBadge, ActionsMenu, EmptyState, Spinner, fmt, MONTHS, YEARS, CURRENT_MONTH, CURRENT_YEAR } from '../components/UI';
import { invoicesAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const TAB_STYLE = (active) => ({
  padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
  color: active ? 'var(--primary)' : 'var(--text3)',
});

export default function ServerPayments({ profiles = [] }) {
  const { isAdmin } = useAuth();
  const [tab, setTab]       = useState('pending');
  const [month, setMonth]   = useState(CURRENT_MONTH);
  const [year, setYear]     = useState(CURRENT_YEAR);
  const [filterPM, setFilterPM] = useState('all');
  const [rows, setRows]     = useState([]);
  const [kpis, setKpis]     = useState({ expected: 0, received: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const pms = profiles.filter(u => u.role === 'project_manager');
  const params = { tab, month, year, ...(filterPM !== 'all' ? { managerId: filterPM } : {}) };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, k] = await Promise.all([invoicesAPI.list(params), invoicesAPI.kpis(params)]);
      setRows(list); setKpis(k);
    } catch (_) {} finally { setLoading(false); }
  }, [tab, month, year, filterPM]);
  useEffect(() => { load(); }, [load]);

  const resend = async (id) => { setBusyId(id); try { await invoicesAPI.resend(id); } catch (e) { alert(e.message); } finally { setBusyId(null); } };
  const markPaid = async (id) => {
    if (!window.confirm('Mark this invoice as paid manually (e.g. bank transfer)?')) return;
    setBusyId(id);
    try { await invoicesAPI.markPaidManual(id); load(); } catch (e) { alert(e.message); } finally { setBusyId(null); }
  };

  const stats = [
    { label: `Expected — ${MONTHS[month - 1]?.label} ${year}`, value: fmt(kpis.expected), color: '#4F46E5', icon: '📅' },
    { label: 'Received This Month',  value: fmt(kpis.received), color: '#059669', icon: '✅' },
    { label: 'Total Overdue',        value: fmt(kpis.overdue),  color: '#DC2626', icon: '⚠️' },
  ];

  return (
    <div>
      <div className="flex flex-center flex-between mb-4" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">Server Payments</div>
          <div className="text-muted" style={{ marginTop: 3 }}>{rows.length} invoice{rows.length !== 1 ? 's' : ''} in this view</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {isAdmin && pms.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">PM</label>
              <select className="form-control form-control-sm" value={filterPM} onChange={e => setFilterPM(e.target.value)}>
                <option value="all">All PMs</option>
                {pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Month</label>
            <select className="form-control form-control-sm" value={month} onChange={e => setMonth(+e.target.value)}>
              {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Year</label>
            <select className="form-control form-control-sm" value={year} onChange={e => setYear(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 18 }}>
        {stats.map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon" style={{ background: s.color + '18' }}><span style={{ fontSize: 17 }}>{s.icon}</span></div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: String(s.value).length > 8 ? 17 : 24 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 14 }}>
        <button style={TAB_STYLE(tab === 'pending')}  onClick={() => setTab('pending')}>Pending</button>
        <button style={TAB_STYLE(tab === 'upcoming')} onClick={() => setTab('upcoming')}>Upcoming</button>
        <button style={TAB_STYLE(tab === 'received')} onClick={() => setTab('received')}>Received</button>
      </div>

      <div className="card">
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Client</th><th>Project</th><th>PM</th><th>Amount</th><th>Due Date</th><th>Status</th>
            {tab !== 'upcoming' && <th style={{ textAlign: 'right' }}>Actions</th>}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7}><Spinner large /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7}><EmptyState icon="💳" message={`No ${tab} payments`} /></td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id || r.subscription_id}>
                <td style={{ fontWeight: 600 }}>{r.client_name}</td>
                <td>{r.project_name}</td>
                <td>{r.pm_name ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={r.pm_name} id={r.manager_id} size={22} />{r.pm_name}</div> : '—'}</td>
                <td className="mono">
                  {fmt(r.total ?? r.amount)}
                  {r.total != null && r.subtotal != null && Number(r.total) > Number(r.subtotal) && <span className="badge badge-yellow" style={{ marginLeft: 6, fontSize: 10 }}>Includes overdue</span>}
                </td>
                <td>{r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}</td>
                <td><StatusBadge status={r.status} /></td>
                {tab !== 'upcoming' && (
                  <td style={{ textAlign: 'right' }}>
                    <ActionsMenu items={[
                      { icon: 'send', label: 'Resend', onClick: () => resend(r.id) },
                      isAdmin && r.status !== 'paid' && { icon: 'check', label: 'Mark Paid Manually', onClick: () => markPaid(r.id) },
                    ]} />
                    {busyId === r.id && <Spinner />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
