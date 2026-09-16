import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Avatar, StatusBadge, AtRiskBadge, ActionsMenu, Modal, EmptyState, Spinner, fmt, billingSuffix, cycleAmount } from '../components/UI';
import { serverSubscriptionsAPI, invoicesAPI } from '../api';
import { useAuth } from '../context/AuthContext';

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
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPM, setFilterPM] = useState('all');
  const [active, setActive]   = useState(null); // subscription for invoice-history drawer

  const pms = profiles.filter(u => u.role === 'project_manager');

  const load = useCallback(async () => {
    setLoading(true);
    try { setSubs(await serverSubscriptionsAPI.list()); }
    catch (_) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = filterPM === 'all' ? subs : subs.filter(s => s.manager_id === filterPM);

  const cancel = async (sub) => {
    if (!window.confirm(`Cancel the subscription for ${sub.project_name}? The client will stop being billed once Stripe confirms.`)) return;
    try { await serverSubscriptionsAPI.cancel(sub.id); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="flex flex-center flex-between mb-4">
        <div>
          <div className="page-title">Subscribed Clients</div>
          <div className="text-muted" style={{ marginTop: 3 }}>{filtered.length} active server subscription{filtered.length !== 1 ? 's' : ''}</div>
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

      <div className="card">
        <div className="table-wrap"><table>
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
                    isAdmin && s.status !== 'canceled' && { icon: 'close', label: 'Cancel Subscription', onClick: () => cancel(s), danger: true },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {active && <InvoiceHistoryModal subscription={active} onClose={() => setActive(null)} />}
    </div>
  );
}
