import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Sparkline, Money } from '../components/ui.jsx';
import { projectCalendar } from '../engines/forecast.js';
import { fmtINR, fmtDate, isoDay, addMonths, startOfMonth, endOfMonth, toDate } from '../engines/utils.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const { state, d } = useStore();
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState(null);
  const [includeVariable, setIncludeVariable] = useState(true);
  const today = d.today;
  const month = addMonths(startOfMonth(today), offset);
  const som = startOfMonth(month); const eom = endOfMonth(month);
  const horizon = Math.max(1, Math.round((eom - today) / 86400000));
  const proj = useMemo(() => projectCalendar({ bankBalance: d.bankBalance, commitments: state.commitments, today, horizonDays: Math.max(horizon, 45), dailyBurn: d.dailyBurn, includeVariable }), [d.bankBalance, state.commitments, today, horizon, d.dailyBurn, includeVariable]);
  const byDate = Object.fromEntries(proj.days.map((x) => [x.date, x]));
  const cells = [];
  const lead = (som.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let dd = 1; dd <= eom.getDate(); dd++) cells.push(new Date(som.getFullYear(), som.getMonth(), dd));
  const monthEvents = proj.events.filter((e) => toDate(e.date) >= som && toDate(e.date) <= eom);
  const selected = sel ? byDate[sel] : null;
  const monthName = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const lowInMonth = proj.days.filter((x) => toDate(x.date) >= som && toDate(x.date) <= eom).reduce((m, x) => (!m || x.balance < m.balance ? x : m), null);

  return (
    <Page title="Money Calendar" lead="Every dated inflow and outflow on one grid, with the balance projected forward so the lowest point is visible before it happens.">
      <div className="stack">
        <Section>
          <div className="grid-3">
            <div className="card flat"><div className="stat"><span className="label">Lowest projected balance</span><Money value={proj.lowest.balance} className={`mid ${proj.lowest.balance < 0 ? 'neg' : ''}`} /><span className="small sub">on {fmtDate(proj.lowest.date)}</span></div></div>
            <div className="card flat"><div className="stat"><span className="label">Projected at month end</span><Money value={proj.monthEndBalance} className={`mid ${proj.monthEndBalance < 0 ? 'neg' : ''}`} /><span className="small sub">{fmtDate(endOfMonth(today))}</span></div></div>
            <div className={`card flat`} style={{ borderColor: proj.enoughAtMonthEnd ? 'var(--green)' : 'var(--rose)' }}><div className="stat"><span className="label">Enough money at month end?</span><span className={`mid ${proj.enoughAtMonthEnd ? 'pos' : 'neg'}`}>{proj.enoughAtMonthEnd ? 'Yes' : 'No'}</span><span className="small sub">{proj.enoughAtMonthEnd ? (proj.laterDip ? `Fine through ${fmtDate(endOfMonth(today))}, but the balance dips to ${fmtINR(proj.laterDip.balance)} on ${fmtDate(proj.laterDip.date)}.` : 'Balance stays above zero through every commitment.') : `Balance dips below zero on ${fmtDate(proj.lowestThisMonth.date)}.`}</span></div></div>
          </div>
        </Section>
        <Section>
          <div className="card">
            <div className="row between wrap"><b>Projected balance, next {proj.days.length - 1} days</b><label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={includeVariable} onChange={(e) => setIncludeVariable(e.target.checked)} /> include {fmtINR(Math.round(d.dailyBurn))}/day variable spending</label></div>
            <Sparkline points={proj.days} low={proj.lowest} />
            <div className="row between tiny muted"><span>{fmtDate(proj.days[0].date)}</span><span>{fmtDate(proj.days[proj.days.length - 1].date)}</span></div>
          </div>
        </Section>
        <Section>
          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <button className="btn ghost sm" onClick={() => { setOffset((o) => o - 1); setSel(null); }} aria-label="Previous month" disabled={offset <= 0}>‹</button>
              <b>{monthName}</b>
              <button className="btn ghost sm" onClick={() => { setOffset((o) => o + 1); setSel(null); }} aria-label="Next month" disabled={offset >= 1}>›</button>
            </div>
            <div className="cal">
              {DOW.map((x) => <div key={x} className="dow">{x}</div>)}
              {cells.map((c, i) => {
                if (!c) return <div key={`e${i}`} className="day empty" />;
                const key = isoDay(c); const day = byDate[key]; const isToday = key === isoDay(today);
                const isLow = lowInMonth && key === lowInMonth.date && day;
                return (
                  <motion.button key={key} type="button" className={`day ${isToday ? 'today' : ''} ${isLow ? 'low' : ''}`} onClick={() => setSel(key)} aria-pressed={sel === key} aria-label={`${fmtDate(c)}${day ? `, projected balance ${fmtINR(day.balance)}` : ''}`} whileTap={{ scale: 0.97 }} style={{ textAlign: 'left', border: sel === key ? '1px solid var(--ink)' : undefined }}>
                    <span className="n">{c.getDate()}</span>
                    {day?.events.slice(0, 2).map((e) => <span key={e.id} className={`ev ${e.direction}`}>{e.direction === 'in' ? '+' : '−'}{fmtINR(e.amount)}</span>)}
                    {day?.events.length > 2 && <span className="ev out">+{day.events.length - 2} more</span>}
                    {day && <span className={`bal ${day.balance < 0 ? 'neg' : ''}`}>{fmtINR(day.balance)}</span>}
                  </motion.button>);
              })}
            </div>
            <AnimatePresence>
              {selected && (
                <motion.div className="card flat" style={{ marginTop: 12 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="row between"><b>{fmtDate(selected.date)}</b><span className={`num ${selected.balance < 0 ? 'neg' : ''}`}>Projected {fmtINR(selected.balance)}</span></div>
                  {selected.events.length ? <div className="stack-sm small" style={{ marginTop: 6 }}>{selected.events.map((e) => <div key={e.id} className="row between"><span>{e.title} <span className="tiny muted">· {e.type.replace(/_/g, ' ')}</span></span><span className={`num ${e.direction === 'in' ? 'pos' : ''}`}>{e.direction === 'in' ? '+' : '−'}{fmtINR(e.amount)}</span></div>)}</div> : <p className="small muted" style={{ marginTop: 4 }}>No dated commitments. {includeVariable ? `Only the ${fmtINR(Math.round(d.dailyBurn))}/day variable estimate applies.` : ''}</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>
        <Section>
          <div className="section-head"><h2>Events in {monthName}</h2><a href="#/forecast">Edit commitments</a></div>
          <div className="card list" style={{ padding: '4px 12px' }}>
            {monthEvents.length === 0 && <p className="small muted" style={{ padding: 10 }}>Nothing dated in this month yet.</p>}
            {monthEvents.map((e) => <div key={e.id} className="list-row"><div className={`avatar ${e.direction}`}>{e.title.charAt(0)}</div><div className="body"><div className="title">{e.title}</div><div className="meta"><span>{fmtDate(e.date)}</span><span>{e.type.replace(/_/g, ' ')}</span></div></div><div className={`amt ${e.direction === 'in' ? 'pos' : ''}`}>{e.direction === 'in' ? '+' : '−'}{fmtINR(e.amount)}<span className="sub">balance after {fmtINR(byDate[e.date]?.balance ?? 0)}</span></div></div>)}
          </div>
        </Section>
      </div>
    </Page>
  );
}
