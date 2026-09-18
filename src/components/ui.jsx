import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { fmtINR } from '../engines/utils.js';

export const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></svg>,
  journal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>,
  split: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20c0-3 2.5-5 5-5s5 2 5 5M12 20c0-3 2.5-5 5-5s5 2 5 5"/></svg>,
  cfo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/><path d="M12 10v2l1.5 1"/></svg>,
  more: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
  accounts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 10h18M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18"/></svg>,
  purpose: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h10M4 17h6"/><circle cx="18" cy="16" r="3"/></svg>,
  forecast: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  emergency: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 21s-7-4.5-7-11a7 7 0 0 1 14 0c0 6.5-7 11-7 11z"/><path d="M12 7v6M9 10h6"/></svg>,
  allowance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>,
  spending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>,
  micro: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 12h6"/></svg>,
  goals: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>,
  streaks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 18 9 9l4 6 3-4 4 7"/></svg>,
  health: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>,
  patterns: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h8M6 8v8M18 8v8M8 18h8"/></svg>,
  dup: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>,
  settle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12l5 5L20 7"/></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12 20 4l-4 16-4-7z"/></svg>,
  refresh: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>,
};

export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
export const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] } } };

export function Page({ title, lead, children, actions, back }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : 'hidden'} animate="show" variants={stagger}>
      {(title || back) && (
        <motion.div variants={rise} className="page-title row between wrap" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 6 }}>
            {back && <a href={'#' + back} className="btn ghost sm" aria-label="Back" style={{ marginLeft: -10 }}>{I.back}</a>}
            <div>{title && <h1>{title}</h1>}{lead && <p>{lead}</p>}</div>
          </div>
          {actions && <div className="row wrap">{actions}</div>}
        </motion.div>
      )}
      {children}
    </motion.div>
  );
}

export function Section({ children }) { return <motion.div variants={rise}>{children}</motion.div>; }

export function Reveal({ children, className = '', as: Tag = 'div' }) {
  const ref = useRef(null); const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ref.current || on) return;
    if (!('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { rootMargin: '0px 0px -8% 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [on]);
  return <Tag ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`}>{children}</Tag>;
}

/** Animated count-up for money figures. */
export function Money({ value, decimals = 0, className = '', sign = false, duration = 900 }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setV(value); return; }
    const start = performance.now(); const a = from.current; const b = value;
    let raf;
    const tick = (t) => { const p = Math.min(1, (t - start) / duration); const e = 1 - Math.pow(1 - p, 3); setV(a + (b - a) * e); if (p < 1) raf = requestAnimationFrame(tick); else from.current = b; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, duration]);
  return <span className={`num ${className}`}>{fmtINR(v, { decimals, sign })}</span>;
}

export function Progress({ value, max = 100, tone = '' }) {
  const p = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return <div className={`progress ${tone}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${p}%` }} /></div>;
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return <div className="segmented" role="tablist" aria-label={ariaLabel}>{options.map((o) => <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function Modal({ open, onClose, title, lead, children }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div className="modal" role="dialog" aria-modal="true" aria-label={title} initial={reduce ? false : { y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>{title && <h2>{title}</h2>}{lead && <p className="lead">{lead}</p>}</div>
              <button className="btn ghost sm" onClick={onClose} aria-label="Close">{I.x}</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, hint, error, children }) {
  return <div className="field">{label && <label>{label}</label>}{children}{error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}</div>;
}

export function MoneyInput({ value, onChange, placeholder = '0', invalid, ...rest }) {
  return <div className="input-money"><input className={`input ${invalid ? 'invalid' : ''}`} inputMode="decimal" type="number" min="0" step="1" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest} /></div>;
}

export function Empty({ title, children }) { return <div className="empty"><b>{title}</b>{children}</div>; }

export function Bars({ rows, max, format = (v) => fmtINR(v) }) {
  const m = max || Math.max(...rows.map((r) => r.value), 1);
  return <div className="bars">{rows.map((r, i) => (
    <div className="bar" key={r.label}>
      <span className="ellipsis">{r.label}</span>
      <div className="track"><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: r.value / m }} transition={{ duration: 0.7, delay: i * 0.05, ease: [0.2, 0.7, 0.2, 1] }} style={{ background: r.color }} /></div>
      <span className="v">{format(r.value)}</span>
    </div>))}</div>;
}

export function Ring({ value, size = 132, stroke = 10, label }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const tone = value >= 70 ? 'var(--green)' : value >= 45 ? 'var(--marigold)' : 'var(--rose)';
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label || 'Score'} ${value} out of 100`}>
      <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} stroke="var(--paper-2)" strokeWidth={stroke} fill="none" /><motion.circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }} /></svg>
      <div className="val"><div><div className="big" style={{ fontSize: '2rem' }}>{value}</div><div className="tiny muted">of 100</div></div></div>
    </div>
  );
}

export function Sparkline({ points, low }) {
  if (!points.length) return null;
  const w = 600; const h = 120; const pad = 8;
  const vals = points.map((p) => p.balance);
  const min = Math.min(...vals, 0); const max = Math.max(...vals);
  const x = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - min) / Math.max(1, max - min)) * (h - pad * 2);
  const dpath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const zero = y(0);
  const li = points.findIndex((p) => p.date === low?.date);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--green)" stopOpacity=".3" /><stop offset="1" stopColor="var(--green)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${dpath} L${x(points.length - 1)},${h} L${x(0)},${h} Z`} fill="url(#sg)" />
      {min < 0 && <line x1={0} x2={w} y1={zero} y2={zero} stroke="var(--rose)" strokeDasharray="4 4" />}
      <motion.path d={dpath} fill="none" stroke="var(--green)" strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      {li >= 0 && <circle cx={x(li)} cy={y(points[li].balance)} r="5" fill="var(--rose)" />}
    </svg>
  );
}

export function useToast() {
  return useContextToast();
}
import { createContext, useContext, useCallback } from 'react';
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = '') => { const id = Math.random(); setItems((s) => [...s, { id, text, kind }]); setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200); }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>{items.map((t) => <motion.div key={t.id} className={`toast ${t.kind}`} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>{t.text}</motion.div>)}</AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
function useContextToast() { return useContext(ToastCtx); }
