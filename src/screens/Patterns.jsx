import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Empty } from '../components/ui.jsx';

export default function Patterns() {
  const { d } = useStore();
  const { patterns, enoughData, historyDays } = d.patterns;
  return (
    <Page title="Behavioural patterns" lead="Observations, not judgements. Awareness on its own changes behaviour; the app leaves the deciding to you.">
      <div className="stack">
        {!enoughData && <Section><Empty title="Not enough history yet">Patterns show once there are about 45 days of transactions. You have {historyDays} so far.</Empty></Section>}
        {enoughData && patterns.length === 0 && <Section><Empty title="No strong patterns">Your spending looks fairly even across days, times and the month.</Empty></Section>}
        <Section>
          <div className="stack-sm">
            {patterns.map((p, i) => (
              <motion.div key={p.id} className="card row" style={{ alignItems: 'flex-start' }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                <span className="badge blue" style={{ marginTop: 2 }}>{p.window}</span>
                <div><div>{p.text}</div><div className="tiny muted" style={{ marginTop: 4 }}>{p.category} · based on {historyDays} days of history</div></div>
              </motion.div>))}
          </div>
        </Section>
        <Section><p className="tiny muted">Patterns are recomputed from your journal every time it changes. Nothing here is sent anywhere.</p></Section>
      </div>
    </Page>
  );
}
