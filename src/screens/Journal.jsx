import React, { useMemo, useState } from 'react';
import { useStore } from '../store/store.jsx';
import { Page, Section, Segmented, Empty, Reveal } from '../components/ui.jsx';
import { TxRow } from '../components/tx.jsx';
import { fmtDate, isoDay } from '../engines/utils.js';

const FILTERS = [{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }, { value: 'peer', label: 'Peer' }, { value: 'transfer', label: 'Transfers' }, { value: 'review', label: 'Needs review' }];

export default function Journal() {
  const { state, d } = useStore();
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.transactions.filter((t) => {
      if (f === 'expense' && !(t.direction === 'out' && !t.internalTransfer && t.category !== 'peer')) return false;
      if (f === 'income' && !(t.direction === 'in' && !t.internalTransfer && t.category !== 'peer')) return false;
      if (f === 'peer' && !(t.category === 'peer' || t.contactId)) return false;
      if (f === 'transfer' && !t.internalTransfer) return false;
      if (f === 'review' && !(t.needsReview || t.needsPurpose || (t.splitPrompt && !t.splitId))) return false;
      if (s && !`${t.merchant} ${t.descriptor} ${t.meaning} ${t.category} ${t.note}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [state.transactions, q, f]);
  const groups = useMemo(() => {
    const g = [];
    for (const t of rows.slice(0, limit)) { const k = isoDay(t.date); if (!g.length || g[g.length - 1].key !== k) g.push({ key: k, items: [] }); g[g.length - 1].items.push(t); }
    return g;
  }, [rows, limit]);
  const sources = new Set(state.transactions.map((t) => t.source));

  return (
    <Page title="Financial journal" lead={`Recorded automatically from ${sources.size} sources through consent-based connections. Internal transfers are shown but never counted as expenses.`} actions={<a href="#/add" className="btn secondary sm">Add cash / informal</a>}>
      <Section>
        <div className="stack-sm">
          <input className="input" placeholder="Search merchant, meaning, note…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
          <div className="scroll-x"><Segmented options={FILTERS} value={f} onChange={setF} ariaLabel="Filter transactions" /></div>
          <div className="row wrap small muted"><span>{rows.length} transactions</span>{d.needsReview.length > 0 && <span>· {d.needsReview.length} need review</span>}{d.duplicates.length > 0 && <a href="#/duplicates">· {d.duplicates.length} possible duplicates</a>}</div>
        </div>
      </Section>
      <Section>
        {groups.length === 0 ? <div className="card" style={{ marginTop: 12 }}><Empty title="Nothing matches">Try a different search or filter.</Empty></div> : groups.map((g) => (
          <Reveal key={g.key}>
            <div className="small muted" style={{ margin: '16px 4px 6px' }}>{fmtDate(g.key, { weekday: 'short' })}{isoDay(new Date()) === g.key ? ' · Today' : ''}</div>
            <div className="card list" style={{ padding: '2px 12px' }}>{g.items.map((t) => <TxRow key={t.id} tx={t} showDate={false} />)}</div>
          </Reveal>))}
        {rows.length > limit && <div style={{ textAlign: 'center', marginTop: 14 }}><button className="btn secondary" onClick={() => setLimit((l) => l + 40)}>Show more</button></div>}
      </Section>
    </Page>
  );
}
