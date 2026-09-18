import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Modal, Field, MoneyInput, useToast, Empty, I, Money } from '../components/ui.jsx';
import { fmtINR, fmtDate, daysBetween } from '../engines/utils.js';
import { Avatar } from '../components/UserPicker.jsx';

export default function Owe() {
  const { state, d, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [pay, setPay] = useState(null); // { obligation, amount }
  const [amt, setAmt] = useState('');
  const [err, setErr] = useState('');

  const openPay = (o) => { setPay(o); setAmt(String(o.remaining)); setErr(''); };
  const confirmPay = async () => {
    const a = Number(amt);
    if (!a || a <= 0) { setErr('Enter an amount above zero.'); return; }
    if (a > pay.remaining + 0.005) { setErr(`Only ${fmtINR(pay.remaining)} is outstanding.`); return; }
    setBusy(true);
    try { await actions.pay(pay.id, a); toast(a >= pay.remaining ? 'Settled. The other person has been notified.' : `Partial payment recorded. ${fmtINR(pay.remaining - a)} still pending.`, 'green'); setPay(null); }
    catch (e) { setErr(e.body?.message || e.message); } finally { setBusy(false); }
  };
  const remind = async (o) => { try { await actions.remind(o.id, o.contactId); toast(`Reminder sent to ${o.contact?.name || 'them'} inside MILO.`); } catch (e) { toast(e.body?.message || e.message, 'rose'); } };

  const Person = ({ p, dir }) => (
    <motion.div className="card">
      <div className="row between"><div className="row"><Avatar u={state.contacts.find((c) => c.id === p.contactId) || { name: p.name }} size={36} /><div><b>{p.name}</b><div className="tiny muted">{state.contacts.find((c) => c.id === p.contactId)?.email}</div><div className="tiny muted">{p.items.filter((o) => (dir === 'they' ? o.direction === 'they_owe' : o.direction === 'i_owe')).length} open item{p.items.filter((o) => (dir === 'they' ? o.direction === 'they_owe' : o.direction === 'i_owe')).length > 1 ? 's' : ''}{p.iOwe > 0 && p.theyOwe > 0 ? ` · net ${p.net > 0 ? `${p.name} owes you` : 'you owe'} ${fmtINR(Math.abs(p.net))}` : ''}</div></div></div><span className={`mid num ${dir === 'they' ? 'pos' : ''}`}>{fmtINR(p.amount)}</span></div>
      <div className="stack-sm" style={{ marginTop: 10 }}>
        {p.items.filter((o) => (dir === 'they' ? o.direction === 'they_owe' : o.direction === 'i_owe')).map((o) => {
          const lastRem = state.reminders.filter((r) => r.obligationId === o.id).slice(-1)[0];
          return (
            <div key={o.id} className="row between small wrap" style={{ gap: 6 }}>
              <span style={{ flex: 1, minWidth: 140 }}>{o.title}<span className="tiny muted"> · {fmtDate(o.createdAt)}{o.remaining < o.amount ? ` · ${fmtINR(o.amount - o.remaining)} paid` : ''}{lastRem ? ` · reminded ${daysBetween(lastRem.at, new Date())}d ago${lastRem.auto ? ' (auto)' : ''}` : ''}</span></span>
              <span className="num"><b>{fmtINR(o.remaining)}</b></span>
              <span className="row" style={{ gap: 6 }}>
                {dir === 'they' && <button className="btn ghost sm" onClick={() => remind(o)}>Remind</button>}
                <button className="btn secondary sm" onClick={() => openPay(o)}>{dir === 'they' ? 'Record received' : 'Record paid'}</button>
              </span>
            </div>);
        })}
      </div>
    </motion.div>
  );

  return (
    <Page title="Split-Bill Memory" lead="Every shared bill and informal loan lives here until it is settled. Reminders go out automatically, so nobody has to feel awkward." actions={<><a className="btn secondary sm" href="#/split">New split</a><a className="btn secondary sm" href="#/settle">Settle a group</a></>}>
      <Section>
        <div className="grid-2">
          <div className="card flat"><div className="stat"><span className="label">You owe</span><Money value={d.totalYouOwe} className="mid" /><span className="small sub">{d.youOwe.length} people</span></div></div>
          <div className="card flat"><div className="stat"><span className="label">Others owe you</span><Money value={d.totalOthersOwe} className="mid pos" /><span className="small sub">{d.othersOwe.length} people · net {fmtINR(d.totalOthersOwe - d.totalYouOwe, { sign: true })}</span></div></div>
        </div>
      </Section>
      <Section>
        <div className="section-head" style={{ marginTop: 14 }}><h2>You owe</h2></div>
        {d.youOwe.length ? <div className="stack-sm">{d.youOwe.map((p) => <Person key={p.contactId} p={p} dir="me" />)}</div> : <Empty title="Nothing to pay">You do not owe anyone right now.</Empty>}
      </Section>
      <Section>
        <div className="section-head" style={{ marginTop: 14 }}><h2>Others owe you</h2></div>
        {d.othersOwe.length ? <div className="stack-sm">{d.othersOwe.map((p) => <Person key={p.contactId} p={p} dir="they" />)}</div> : <Empty title="Nothing to collect">Nobody owes you anything right now.</Empty>}
      </Section>
      <Section>
        <div className="section-head" style={{ marginTop: 14 }}><h2>Reminder log</h2></div>
        <div className="card list" style={{ padding: '4px 12px' }}>
          {state.reminders.length === 0 && <p className="small muted" style={{ padding: 10 }}>No reminders yet. Automatic reminders go out every {state.settings.reminderEveryDays} days for open balances.</p>}
          {[...state.reminders].reverse().slice(0, 8).map((r) => { const o = state.obligations.find((x) => x.id === r.obligationId); return <div key={r.id} className="list-row small"><div className="body"><div className="title">{state.contacts.find((c) => c.id === r.contactId)?.name || 'Contact'}: {o?.title}</div><div className="meta"><span>{fmtDate(r.at)} · {r.auto ? 'automatic' : 'sent by you'} · {r.channel}</span></div></div><div className="amt num">{o ? fmtINR(o.remaining) : ''}</div></div>; })}
        </div>
      </Section>
      <Modal open={!!pay} onClose={() => setPay(null)} title={pay ? `${pay.direction === 'they_owe' ? 'Record money received' : 'Record a payment'}` : ''} lead={pay ? `${pay.title} · ${fmtINR(pay.remaining)} outstanding` : ''}>
        {pay && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <Field label="Amount" error={err} hint="Partial payments are fine; the remainder stays open."><MoneyInput value={amt} onChange={setAmt} invalid={!!err} autoFocus /></Field>
            <div className="row"><button className="btn" onClick={confirmPay} disabled={busy}>{I.check} {busy ? 'Saving…' : 'Confirm'}</button><button className="btn ghost" onClick={() => setPay(null)}>Cancel</button></div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
