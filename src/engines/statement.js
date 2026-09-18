// Client-side CSV statement parser for Indian bank exports (HDFC, SBI, ICICI, Axis, Kotak, …).
// Finds the header row, maps columns by keyword, normalises dates and amounts.
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim()));
}
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
export function parseDate(s) {
  if (!s) return null; s = String(s).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return iso(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return iso(y, +m[2] - 1, +m[1]); }
  if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,4})[\s\-,]*(\d{2,4})/))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo == null) return null; const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return iso(y, mo, +m[1]); }
  const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function iso(y, mo, d) { const dt = new Date(y, mo, d, 12, 0, 0); return Number.isNaN(dt.getTime()) ? null : dt.toISOString(); }
export function parseAmount(s) {
  if (s == null) return null; const t = String(s).replace(/[₹,\s]/g, '').replace(/INR/i, '');
  if (!t || t === '-') return null;
  const cr = /cr\.?$/i.test(t); const dr = /dr\.?$/i.test(t);
  const n = parseFloat(t.replace(/(cr|dr)\.?$/i, '').replace(/[()]/g, (x) => (x === '(' ? '-' : '')));
  if (Number.isNaN(n)) return null;
  return { value: n, cr, dr };
}
const KEY = { date: /(txn|transaction|value)?\s*date/i, desc: /narration|description|particulars|details|remarks|transaction\s*remarks/i, debit: /withdrawal|debit|^dr\b|amount\s*\(?dr/i, credit: /deposit|credit|^cr\b|amount\s*\(?cr/i, amount: /^amount$|transaction\s*amount|amount\s*\(inr\)/i, balance: /balance/i, type: /^type$|dr\/cr|cr\/dr/i };
export function parseStatement(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c));
  let hi = rows.findIndex((r) => r.some((c) => KEY.date.test(c)) && r.some((c) => KEY.debit.test(c) || KEY.credit.test(c) || KEY.amount.test(c)));
  if (hi < 0) return { rows: [], error: 'Could not find a header row with a Date and Debit/Credit/Amount column. Export the statement as CSV from net-banking (not PDF).', columns: {} };
  const h = rows[hi];
  const col = (re) => h.findIndex((c) => re.test(c));
  const ci = { date: col(KEY.date), desc: col(KEY.desc), debit: col(KEY.debit), credit: col(KEY.credit), amount: col(KEY.amount), balance: col(KEY.balance), type: col(KEY.type) };
  if (ci.desc < 0) ci.desc = h.findIndex((c, i) => i !== ci.date && /[a-z]/i.test(c) && ![ci.debit, ci.credit, ci.amount, ci.balance].includes(i));
  const out = []; let skipped = 0;
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[ci.date]); if (!date) { skipped++; continue; }
    const narration = r[ci.desc] || '';
    let amount = null; let direction = null;
    const d = ci.debit >= 0 ? parseAmount(r[ci.debit]) : null; const c = ci.credit >= 0 ? parseAmount(r[ci.credit]) : null;
    if (d?.value) { amount = Math.abs(d.value); direction = 'out'; }
    else if (c?.value) { amount = Math.abs(c.value); direction = 'in'; }
    else if (ci.amount >= 0) { const a = parseAmount(r[ci.amount]); if (a?.value) { amount = Math.abs(a.value); const t = ci.type >= 0 ? String(r[ci.type]).toLowerCase() : ''; direction = a.cr || /^cr/.test(t) ? 'in' : a.dr || /^dr/.test(t) ? 'out' : a.value < 0 ? 'out' : 'in'; } }
    if (!amount) { skipped++; continue; }
    const b = ci.balance >= 0 ? parseAmount(r[ci.balance]) : null;
    out.push({ date, narration, amount, direction, balance: b ? b.value : null });
  }
  return { rows: out, skipped, columns: Object.fromEntries(Object.entries(ci).filter(([, v]) => v >= 0).map(([k, v]) => [k, h[v]])) };
}
