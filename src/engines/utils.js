// Shared helpers used by every engine. Pure functions only.

export const DAY_MS = 86400000;

export function toDate(d) {
  if (d instanceof Date) return d;
  // Date-only strings are parsed as LOCAL midnight (the JS default is UTC midnight, which
  // shifts the day in negative-offset timezones).
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + 'T00:00:00');
  return new Date(d);
}

export function isoDay(d) {
  const x = toDate(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d) {
  const x = toDate(d);
  return new Date(x.getFullYear(), x.getMonth(), 1);
}

export function endOfMonth(d) {
  const x = toDate(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addDays(d, n) {
  const x = new Date(toDate(d));
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d, n) {
  const x = new Date(toDate(d));
  x.setMonth(x.getMonth() + n);
  return x;
}

export function daysBetween(a, b) {
  const da = new Date(isoDay(a) + 'T00:00:00');
  const db = new Date(isoDay(b) + 'T00:00:00');
  return Math.round((db - da) / DAY_MS);
}

export function sameMonth(a, b) {
  const x = toDate(a);
  const y = toDate(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
}

export function monthKey(d) {
  const x = toDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum(arr, fn = (x) => x) {
  return arr.reduce((acc, x) => acc + (fn(x) || 0), 0);
}

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Indian number formatting: ₹1,50,000 */
export function fmtINR(n, { decimals, sign = false } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const neg = n < 0;
  const abs = Math.abs(n);
  // Paise are shown only when they exist (split shares like ₹466.67); whole rupees stay clean.
  if (decimals === undefined) decimals = Math.abs(abs - Math.round(abs)) >= 0.005 ? 2 : 0;
  const fixed = abs.toFixed(decimals);
  const [intPart, dec] = fixed.split('.');
  let last3 = intPart.slice(-3);
  let rest = intPart.slice(0, -3);
  if (rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
  const body = `₹${rest}${last3}${dec ? '.' + dec : ''}`;
  if (neg) return `−${body}`;
  return sign ? `+${body}` : body;
}

export function fmtDate(d, opts = {}) {
  return toDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...opts });
}

export function fmtTime(d) {
  return toDate(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Deterministic PRNG so the demo dataset is stable across reloads. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
