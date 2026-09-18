import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Page, Section, Segmented, Field, MoneyInput, useToast, I, Empty } from '../components/ui.jsx';
import { UserPicker } from '../components/UserPicker.jsx';
import { computeSplit } from '../engines/split.js';
import { fmtINR, fmtDate } from '../engines/utils.js';

export default function Split() {
  const { state } = useStore();
  const { route } = useRouter();
  const txId = route.parts[1];
  const tx = txId ? state.transactions.find((t) => t.id === txId) : null;
  if (txId && !tx) return <Page title="Split a bill" back="/journal"><Empty title="Transaction not found" /></Page>;
  if (tx?.splitId) { const s = state.splits.find((x) => x.id === tx.splitId); return <Page title="Already split" back={`/tx/${tx.id}`}><SplitSummary split={s} /></Page>; }
  return <SplitEditor key={txId || 'new'} tx={tx} />;
}

function SplitEditor({ tx }) {
  const { state, actions } = useStore();
  const { navigate } = useRouter();
  const toast = useToast();
  const [total, setTotal] = useState(tx ? String(Math.abs(tx.amount)) : '');
  const [title, setTitle] = useState(tx ? `${tx.meaning || tx.merchant}` : '');
  const [mode, setMode] = useState('equal');
  const [people, setPeople] = useState([]); // verified users
  const [items, setItems] = useState({});
  const [shared, setShared] = useState('');
  const [groupName, setGroupName] = useState('');
  const [payerId, setPayerId] = useState('self');
  const [busy, setBusy] = useState(false);
  const me = state.user;
  const participants = useMemo(() => [{ id: me.id, name: me.name, isSelf: true, itemAmount: items.self || 0 }, ...people.map((u) => ({ id: u.id, name: u.name, isSelf: false, itemAmount: items[u.id] || 0 }))], [people, items, me]);
  const result = useMemo(() => computeSplit({ total: Number(total) || 0, participants, mode, sharedAmount: Number(shared) || 0, payerId: payerId === 'self' ? me.id : payerId }), [total, participants, mode, shared, payerId, me.id]);
  const itemsSum = participants.reduce((a, p) => a + (Number(p.itemAmount) || 0), 0);
  const leftover = (Number(total) || 0) - itemsSum;
  const groups = [...new Set(state.obligations.map((o) => o.groupId).filter(Boolean))];

  const save = async () => {
    if (!result.valid) { toast(result.error, 'rose'); return; }
    if (!people.length) { toast('Add at least one verified MILO user.', 'rose'); return; }
    setBusy(true);
    try {
      if (payerId !== 'self') {
        const payer = people.find((u) => u.id === payerId); const mine = result.shares.find((s) => s.isSelf)?.share || 0;
        await actions.createObligation({ counterpartUserId: payerId, direction: 'i_owe', amount: mine, title: title || 'Shared bill', kind: 'informal' });
        toast(`${payer.name} paid. Your share of ${fmtINR(mine)} is now under "You owe".`, 'green');
      } else {
        const r = await actions.createSplit({ title: title || 'Shared bill', total: Number(total), mode, sharedAmount: Number(shared) || 0, selfItemAmount: Number(items.self) || 0, participants: people.map((u) => ({ userId: u.id, itemAmount: Number(items[u.id]) || 0 })), groupName: groupName || undefined, sourceTxId: tx?.id });
        toast(`Split saved. Your expense is ${fmtINR(r.split.userExpense)}; ${fmtINR(r.split.recoverable)} is recoverable. Everyone involved has been notified.`, 'green');
      }
      navigate('/owe');
    } catch (e) { toast(e.body?.message || e.message, 'rose'); }
    finally { setBusy(false); }
  };

  return (
    <Page title="Split a bill" lead={tx ? `${fmtINR(tx.amount)} at ${tx.merchant} on ${fmtDate(tx.date)}. Who was involved?` : 'Record a shared bill with verified MILO users. Balances follow real accounts, not names.'} back={tx ? `/tx/${tx.id}` : '/owe'}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Section>
          <div className="card stack-sm">
            {!tx && <Field label="Total paid"><MoneyInput value={total} onChange={setTotal} aria-label="Total paid" /></Field>}
            <Field label="What was it"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner at Truffles" /></Field>
            <Field label="Who was involved" hint="Only registered MILO accounts can be added. You are always included."><UserPicker selected={people} onChange={setPeople} context={title} /></Field>
            <Field label="Who paid"><select className="select input" value={payerId} onChange={(e) => setPayerId(e.target.value)}><option value="self">{me.name} (me)</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Group (optional)" hint="Group splits feed the settlement engine."><input className="input" list="groups" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Goa trip" /><datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></Field>
            <Segmented options={[{ value: 'equal', label: 'Equal split' }, { value: 'unequal', label: 'Unequal (by items)' }]} value={mode} onChange={setMode} ariaLabel="Split mode" />
            <AnimatePresence initial={false}>
              {mode === 'unequal' && (
                <motion.div key="unequal" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }} className="stack-sm">
                  <p className="small sub">Enter what each person consumed. Whatever is left over is shared equally.</p>
                  {participants.map((p) => <div key={p.id} className="row"><span style={{ width: 110 }} className="small ellipsis">{p.name}{p.isSelf ? ' (you)' : ''}</span><MoneyInput value={items[p.isSelf ? 'self' : p.id] ?? ''} onChange={(v) => setItems((s) => ({ ...s, [p.isSelf ? 'self' : p.id]: v }))} placeholder="0" aria-label={`${p.name} items`} /></div>)}
                  <div className="row"><span style={{ width: 110 }} className="small">Shared</span><MoneyInput value={shared} onChange={setShared} placeholder={leftover > 0 ? String(leftover) : '0'} aria-label="Shared amount" /><button type="button" className="btn ghost sm" onClick={() => setShared(String(Math.max(0, leftover)))}>Use leftover {fmtINR(Math.max(0, leftover))}</button></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>
        <Section>
          <div className="card">
            <div className="section-head"><h2>Preview</h2></div>
            {!people.length ? <Empty title="Add people to see the split">Search by name or email above. Only verified accounts appear.</Empty> : !result.valid ? <div className="notice rose" style={{ marginTop: 8 }}>{result.error}</div> : (
              <>
                <div className="stack-sm" style={{ marginTop: 8 }}>
                  {result.shares.map((s, i) => <motion.div key={s.id} className="row between" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}><span>{s.name}{s.isSelf ? ' (you)' : ''}</span><span className="num"><b>{fmtINR(s.share)}</b>{mode === 'unequal' && <span className="tiny muted"> ({fmtINR(Number(s.itemAmount) || 0)} items + {fmtINR(s.sharedPart || 0)} shared)</span>}</span></motion.div>)}
                </div>
                <div className="divider" />
                <div className="kv"><span className="k">Payment outflow</span><span className="v num">{fmtINR(payerId === 'self' ? Number(total) : 0)}</span><span className="k">Your actual expense</span><span className="v num">{fmtINR(result.userExpense)}</span><span className="k">Recoverable from others</span><span className="v num pos">{fmtINR(result.recoverable)}</span></div>
              </>
            )}
            <button className="btn block" style={{ marginTop: 12 }} onClick={save} disabled={!result.valid || !people.length || busy}>{I.check} {busy ? 'Saving…' : 'Save split'}</button>
          </div>
        </Section>
      </div>
    </Page>
  );
}

export function SplitSummary({ split }) {
  if (!split) return null;
  return (
    <div className="card">
      <div className="section-head"><h2>{split.title}</h2><a href="#/owe">Split-Bill Memory</a></div>
      <div className="stack-sm" style={{ marginTop: 8 }}>{split.shares.map((s) => <div key={s.id} className="row between small"><span>{s.name}{s.isSelf ? ' (you)' : ''}</span><span className="num">{fmtINR(s.share)} · {s.isSelf ? 'paid' : s.remaining > 0 ? `${fmtINR(s.remaining)} pending` : 'settled'}</span></div>)}</div>
      <div className="divider" />
      <div className="kv"><span className="k">Paid</span><span className="v">{fmtINR(split.total)}</span><span className="k">Your expense</span><span className="v">{fmtINR(split.userExpense)}</span><span className="k">Still to recover</span><span className="v pos">{fmtINR(split.recoverable)}</span></div>
    </div>
  );
}
