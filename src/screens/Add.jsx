import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Page, Section, Segmented, Field, MoneyInput, useToast, I } from '../components/ui.jsx';
import { CATEGORIES } from '../engines/taxonomy.js';
import { isoDay, addDays } from '../engines/utils.js';
import { UserPicker } from '../components/UserPicker.jsx';

const KINDS = [{ value: 'cash', label: 'Cash spend' }, { value: 'borrowed', label: 'Borrowed' }, { value: 'lent', label: 'Lent' }, { value: 'commitment', label: 'Future commitment' }];
const EXPENSE_CATS = Object.entries(CATEGORIES).filter(([, c]) => c.kind === 'expense' && !['credit_card_bill', 'emi', 'sip', 'internal_transfer'].includes(c)).map(([id, c]) => ({ id, label: c.label }));
const COMMIT_TYPES = ['rent', 'hostel', 'tuition', 'emi', 'insurance', 'subscription', 'sip', 'credit_card_bill', 'income', 'other'];

export default function Add() {
  const { state, dispatch, actions } = useStore();
  const [person, setPerson] = useState([]);
  const [busy, setBusy] = useState(false);
  const { navigate } = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState('cash');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('food');
  const [note, setNote] = useState('');
  
  const [date, setDate] = useState(isoDay(new Date()));
  const [title, setTitle] = useState('');
  const [ctype, setCtype] = useState('rent');
  const [direction, setDirection] = useState('out');
  const [recurrence, setRecurrence] = useState('monthly');
  const [errs, setErrs] = useState({});

  const submit = async () => {
    const e = {};
    const amt = Number(amount);
    if (!amount || Number.isNaN(amt) || amt <= 0) e.amount = 'Enter an amount above zero.';
    if (kind === 'cash' && !merchant.trim()) e.merchant = 'Where did you spend it?';
    if ((kind === 'borrowed' || kind === 'lent') && !person.length) e.contact = 'Pick a verified MILO user.';
    if (kind === 'commitment' && !title.trim()) e.title = 'Give the commitment a name.';
    if (kind === 'commitment' && date < isoDay(new Date())) e.date = 'A commitment is something in the future. Pick today or later.';
    if (kind !== 'commitment' && date > isoDay(new Date())) e.date = 'Cash and informal entries cannot be dated in the future.';
    setErrs(e); if (Object.keys(e).length) return;
    const dt = new Date(date + 'T' + new Date().toTimeString().slice(0, 8));
    if (kind === 'commitment') {
      dispatch({ type: 'addCommitment', payload: { title: title.trim(), type: ctype, amount: amt, direction: ctype === 'income' ? 'in' : direction, date, recurrence } });
      toast('Commitment added. Forecast and Money Calendar updated.', 'green'); navigate('/forecast'); return;
    }
    if (kind === 'cash') { dispatch({ type: 'addManual', payload: { amount: amt, merchant: merchant.trim(), category, note: note.trim(), date: dt.toISOString() } }); toast('Cash spend recorded.', 'green'); navigate('/journal'); return; }
    const u = person[0]; setBusy(true);
    try { await actions.createObligation({ counterpartUserId: u.id, direction: kind === 'borrowed' ? 'i_owe' : 'they_owe', amount: amt, title: note.trim() || (kind === 'borrowed' ? 'Informal borrowing' : 'Informal lending'), kind: 'informal' }); toast(kind === 'borrowed' ? `Recorded: you owe ${u.name} ₹${amt}. They have been notified.` : `Recorded: ${u.name} owes you ₹${amt}. They have been notified.`, 'green'); navigate('/owe'); }
    catch (e2) { toast(e2.body?.message || e2.message, 'rose'); } finally { setBusy(false); }
  };

  return (
    <Page title="Add manually" lead="Only for what banks cannot see: cash, informal money between friends, and future commitments. Everything else is recorded automatically." back="/journal">
      <Section>
        <div className="card stack-sm">
          <div className="scroll-x"><Segmented options={KINDS} value={kind} onChange={(v) => { setKind(v); setErrs({}); }} ariaLabel="Type of manual entry" /></div>
          <Field label="Amount" error={errs.amount}><MoneyInput value={amount} onChange={setAmount} invalid={!!errs.amount} autoFocus /></Field>
          {kind === 'cash' && (
            <>
              <Field label="Where / what" error={errs.merchant}><input className={`input ${errs.merchant ? 'invalid' : ''}`} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Auto rickshaw, Street food" /></Field>
              <Field label="Category"><select className="select input" value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
            </>
          )}
          {(kind === 'borrowed' || kind === 'lent') && (
            <>
              <Field label={kind === 'borrowed' ? 'Borrowed from' : 'Lent to'} error={errs.contact} hint="Must be a registered MILO user."><UserPicker single selected={person} onChange={setPerson} /></Field>
              <p className="small sub">Informal money goes straight into Split-Bill Memory, so it is never forgotten.</p>
            </>
          )}
          {kind === 'commitment' && (
            <>
              <Field label="Name" error={errs.title}><input className={`input ${errs.title ? 'invalid' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exam fee, Course EMI" /></Field>
              <div className="grid-2">
                <Field label="Type"><select className="select input" value={ctype} onChange={(e) => setCtype(e.target.value)}>{COMMIT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></Field>
                <Field label="Repeats"><select className="select input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}><option value="none">One time</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></Field>
              </div>
              {ctype !== 'income' && <Segmented options={[{ value: 'out', label: 'Money going out' }, { value: 'in', label: 'Money coming in' }]} value={direction} onChange={setDirection} ariaLabel="Direction" />}
            </>
          )}
          <Field label={kind === 'commitment' ? 'Due date' : 'Date'} error={errs.date}><input type="date" className={`input ${errs.date ? 'invalid' : ''}`} value={date} max={kind === 'commitment' ? undefined : isoDay(new Date())} min={kind === 'commitment' ? isoDay(new Date()) : isoDay(addDays(new Date(), -120))} onChange={(e) => setDate(e.target.value)} /></Field>
          {kind !== 'commitment' && <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'cash' ? 'e.g. Lunch with team' : 'e.g. For the trip, Movie tickets'} /></Field>}
          <div className="row"><button className="btn" onClick={submit} disabled={busy}>{I.check} {busy ? 'Saving…' : 'Save'}</button><a className="btn ghost" href="#/journal">Cancel</a></div>
        </div>
      </Section>
    </Page>
  );
}
