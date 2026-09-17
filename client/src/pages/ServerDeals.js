import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Avatar, StatusBadge, ActionsMenu, Modal, EmptyState, Spinner, fmt, BILLING_INTERVALS, billingSuffix, cycleAmount } from '../components/UI';
import { serverDealsAPI, projectsAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const TAB_STYLE = (active) => ({
  padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none',
  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
  color: active ? 'var(--primary)' : 'var(--text3)',
});

// ── New Deal modal ────────────────────────────────────────────
export function ProjectPicker({ project, onSelect }) {
  const [allProjects, setAllProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef = React.useRef(null);

  useEffect(() => {
    projectsAPI.list().then(rows => { setAllProjects(rows); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = !q ? allProjects : allProjects.filter(p =>
    p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q)
  );

  if (project) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{project.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{project.client} · PM: {project.manager_name || '—'}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => { onSelect(null); setQuery(''); }}><Icon name="close" size={12} /></button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          className="form-control" placeholder="Select or search a project…"
          value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none', display: 'flex' }}>
          {!loaded ? <Spinner /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>}
        </span>
      </div>
      {open && loaded && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text3)' }}>No projects found</div>}
          {filtered.map(p => (
            <div key={p.id} onClick={() => { onSelect(p); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}>
              <strong>{p.name}</strong> — {p.client} <span style={{ color: 'var(--text3)' }}>({p.manager_name || 'no PM'})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewDealModal({ onClose, onCreated }) {
  const [project, setProject] = useState(null);
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const save = async () => {
    setError('');
    if (!project) return setError('Select a project.');
    setSaving(true);
    try {
      const deal = await serverDealsAPI.create({
        project_id: project.id, notes: notes.trim() || undefined, target_date: targetDate || undefined,
      });
      onCreated(deal);
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal
      title="New Server Deal"
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <><Icon name="add" size={13} />Create Deal</>}
        </button>
      </>}
    >
      {error && <div className="alert alert-error" style={{ marginBottom: 14 }}><Icon name="warning" size={13} />{error}</div>}

      <div className="form-group">
        <label className="form-label">Project *</label>
        <ProjectPicker project={project} onSelect={setProject} />
      </div>

      <div className="info-box" style={{ marginBottom: 14 }}>
        <Icon name="info" size={13} />
        <span>Plan, price and billing cycle are set once the client agrees — you'll fill those in when marking this deal "Client Agreed".</span>
      </div>

      <div className="form-group">
        <label className="form-label">Target Decision Date</label>
        <input className="form-control" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional…" />
      </div>
    </Modal>
  );
}

// ── Shared plan/price fields — used both for standalone editing and for
// confirming pricing at the moment a deal is marked Client Agreed ──
function PricingFields({ planName, setPlanName, monthly, setMonthly, setupFee, setSetupFee, interval, setIntervalV }) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Plan Name *</label>
        <input className="form-control" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Server Maintenance" autoFocus />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Monthly Price ($) *</label>
          <input className="form-control" type="number" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="99" />
        </div>
        <div className="form-group">
          <label className="form-label">Setup Fee ($)</label>
          <input className="form-control" type="number" value={setupFee} onChange={e => setSetupFee(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Billing Cycle</label>
        <select className="form-control" value={interval} onChange={e => setIntervalV(e.target.value)}>
          {BILLING_INTERVALS.map(b => <option key={b.val} value={b.val}>{b.label}</option>)}
        </select>
        {parseFloat(monthly) > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Client is charged <strong>{fmt(cycleAmount(monthly, interval))}</strong> every {BILLING_INTERVALS.find(b => b.val === interval)?.label.toLowerCase()} cycle
            {parseFloat(setupFee) > 0 && <> (plus a one-time {fmt(setupFee)} setup fee on the first invoice)</>}.
          </div>
        )}
      </div>
    </>
  );
}

// ── Edit a deal's plan/price/target date (any time before it's subscribed) ──
function EditPricingModal({ deal, onClose, onDone }) {
  const [planName, setPlanName]   = useState(deal.plan_name || 'Server Maintenance');
  const [monthly, setMonthly]     = useState(deal.monthly_price > 0 ? String(deal.monthly_price) : '');
  const [setupFee, setSetupFee]   = useState(deal.setup_fee > 0 ? String(deal.setup_fee) : '');
  const [interval, setIntervalV]  = useState(deal.billing_interval || 'month');
  const [targetDate, setTargetDate] = useState(deal.target_date ? deal.target_date.slice(0, 10) : '');
  const [notes, setNotes]         = useState(deal.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const save = async () => {
    setError('');
    if (!planName.trim()) return setError('Plan name is required.');
    if (!monthly || parseFloat(monthly) < 0) return setError('Monthly price is required.');
    setSaving(true);
    try {
      await serverDealsAPI.update(deal.id, {
        plan_name: planName.trim(), monthly_price: parseFloat(monthly),
        setup_fee: parseFloat(setupFee) || 0, billing_interval: interval,
        target_date: targetDate || '', notes: notes.trim(),
      });
      onDone();
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="Edit Deal" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : 'Save'}</button>
    </>}>
      {error && <div className="alert alert-error" style={{ marginBottom: 14 }}><Icon name="warning" size={13} />{error}</div>}
      <PricingFields planName={planName} setPlanName={setPlanName} monthly={monthly} setMonthly={setMonthly}
        setupFee={setupFee} setSetupFee={setSetupFee} interval={interval} setIntervalV={setIntervalV} />
      <div className="form-group">
        <label className="form-label">Target Decision Date</label>
        <input className="form-control" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional…" />
      </div>
    </Modal>
  );
}

// ── Confirm pricing + transition to Client Agreed (generates the checkout link) ──
function AgreeModal({ deal, onClose, onAgreed }) {
  const [planName, setPlanName]   = useState(deal.plan_name || 'Server Maintenance');
  const [monthly, setMonthly]     = useState(deal.monthly_price > 0 ? String(deal.monthly_price) : '');
  const [setupFee, setSetupFee]   = useState(deal.setup_fee > 0 ? String(deal.setup_fee) : '');
  const [interval, setIntervalV]  = useState(deal.billing_interval || 'month');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const submit = async () => {
    setError('');
    if (!planName.trim()) return setError('Plan name is required.');
    if (!monthly || parseFloat(monthly) < 0) return setError('Monthly price is required.');
    setSaving(true);
    try {
      await serverDealsAPI.update(deal.id, {
        plan_name: planName.trim(), monthly_price: parseFloat(monthly),
        setup_fee: parseFloat(setupFee) || 0, billing_interval: interval,
      });
      const res = await serverDealsAPI.updateStatus(deal.id, { status: 'client_agreed' });
      onAgreed({ ...deal, plan_name: planName.trim(), monthly_price: parseFloat(monthly), billing_interval: interval }, res.checkoutUrl);
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="Confirm Plan & Mark Client Agreed" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? <Spinner /> : <><Icon name="check" size={13} />Confirm & Generate Link</>}</button>
    </>}>
      {error && <div className="alert alert-error" style={{ marginBottom: 14 }}><Icon name="warning" size={13} />{error}</div>}
      <PricingFields planName={planName} setPlanName={setPlanName} monthly={monthly} setMonthly={setMonthly}
        setupFee={setupFee} setSetupFee={setSetupFee} interval={interval} setIntervalV={setIntervalV} />
    </Modal>
  );
}

// ── Denial reason modal ───────────────────────────────────────
function DenyModal({ deal, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const submit = async () => {
    if (!reason.trim()) return setError('A denial reason is required.');
    setSaving(true); setError('');
    try {
      await serverDealsAPI.updateStatus(deal.id, { status: 'client_denied', reason: reason.trim() });
      onDone();
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal title="Mark Client Denied" onClose={onClose} small footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-danger" onClick={submit} disabled={saving}>{saving ? <Spinner /> : 'Mark Denied'}</button>
    </>}>
      {error && <div className="alert alert-error" style={{ marginBottom: 14 }}><Icon name="warning" size={13} />{error}</div>}
      <div className="form-group">
        <label className="form-label">Reason *</label>
        <textarea className="form-control" rows={3} autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Why did the client decline?" />
      </div>
    </Modal>
  );
}

// ── Checkout link modal (shown once a deal is marked Client Agreed) ──
function CheckoutModal({ deal, url, onClose }) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail]   = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (_) {}
  };

  const send = async () => {
    if (!email.trim()) return setError('Enter the client\'s email.');
    setSending(true); setError('');
    try { await serverDealsAPI.resendCheckoutEmail(deal.id, email.trim()); setSent(true); }
    catch (e) { setError(e.message); } finally { setSending(false); }
  };

  return (
    <Modal title="Billing Setup Link" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="info-box" style={{ marginBottom: 14 }}>
        <Icon name="info" size={13} />
        <span>Share this secure Stripe link with the client to set up recurring billing for <strong>{deal.plan_name}</strong>.</span>
      </div>
      <div className="form-group">
        <label className="form-label">Checkout Link</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-control" readOnly value={url} onClick={e => e.target.select()} />
          <button className="btn btn-outline" onClick={copy}>{copied ? <Icon name="check" size={13} /> : <Icon name="log" size={13} />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Send to Client via Email</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-control" type="email" placeholder="client@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn btn-outline" onClick={send} disabled={sending}>{sending ? <Spinner /> : <Icon name="send" size={13} />}Send</button>
        </div>
        {sent && <div className="success-box" style={{ marginTop: 8 }}>Email sent.</div>}
        {error && <div className="form-error">{error}</div>}
      </div>
    </Modal>
  );
}

// ── Deal history + comments modal ───────────────────────────────
function HistoryModal({ dealId, onClose }) {
  const [deal, setDeal] = useState(null);
  const [tab, setTab] = useState('history');
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  useEffect(() => { serverDealsAPI.get(dealId).then(setDeal).catch(() => {}); }, [dealId]);
  useEffect(() => {
    setCommentsLoading(true);
    serverDealsAPI.getComments(dealId).then(c => { setComments(c); setCommentsLoading(false); }).catch(() => setCommentsLoading(false));
  }, [dealId]);

  const addComment = async () => {
    if (!commentText.trim()) return;
    setCommentSaving(true);
    try {
      const c = await serverDealsAPI.addComment(dealId, commentText.trim());
      setComments(c);
      setCommentText('');
    } catch (e) { alert(e.message); } finally { setCommentSaving(false); }
  };

  return (
    <Modal title="Deal Details" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {!deal ? <Spinner large /> : (
        <>
          {deal.target_date && (
            <div className="info-box" style={{ marginBottom: 14 }}>
              <Icon name="clock" size={13} />
              <span>Target decision date: <strong>{new Date(deal.target_date).toLocaleDateString()}</strong></span>
            </div>
          )}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 14 }}>
            <button style={TAB_STYLE(tab === 'history')} onClick={() => setTab('history')}>History</button>
            <button style={TAB_STYLE(tab === 'comments')} onClick={() => setTab('comments')}>Comments ({comments.length})</button>
          </div>

          {tab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deal.history.map(h => (
                <div key={h.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {h.from_status ? <><StatusBadge status={h.from_status} /> → </> : null}
                    <StatusBadge status={h.to_status} />
                  </div>
                  {h.reason && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{h.reason}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 3 }}>
                    {h.changed_by_name || 'System'} · {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'comments' && (
            <div>
              {commentsLoading && <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>}
              {!commentsLoading && comments.length === 0 && (
                <div style={{ color: 'var(--text4)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>No comments yet.</div>
              )}
              {!commentsLoading && comments.map(c => (
                <div key={c.id} style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                    <strong>{c.user_name}</strong>
                    <span style={{ marginLeft: 6, textTransform: 'capitalize' }}>{c.user_role.replace(/_/g, ' ')}</span>
                    <span style={{ marginLeft: 8, color: 'var(--text4)' }}>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 13 }}>{c.comment}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <textarea
                  className="form-control" rows={2} style={{ flex: 1, resize: 'vertical' }}
                  placeholder="Add a comment…" value={commentText} onChange={e => setCommentText(e.target.value)}
                />
                <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={addComment} disabled={commentSaving || !commentText.trim()}>
                  {commentSaving ? <Spinner /> : <><Icon name="send" size={13} />Add</>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────
export default function ServerDeals() {
  const { isAdmin } = useAuth();
  const [tab, setTab]       = useState('all');
  const [deals, setDeals]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setDeals(await serverDealsAPI.list(tab === 'all' ? {} : { status: tab })); }
    catch (_) {} finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const counts = {
    all: deals.length,
    in_discussion: deals.filter(d => d.status === 'in_discussion').length,
    client_agreed: deals.filter(d => d.status === 'client_agreed').length,
    client_denied: deals.filter(d => d.status === 'client_denied').length,
  };

  const reopen = async (deal) => {
    try { await serverDealsAPI.updateStatus(deal.id, { status: 'in_discussion' }); load(); }
    catch (e) { alert(e.message); }
  };

  const viewCheckoutLink = async (deal) => {
    try {
      const res = await serverDealsAPI.getCheckoutLink(deal.id);
      setCheckoutUrl(res.checkoutUrl);
      setActiveDeal(deal);
      setModal('checkout');
    } catch (e) { alert(e.message); }
  };

  const remindPM = async (deal) => {
    try {
      const res = await serverDealsAPI.remindPM(deal.id);
      alert(`Reminder sent to ${deal.pm_name}${res.emailSent ? ' (in-app + email)' : ' (in-app only — email could not be sent)'}.`);
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="flex flex-center flex-between mb-4">
        <div>
          <div className="page-title">Server Deals</div>
          <div className="text-muted" style={{ marginTop: 3 }}>{counts[tab]} deal{counts[tab] !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}><Icon name="add" />New Server Deal</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 14 }}>
        <button style={TAB_STYLE(tab === 'all')} onClick={() => setTab('all')}>All ({counts.all})</button>
        <button style={TAB_STYLE(tab === 'in_discussion')} onClick={() => setTab('in_discussion')}>In Discussion ({counts.in_discussion})</button>
        <button style={TAB_STYLE(tab === 'client_agreed')} onClick={() => setTab('client_agreed')}>Client Agreed ({counts.client_agreed})</button>
        <button style={TAB_STYLE(tab === 'client_denied')} onClick={() => setTab('client_denied')}>Client Denied ({counts.client_denied})</button>
      </div>

      <div className="card">
        <div className="table-wrap"><table>
          <thead><tr>
            <th>Project</th><th>Client</th><th>PM</th><th>Status</th><th>Target Date</th><th>Price (per cycle)</th><th>Created</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8}><Spinner large /></td></tr>}
            {!loading && deals.length === 0 && <tr><td colSpan={8}><EmptyState icon="🖥️" message="No server deals yet" /></td></tr>}
            {!loading && deals.map(d => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600 }}>{d.project_name}</td>
                <td>{d.client_name}</td>
                <td>{d.pm_name ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar name={d.pm_name} id={d.manager_id} size={22} />{d.pm_name}</div> : '—'}</td>
                <td><StatusBadge status={d.status} /></td>
                <td>{d.target_date ? new Date(d.target_date).toLocaleDateString() : <span style={{ color: 'var(--text4)' }}>—</span>}</td>
                <td className="mono">
                  {d.monthly_price > 0
                    ? <>{fmt(cycleAmount(d.monthly_price, d.billing_interval))}/{billingSuffix(d.billing_interval)}</>
                    : <span style={{ color: 'var(--text4)', fontWeight: 400 }}>Not set yet</span>}
                </td>
                <td>{new Date(d.created_at).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <ActionsMenu items={[
                    { icon: 'log', label: 'View History & Comments', onClick: () => { setActiveDeal(d); setModal('history'); } },
                    d.status === 'in_discussion' && { icon: 'edit', label: 'Edit Deal', onClick: () => { setActiveDeal(d); setModal('edit'); } },
                    d.status === 'in_discussion' && { icon: 'check', label: 'Mark Client Agreed', onClick: () => { setActiveDeal(d); setModal('agree'); } },
                    d.status === 'in_discussion' && { icon: 'close', label: 'Mark Client Denied', onClick: () => { setActiveDeal(d); setModal('deny'); }, danger: true },
                    d.status === 'client_denied' && { icon: 'restore', label: 'Reopen (In Discussion)', onClick: () => reopen(d) },
                    d.status === 'client_agreed' && { icon: 'send', label: 'View / Resend Checkout Link', onClick: () => viewCheckoutLink(d) },
                    isAdmin && d.pm_name && { icon: 'send', label: `Remind ${d.pm_name}`, onClick: () => remindPM(d) },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {modal === 'new'    && <NewDealModal onClose={() => setModal(null)} onCreated={load} />}
      {modal === 'edit'   && <EditPricingModal deal={activeDeal} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'agree'  && (
        <AgreeModal
          deal={activeDeal}
          onClose={() => setModal(null)}
          onAgreed={(deal, url) => { setActiveDeal(deal); setCheckoutUrl(url); setModal('checkout'); load(); }}
        />
      )}
      {modal === 'deny'   && <DenyModal deal={activeDeal} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'checkout' && <CheckoutModal deal={activeDeal} url={checkoutUrl} onClose={() => setModal(null)} />}
      {modal === 'history' && <HistoryModal dealId={activeDeal.id} onClose={() => setModal(null)} />}
    </div>
  );
}
