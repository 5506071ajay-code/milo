import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Modal, Field, MoneyInput, useToast, Progress, Money, I } from '../components/ui.jsx';
import { fmtINR, fmtDate } from '../engines/utils.js';

const PRESETS = [{ name: 'New headphones', target: 8000, months: 3 }, { name: 'Goa trip', target: 12000, months: 6 }, { name: 'Laptop', target: 60000, months: 12 }, { name: 'Phone', target: 25000, months: 8 }, { name: 'Certification', target: 15000, months: 4 }];

export default function Goals() {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({ name: '', target: '', months: '6' });
  const [errs, setErrs] = useState({});
  const [money, setMoney] = useState(null); // { goal, dir }
  const [amt, setAmt] = useState(''); const [mErr, setMErr] = useState('');
  const hdfc = state.accounts.find((a) => a.id === 'acc_hdfc');

  const create = () => {
    const e = {}; const t = Number(form.target); const m = Number(form.months);
    if (!form.name.trim()) e.name = 'Name the goal.';
    if (!(t > 0)) e.target = 'Target must be above zero.';
    if (!(m > 0 && m <= 60)) e.months = 'Between 1 and 60 months.';
    if (state.goals.some((g) => g.name.toLowerCase() === form.name.trim().toLowerCase())) e.name = 'You already have a goal with this name.';
    setErrs(e); if (Object.keys(e).length) return;
    dispatch({ type: 'addGoal', payload: { name: form.name.trim(), target: t, horizonMonths: m, selected: state.goals.length === 0 } });
    toast(`Goal added. That is about ${fmtINR(Math.ceil(t / (m * 30)))} a day.`, 'green'); setAdd(false); setForm({ name: '', target: '', months: '6' });
  };
  const moveMoney = () => {
    const a = Number(amt); setMErr('');
    if (!(a > 0)) { setMErr('Enter an amount above zero.'); return; }
    if (money.dir > 0 && a > d.cvf.flexible) { setMErr(`Only ${fmtINR(Math.max(0, d.cvf.flexible))} is flexible right now. Saving more would eat into committed money.`); return; }
    if (money.dir < 0 && a > money.goal.saved) { setMErr(`Only ${fmtINR(money.goal.saved)} is in this goal.`); return; }
    dispatch({ type: 'goalMoney', payload: { id: money.goal.id, amount: money.dir * a } });
    toast(money.dir > 0 ? `${fmtINR(a)} moved into ${money.goal.name}.` : `${fmtINR(a)} moved back to ${hdfc?.name}.`, 'green'); setMoney(null);
  };

  return (
    <Page title="Goals" lead="A goal is a target, a date and a daily number. Money you move into a goal is yours, held aside, and comes back whenever you decide." actions={<button className="btn sm" onClick={() => setAdd(true)}>{I.plus} New goal</button>}>
      <div className="stack">
        <Section>
          <div className="grid-2">
            {d.goalsMath.map((g, i) => (
              <motion.div key={g.id} className="card" style={{ borderColor: g.selected ? 'var(--green)' : undefined }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div><b>{g.name}</b>{g.selected && <span className="badge green" style={{ marginLeft: 6 }}>Focus</span>}<div className="tiny muted">Target {fmtINR(g.target)} by {fmtDate(g.math.targetDate)} · {g.math.daysLeft} days left</div></div>
                  <span className="num mid">{g.math.progressPct}%</span>
                </div>
                <Progress value={g.saved} max={g.target} tone={g.math.done ? 'green' : ''} />
                <div className="row between small" style={{ marginTop: 6 }}><span><b className="num">{fmtINR(g.saved)}</b> <span className="muted">of {fmtINR(g.target)}</span></span><span className="muted">{g.math.done ? 'Reached' : `${fmtINR(g.math.remaining)} to go`}</span></div>
                <div className="kv small" style={{ marginTop: 10 }}>
                  <span className="k">Plan: save per day</span><span className="v num">{fmtINR(g.math.planDaily)}</span>
                  <span className="k">Needed now to stay on track</span><span className={`v num ${g.math.requiredDaily > g.math.planDaily * 1.25 ? 'neg' : ''}`}>{g.math.done ? '—' : fmtINR(g.math.requiredDaily)}</span>
                </div>
                <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
                  <button className="btn sm" onClick={() => { setMoney({ goal: g, dir: 1 }); setAmt(''); setMErr(''); }} disabled={g.math.done}>Save money</button>
                  <button className="btn secondary sm" onClick={() => { setMoney({ goal: g, dir: -1 }); setAmt(''); setMErr(''); }} disabled={!g.saved}>Withdraw</button>
                  {!g.selected && <button className="btn ghost sm" onClick={() => { dispatch({ type: 'selectGoal', payload: { id: g.id } }); toast(`${g.name} is now your focus goal.`); }}>Make focus</button>}
                </div>
              </motion.div>))}
          </div>
        </Section>
        <Section>
          <div className="card"><div className="section-head"><h2>Totals</h2></div><div className="kv" style={{ marginTop: 6 }}><span className="k">In goals</span><span className="v num">{fmtINR(state.goals.reduce((a, g) => a + g.saved, 0))}</span><span className="k">Flexible money available to save</span><span className="v num">{fmtINR(Math.max(0, d.cvf.flexible))}</span></div><p className="tiny muted" style={{ marginTop: 8 }}>Goal money is moved from {hdfc?.name} and recorded as an internal transfer, so it never shows up as spending.</p></div>
        </Section>
      </div>

      <Modal open={add} onClose={() => setAdd(false)} title="New goal" lead="Pick a preset or write your own.">
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <div className="chips">{PRESETS.filter((p) => !state.goals.some((g) => g.name === p.name)).map((p) => <button key={p.name} className="chip" onClick={() => setForm({ name: p.name, target: String(p.target), months: String(p.months) })}>{p.name} · {fmtINR(p.target)}</button>)}</div>
          <Field label="Name" error={errs.name}><input className={`input ${errs.name ? 'invalid' : ''}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid-2">
            <Field label="Target" error={errs.target}><MoneyInput value={form.target} onChange={(v) => setForm({ ...form, target: v })} invalid={!!errs.target} /></Field>
            <Field label="Months to reach it" error={errs.months}><input type="number" min="1" max="60" className={`input ${errs.months ? 'invalid' : ''}`} value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} /></Field>
          </div>
          {Number(form.target) > 0 && Number(form.months) > 0 && <p className="small sub">That works out to about <b>{fmtINR(Math.ceil(Number(form.target) / (Number(form.months) * 30)))} a day</b>.</p>}
          <div className="row"><button className="btn" onClick={create}>{I.check} Create goal</button><button className="btn ghost" onClick={() => setAdd(false)}>Cancel</button></div>
        </div>
      </Modal>
      <Modal open={!!money} onClose={() => setMoney(null)} title={money ? (money.dir > 0 ? `Save into ${money.goal.name}` : `Withdraw from ${money.goal.name}`) : ''} lead={money ? (money.dir > 0 ? `Flexible money: ${fmtINR(Math.max(0, d.cvf.flexible))}` : `In goal: ${fmtINR(money.goal.saved)}`) : ''}>
        {money && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <Field label="Amount" error={mErr}><MoneyInput value={amt} onChange={setAmt} invalid={!!mErr} autoFocus /></Field>
            {money.dir > 0 && <div className="chips">{[500, 1000, money.goal.math.remaining].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => <button key={v} className="chip" onClick={() => setAmt(String(v))}>{fmtINR(v)}</button>)}</div>}
            <div className="row"><button className="btn" onClick={moveMoney}>{I.check} Confirm</button><button className="btn ghost" onClick={() => setMoney(null)}>Cancel</button></div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
