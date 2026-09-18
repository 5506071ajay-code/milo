import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Page, Section, Field, useToast, I, Empty } from '../components/ui.jsx';
import { parseStatement } from '../engines/statement.js';
import { Data } from '../api.js';
import { fmtINR, fmtDate } from '../engines/utils.js';

/** Import a bank statement CSV: real data for people who cannot use an Account Aggregator. */
export default function Import() {
  const { state, actions, reload } = useStore();
  const { route, navigate } = useRouter();
  const toast = useToast();
  const existing = route.params.append ? state.connections.find((c) => c.id === route.params.append) : null;
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [form, setForm] = useState({ institution: '', accountName: '', type: 'savings', mask: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onFile = async (f) => {
    if (!f) return; setErr(''); setFileName(f.name);
    if (f.size > 5_000_000) { setErr('File is larger than 5 MB. Export a shorter date range.'); return; }
    const text = await f.text();
    const p = parseStatement(text);
    if (p.error) { setErr(p.error); setParsed(null); return; }
    setParsed(p);
    if (!form.accountName) setForm((s) => ({ ...s, accountName: f.name.replace(/\.[^.]+$/, '').slice(0, 40) }));
  };
  const submit = async () => {
    setErr('');
    if (!parsed?.rows.length) { setErr('Choose a statement file first.'); return; }
    if (!existing && !form.institution.trim()) { setErr('Which bank is this statement from?'); return; }
    if (!agree) { setErr('Tick the box to confirm this is your own statement.'); return; }
    setBusy(true);
    try {
      if (existing) { const r = await Data.append(existing.id, { rows: parsed.rows }); await reload(); toast(`${r.added} new transactions added (duplicates skipped).`, 'green'); }
      else { const r = await actions.connect('statement_import', { rows: parsed.rows, institution: form.institution.trim(), accountName: form.accountName.trim() || `${form.institution.trim()} statement`, type: form.type, mask: form.mask.trim() }); toast(`Imported ${r.synced.transactionsAdded} transactions.`, 'green'); }
      navigate('/accounts');
    } catch (e) { setErr(e.body?.message || e.message); } finally { setBusy(false); }
  };
  const ins = parsed ? parsed.rows.filter((r) => r.direction === 'in').length : 0;
  const first = parsed?.rows.length ? parsed.rows.reduce((m, r) => (r.date < m ? r.date : m), parsed.rows[0].date) : null;
  const last = parsed?.rows.length ? parsed.rows.reduce((m, r) => (r.date > m ? r.date : m), parsed.rows[0].date) : null;

  return (
    <Page title={existing ? `Add to ${existing.label}` : 'Import a bank statement'} lead="Export a CSV statement from your bank's net-banking (Accounts → Statement → Download as CSV/Excel-CSV). MILO reads only the rows in that file and never contacts the bank." back="/accounts">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Section>
          <div className="card stack-sm">
            <Field label="Statement file (.csv)" hint="HDFC, SBI, ICICI, Axis, Kotak and most other exports are recognised automatically. PDF statements are not supported; choose CSV in net-banking.">
              <input type="file" accept=".csv,text/csv,.txt" className="input" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Statement file" />
            </Field>
            {!existing && (
              <>
                <div className="grid-2">
                  <Field label="Bank"><input className="input" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="e.g. HDFC Bank" /></Field>
                  <Field label="Account type"><select className="select input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="savings">Savings</option><option value="current">Current</option><option value="credit_card">Credit card</option></select></Field>
                </div>
                <div className="grid-2">
                  <Field label="Name in MILO"><input className="input" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="e.g. HDFC Savings" /></Field>
                  <Field label="Last 4 digits (optional)"><input className="input" inputMode="numeric" maxLength={4} value={form.mask} onChange={(e) => setForm({ ...form, mask: e.target.value.replace(/\D/g, '') })} placeholder="4821" /></Field>
                </div>
              </>
            )}
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> This is my own account statement and I want MILO to store its transactions.</label>
            {err && <span className="small" style={{ color: 'var(--rose)' }} role="alert">{err}</span>}
            <div className="row"><button className="btn" onClick={submit} disabled={busy || !parsed}>{I.check} {busy ? 'Importing…' : existing ? 'Add transactions' : 'Import'}</button><a className="btn ghost" href="#/accounts">Cancel</a></div>
          </div>
        </Section>
        <Section>
          <div className="card">
            <div className="section-head"><h2>Preview</h2>{fileName && <span className="tiny muted ellipsis">{fileName}</span>}</div>
            {!parsed ? <Empty title="No file yet">Pick a CSV and MILO shows what it understood before anything is saved.</Empty> : (
              <>
                <div className="kv small" style={{ marginTop: 8 }}>
                  <span className="k">Transactions found</span><span className="v">{parsed.rows.length}</span>
                  <span className="k">Money in / out</span><span className="v">{ins} / {parsed.rows.length - ins}</span>
                  <span className="k">Date range</span><span className="v">{fmtDate(first)} – {fmtDate(last)}</span>
                  <span className="k">Rows skipped</span><span className="v">{parsed.skipped}</span>
                  <span className="k">Columns used</span><span className="v tiny">{Object.entries(parsed.columns).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>
                </div>
                <div className="divider" />
                <div className="stack-sm small">{parsed.rows.slice(0, 8).map((r, i) => <div key={i} className="row between"><span className="ellipsis" style={{ flex: 1 }}>{fmtDate(r.date)} · {r.narration.slice(0, 40)}</span><span className={`num ${r.direction === 'in' ? 'pos' : ''}`}>{r.direction === 'in' ? '+' : '−'}{fmtINR(r.amount)}</span></div>)}{parsed.rows.length > 8 && <div className="tiny muted">…and {parsed.rows.length - 8} more</div>}</div>
              </>
            )}
          </div>
        </Section>
      </div>
    </Page>
  );
}
