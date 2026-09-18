import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Ring, Progress } from '../components/ui.jsx';
import { fmtDate } from '../engines/utils.js';

export default function Health() {
  const { state, d } = useStore();
  const { score, scoreChange, prevScore } = d;
  const band = score.score >= 70 ? 'Steady' : score.score >= 45 ? 'Watchful' : 'Under strain';
  return (
    <Page title="Student Money Health" lead="A 0–100 reading of your own habits. It is not a credit score, no bank sees it, and it moves only when your behaviour does.">
      <div className="stack">
        <Section>
          <div className="hero row wrap" style={{ gap: 24, alignItems: 'center' }}>
            <Ring value={score.score} label="Student Money Health" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="mid">{band}</div>
              <p className="small" style={{ marginTop: 6 }}>{scoreChange.text}</p>
              {prevScore && <p className="tiny muted" style={{ marginTop: 6 }}>Previous reading {prevScore.score}{prevScore.at ? ` on ${fmtDate(prevScore.at)}` : ''} · change {scoreChange.delta > 0 ? '+' : ''}{scoreChange.delta}</p>}
            </div>
          </div>
        </Section>
        <Section>
          <div className="section-head"><h2>What goes into it</h2></div>
          <div className="stack-sm">
            {score.factors.map((f, i) => {
              const prev = prevScore?.factors?.find((x) => x.id === f.id);
              const ch = prev ? f.score - prev.score : 0;
              return (
                <motion.div key={f.id} className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <div className="row between"><b>{f.label} <span className="tiny muted">weight {Math.round(f.weight * 100)}%</span></b><span className="num"><b>{f.score}</b>{ch !== 0 && <span className={`tiny ${ch > 0 ? 'pos' : 'neg'}`} style={{ marginLeft: 6 }}>{ch > 0 ? '▲' : '▼'} {Math.abs(ch)}</span>}</span></div>
                  <Progress value={f.score} tone={f.score >= 70 ? 'green' : f.score >= 45 ? '' : 'rose'} />
                  <p className="small sub" style={{ marginTop: 6 }}>{f.detail}</p>
                </motion.div>);
            })}
          </div>
        </Section>
        <Section>
          <div className="card"><div className="section-head"><h2>History</h2></div>
            {state.scoreHistory.length ? <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{state.scoreHistory.map((h, i) => <span key={i} className="badge">{fmtDate(h.at)} · {h.score}</span>)}<span className="badge green">Now · {score.score}</span></div> : <p className="small muted">A reading is stored every week.</p>}
          </div>
        </Section>
      </div>
    </Page>
  );
}
