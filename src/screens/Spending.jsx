import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Bars, Money, Segmented, Reveal } from '../components/ui.jsx';
import { TxRow } from '../components/tx.jsx';
import { monthTransactions, categoryTotals, expenseOf } from '../engines/spending.js';
import { fmtINR, addMonths } from '../engines/utils.js';

const COLORS = { food: 'var(--marigold)', transport: 'var(--blue)', entertainment: 'var(--rose)', shopping: '#8e5bd1', college: 'var(--green)', travel: '#2a9d8f', health: '#e76f51', cash: '#777', other: '#999', subscription: '#4a6fa5', rent: '#6c757d', hostel: '#6c757d', tuition: '#6c757d', emi: '#6c757d', insurance: '#6c757d', sip: '#6c757d' };

export default function Spending() {
  const { state, d } = useStore();
  const [monthOff, setMonthOff] = useState(0);
  const [cat, setCat] = useState(null);
  const month = addMonths(d.today, -monthOff);
  const active = state.transactions.filter((t) => !t.excluded);
  const txs = useMemo(() => monthTransactions(active, month), [active, month]);
  const rows = useMemo(() => categoryTotals(txs), [txs]);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const { why, summary } = d;
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const list = cat ? txs.filter((t) => expenseOf(t) > 0 && (t.category === cat || (t.category && ({ food_delivery: 'food', coffee: 'food', dining: 'food', groceries: 'food' })[t.category] === cat))).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

  return (
    <Page title="Bro, where did my money go?" lead="Not a chart to admire. A plain answer, with the comparison that explains it.">
      <div className="stack">
        <Section>
          <div className="row between wrap"><Segmented options={[{ value: 0, label: 'This month' }, { value: 1, label: 'Last month' }, { value: 2, label: '2 months ago' }]} value={monthOff} onChange={(v) => { setMonthOff(v); setCat(null); }} ariaLabel="Month" /><span className="small muted">{monthLabel}</span></div>
        </Section>
        <Section>
          <div className="hero">
            <div className="stat"><span className="label">Spent in {monthLabel}</span><Money value={total} className="big" /><span className="small sub">{txs.filter((t) => expenseOf(t) > 0).length} transactions · transfers, peer payments and duplicates excluded · split bills counted at your share only</span></div>
            <div style={{ marginTop: 14 }}>
              <Bars rows={rows.map((r) => ({ label: `${r.label} ${total ? Math.round((r.total / total) * 100) : 0}%`, value: r.total, color: COLORS[r.category] || 'var(--ink-3)' }))} />
            </div>
            <div className="chips" style={{ marginTop: 12 }}>{rows.map((r) => <button key={r.category} className={`chip ${cat === r.category ? 'active' : ''}`} onClick={() => setCat(cat === r.category ? null : r.category)} aria-pressed={cat === r.category}>{r.label}</button>)}</div>
          </div>
        </Section>
        {cat && (
          <Section>
            <div className="section-head"><h2>{rows.find((r) => r.category === cat)?.label} in {monthLabel}</h2><span className="tiny muted">{list.length} transactions</span></div>
            <div className="card list" style={{ padding: '4px 12px' }}>{list.slice(0, 30).map((t) => <TxRow key={t.id} tx={t} />)}</div>
          </Section>
        )}
        {monthOff === 0 && (
          <>
            <Section>
              <div className="card">
                <div className="section-head"><h2>Compared with last month</h2><span className="tiny muted">{fmtINR(summary.lastTotal)} by day {summary.comparedToDay} last month</span></div>
                <div className="stack-sm" style={{ marginTop: 8 }}>
                  {summary.rows.map((r) => <div key={r.category} className="row between small"><span>{r.label}</span><span className="num">{fmtINR(r.total)} <span className="tiny muted">vs {fmtINR(r.last)}</span> {r.change !== null && <span className={`badge ${r.change > 0 ? 'rose' : 'green'}`}>{r.change > 0 ? '+' : ''}{r.change}%</span>}</span></div>)}
                </div>
                {summary.insights.length > 0 && <><div className="divider" /><div className="stack-sm">{summary.insights.map((s, i) => <motion.p key={i} className="small" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }}>• {s}</motion.p>)}</div></>}
              </div>
            </Section>
            <Reveal>
              <div className="card" style={{ marginTop: 14 }}>
                <div className="section-head"><h2>Why did my spending {why.diff >= 0 ? 'increase' : 'drop'}?</h2><span className="tiny muted">vs 3-month average {fmtINR(why.prevAvgTotal)}</span></div>
                {why.partialMonth && <p className="tiny muted">{why.daysElapsed} days of this month have passed, so earlier months are compared over their first {why.daysElapsed} days too.</p>}
                <p style={{ marginTop: 8 }}>This month is <b className={why.diff > 0 ? 'neg' : 'pos'}>{fmtINR(Math.abs(why.diff))} {why.diff >= 0 ? 'above' : 'below'}</b> your three-month average ({why.pctChange > 0 ? '+' : ''}{why.pctChange}%).</p>
                {why.diff > 0 && (
                  <>
                    <div className="stack-sm small" style={{ marginTop: 10 }}>
                      {why.contributions.filter((c) => c.delta > 0).slice(0, 4).map((c) => <div key={c.category} className="row between"><span>{c.share}% of the increase came from <b>{c.label.toLowerCase()}</b></span><span className="num neg">+{fmtINR(c.delta)}</span></div>)}
                      {why.contributions.filter((c) => c.delta < 0).slice(0, 2).map((c) => <div key={c.category} className="row between muted"><span>{c.label} actually fell</span><span className="num pos">{fmtINR(c.delta)}</span></div>)}
                    </div>
                    {why.oneTime.length > 0 && (
                      <div className="notice blue" style={{ marginTop: 12 }}>
                        <span>{fmtINR(why.oneTimeTotal)} of it was one-time: {why.oneTime.map((t) => `${t.merchant} ${fmtINR(expenseOf(t))}`).join(', ')}. Excluding those, spending is still {why.exclPct >= 0 ? `${why.exclPct}% higher` : `${-why.exclPct}% lower`} than usual.</span>
                      </div>
                    )}
                    {why.oneTime.length === 0 && <p className="small sub" style={{ marginTop: 10 }}>No large one-time purchases this month, so the increase is behavioural rather than a one-off.</p>}
                  </>
                )}
                {why.diff <= 0 && <p className="small sub" style={{ marginTop: 8 }}>Nothing to explain: you are under your usual level.</p>}
              </div>
            </Reveal>
          </>
        )}
        <Section>
          <div className="grid-2">
            <a href="#/micro" className="card press" style={{ textDecoration: 'none', color: 'inherit' }}><b>The ₹100 Problem</b><div className="small sub">{d.micro.count} purchases under ₹{d.micro.threshold} this month add up to {fmtINR(d.micro.total)}.</div></a>
            <a href="#/patterns" className="card press" style={{ textDecoration: 'none', color: 'inherit' }}><b>Behavioural patterns</b><div className="small sub">{d.patterns.patterns[0]?.text || 'Patterns appear after a few weeks of history.'}</div></a>
          </div>
        </Section>
      </div>
    </Page>
  );
}
