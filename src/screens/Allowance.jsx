import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Money, MoneyInput, Field, useToast, Progress, I } from '../components/ui.jsx';
import { defaultAllocation, DAILY_BUCKETS, AVG_MONTH_DAYS } from '../engines/allowance.js';
import { fmtINR, fmtDate, addDays } from '../engines/utils.js';

export default function Allowance() {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const a = d.allowanceState;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(state.allowance.amount));
  const [buckets, setBuckets] = useState(state.allowance.buckets.map((b) => ({ ...b, amount: String(b.amount) })));
  const total = useMemo(() => buckets.reduce((s, b) => s + (Number(b.amount) || 0), 0), [buckets]);
  const diff = (Number(amount) || 0) - total;
  const previewDaily = Math.round(buckets.filter((b) => DAILY_BUCKETS.includes(b.name)).reduce((s, b) => s + (Number(b.amount) || 0), 0) / AVG_MONTH_DAYS);

  const save = () => {
    if (!(Number(amount) > 0)) { toast('Allowance must be above zero.', 'rose'); return; }
    if (Math.abs(diff) > 0.5) { toast(diff > 0 ? `${fmtINR(diff)} is not in any bucket yet.` : `Buckets exceed the allowance by ${fmtINR(-diff)}.`, 'rose'); return; }
    dispatch({ type: 'setAllowance', payload: { amount: Number(amount), buckets: buckets.map((b) => ({ name: b.name, amount: Number(b.amount) || 0 })) } });
    toast('Survival plan updated.', 'green'); setEditing(false);
  };
  const auto = () => { const alloc = defaultAllocation(Number(amount) || 0); setBuckets(alloc.map((x) => ({ ...x, amount: String(x.amount) }))); };

  return (
    <Page title="Allowance Survival Mode" lead="For the month between one allowance and the next. The app turns the month into a daily number you can actually live by." actions={<button className="btn secondary sm" onClick={() => setEditing((e) => !e)}>{editing ? 'Close' : 'Edit plan'}</button>}>
      <div className="stack">
        <Section>
          <div className="hero">
            <div className="grid-3">
              <div className="stat"><span className="label">Safe to spend per day</span><Money value={a.dailySafe} className="big" /><span className="tiny muted">({fmtINR(a.dailyPool)} daily pool ÷ {AVG_MONTH_DAYS} days)</span></div>
              <div className="stat"><span className="label">Spent today</span><Money value={a.spentToday} className={`mid ${a.overspend > 0 ? 'neg' : ''}`} /><span className="small sub">{a.overspend > 0 ? `${fmtINR(a.overspend)} over today's limit` : a.spentToday ? `${fmtINR(a.underspend)} under` : 'Nothing yet'}</span></div>
              <div className="stat"><span className="label">Tomorrow's safe amount</span><Money value={a.tomorrowSafe} className="mid" /><span className="small sub">{fmtINR(a.remainingPool)} left ÷ {a.daysLeft} days</span></div>
            </div>
            {a.overspend > 0 && <motion.div className="notice" style={{ marginTop: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>You spent {fmtINR(a.spentToday)} today against {fmtINR(a.dailySafe)}. Tomorrow's safe amount has been recalculated to {fmtINR(a.tomorrowSafe)} so the month still works. No guilt, just arithmetic.</motion.div>}
            {a.tomorrowSafe === 0 && a.remainingPool <= 0 && <div className="notice rose" style={{ marginTop: 14 }}>The daily pool for this month is used up. Anything more comes out of emergency or savings buckets.</div>}
          </div>
        </Section>
        <Section>
          <div className="section-head"><h2>Buckets this month</h2><span className="tiny muted">{fmtDate(new Date())} · {a.daysLeft} days to go</span></div>
          <div className="grid-2">
            {a.buckets.map((b, i) => (
              <motion.div key={b.name} className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <div className="row between"><b>{b.name}</b><span className="num"><b>{fmtINR(b.left)}</b> <span className="tiny muted">left of {fmtINR(b.amount)}</span></span></div>
                <Progress value={b.spent} max={b.amount} tone={b.spent > b.amount ? 'rose' : DAILY_BUCKETS.includes(b.name) ? '' : 'green'} />
                <div className="tiny muted" style={{ marginTop: 6 }}>{DAILY_BUCKETS.includes(b.name) ? 'Part of the daily pool' : b.name === 'Savings' ? 'Held back for goals' : b.name === 'Emergency' ? 'Untouched unless something goes wrong' : 'Tracked separately'}{b.spent ? ` · ${fmtINR(b.spent)} spent` : ''}</div>
              </motion.div>))}
          </div>
        </Section>
        {editing && (
          <Section>
            <div className="card stack-sm">
              <div className="section-head"><h2>Edit the plan</h2><button className="btn ghost sm" onClick={auto}>Auto-allocate</button></div>
              <Field label="Monthly allowance"><MoneyInput value={amount} onChange={setAmount} /></Field>
              {buckets.map((b, i) => <div key={b.name} className="row"><span className="small" style={{ width: 110 }}>{b.name}</span><MoneyInput value={b.amount} onChange={(v) => setBuckets((s) => s.map((x, j) => (j === i ? { ...x, amount: v } : x)))} aria-label={`${b.name} bucket`} /></div>)}
              <div className="row between small"><span>Allocated {fmtINR(total)} of {fmtINR(Number(amount) || 0)}</span><span className={Math.abs(diff) > 0.5 ? 'neg' : 'pos'}>{Math.abs(diff) > 0.5 ? (diff > 0 ? `${fmtINR(diff)} unallocated` : `${fmtINR(-diff)} over`) : 'Balanced'}</span></div>
              <p className="small sub">With this plan the daily safe amount would be <b>{fmtINR(previewDaily)}</b>.</p>
              <div className="row"><button className="btn" onClick={save} disabled={Math.abs(diff) > 0.5}>{I.check} Save plan</button><button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
            </div>
          </Section>
        )}
        <Section>
          <div className="card"><div className="section-head"><h2>How the daily number works</h2></div><p className="small sub">Food, transport and entertainment form the daily pool. College, emergency and savings are held back. The pool divided by {AVG_MONTH_DAYS} days gives today's limit; each evening the remaining pool is divided by the days left, so an expensive day lowers tomorrow slightly instead of breaking the month.</p></div>
        </Section>
      </div>
    </Page>
  );
}
