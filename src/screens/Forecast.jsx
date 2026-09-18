import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Money, Modal, Field, MoneyInput, useToast, I } from '../components/ui.jsx';
import { fmtINR, fmtDate, isoDay } from '../engines/utils.js';

const TYPES = ['rent', 'hostel', 'tuition', 'emi', 'insurance', 'subscription', 'sip', 'credit_card_bill', 'income', 'other'];

export default function Forecast() {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const { cvf, income, calendar } = d;
  const [edit, setEdit] = useState(null); // commitment object or {} for new
  const [form, setForm] = useState({});
  const [errs, setErrs] = useState({});
  const open = (c) => { setEdit(c || {}); setForm(c ? { ...c } : { title: '', type: 'rent', amount: '', direction: 'out', date: isoDay(new Date()), recurrence: 'monthly' }); setErrs({}); };
  const save = () => {
    const e = {};
    if (!form.title?.trim()) e.title = 'Give it a name.';
    if (!(Number(form.amount) > 0)) e.amount = 'Amount must be above zero.';
    if (!form.date) e.date = 'Pick a date.';
    setErrs(e); if (Object.keys(e).length) return;
    const payload = { title: form.title.trim(), type: form.type, amount: Number(form.amount), direction: form.type === 'income' ? 'in' : form.direction, date: form.date, recurrence: form.recurrence };
    if (edit.id) dispatch({ type: 'updateCommitment', payload: { id: edit.id, patch: payload } }); else dispatch({ type: 'addCommitment', payload });
    toast('Forecast updated.', 'green'); setEdit(null);
  };
  const bal = d.bankBalance || 1;
  const pct = (v) => Math.max(0, Math.min(100, (v / bal) * 100));

  return (
    <Page title="Forecast" lead="What is committed, what is actually flexible, and what your income really looks like." actions={<button className="btn sm" onClick={() => open(null)}>{I.plus} Add commitment</button>}>
      <div className="stack">
        <Section>
          <div className="hero">
            <div className="grid-3">
              <div className="stat"><span className="label">Bank balance</span><Money value={cvf.bankBalance} className="mid" /></div>
              <div className="stat"><span className="label">Committed until {fmtDate(cvf.horizonEnd)}</span><Money value={cvf.committed} className="mid" /><span className="tiny muted">+ {fmtINR(cvf.reserved)} reserved for purposes</span></div>
              <div className="stat"><span className="label">Actually flexible</span><Money value={cvf.flexible} className={`big ${cvf.flexible < 0 ? 'neg' : 'pos'}`} /></div>
            </div>
            <div className="strip" aria-hidden="true" style={{ marginTop: 14 }}>
              <motion.span className="s-res" initial={{ width: 0 }} animate={{ width: `${pct(cvf.reserved)}%` }} transition={{ duration: 0.8 }} />
              <motion.span className="s-com" initial={{ width: 0 }} animate={{ width: `${pct(cvf.committed)}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
              <motion.span className="s-flex" initial={{ width: 0 }} animate={{ width: `${pct(Math.max(0, cvf.flexible))}%` }} transition={{ duration: 0.8, delay: 0.4 }} />
            </div>
            <div className="kv small" style={{ marginTop: 14 }}>
              <span className="k">Balance</span><span className="v num">{fmtINR(cvf.bankBalance)}</span>
              {cvf.items.map((e) => <React.Fragment key={e.id}><span className="k">− {e.title} <span className="tiny muted">{fmtDate(e.date)}</span></span><span className="v num">{fmtINR(e.amount)}</span></React.Fragment>)}
              {cvf.reserved > 0 && <><span className="k">− Reserved for purposes</span><span className="v num">{fmtINR(cvf.reserved)}</span></>}
              <span className="k total">Flexible</span><span className={`v total num ${cvf.flexible < 0 ? 'neg' : ''}`}>{fmtINR(cvf.flexible)}</span>
            </div>
            {cvf.flexible < 0 && <div className="notice rose" style={{ marginTop: 12 }}>Your commitments exceed what is in the bank before month end. Expected income of {fmtINR(calendar.upcomingIn)} is not counted until it actually arrives.</div>}
          </div>
        </Section>

        <Section>
          <div className="grid-2">
            <div className="card">
              <div className="section-head"><h2>Irregular income model</h2></div>
              <p className="small sub">Allowance, internship and scholarship money do not arrive on a fixed date, so the forecast never assumes a fixed monthly income.</p>
              <div className="kv" style={{ marginTop: 10 }}>
                <span className="k">Minimum expected (worst month)</span><span className="v num">{fmtINR(income.minExpected)}</span>
                <span className="k">Typical (median)</span><span className="v num">{fmtINR(income.typical)}</span>
                <span className="k">Volatility</span><span className="v">{income.volatilityLabel} ({Math.round(income.volatility * 100)}%)</span>
                <span className="k">Typical monthly outflow</span><span className="v num">{fmtINR(income.monthlyBurn)}</span>
                <span className="k total">Runway on current balance</span><span className="v total">{income.runwayMonths === Infinity ? '∞' : `${income.runwayMonths} months`}</span>
              </div>
              <div className="bars" style={{ marginTop: 12 }}>
                {income.months.map((m, i) => <div className="bar" key={m.month}><span>{m.month}</span><div className="track"><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: m.total / Math.max(...income.months.map((x) => x.total), 1) }} transition={{ delay: i * 0.06 }} /></div><span className="v">{fmtINR(m.total)}</span></div>)}
              </div>
            </div>
            <div className="card">
              <div className="section-head"><h2>Variable spending</h2><a href="#/spending">Analysis</a></div>
              <div className="stat" style={{ marginTop: 6 }}><span className="label">Average per day (last 60 days)</span><Money value={Math.round(d.dailyBurn)} className="mid" /><span className="small sub">Food, transport, entertainment, shopping, college. Used for the Money Calendar projection.</span></div>
              <div className="divider" />
              <div className="kv small"><span className="k">Next 45 days: outflows</span><span className="v num">{fmtINR(calendar.upcomingOut)}</span><span className="k">Next 45 days: inflows</span><span className="v num pos">{fmtINR(calendar.upcomingIn)}</span><span className="k">Lowest projected balance</span><span className={`v num ${calendar.lowest.balance < 0 ? 'neg' : ''}`}>{fmtINR(calendar.lowest.balance)} on {fmtDate(calendar.lowest.date)}</span></div>
              <a className="btn secondary sm" href="#/calendar" style={{ marginTop: 10 }}>Open Money Calendar</a>
            </div>
          </div>
        </Section>

        <Section>
          <div className="section-head"><h2>Commitments</h2></div>
          <div className="card list" style={{ padding: '4px 12px' }}>
            {state.commitments.map((c) => (
              <div key={c.id} className="list-row">
                <div className={`avatar ${c.direction === 'in' ? 'in' : 'out'}`}>{c.title.charAt(0)}</div>
                <div className="body"><div className="title">{c.title}</div><div className="meta"><span>{c.type.replace(/_/g, ' ')}</span><span>{c.recurrence === 'none' ? 'One time' : c.recurrence} · from {fmtDate(c.date)}</span>{c.source === 'commitment' && c.note && <span>{c.note}</span>}</div></div>
                <div className={`amt ${c.direction === 'in' ? 'pos' : ''}`}>{c.direction === 'in' ? '+' : '−'}{fmtINR(c.amount)}<span className="sub row" style={{ gap: 4, justifyContent: 'flex-end' }}><button className="btn ghost sm" onClick={() => open(c)}>Edit</button><button className="btn ghost sm" onClick={() => { dispatch({ type: 'removeCommitment', payload: { id: c.id } }); toast('Removed.'); }} aria-label={`Remove ${c.title}`}>{I.x}</button></span></div>
              </div>))}
          </div>
        </Section>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit commitment' : 'New commitment'} lead="Commitments drive the committed-vs-flexible split and the Money Calendar.">
        {edit && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <Field label="Name" error={errs.title}><input className={`input ${errs.title ? 'invalid' : ''}`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Type"><select className="select input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></Field>
              <Field label="Amount" error={errs.amount}><MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} invalid={!!errs.amount} /></Field>
            </div>
            <div className="grid-2">
              <Field label="Date" error={errs.date}><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Repeats"><select className="select input" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}><option value="none">One time</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></Field>
            </div>
            {form.type !== 'income' && <Field label="Direction"><select className="select input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option value="out">Money going out</option><option value="in">Money coming in</option></select></Field>}
            <div className="row"><button className="btn" onClick={save}>{I.check} Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
