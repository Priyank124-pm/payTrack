import React, { useState } from 'react';
import { fmt } from './UI';

// Categorical slots 1 & 2 from the reference palette (validated adjacent pair).
export const SERIES = { projected: '#2a78d6', received: '#eb6834' };
// Status colours are reserved for state, never reused as series colours.
const STATUS_COLORS = { Paid: '#059669', Partial: '#D97706', Pending: '#94A3B8', Overdue: '#DC2626' };

const compact = n => {
  const v = Math.abs(n);
  const s = v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(Math.round(v));
  return (n < 0 ? '-' : '') + '$' + s.replace('.0', '');
};

const niceMax = max => {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
};

// Bar with rounded data-end only, anchored to the baseline
const barPath = (x, y, w, h, r = 4) => {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};

const Legend = ({ items }) => (
  <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'var(--text2)' }}>
    {items.map(i => (
      <span key={i.label} style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
        <span style={{ width:10, height:10, borderRadius:3, background:i.color }} />{i.label}
      </span>
    ))}
  </div>
);

// ── Grouped column chart: two series per category ───────────────
export function GroupedBars({ data, a, b, height = 260 }) {
  // data: [{ label, a, b }]   a/b: { name, color }
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const W = 720, H = height, L = 46, R = 8, T = 10, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(...data.flatMap(d => [d.a, d.b]), 0));
  const y = v => T + ph - (v / max) * ph;
  const gw = pw / data.length, bw = Math.min(18, gw * 0.32);
  const ticks = [0, .25, .5, .75, 1].map(t => max * t);
  const hd = hover !== null ? data[hover] : null;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:10, flexWrap:'wrap' }}>
        <Legend items={[{ label:a.name, color:a.color }, { label:b.name, color:b.color }]} />
        <button className="btn btn-xs btn-ghost" onClick={() => setTable(t => !t)}>{table ? 'Show chart' : 'Show table'}</button>
      </div>
      {table ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Month</th><th style={{ textAlign:'right' }}>{a.name}</th><th style={{ textAlign:'right' }}>{b.name}</th></tr></thead>
          <tbody>{data.map(d => <tr key={d.label}><td>{d.label}</td><td className="mono" style={{ textAlign:'right' }}>{fmt(d.a)}</td><td className="mono" style={{ textAlign:'right' }}>{fmt(d.b)}</td></tr>)}</tbody>
        </table></div>
      ) : (
        <div style={{ position:'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block' }} role="img" aria-label={`${a.name} versus ${b.name} by month`}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" strokeDasharray={t === 0 ? '' : '3 4'} />
                <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--text3)">{compact(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = L + gw * i + gw / 2;
              return (
                <g key={d.label}>
                  {hover === i && <rect x={L + gw * i + 2} y={T} width={gw - 4} height={ph} rx="6" fill="var(--surface2)" />}
                  <path d={barPath(cx - bw - 1, y(d.a), bw, T + ph - y(d.a))} fill={a.color} />
                  <path d={barPath(cx + 1, y(d.b), bw, T + ph - y(d.b))} fill={b.color} />
                  <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--text3)">{d.label}</text>
                  <rect x={L + gw * i} y={T} width={gw} height={ph + B} fill="transparent"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                </g>
              );
            })}
          </svg>
          {hd && (
            <div style={{
              position:'absolute', top:0, pointerEvents:'none', zIndex:5,
              left:`${((L + gw * hover + gw / 2) / W) * 100}%`, transform: hover > 8 ? 'translateX(-105%)' : 'translateX(8%)',
              background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:10, padding:'8px 12px', boxShadow:'var(--shadow)', fontSize:12, whiteSpace:'nowrap',
            }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>{hd.label}</div>
              <div><span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:a.color, marginRight:6 }} />{a.name}: <strong className="mono">{fmt(hd.a)}</strong></div>
              <div><span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:b.color, marginRight:6 }} />{b.name}: <strong className="mono">{fmt(hd.b)}</strong></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Horizontal bars: received (solid) over projected (light track) ──
export function PortalBars({ rows }) {
  // rows: [{ label, projected, received }]
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map(r => r.projected), ...rows.map(r => r.received), 1);
  return (
    <div>
      <Legend items={[{ label:'Projected', color:'#bcd5f3' }, { label:'Received', color:SERIES.projected }]} />
      <div style={{ marginTop:14 }}>
        {rows.map((r, i) => (
          <div key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ display:'grid', gridTemplateColumns:'100px 1fr 86px', alignItems:'center', gap:10, padding:'6px 0', opacity: hover === null || hover === i ? 1 : .55, transition:'opacity .12s' }}>
            <div style={{ fontSize:12.5, fontWeight:600, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</div>
            <div style={{ position:'relative', height:14 }} title={`Projected ${fmt(r.projected)} · Received ${fmt(r.received)}`}>
              <div style={{ position:'absolute', inset:0, width:`${(r.projected / max) * 100}%`, background:'#bcd5f3', borderRadius:'0 5px 5px 0' }} />
              <div style={{ position:'absolute', inset:0, width:`${(r.received / max) * 100}%`, background:SERIES.projected, borderRadius:'0 5px 5px 0', boxShadow:'0 0 0 2px var(--surface)' }} />
            </div>
            <div className="mono" style={{ fontSize:12, textAlign:'right', fontWeight:600 }}>{fmt(r.received)}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-muted" style={{ padding:'20px 0' }}>No portal data yet</div>}
      </div>
    </div>
  );
}

// ── Single stacked bar for state distribution ───────────────────
export function StatusBar({ counts }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const order = ['Paid', 'Partial', 'Pending', 'Overdue'];
  if (!total) return <div className="text-muted" style={{ padding:'20px 0' }}>No milestones this month</div>;
  return (
    <div>
      <div style={{ display:'flex', height:16, gap:2, borderRadius:8, overflow:'hidden' }}>
        {order.filter(k => counts[k]).map(k => (
          <div key={k} title={`${k}: ${counts[k]}`} style={{ flex:counts[k], background:STATUS_COLORS[k] }} />
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginTop:16 }}>
        {order.map(k => (
          <div key={k} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
            <span style={{ width:10, height:10, borderRadius:3, background:STATUS_COLORS[k] }} />
            <span style={{ color:'var(--text2)' }}>{k}</span>
            <strong style={{ marginLeft:'auto' }}>{counts[k] || 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
