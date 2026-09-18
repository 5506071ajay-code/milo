import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, I, Modal } from '../components/ui.jsx';
import { answerQuestion, SUGGESTED_QUESTIONS, INTENTS } from '../engines/cfo.js';

const PERMS = [
  ['cfoAccounts', 'Bank accounts and balances'],
  ['cfoInvestments', 'Investments (mutual funds, stocks, FDs)'],
  ['cfoLoans', 'Loans and credit cards'],
  ['cfoPeers', 'Peer transactions and split balances'],
  ['cfoGoals', 'Savings goals'],
  ['cfoCommitments', 'Commitments and upcoming payments'],
  ['cfoDocuments', 'Uploaded documents (none uploaded yet)'],
];

export default function CFO() {
  const { state, d, dispatch } = useStore();
  const reduce = useReducedMotion();
  const [msgs, setMsgs] = useState(() => [{ role: 'cfo', text: `Hi ${state.user.name}. I answer only from your own financial data, and I show every step I took. Ask me anything about your money.`, steps: [], sources: [], grounded: true, intro: true }]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [openTrace, setOpenTrace] = useState({});
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' }); }, [msgs, thinking, reduce]);

  const ask = (text) => {
    const question = (text ?? q).trim();
    if (!question || thinking) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setThinking(true);
    // The pipeline is synchronous and deterministic; the short delay only makes the trace readable.
    setTimeout(() => {
      const res = answerQuestion(question, { state, d });
      setMsgs((m) => [...m, { role: 'cfo', text: res.answer, steps: res.steps, sources: res.sources, grounded: res.grounded, intent: res.intent }]);
      setThinking(false);
    }, reduce ? 0 : 520);
  };

  return (
    <Page title="AI CFO" lead="Agentic, grounded and permission-based. It never invents a number: every answer comes from the same engines that power the rest of the app." actions={<button className="btn secondary sm" onClick={() => setShowPerms(true)}>{I.shield} Permissions</button>}>
      <Section>
        <div className="card" style={{ padding: 12, minHeight: 320 }}>
          <div className="stack" role="log" aria-live="polite">
            <AnimatePresence initial={false}>
              {msgs.map((m, i) => (
                <motion.div key={i} className={`msg ${m.role}`} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  {m.role === 'cfo' && <div className="avatar in" aria-hidden="true">C</div>}
                  <div className="bubble">
                    <div>{m.text}</div>
                    {m.role === 'cfo' && !m.intro && (
                      <>
                        <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
                          <span className={`badge ${m.grounded ? 'green' : 'rose'}`}>{m.grounded ? 'Grounded in your data' : 'Not answerable from data'}</span>
                          {m.intent && <span className="badge">{INTENTS.find((x) => x.id === m.intent)?.label}</span>}
                          {m.sources?.map((s) => <span key={s} className="badge blue">{s}</span>)}
                          <button className="btn ghost sm" onClick={() => setOpenTrace((o) => ({ ...o, [i]: !o[i] }))} aria-expanded={!!openTrace[i]}>{openTrace[i] ? 'Hide' : 'Show'} reasoning</button>
                        </div>
                        <AnimatePresence initial={false}>
                          {openTrace[i] && (
                            <motion.div className="pipeline" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                              <div className="st"><i>Q</i><span><b>User question</b> — as typed</span></div>
                              {m.steps.map((s, k) => <motion.div key={k} className="st" initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.07 }}><i>{k + 1}</i><span><b>{s.name}</b> — {s.detail}</span></motion.div>)}
                              <div className="st"><i>A</i><span><b>Answer</b> — shown above</span></div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                </motion.div>))}
            </AnimatePresence>
            {thinking && <div className="msg cfo"><div className="avatar in" aria-hidden="true">C</div><div className="bubble small muted"><Dots /> Retrieving, calculating, checking…</div></div>}
            <div ref={endRef} />
          </div>
        </div>
      </Section>
      <Section>
        <div className="chips" style={{ marginTop: 12 }}>
          {SUGGESTED_QUESTIONS.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={thinking}>{s}</button>)}
        </div>
      </Section>
      <Section>
        <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your money…" aria-label="Ask the AI CFO" />
          <button className="btn" type="submit" disabled={!q.trim() || thinking} aria-label="Send">{I.send}</button>
        </form>
        <p className="tiny muted" style={{ marginTop: 8 }}>Supported intents: {INTENTS.map((i) => i.label).join(', ')}. If a question cannot be mapped to retrievable data, the CFO says so instead of guessing.</p>
      </Section>
      <Modal open={showPerms} onClose={() => setShowPerms(false)} title="What the AI CFO may read" lead="Nothing is accessed without your permission. Turn a source off and answers that need it will be declined.">
        <div className="stack-sm" style={{ marginTop: 12 }}>
          {PERMS.map(([k, label]) => (
            <label key={k} className="row between card flat" style={{ padding: '10px 12px', cursor: 'pointer' }}>
              <span className="small">{label}</span>
              <input type="checkbox" checked={!!state.permissions[k]} onChange={(e) => dispatch({ type: 'setPermission', payload: { key: k, value: e.target.checked } })} aria-label={label} />
            </label>))}
        </div>
      </Modal>
    </Page>
  );
}

function Dots() {
  return <span aria-hidden="true" style={{ display: 'inline-flex', gap: 3, marginRight: 6 }}>{[0, 1, 2].map((i) => <motion.i key={i} style={{ width: 5, height: 5, borderRadius: 5, background: 'currentColor', display: 'inline-block' }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.18 }} />)}</span>;
}
