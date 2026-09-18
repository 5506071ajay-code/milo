import React from 'react';
import { contextPath } from '../engines/categorise.js';
import { fmtINR, fmtDate, fmtTime } from '../engines/utils.js';
import { useStore } from '../store/store.jsx';

export function TxRow({ tx, showDate = true }) {
  const { state } = useStore();
  const path = contextPath(tx, state.contacts);
  const kind = tx.internalTransfer ? 'transfer' : tx.category === 'peer' || tx.contactId ? 'peer' : tx.direction === 'in' ? 'in' : 'out';
  const initial = (tx.merchant || '?').replace(/^UPI\s*[–-]\s*/i, '').trim().charAt(0).toUpperCase();
  const isSplit = !!tx.splitId;
  return (
    <a href={`#/tx/${tx.id}`} className="list-row clickable">
      <div className={`avatar ${kind}`}>{initial}</div>
      <div className="body">
        <div className="title ellipsis">{tx.merchant || 'Unknown merchant'}{tx.excluded && <span className="badge rose" style={{ marginLeft: 6 }}>Duplicate</span>}</div>
        <div className="meta">
          <span className="path">{path.map((p, i) => <span key={i}>{p}</span>)}</span>
        </div>
        <div className="meta">
          {showDate && <span>{fmtDate(tx.date)} · {fmtTime(tx.date)}</span>}
          {tx.needsReview && <span className="badge marigold">Needs your review</span>}
          {tx.needsPurpose && <span className="badge blue">What is this for?</span>}
          {tx.splitPrompt && !tx.splitId && <span className="badge blue">Who was involved?</span>}
          {tx.userCorrected && <span className="badge green">Corrected</span>}
          {tx.manual && <span className="badge">Manual</span>}
        </div>
      </div>
      <div className={`amt ${tx.internalTransfer ? 'muted' : tx.direction === 'in' ? 'pos' : ''}`}>
        {tx.direction === 'in' ? '+' : '−'}{fmtINR(Math.abs(tx.amount))}
        {isSplit && <span className="sub">your share {fmtINR(tx.userExpense)}</span>}
        {tx.internalTransfer && <span className="sub">not an expense</span>}
      </div>
    </a>
  );
}
