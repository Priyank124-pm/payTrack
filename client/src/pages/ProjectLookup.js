import React, { useState, useEffect } from 'react';
import { Icon, fmt, EmptyState, Spinner, StatusBadge, MONTHS, YEARS, CURRENT_MONTH, CURRENT_YEAR } from '../components/UI';
import { COMMISSION_PORTALS, calcNet } from '../hooks/useData';
import { projectsAPI, milestonesAPI } from '../api';

export default function ProjectLookup() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const [query,         setQuery]         = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [picked,        setPicked]        = useState(null);
  const [pickedRows,    setPickedRows]    = useState([]);
  const [searching,     setSearching]     = useState(false);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await projectsAPI.lookup(query);
        if (!cancelled) setSearchResults(results);
      } catch (_) {}
      finally { if (!cancelled) setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!picked) { setPickedRows([]); return; }
    milestonesAPI.lookup({ project_id: picked.id, month, year })
      .then(rows => setPickedRows(rows))
      .catch(() => setPickedRows([]));
  }, [picked, month, year]);

  const pickedNetT = pickedRows.reduce((s, m) => s + calcNet(parseFloat(m.amount)  || 0, picked?.portal), 0);
  const pickedNetA = pickedRows.reduce((s, m) => s + calcNet(parseFloat(m.achieved) || 0, picked?.portal), 0);

  const clear = () => { setPicked(null); setQuery(''); setSearchResults([]); };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-center flex-between mb-4" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">Project Lookup</div>
          <div className="text-muted" style={{ marginTop: 3 }}>
            Search any project to view its {MONTHS[month - 1]?.label} {year} projection
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Month</label>
            <select className="form-control form-control-sm" value={month} onChange={e => { setMonth(+e.target.value); setPickedRows([]); }}>
              {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Year</label>
            <select className="form-control form-control-sm" value={year} onChange={e => { setYear(+e.target.value); setPickedRows([]); }}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', maxWidth: 440, marginBottom: 6 }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', display: 'flex', pointerEvents: 'none' }}>
          <Icon name="search" size={15} />
        </span>
        <input
          className="form-control"
          style={{ paddingLeft: 38, fontSize: 14 }}
          placeholder="Search project or client name…"
          value={query}
          onChange={e => { setQuery(e.target.value); setPicked(null); }}
          autoFocus
        />
        {searching && (
          <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            <Spinner />
          </span>
        )}
      </div>

      {/* ── Dropdown results ──────────────────────────────────── */}
      {searchResults.length > 0 && !picked && (
        <div style={{ maxWidth: 440, border: '1px solid var(--border1)', borderRadius: 8, marginBottom: 16, background: 'var(--surface)', boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20, position: 'relative' }}>
          {searchResults.map(p => (
            <div key={p.id}
              onClick={() => { setPicked(p); setQuery(p.name); }}
              style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border1)', fontSize: 13 }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg2)'}
              onMouseOut={e  => e.currentTarget.style.background = ''}
            >
              <div style={{ fontWeight: 600 }}>
                {p.name}
                <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 12, fontWeight: 400 }}>{p.client}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text4)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="tag" style={{ fontSize: 11 }}>{p.portal}</span>
                <span>PM: {p.manager_name}</span>
                {p.coordinator_name && <span>· PC: {p.coordinator_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty / no-results states ─────────────────────────── */}
      {!query.trim() && (
        <div className="card card-p" style={{ marginTop: 10 }}>
          <EmptyState icon="🔍" message="Type a project or client name above to search" />
        </div>
      )}
      {query.trim() && !searching && searchResults.length === 0 && !picked && (
        <div className="card card-p" style={{ marginTop: 10 }}>
          <EmptyState icon="📭" message={`No projects found matching "${query}"`} />
        </div>
      )}

      {/* ── Result card ───────────────────────────────────────── */}
      {picked && (
        <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--primary)' }}>
          <div className="card-header" style={{ background: 'var(--bg2)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{picked.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="tag">{picked.type}</span>
                <span className="tag">{picked.portal}</span>
                {COMMISSION_PORTALS.includes(picked.portal) && (
                  <span className="badge badge-yellow" style={{ fontSize: 10 }}>-20% commission</span>
                )}
                <span>PM: <strong>{picked.manager_name}</strong></span>
                {picked.coordinator_name && <span>· PC: <strong>{picked.coordinator_name}</strong></span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {pickedRows.length > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>Net Target / Achieved</div>
                  <div className="mono" style={{ fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>{fmt(pickedNetT)}</span>
                    <span style={{ color: 'var(--border2)', margin: '0 6px' }}>/</span>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>{fmt(pickedNetA)}</span>
                  </div>
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={clear}>
                <Icon name="close" size={13} /> Clear
              </button>
            </div>
          </div>

          <div style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {MONTHS[month - 1]?.label} {year} · Milestones
            </div>
            {pickedRows.length === 0
              ? <div style={{ color: 'var(--text4)', fontSize: 13, fontStyle: 'italic' }}>
                  No milestones for {MONTHS[month - 1]?.label} {year}.
                </div>
              : pickedRows.map(m => {
                const net = calcNet(parseFloat(m.amount) || 0, picked.portal);
                const td  = m.target_date ? String(m.target_date).slice(0, 10) : null;
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border1)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                      {td && <div className="mono text-muted" style={{ fontSize: 11, marginTop: 2 }}>{td}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: 13, color: 'var(--text2)' }}>{fmt(net)}</span>
                      <StatusBadge status={m.status} />
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}
    </div>
  );
}
