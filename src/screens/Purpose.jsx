import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore, inferPurpose } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Page, Section, MoneyInput, useToast, Money, I, Progress } from '../components/ui.jsx';
import { validateAllocation } from '../engines/purpose.js';
import { PURPOSES } from '../engines/taxonomy.js';
import { fmtINR, fmtDate, round2 } from '../engines/utils.js';

export default function Purpose() {
  const { state, d, dispatch } = useStore();
  const { route, navigate } = useRouter();
  const toast = useToast();
  const txId = route.params.tx;
  const pending = d.purposePrompts;
  const tx = (txId && state.transactions.find((t) => t.id === txId)) || pending[0] || null;
  return (
    <Page title="Purpose-Based Money" lead="Money has a job before it has a balance. Bank balance is not spendable balance: reserved money stays out of the flexible figure until it is spent on what it was for.">
      <div className="stack">
        {tx && tx.direction === 'in' && <Section><Allocator key={tx.id} tx={tx} state={state} dispatch={dispatch} toast={toast} navigate={navigate} /></Section>}
        {pending.length > (tx ? 1 : 0) && <Section><div className="notice blue">{pending.filter((p) => p.id !== tx?.id).map((p) => <a key={p.id} href={`#/purpose?tx=${p.id}`}>{fmtINR(p.amount)} from {p.merchant} also needs a purpose. </a>)}</div></Section>}
        <Section>
          <div className="section-head"><h2>Purpose buckets</h2><span className="badge marigold">Reserved {fmtINR(d.purposes.reserved)}</span></div>
          <div className="grid-2">
            {d.purposes.buckets.map((b, i) => (
              <motion.div key={b.id} className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <div className="row between"><b>{b.label}</b><span className="num mid">{fmtINR(b.balance)}</span></div>
                <Progress value={b.allocated ? b.consumed : 0} max={b.allocated || 1} tone={b.id === 'unrestricted' ? 'green' : ''} />
                <div className="tiny muted" style={{ marginTop: 6 }}>Allocated {fmtINR(b.allocated)} · consumed {fmtINR(b.consumed)}{b.id === 'unrestricted' ? ' · yours to decide' : ' · reserved'}</div>
              </motion.div>))}
          </div>
        </Section>
        <Section>
          <div className="card">
            <div className="section-head"><h2>How it adds up</h2><a href="#/forecast">Forecast</a></div>
            <div className="kv" style={{ marginTop: 6 }}>
              <span className="k">Total bank balance</span><span className="v num">{fmtINR(d.bankBalance)}</span>
              <span className="k">Reserved for purposes</span><span className="v num">− {fmtINR(d.purposes.reserved)}</span>
              <span className="k">Committed until {fmtDate(d.cvf.horizonEnd)}</span><span className="v num">− {fmtINR(d.cvf.committed)}</span>
              <span className="k total">Actually yours to spend</span><span className={`v total num ${d.cvf.flexible < 0 ? 'neg' : 'pos'}`}>{fmtINR(d.cvf.flexible)}</span>
            </div>
          </div>
        </Section>
        <Section>
          <div className="section-head"><h2>Recent incoming money</h2></div>
          <div className="card list" style={{ padding: '4px 12px' }}>
            {state.transactions.filter((t) => t.direction === 'in' && !t.internalTransfer && t.category !== 'peer').slice(0, 8).map((t) => (
              <a key={t.id} href={`#/purpose?tx=${t.id}`} className="list-row clickable"><div className="avatar in">{t.merchant.charAt(0)}</div><div className="body"><div className="title">{t.merchant}</div><div className="meta"><span>{fmtDate(t.date)}</span>{t.purposeAllocations?.length ? <span>{t.purposeAllocations.map((a) => `${PURPOSES.find((p) => p.id === a.purpose)?.label} ${fmtINR(a.amount)}`).join(' · ')}</span> : <span className="badge blue">Needs a purpose</span>}{t.purposeCorrected && <span className="badge green">Corrected</span>}</div></div><div className="amt pos">+{fmtINR(t.amount)}</div></a>))}
          </div>
        </Section>
      </div>
    </Page>
  );
}

