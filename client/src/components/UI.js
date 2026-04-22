import React from 'react';

// ── SVG Icons ─────────────────────────────────────────────────
const P = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  users:     "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  projects:  "M20 6h-2.18c.07-.44.18-.9.18-1 0-2.21-1.79-4-4-4s-4 1.79-4 4c0 .1.11.56.18 1H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-3c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm6 19H8V8h2v3h8V8h2v14z",
  projection:"M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
  report:    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  logout:    "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
  add:       "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  edit:      "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  delete:    "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  close:     "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  check:     "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  save:      "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z",
  info:      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  warning:   "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  money:     "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  cr:        "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z",
  percent:   "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM17 6l-9 12h-1.5l9-12H17z",
  key:       "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  upload:    "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  download:  "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  archive:   "M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.93 1H5.12z",
  restore:   "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
  clock:     "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
};

export const Icon = ({ name, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'} style={{ flexShrink: 0 }}>
    <path d={P[name] || P.dashboard} />
  </svg>
);

// ── Modal ──────────────────────────────────────────────────────
export const Modal = ({ title, onClose, children, footer, large, small }) => (
  <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className={`modal${large ? ' modal-lg' : small ? ' modal-sm' : ''}`}>
      <div className="modal-header">
        <span className="modal-title">{title}</span>
        <button className="btn btn-icon btn-ghost" onClick={onClose}><Icon name="close" size={15} /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </div>
  </div>
);

// ── Badges ─────────────────────────────────────────────────────
export const StatusBadge = ({ status }) => {
  const map = { Paid:'badge-green', Partial:'badge-yellow', Pending:'badge-gray', Overdue:'badge-red' };
  return <span className={`badge ${map[status]||'badge-gray'}`}>{status||'—'}</span>;
};
export const RoleBadge = ({ role }) => {
  const map = { super_admin:'badge-purple', sub_admin:'badge-blue', project_manager:'badge-green', coordinator:'badge-yellow' };
  const lbl = { super_admin:'Super Admin', sub_admin:'Sub Admin', project_manager:'PM', coordinator:'Coordinator' };
  return <span className={`badge ${map[role]||'badge-gray'}`}>{lbl[role]||role}</span>;
};

// ── Avatar ─────────────────────────────────────────────────────
const ACOLORS = ['#4F46E5','#0284C7','#059669','#D97706','#DC2626','#7C3AED','#DB2777'];
export const avatarColor = (id='') => ACOLORS[id.charCodeAt(id.length-1) % ACOLORS.length] || ACOLORS[0];
export const Avatar = ({ name='?', id='', size=32 }) => (
  <div style={{ width:size, height:size, borderRadius:'50%', background:avatarColor(id),
    display:'flex', alignItems:'center', justifyContent:'center',
    color:'white', fontWeight:700, fontSize:size*.36, flexShrink:0 }}>
    {name[0]?.toUpperCase()}
  </div>
);

// ── Helpers ────────────────────────────────────────────────────
export const fmt = n => '$'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
export const pct = (a,b) => b>0 ? Math.min(100,Math.round((a/b)*100)) : 0;
export const MONTHS = Array.from({length:12},(_,i)=>({val:i+1,label:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}));
export const YEARS  = [2024,2025,2026,2027,2028];
export const todayStr = () => new Date().toISOString().split('T')[0];
export const CURRENT_MONTH = new Date().getMonth()+1;
export const CURRENT_YEAR  = new Date().getFullYear();

// ── Misc components ────────────────────────────────────────────
export const Spinner   = ({ large }) => <div className={`spinner${large?' spinner-lg':''}`} />;
export const ProgressBar = ({ value, color }) => {
  const c = color||(value>=100?'#059669':value>=60?'#D97706':'#4F46E5');
  return <div className="progress-bar"><div className="progress-fill" style={{width:`${Math.min(100,value)}%`,background:c}}/></div>;
};
export const EmptyState = ({ icon='📭', message='No data yet' }) => (
  <div className="empty-state"><div className="empty-icon">{icon}</div><div>{message}</div></div>
);
