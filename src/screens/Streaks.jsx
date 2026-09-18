import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, useToast } from '../components/ui.jsx';
import { fmtINR, fmtDate } from '../engines/utils.js';

export default function Streaks() {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const active = state.subscriptions.filter((s) => s.status === 'active');
  return (
    <Page title="Streaks" lead="Quiet, factual streaks about outcomes. No confetti, no leaderboards, no badges for opening the app.">
      <div className="stack">
        <Section>
          <div className="grid-2">
            {d.streaks.map((s, i) => (
              <motion.div key={s.id} className="card" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 26 }}>
                <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.kind}</div>
                <div className="mid" style={{ margin: '4px 0 6px' }}>{s.label}</div>
                <p className="small sub">{s.outcome}</p>
              </motion.div>))}
          </div>
        </Section>
        <Section>
          <div className="card">
            <div className="section-head"><h2>Subscriptions</h2><span className="tiny muted">{fmtINR(active.reduce((a, s) => a + s.amount, 0))}/month active</span></div>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {state.subscriptions.map((s) => (
                <div key={s.id} className="row between small wrap"><span><b>{s.name}</b> <span className="muted">{fmtINR(s.amount)}/mo</span>{s.status === 'active' && s.lastUsed && <span className="tiny muted"> · last used {fmtDate(s.lastUsed)}</span>}{s.status === 'cancelled' && <span className="badge" style={{ marginLeft: 6 }}>cancelled {fmtDate(s.cancelledAt)}</span>}</span>{s.status === 'active' && <button className="btn ghost sm" onClick={() => { dispatch({ type: 'cancelSubscription', payload: { id: s.id } }); toast(`${s.name} cancelled. ${fmtINR(s.amount)} a month recovered.`, 'green'); }}>Cancel</button>}</div>))}
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>A subscription not used for 30 days lowers your Student Money Health "subscription utilisation" factor. Cancelling one adds to the "recovered" streak.</p>
          </div>
        </Section>
      </div>
    </Page>
  );
}
