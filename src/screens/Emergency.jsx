import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Modal, Field, MoneyInput, useToast, Progress, I, Empty } from '../components/ui.jsx';
import { fmtINR, fmtDate, isoDay, addDays, daysBetween } from '../engines/utils.js';

export default function Emergency() {
  const { state, d, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ amount: '', reason: '', requiredBy: isoDay(addDays(new Date(), 2)), repaymentDate: isoDay(addDays(new Date(), 30)), visibility: 'friends' });
  const [errs, setErrs] = useState({});
  const [lend, setLend] = useState(null); const [lendAmt, setLendAmt] = useState(''); const [lendErr, setLendErr] = useState('');

  const mine = state.emergencyRequests.filter((r) => r.requesterId === 'self');
  const peers = state.emergencyRequests.filter((r) => r.requesterId !== 'self' && !r.ignored && r.status === 'open');
  const ignored = state.emergencyRequests.filter((r) => r.requesterId !== 'self' && r.ignored);
  const funded = (r) => r.contributions.reduce((a, c) => a + c.amount, 0);

  const submit = async () => {
    const e = {}; const amt = Number(form.amount);
    if (!(amt > 0)) e.amount = 'Enter the amount you need.';
    if (amt > 50000) e.amount = 'Peer liquidity is for small emergencies. Keep it under ₹50,000.';
    if (!form.reason.trim()) e.reason = 'Say what it is for. People lend to reasons, not numbers.';
    if (form.requiredBy < isoDay(new Date())) e.requiredBy = 'Required-by date cannot be in the past.';
    if (form.repaymentDate <= form.requiredBy) e.repaymentDate = 'Repayment must come after the required-by date.';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { await actions.createRequest({ amount: amt, reason: form.reason.trim(), requiredBy: form.requiredBy, repaymentDate: form.repaymentDate, visibility: form.visibility }); toast(`Request posted to ${form.visibility === 'friends' ? 'people you have split with' : 'your verified college network'}. No interest, ever.`, 'green'); setCreate(false); }
    catch (e2) { toast(e2.body?.message || e2.message, 'rose'); } finally { setBusy(false); } setForm({ amount: '', reason: '', requiredBy: isoDay(addDays(new Date(), 2)), repaymentDate: isoDay(addDays(new Date(), 30)), visibility: 'friends' });
  };
  const openLend = (r, full) => { setLend(r); setLendAmt(full ? String(r.amount - funded(r)) : ''); setLendErr(''); };
  const confirmLend = async () => {
    const a = Number(lendAmt); const left = lend.amount - funded(lend);
    if (!(a > 0)) { setLendErr('Enter an amount above zero.'); return; }
    if (a > left) { setLendErr(`Only ${fmtINR(left)} is still needed.`); return; }
    if (a > d.cvf.flexible) { setLendErr(`That is more than your flexible money (${fmtINR(d.cvf.flexible)}). Lending it would eat into committed or reserved money.`); return; }
    setBusy(true);
    try { await actions.contribute(lend.id, a); toast(`You lent ${fmtINR(a)} to ${lend.requesterName}. It is tracked under "Others owe you" with the agreed repayment date.`, 'green'); setLend(null); }
    catch (e) { setLendErr(e.body?.message || e.message); } finally { setBusy(false); }
  };

  const RequestCard = ({ r, own }) => {
    const f = funded(r); const left = Math.max(0, r.amount - f);
    return (
      <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
          <div className="row"><div className="avatar peer">{r.requesterName.charAt(0)}</div><div><b>{own ? 'Your request' : r.requesterName}</b><div className="small">{r.reason}</div><div className="tiny muted">Needed by {fmtDate(r.requiredBy)} · repay by {fmtDate(r.repaymentDate)} · visible to {r.visibility === 'friends' ? 'friends' : 'verified college network'}</div></div></div>
          <div style={{ textAlign: 'right' }}><div className="mid num">{fmtINR(r.amount)}</div><span className={`badge ${r.status === 'funded' ? 'green' : r.status === 'closed' ? '' : 'blue'}`}>{r.status}</span></div>
        </div>
        <Progress value={f} max={r.amount} tone="green" />
        <div className="row between tiny muted" style={{ marginTop: 4 }}><span>{fmtINR(f)} funded by {r.contributions.length} {r.contributions.length === 1 ? 'person' : 'people'}{r.contributions.length ? `: ${r.contributions.map((c) => `${c.name} ${fmtINR(c.amount)}`).join(', ')}` : ''}</span><span>{left > 0 ? `${fmtINR(left)} still needed` : 'Fully funded'}</span></div>
        {!own && r.status === 'open' && left > 0 && (
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn sm" onClick={() => openLend(r, true)}>Lend {fmtINR(left)}</button>
            <button className="btn secondary sm" onClick={() => openLend(r, false)}>Lend part</button>
            <button className="btn ghost sm" onClick={async () => { await actions.ignoreRequest(r.id); toast('Ignored. Nobody is told.'); }}>Ignore</button>
          </div>
        )}
        {own && r.status !== 'closed' && <div className="row" style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={async () => { await actions.closeRequest(r.id); toast('Request closed.'); }}>Close request</button></div>}
      </motion.div>
    );
  };

  return (
    <Page title="Emergency liquidity" lead="Short-term help from people who know you. No interest, no profit, no lender in the middle. Just students helping students, with everything recorded so nothing is forgotten." actions={<button className="btn sm" onClick={() => setCreate(true)}>{I.plus} Request help</button>}>
      <div className="stack">
        <Section>
          <label className="card row between" style={{ cursor: 'pointer' }}><span><b>I am open to helping</b><div className="small sub">Friends and verified classmates can see your name as a possible helper. You always choose how much.</div></span><input type="checkbox" checked={!!state.user.helperOptIn} onChange={(e) => actions.setHelper(e.target.checked)} aria-label="Helper opt-in" /></label>
        </Section>
        <Section>
          <div className="section-head"><h2>Requests from your network</h2><span className="tiny muted">You can lend up to {fmtINR(Math.max(0, d.cvf.flexible))} without touching committed money</span></div>
          {state.user.helperOptIn ? (peers.length ? <div className="stack-sm">{peers.map((r) => <RequestCard key={r.id} r={r} />)}</div> : <Empty title="No open requests">Nobody in your network needs help right now.</Empty>) : <Empty title="Helper mode is off">Turn it on above to see requests from friends.</Empty>}
        </Section>
        <Section>
          <div className="section-head"><h2>Your requests</h2></div>
          {mine.length ? <div className="stack-sm">{mine.map((r) => <RequestCard key={r.id} r={r} own />)}</div> : <Empty title="No requests yet">If something urgent comes up, post a request with the amount, the reason and when you can repay.</Empty>}
        </Section>
        {ignored.length > 0 && <Section><p className="tiny muted">{ignored.length} request{ignored.length > 1 ? 's' : ''} ignored.</p></Section>}
      </div>

      <Modal open={create} onClose={() => setCreate(false)} title="Request emergency help" lead="Be specific. Requests with a clear reason and a repayment date get funded faster.">
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Field label="Amount needed" error={errs.amount}><MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} invalid={!!errs.amount} autoFocus /></Field>
          <Field label="Reason" error={errs.reason}><input className={`input ${errs.reason ? 'invalid' : ''}`} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Exam fee due, medicines" /></Field>
          <div className="grid-2">
            <Field label="Required by" error={errs.requiredBy}><input type="date" className="input" value={form.requiredBy} min={isoDay(new Date())} onChange={(e) => setForm({ ...form, requiredBy: e.target.value })} /></Field>
            <Field label="Repayment date" error={errs.repaymentDate}><input type="date" className="input" value={form.repaymentDate} min={form.requiredBy} onChange={(e) => setForm({ ...form, repaymentDate: e.target.value })} /></Field>
          </div>
          <Field label="Who can see it"><select className="select input" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}><option value="friends">People you have split with ({state.emergencyMeta.networkSize})</option><option value="college" disabled={!state.emergencyMeta.collegeDomain}>Verified college network (@{state.emergencyMeta.collegeDomain || 'no college email'})</option></select></Field>
          <div className="notice green small">No interest. No profit. Repayment is tracked in Split-Bill Memory with the date you set, and reminders go out automatically.</div>
          <div className="row"><button className="btn" onClick={submit} disabled={busy}>{I.check} {busy ? 'Posting…' : 'Post request'}</button><button className="btn ghost" onClick={() => setCreate(false)}>Cancel</button></div>
        </div>
      </Modal>
      <Modal open={!!lend} onClose={() => setLend(null)} title={lend ? `Lend to ${lend.requesterName}` : ''} lead={lend ? `${lend.reason} · repay by ${fmtDate(lend.repaymentDate)} (${daysBetween(new Date(), lend.repaymentDate)} days)` : ''}>
        {lend && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <Field label="Amount" error={lendErr} hint={`${fmtINR(Math.max(0, lend.amount - funded(lend)))} still needed · your flexible money is ${fmtINR(d.cvf.flexible)}`}><MoneyInput value={lendAmt} onChange={setLendAmt} invalid={!!lendErr} autoFocus /></Field>
            <div className="row"><button className="btn" onClick={confirmLend} disabled={busy}>{I.check} {busy ? 'Lending…' : 'Lend'}</button><button className="btn ghost" onClick={() => setLend(null)}>Cancel</button></div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
