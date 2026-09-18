import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, useToast, Empty, I } from '../components/ui.jsx';
import { fmtINR, fmtDate } from '../engines/utils.js';

export default function Settle() {
  const { state, d, actions } = useStore();
  const toast = useToast();
  const [done, setDone] = useState({});
  const name = (id) => (id === 'self' ? `${state.user.name} (you)` : state.contacts.find((c) => c.id === id)?.name || id);
  return (
    <Page title="Settlement" lead="Instead of everyone paying everyone, the engine nets each member's balance and finds the fewest payments that clear the group.">
      <div className="stack">
        {d.settlements.map((s) => {
          const key = (p) => `${s.group.id}:${p.from}>${p.to}`;
          const allDone = s.payments.length > 0 && s.payments.every((p) => done[key(p)]);
          return (
            <Section key={s.group.id}>
              <div className="card">
                <div className="section-head"><h2>{s.group.name}</h2><span className="badge">{s.group.type === 'trip' ? 'Trip' : 'Home'} · {s.group.memberIds.length} members</span></div>
                {s.payments.length === 0 ? <p className="small sub" style={{ marginTop: 8 }}>Everything in this group is settled.</p> : (
                  <>
                    <div className="grid-2" style={{ marginTop: 10 }}>
                      <div>
                        <div className="small sub" style={{ marginBottom: 6 }}>{s.debts.length} open debt{s.debts.length > 1 ? 's' : ''}</div>
                        <div className="stack-sm small">{s.debts.map((x, i) => <div key={i} className="row between"><span>{name(x.from)} → {name(x.to)}<span className="tiny muted"> · {x.title}</span></span><span className="num">{fmtINR(x.amount)}</span></div>)}</div>
                      </div>
                      <div>
                        <div className="small sub" style={{ marginBottom: 6 }}>Net position</div>
                        <div className="stack-sm small">{Object.entries(s.net).filter(([, v]) => Math.abs(v) > 0.005).map(([id, v]) => <div key={id} className="row between"><span>{name(id)}</span><span className={`num ${v > 0 ? 'pos' : 'neg'}`}>{v > 0 ? 'receives' : 'pays'} {fmtINR(Math.abs(v))}</span></div>)}</div>
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="row between"><b>Minimum payments: {s.payments.length}</b><span className="tiny muted">instead of {s.originalCount}</span></div>
                    <div className="stack-sm" style={{ marginTop: 8 }}>
                      {s.payments.map((p, i) => (
                        <motion.label key={key(p)} className="row between card flat" style={{ padding: '10px 12px', cursor: 'pointer' }} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                          <span className="row"><input type="checkbox" checked={!!done[key(p)]} onChange={(e) => setDone((s2) => ({ ...s2, [key(p)]: e.target.checked }))} /><span><b>{name(p.from)}</b> pays <b>{name(p.to)}</b></span></span>
                          <span className="num mid">{fmtINR(p.amount)}</span>
                        </motion.label>))}
                    </div>
                    <button className="btn" style={{ marginTop: 12 }} disabled={!allDone} onClick={async () => { try { await actions.settleGroup(s.group.id); toast(`${s.group.name} settled. Everyone involved has been notified.`, 'green'); } catch (e) { toast(e.message, 'rose'); } }}>{I.check} Mark group as settled</button>
                    {!allDone && <p className="tiny muted" style={{ marginTop: 6 }}>Tick each payment once it has actually been made.</p>}
                  </>
                )}
              </div>
            </Section>);
        })}
        {d.settlements.length === 0 && <Empty title="No groups yet">Give a split a group name (e.g. “Goa trip”) and the settlement engine will net everyone's balances here.</Empty>}
        <Section><p className="tiny muted">MILO only sees debts you are part of. Debts between two other members of a group are not visible to you, so their payments are not shown.</p></Section>
      </div>
    </Page>
  );
}
