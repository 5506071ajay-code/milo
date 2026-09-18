import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, useToast, Empty, I } from '../components/ui.jsx';
import { fmtINR, fmtDate, fmtTime } from '../engines/utils.js';

export default function Duplicates() {
  const { state, d, dispatch } = useStore();
  const toast = useToast();
  const resolved = state.transactions.filter((t) => t.dupResolution);
  const acct = (t) => state.accounts.find((a) => a.id === t.accountId)?.name || 'Cash';
  const resolve = (f, resolution) => {
    dispatch({ type: 'resolveDuplicate', payload: { ids: [f.pair[0].id, f.pair[1].id], resolution, pairId: f.id } });
    toast(resolution === 'keep' ? 'Kept both as separate transactions.' : resolution === 'duplicate' ? 'Second entry excluded from all totals.' : 'Linked as a payment and its refund. Neither counts as an expense.', 'green');
  };
  return (
    <Page title="Possible duplicates" lead="The same amount showing up twice through different channels is flagged, not deleted. You decide; nothing is silently removed.">
      <div className="stack">
        <Section>
          {d.duplicates.length === 0 ? <Empty title="Nothing to review">No unresolved duplicate or reversal candidates.</Empty> : (
            <div className="stack-sm">
              <AnimatePresence>
                {d.duplicates.map((f) => (
                  <motion.div key={f.id} className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
                    <div className="row between wrap"><span className="badge marigold">{f.kind === 'reversal' ? 'Possible reversal / refund' : 'Possible duplicate transaction'}</span><span className="mid num">{fmtINR(Math.abs(f.pair[0].amount))}</span></div>
                    <p className="small" style={{ marginTop: 8 }}>{f.reason}</p>
                    <div className="grid-2" style={{ marginTop: 10 }}>
                      {f.pair.map((t) => <a key={t.id} href={`#/tx/${t.id}`} className="card flat small" style={{ textDecoration: 'none', color: 'inherit' }}><b>{t.merchant}</b><div className="tiny muted">{fmtDate(t.date)} {fmtTime(t.date)} · {acct(t)} · {t.channel?.toUpperCase()} · {t.direction === 'in' ? 'credit' : 'payment'}</div><div className="tiny muted">{t.descriptor}</div></a>)}
                    </div>
                    <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                      <button className="btn secondary sm" onClick={() => resolve(f, 'keep')}>Both are real</button>
                      {f.kind === 'duplicate' && <button className="btn sm" onClick={() => resolve(f, 'duplicate')}>{I.check} It is a duplicate</button>}
                      {f.kind === 'reversal' ? <button className="btn sm" onClick={() => resolve(f, 'refund')}>{I.check} Refund / reversal</button> : <button className="btn ghost sm" onClick={() => resolve(f, 'refund')}>Paid once, then reversed</button>}
                    </div>
                  </motion.div>))}
              </AnimatePresence>
            </div>
          )}
        </Section>
        {resolved.length > 0 && (
          <Section>
            <div className="section-head"><h2>Resolved</h2></div>
            <div className="card list" style={{ padding: '4px 12px' }}>
              {resolved.map((t) => <a key={t.id} href={`#/tx/${t.id}`} className="list-row clickable small"><div className="body"><div className="title">{t.merchant} · {fmtINR(Math.abs(t.amount))}</div><div className="meta"><span>{fmtDate(t.date)}</span><span className="badge">{t.dupResolution === 'keep' ? 'kept' : t.dupResolution === 'duplicate' ? (t.excluded ? 'excluded as duplicate' : 'kept (original)') : 'refund pair'}</span></div></div></a>)}
            </div>
          </Section>
        )}
      </div>
    </Page>
  );
}