function Allocator({ tx, state, dispatch, toast, navigate }) {
  const total = Math.abs(tx.amount);
  const inferred = useMemo(() => inferPurpose(tx, state.purposeMemory), [tx, state.purposeMemory]);
  const preset = tx.purposeAllocations?.length ? tx.purposeAllocations : [{ purpose: inferred.purpose, amount: total }];
  const [rows, setRows] = useState(() => Object.fromEntries(PURPOSES.map((p) => [p.id, String(preset.find((a) => a.purpose === p.id)?.amount || '')])));
  const allocations = PURPOSES.map((p) => ({ purpose: p.id, amount: Number(rows[p.id]) || 0 })).filter((a) => a.amount > 0);
  const check = validateAllocation(total, allocations);
  const allocated = round2(allocations.reduce((a, x) => a + x.amount, 0));
  const unallocated = round2(total - allocated);
  const isSingle = allocations.length === 1 && allocations[0].purpose === inferred.purpose && !tx.purposeAllocations?.length;
  const example = () => {
    // The source example: ₹30,000 → hostel 10,000 / food 7,000 / transport 3,000 / education 5,000 / emergency 2,000 / flexible 3,000.
    // Food + transport are monthly living; education maps to tuition; flexible is unrestricted.
    const f = total / 30000;
    const r = (n) => String(Math.round(n * f));
    setRows({ hostel: r(10000), monthly_living: r(10000), tuition: r(5000), emergency: r(2000), unrestricted: r(3000), travel: '', investment: '' });
  };
  const save = () => {
    if (!check.ok) return;
    dispatch({ type: 'allocatePurpose', payload: { id: tx.id, allocations, corrected: !isSingle } });
    toast(isSingle ? `Confirmed: ${fmtINR(total)} for ${PURPOSES.find((p) => p.id === inferred.purpose)?.label.toLowerCase()}. The app will suggest this for ${tx.merchant} next time.` : 'Allocation saved. The app learned your split for money from this source.', 'green');
    navigate('/purpose');
  };
  return (
    <div className="card">
      <div className="section-head"><h2>{fmtINR(total)} from {tx.merchant}</h2><span className="tiny muted">{fmtDate(tx.date)}</span></div>
      <div className={`notice ${inferred.confidence >= 0.75 ? 'green' : ''}`} style={{ marginTop: 8 }}><span><b>Inferred purpose: {PURPOSES.find((p) => p.id === inferred.purpose)?.label}</b> ({Math.round(inferred.confidence * 100)}%). {inferred.reason}. Accept it, or spread the money across purposes.</span></div>
      <div className="stack-sm" style={{ marginTop: 12 }}>
        {PURPOSES.map((p) => (
          <div key={p.id} className="row"><label htmlFor={`p_${p.id}`} className="small" style={{ width: 120 }}>{p.label}</label><MoneyInput id={`p_${p.id}`} value={rows[p.id]} onChange={(v) => setRows((r) => ({ ...r, [p.id]: v }))} placeholder="0" /></div>))}
      </div>
      <div className="divider" />
      <div className="row between small"><span>Allocated <b className="num">{fmtINR(allocated)}</b> of {fmtINR(total)}</span>{unallocated !== 0 && <span className={unallocated > 0 ? 'muted' : 'neg'}>{unallocated > 0 ? `${fmtINR(unallocated)} unallocated` : `${fmtINR(-unallocated)} over`}</span>}</div>
      <Progress value={allocated} max={total} tone={allocated > total + 0.005 ? 'rose' : ''} />
      {!check.ok && <p className="small" style={{ color: 'var(--rose)', marginTop: 6 }} role="alert">{check.error}</p>}
      <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
        <button className="btn" onClick={save} disabled={!check.ok}>{I.check} {isSingle ? 'Accept' : 'Save allocation'}</button>
        <button className="btn secondary" onClick={() => setRows(Object.fromEntries(PURPOSES.map((p) => [p.id, p.id === inferred.purpose ? String(total) : ''])))}>All to {PURPOSES.find((p) => p.id === inferred.purpose)?.label.toLowerCase()}</button>
        {unallocated > 0 && <button className="btn ghost" onClick={() => setRows((r) => ({ ...r, unrestricted: String((Number(r.unrestricted) || 0) + unallocated) }))}>Put {fmtINR(unallocated)} in unrestricted</button>}
        <button className="btn ghost" onClick={example}>Typical semester split</button>
      </div>
    </div>
  );
}
