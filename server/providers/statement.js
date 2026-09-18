// Bank statement import. Real data, no institution API: the user exports a statement (CSV) from
// net-banking and MILO parses it. Rows are stored encrypted on the connection; sync re-emits them so
// the same pipeline (categorisation, forecast, CFO) runs on imported data exactly as on API data.
import { createHash } from 'node:crypto';
const norm = (r) => ({ date: r.date, amount: Math.abs(Number(r.amount)), direction: r.direction === 'in' ? 'in' : 'out', narration: String(r.narration || '').slice(0, 200), balance: r.balance == null ? null : Number(r.balance) });
const rowId = (r) => createHash('sha1').update(`${r.date}|${r.amount}|${r.direction}|${r.narration}|${r.balance ?? ''}`).digest('hex').slice(0, 24);
const KINDS = { savings: 'asset', current: 'asset', credit_card: 'liability' };
export default {
  id: 'statement_import', name: 'Import a bank statement (CSV)', kind: 'bank', demo: false,
  covers: 'Any bank. Export your statement from net-banking as CSV and upload it: real transactions, no company registration needed. Balance comes from the statement\'s running balance.',
  scopes: ['Only the rows in the file you upload'],
  inputs: [],
  status() { return { available: true }; },
  async start() { return { ready: true }; },
  async complete(conn, params, inputs = {}) {
    const rows = Array.isArray(inputs.rows) ? inputs.rows.map(norm).filter((r) => r.date && r.amount > 0) : [];
    if (!rows.length) throw new Error('No usable rows were found in the statement.');
    if (rows.length > 20000) throw new Error('That statement has more than 20,000 rows; split it into smaller files.');
    const type = KINDS[inputs.type] ? inputs.type : 'savings';
    const label = String(inputs.accountName || `${inputs.institution || 'Bank'} statement`).slice(0, 60);
    return { tokens: { rows, institution: String(inputs.institution || 'Bank').slice(0, 40), accountName: label, type, mask: String(inputs.mask || '').slice(-4) }, providerRef: 'statement', label, consentExpiresAt: null };
  },
  async append(conn, tokens, inputs = {}) {
    const add = (Array.isArray(inputs.rows) ? inputs.rows.map(norm) : []).filter((r) => r.date && r.amount > 0);
    const seen = new Set(tokens.rows.map(rowId));
    const merged = [...tokens.rows, ...add.filter((r) => !seen.has(rowId(r)))];
    return { ...tokens, rows: merged, added: merged.length - tokens.rows.length };
  },
  async sync(conn, tokens) {
    const rows = [...tokens.rows].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = rows.find((r) => r.balance != null);
    const account = { externalId: `stmt-${conn.id}`, name: tokens.accountName, institution: tokens.institution, type: tokens.type, kind: KINDS[tokens.type], balance: latest ? Math.abs(latest.balance) : 0, mask: tokens.mask ? `••${tokens.mask}` : 'statement', meta: { imported: rows.length, balanceKnown: !!latest } };
    const transactions = rows.map((r) => ({ accountExternalId: account.externalId, externalId: rowId(r), date: r.date, amount: r.amount, direction: r.direction, merchant: r.narration.replace(/^(UPI|NEFT|IMPS|POS|ATM)[\/\-\s]*/i, '').split(/[\/\-]/)[0].trim().slice(0, 60) || r.narration.slice(0, 60), descriptor: r.narration, channel: /UPI/i.test(r.narration) ? 'upi' : /POS|CARD/i.test(r.narration) ? 'card' : 'bank' }));
    return { accounts: [account], transactions };
  },
  async revoke() { /* nothing external */ },
};
