import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Money, Bars } from '../components/ui.jsx';
import { TxRow } from '../components/tx.jsx';
import { microSpending, monthTransactions } from '../engines/spending.js';
import { categoryTotals } from '../engines/spending.js';
import { fmtINR } from '../engines/utils.js';

export default function Micro() {
  const { state, d } = useStore();
  const [rate, setRate] = useState(25);
  const active = state.transactions.filter((t) => !t.excluded);
  const cur = useMemo(() => monthTransactions(active, d.today), [active, d.today]);
  const m = useMemo(() => microSpending(cur, 200, rate / 100), [cur, rate]);
  const cats = useMemo(() => categoryTotals(m.items), [m.items]);
  const hours = Object.entries(m.byHour).map(([h, n]) => ({ label: `${String(h).padStart(2, '0')}:00`, value: n })).sort((a, b) => a.label.localeCompare(b.label));
  const perDay = d.today.getDate() ? m.total / d.today.getDate() : 0;

  return (
    <Page title="The ₹100 Problem" lead="Nobody notices a ₹90 tea or a ₹140 auto. Together they are the biggest line on many students' months.">
      <div className="stack">
        <Section>
          <div className="hero">
            <div className="grid-3">
              <div className="stat"><span className="label">Small purchases this month</span><span className="big">{m.count}</span><span className="tiny muted">each under ₹{m.threshold}</span></div>
              <div className="stat"><span className="label">They add up to</span><Money value={m.total} className="big" /><span className="tiny muted">about {fmtINR(Math.round(perDay))} a day</span></div>
              <div className="stat"><span className="label">Cut them by {rate}% and keep</span><Money value={m.saving} className="big pos" /><span className="tiny muted">every month</span></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label className="small" htmlFor="rate">What if you reduced them by {rate}%?</label>
              <input id="rate" type="range" min="5" max="75" step="5" value={rate} onChange={(e) => setRate(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--green)' }} />
              <div className="row between tiny muted"><span>5%</span><span>75%</span></div>
            </div>
          </div>
        </Section>
        <Section>
          <div className="grid-2">
            <div className="card"><div className="section-head"><h2>Where the small money goes</h2></div><div style={{ marginTop: 8 }}><Bars rows={cats.map((c) => ({ label: c.label, value: c.total }))} /></div></div>
            <div className="card"><div className="section-head"><h2>When it happens</h2></div>{hours.length ? <div style={{ marginTop: 8 }}><Bars rows={hours} format={(v) => `${v}×`} /></div> : <p className="small muted">No small purchases yet this month.</p>}</div>
          </div>
        </Section>
        <Section>
          <div className="section-head"><h2>All {m.count} purchases</h2></div>
          <motion.div className="card list" style={{ padding: '4px 12px' }} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.02 } } }}>
            {m.items.map((t) => <TxRow key={t.id} tx={t} />)}
            {!m.items.length && <p className="small muted" style={{ padding: 10 }}>Nothing under ₹{m.threshold} this month.</p>}
          </motion.div>
        </Section>
      </div>
    </Page>
  );
}
