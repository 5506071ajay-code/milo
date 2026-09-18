import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Page, Section, Field, useToast, Empty, I } from '../components/ui.jsx';
import { contextPath, inferUpiMerchant, interpretPeerTransaction, DEFAULT_MERCHANT_MEMORY, parseUpiDescriptor } from '../engines/categorise.js';
import { CATEGORIES, PEER_MEANINGS, PURPOSES, categoryLabel, purposeLabel } from '../engines/taxonomy.js';
import { fmtINR, fmtDate, fmtTime } from '../engines/utils.js';

const EXPENSE_CATS = Object.entries(CATEGORIES).filter(([, c]) => c.kind === 'expense').map(([id, c]) => ({ id, label: c.label }));

export default function Transaction() {
  const { state, d, dispatch } = useStore();
  const { route } = useRouter();
  const toast = useToast();
  const id = route.parts[1];
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return <Page title="Transaction" back="/journal"><Empty title="Transaction not found">It may have been removed or the link is wrong.</Empty></Page>;
  return <TxDetail key={tx.id} tx={tx} state={state} d={d} dispatch={dispatch} toast={toast} />;
}

function TxDetail({ tx, state, d, dispatch, toast }) {
  const contact = state.contacts.find((c) => c.id === tx.contactId);
  const memory = { ...DEFAULT_MERCHANT_MEMORY, ...state.merchantMemory };
  const isPeer = tx.category === 'peer' || !!tx.contactId;
  const isIncome = tx.direction === 'in' && !isPeer && !tx.internalTransfer;
  const inference = useMemo(() => (!isPeer && !isIncome && !tx.internalTransfer ? inferUpiMerchant(tx, memory, state.transactions) : null), [tx.id, state.merchantMemory]); // eslint-disable-line
  const peer = useMemo(() => (isPeer && contact ? interpretPeerTransaction(tx, { contact, obligations: state.obligations, groups: state.groups, corrections: state.peerCorrections, transactions: state.transactions }) : null), [tx.id, state.peerCorrections]); // eslint-disable-line

  const [category, setCategory] = useState(tx.category || inference?.category || 'other');
  const [meaning, setMeaning] = useState(tx.meaning || inference?.meaning || '');
  const [purpose, setPurpose] = useState(tx.purpose || CATEGORIES[tx.category]?.purpose || 'monthly_living');
  const [peerMeaning, setPeerMeaning] = useState(tx.peerMeaning || peer?.top.id || 'money_transfer');
  const [notExpense, setNotExpense] = useState(!!tx.internalTransfer);
  const [err, setErr] = useState('');

  const account = state.accounts.find((a) => a.id === tx.accountId);
  const linked = tx.linkedTxId ? state.transactions.find((t) => t.id === tx.linkedTxId) : null;
  const split = tx.splitId ? state.splits.find((s) => s.id === tx.splitId) : null;
  const path = contextPath(tx, state.contacts);
  const dirty = isPeer ? peerMeaning !== tx.peerMeaning : notExpense !== !!tx.internalTransfer || category !== tx.category || meaning !== (tx.meaning || '') || purpose !== tx.purpose;

  const save = () => {
    setErr('');
    if (isPeer) {
      dispatch({ type: 'correctTransaction', payload: { id: tx.id, patch: { peerMeaning, meaning: PEER_MEANINGS.find((m) => m.id === peerMeaning)?.label } } });
      toast(`Saved. Future ${fmtINR(tx.amount)}-ish transfers to ${contact?.name} will lean towards "${PEER_MEANINGS.find((m) => m.id === peerMeaning)?.label}".`, 'green');
      return;
    }
    if (notExpense) {
      dispatch({ type: 'correctTransaction', payload: { id: tx.id, patch: { internalTransfer: true, category: 'internal_transfer', meaning: 'Own-account transfer' } } });
      toast('Marked as an internal transfer. It no longer counts as an expense.', 'green');
      return;
    }
    if (!category || !CATEGORIES[category]) { setErr('Choose a category.'); return; }
    if (!meaning.trim()) { setErr('Say what this was, in a word or two. This is what the app learns.'); return; }
    const patch = { category, meaning: meaning.trim(), purpose, internalTransfer: false };
    dispatch({ type: 'correctTransaction', payload: { id: tx.id, patch } });
    toast(tx.merchant ? `Learned: ${parseUpiDescriptor(tx.descriptor || tx.merchant).merchant} → ${categoryLabel(category)}.` : 'Saved.', 'green');
  };

  const kindLabel = tx.internalTransfer ? 'Internal transfer' : isPeer ? 'Peer transaction' : isIncome ? 'Income' : 'Expense';

  return (
    <Page title={tx.merchant || 'Unknown merchant'} lead={`${kindLabel} · ${fmtDate(tx.date)} at ${fmtTime(tx.date)}`} back="/journal">
      <div className="stack">
        <Section>
          <div className="card">
            <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
              <div className="stat">
                <span className="label">{tx.direction === 'in' ? 'Received' : 'Paid'}</span>
                <span className={`big ${tx.direction === 'in' ? 'pos' : ''}`}>{tx.direction === 'in' ? '+' : '−'}{fmtINR(Math.abs(tx.amount))}</span>
                {split && <span className="small sub">Payment outflow {fmtINR(split.total)} · your actual expense {fmtINR(split.userExpense)} · recoverable {fmtINR(split.recoverable)}</span>}
                {tx.internalTransfer && <span className="small sub">Money moved between your own accounts. Not an expense, not income.</span>}
              </div>
              <div className="stack-sm small" style={{ textAlign: 'right' }}>
                <span className="badge">{tx.source}</span>
                <span className="muted">{account ? `${account.name} ${account.mask}` : 'Cash'} · {tx.channel?.toUpperCase()}</span>
              </div>
            </div>
            <div className="divider" />
            <div className="small sub" style={{ marginBottom: 4 }}>Context path</div>
            <div className="path">{path.map((p, i) => <span key={i}>{p}</span>)}</div>
            {tx.descriptor && <div className="tiny muted" style={{ marginTop: 8 }}>Raw descriptor: <code>{tx.descriptor}</code></div>}
            {tx.excluded && <div className="notice rose" style={{ marginTop: 10 }}>Marked as a duplicate. Excluded from every total. <a href="#/duplicates">Review duplicates</a></div>}
            {linked && <div className="notice blue" style={{ marginTop: 10 }}>Linked to <a href={`#/tx/${linked.id}`}>{linked.merchant} · {fmtINR(Math.abs(linked.amount))}</a> ({tx.internalTransfer ? 'the other side of this transfer' : 'refund / reversal pair'}).</div>}
          </div>
        </Section>

        {!tx.internalTransfer && !isPeer && !isIncome && tx.splitPrompt && !tx.splitId && (
          <Section>
            <div className="notice blue">
              <span style={{ flex: 1 }}>{fmtINR(tx.amount)} at {tx.merchant} looks like a shared bill. Who was involved?</span>
              <a className="btn sm" href={`#/split/${tx.id}`}>Split it</a>
              <button className="btn ghost sm" onClick={() => { dispatch({ type: 'dismissSplitPrompt', payload: { id: tx.id } }); toast('Kept as your own expense.'); }}>Just me</button>
            </div>
          </Section>
        )}
        {split && (
          <Section>
            <div className="card">
              <div className="section-head"><h2>Split</h2><a href="#/owe">Split-Bill Memory</a></div>
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {split.shares.map((s) => <div key={s.id} className="row between small"><span>{s.name}{s.isSelf ? ' (you)' : ''}</span><span className="num">{fmtINR(s.share)} · {s.isSelf ? 'paid' : s.remaining > 0 ? `${fmtINR(s.remaining)} pending` : 'settled'}</span></div>)}
              </div>
            </div>
          </Section>
        )}

        {isPeer && contact && peer && (
          <Section>
            <div className="card">
              <div className="section-head"><h2>What was this {fmtINR(tx.amount)} {tx.direction === 'out' ? 'to' : 'from'} {contact.name}?</h2></div>
              <p className="small sub">The app ranked these from your history, open balances, groups and timing. {peer.ambiguous ? 'It is not sure, so it is asking you.' : `It thinks "${peer.top.label}" is most likely.`}</p>
              <div className="stack-sm" style={{ marginTop: 10 }}>
                {peer.ranked.map((m, i) => (
                  <motion.button key={m.id} type="button" whileTap={{ scale: 0.99 }} onClick={() => setPeerMeaning(m.id)} className="card press" style={{ textAlign: 'left', padding: '10px 12px', borderColor: peerMeaning === m.id ? 'var(--green)' : undefined, background: peerMeaning === m.id ? 'var(--green-soft)' : undefined }} aria-pressed={peerMeaning === m.id}>
                    <div className="row between"><b>{m.label}</b><span className="tiny muted">{Math.round(m.score * 100)}% {i === 0 && '· likely'}</span></div>
                    {m.evidence.length > 0 && <div className="tiny sub" style={{ marginTop: 4 }}>{m.evidence.join(' · ')}</div>}
                  </motion.button>))}
              </div>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn" onClick={save} disabled={!dirty && !tx.needsReview}>{I.check} Confirm</button>
                {tx.direction === 'out' && <a className="btn secondary" href={`#/split/${tx.id}`}>Record as a split instead</a>}
              </div>
            </div>
          </Section>
        )}

        {!isPeer && !isIncome && (
          <Section>
            <div className="card">
              <div className="section-head"><h2>{tx.needsReview ? 'Confirm what this was' : 'Correct this transaction'}</h2></div>
              {inference && !tx.internalTransfer && (
                <div className={`notice ${inference.ambiguous ? '' : 'green'}`} style={{ marginBottom: 12 }}>
                  <span>
                    <b>{inference.ambiguous ? 'Best guess' : 'Recognised'}:</b> “{inference.merchant}” → {categoryLabel(inference.category)} → {inference.meaning} ({Math.round(inference.confidence * 100)}%). {inference.reason}.
                    {inference.alternatives?.length > 0 && <> Could also be {inference.alternatives.map((a) => a.meaning.toLowerCase()).join(' or ')}.</>}
                  </span>
                </div>
              )}
              <div className="stack-sm">
                <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={notExpense} onChange={(e) => setNotExpense(e.target.checked)} /> This is a transfer between my own accounts (not an expense)</label>
                {!notExpense && (
                  <>
                    <Field label="Category">
                      <select className="select input" value={category} onChange={(e) => { setCategory(e.target.value); const c = CATEGORIES[e.target.value]; if (c?.purpose) setPurpose(c.purpose); }}>
                        {EXPENSE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </Field>
                    <Field label="What was it?" hint="A short meaning, e.g. Dinner, Groceries, Bus pass. The app remembers this merchant.">
                      <input className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="e.g. Dinner" />
                    </Field>
                    <Field label="Which purpose does it consume?" hint="Bank balance is not spendable balance: expenses draw down a purpose bucket.">
                      <select className="select input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                    </Field>
                  </>
                )}
                {err && <span className="small" style={{ color: 'var(--rose)' }} role="alert">{err}</span>}
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn" onClick={save} disabled={!dirty && !tx.needsReview}>{I.check} {tx.needsReview ? 'Confirm' : 'Save correction'}</button>
                  {!tx.splitId && !tx.internalTransfer && !notExpense && <a className="btn secondary" href={`#/split/${tx.id}`}>Split this bill</a>}
                </div>
              </div>
            </div>
          </Section>
        )}

        {isIncome && (
          <Section>
            <div className="card">
              <div className="section-head"><h2>Purpose of this money</h2><a href={`#/purpose?tx=${tx.id}`}>Allocate</a></div>
              {tx.purposeAllocations?.length ? <div className="stack-sm" style={{ marginTop: 6 }}>{tx.purposeAllocations.map((a) => <div key={a.purpose} className="row between small"><span>{purposeLabel(a.purpose)}</span><span className="num">{fmtINR(a.amount)}</span></div>)}</div> : <p className="small sub">Not yet allocated. Money without a purpose stays outside your spendable balance until you decide.</p>}
            </div>
          </Section>
        )}
      </div>
    </Page>
  );
}
