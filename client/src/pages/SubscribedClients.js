import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Avatar, StatusBadge, AtRiskBadge, ActionsMenu, Modal, EmptyState, Spinner, fmt, billingSuffix, cycleAmount } from '../components/UI';
import { serverSubscriptionsAPI, invoicesAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const TAB_STYLE = (active) => ({
  padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
  color: active ? 'var(--primary)' : 'var(--text3)',
});

// ── Cancel-with-reason modal ────────────────────────────────────
function CancelModal({ sub, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const submit = async () => {
    if (!reason.trim()) return setError('A cancellation reason is required.');
    setSaving(true); setError('');
    try {
      await serverSubscriptionsAPI.cancel(sub.id, reason.trim());
      onDone();
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="Cancel Subscription" onClose={onClose} small footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-danger" onClick={submit} disabled={saving}>{saving ? <Spinner /> : 'Cancel Subscription'}</button>
    </>}>
      {error && <div className="alert alert-error" style={{ marginBottom: 14 }}><Icon name="warning" size={13} />{error}</div>}
      <div className="info-box" style={{ marginBottom: 14 }}>
        <Icon name="info" size={13} />
        <span>The client for <strong>{sub.project_name}</strong> will stop being billed once Stripe confirms, and this subscription will move to the Cancelled tab.</span>
      </div>
      <div className="form-group">
        <label className="form-label">Reason *</label>
        <textarea className="form-control" rows={3} autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this subscription being cancelled?" />
      </div>
    </Modal>
  );
}

// ── Invoice history drawer ────────────────────────────────────
function InvoiceHistoryModal({ subscription, onClose }) {
  const [invoices, setInvoices] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    invoicesAPI.clientHistory(subscription.id).then(r => setInvoices(r.invoices)).catch(() => setInvoices([]));
  }, [subscription.id]);
  useEffect(() => { load(); }, [load]);

  const resend = async (id) => {
    setBusyId(id);
    try { await invoicesAPI.resend(id); } catch (e) { alert(e.message); } finally { setBusyId(null); }
  };

  return (
    <Modal title={`Invoice History — ${subscription.project_name}`} onClose={onClose} large footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {invoices === null ? <Spinner large /> : (
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Invoice #</th><th>Period</th><th>Amount</th><th>Status</th><th>Issued</th><th>Paid</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {invoices.length === 0 && <tr><td colSpan={7}><EmptyState icon="🧾" message="No invoices yet" /></td></tr>}
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="mono">{inv.invoice_number}</td>
                <td>{inv.period_start ? new Date(inv.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</td>
                <td className="mono">
                  {fmt(inv.total)}
                  {Number(inv.total) > Number(inv.subtotal) && <span className="badge badge-yellow" style={{ marginLeft: 6, fontSize: 10 }}>Includes overdue</span>}
                </td>
                <td><StatusBadge status={inv.status} /></td>
                <td>{inv.sent_at ? new Date(inv.sent_at).toLocaleDateString() : '—'}</td>
                <td>{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm btn-ghost" disabled={busyId === inv.id} onClick={() => resend(inv.id)}>
                    {busyId === inv.id ? <Spinner /> : <Icon name="send" size={13} />} Resend
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function SubscribedClients({ profiles = [] }) {
  const { isAdmin } = useAuth();
  const [tab, setTab]         = useState('active');
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPM, setFilterPM] = useState('all');
  const [active, setActive]   = useState(null); // subscription for invoice-history drawer
  const [toCancel, setToCancel] = useState(null); // subscription for cancel-reason modal

  const pms = profiles.filter(u => u.role === 'project_manager');

  const load = useCallback(async () => {
    setLoading(true);
    try { setSubs(await serverSubscriptionsAPI.list()); }
    catch (_) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const byTab = tab === 'cancelled' ? subs.filter(s => s.status === 'canceled') : subs.filter(s => s.status !== 'canceled');
  const filtered = filterPM === 'all' ? byTab : byTab.filter(s => s.manager_id === filterPM);
  const counts = {
    active: subs.filter(s => s.status !== 'canceled').length,
    cancelled: subs.filter(s => s.status === 'canceled').length,
  };

  return (
    <div>
      <div className="flex flex-center flex-between mb-4">
        <div>
          <div className="page-title">Subscribed Clients</div>
          <div className="text-muted" style={{ marginTop: 3 }}>{filtered.length} {tab === 'cancelled' ? 'cancelled' : 'active'} server subscription{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        {isAdmin && pms.length > 0 && (
          <div>
            <div className="form-label">Filter by PM</div>
            <select className="form-control form-control-sm" value={filterPM} onChange={e => setFilterPM(e.target.value)} style={{ minWidth: 140 }}>
              <option value="all">All PMs</option>
              {pms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 14 }}>
        <button style={TAB_STYLE(tab === 'active')} onClick={() => setTab('active')}>Subscribed ({counts.active})</button>
        <button style={TAB_STYLE(tab === 'cancelled')} onClick={() => setTab('cancelled')}>Cancelled ({counts.cancelled})</button>
      </div>

      <div className="card">
        <div className="table-wrap"><table>
          {tab === 'cancelled' ? (
            <>
              <thead><tr>
                <th>Client</th><th>Project</th><th>PM</th><th>Price (per cycle)</th><th>Reason</th><th>Cancelled On</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7}><Spinner large /></td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={7}><EmptyState icon="🔌" message="No cancelled subscriptions" /></td></tr>}
                {!loading && filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.client_name}</td>
                    <td>{s.project_name}</td>
                    <td>{s.pm_name ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={s.pm_name} id={s.manager_id} size={22} />{s.pm_name}</div> : '—'}</td>
                    <td className="mono">{fmt(cycleAmount(s.monthly_price, s.billing_interval))}/{billingSuffix(s.billing_interval)}</td>
                    <td style={{ maxWidth: 260 }}>{s.cancel_reason || <span style={{ color: 'var(--text4)' }}>—</span>}</td>
                    <td>{s.canceled_at ? new Date(s.canceled_at).toLocaleDateString() : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <ActionsMenu items={[
                        { icon: 'log', label: 'View Invoice History', onClick: () => setActive(s) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr>
                <th>Client</th><th>Project</th><th>PM</th><th>Price (per cycle)</th>
                <th>Sub. Start</th><th>Next Billing</th><th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={8}><Spinner large /></td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={8}><EmptyState icon="🔌" message="No subscribed clients yet" /></td></tr>}
                {!loading && filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.client_name}</td>
                    <td>{s.project_name}</td>
                    <td>{s.pm_name ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={s.pm_name} id={s.manager_id} size={22} />{s.pm_name}</div> : '—'}</td>
                    <td className="mono">{fmt(cycleAmount(s.monthly_price, s.billing_interval))}/{billingSuffix(s.billing_interval)}</td>
                    <td>{s.current_period_start ? new Date(s.current_period_start).toLocaleDateString() : '—'}</td>
                    <td>{s.next_invoice_date ? new Date(s.next_invoice_date).toLocaleDateString() : '—'}</td>
                    <td>
                      <StatusBadge status={s.status} />
                      {!!s.at_risk && <span style={{ marginLeft: 6 }}><AtRiskBadge /></span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <ActionsMenu items={[
                        { icon: 'log', label: 'View Invoice History', onClick: () => setActive(s) },
                        isAdmin && { icon: 'close', label: 'Cancel Subscription', onClick: () => setToCancel(s), danger: true },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table></div>
      </div>

      {active && <InvoiceHistoryModal subscription={active} onClose={() => setActive(null)} />}
      {toCancel && <CancelModal sub={toCancel} onClose={() => setToCancel(null)} onDone={load} />}
    </div>
  );
}
