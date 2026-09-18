import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Empty } from '../components/ui.jsx';
import { fmtINR, fmtDate, daysBetween } from '../engines/utils.js';

/** Notifications are derived from state, so they are always current and never stale. */
export function buildNotifications(state, d) {
  const n = [];
  for (const s of state.serverNotifications || []) n.push({ id: s.id, kind: s.kind.charAt(0).toUpperCase() + s.kind.slice(1), tone: s.kind === 'reminder' ? 'marigold' : s.kind === 'emergency' ? 'rose' : 'blue', text: s.text, to: s.link || '#/owe', at: s.createdAt, server: true, read: !!s.readAt });
  for (const t of d.purposePrompts) n.push({ id: `purpose:${t.id}`, kind: 'Purpose', tone: 'blue', text: `You received ${fmtINR(t.amount)} from ${t.merchant}. What is this money for?`, to: `#/purpose?tx=${t.id}`, at: t.date });
  for (const t of d.splitPrompts) n.push({ id: `split:${t.id}`, kind: 'Split', tone: 'blue', text: `${fmtINR(t.amount)} at ${t.merchant} looks like a shared bill. Who was involved?`, to: `#/split/${t.id}`, at: t.date });
  for (const t of d.needsReview) n.push({ id: `review:${t.id}`, kind: 'Review', tone: 'marigold', text: t.contactId ? `${fmtINR(t.amount)} to ${t.merchant}: what was this for?` : `“${t.descriptor}” is a new merchant. Confirm what it was.`, to: `#/tx/${t.id}`, at: t.date });
  for (const f of d.duplicates) n.push({ id: `dup:${f.id}`, kind: 'Duplicate', tone: 'rose', text: `Possible duplicate transaction: ${fmtINR(Math.abs(f.pair[0].amount))} at ${f.pair[0].merchant} appears twice.`, to: '#/duplicates', at: f.pair[0].date });
  if (d.allowanceState.overspend > 0) n.push({ id: `allow:${d.today.toDateString()}`, kind: 'Allowance', tone: 'marigold', text: `Today's spending is ${fmtINR(d.allowanceState.overspend)} over your daily allowance. Tomorrow's safe amount is ${fmtINR(d.allowanceState.tomorrowSafe)}.`, to: '#/allowance', at: d.today });
  for (const e of d.calendar.events.filter((x) => x.direction === 'out' && daysBetween(d.today, x.date) <= 3)) n.push({ id: `due:${e.id}`, kind: 'Due', tone: 'blue', text: `${e.title} of ${fmtINR(e.amount)} is due ${daysBetween(d.today, e.date) === 0 ? 'today' : `in ${daysBetween(d.today, e.date)} day(s)`}.`, to: '#/calendar', at: d.today });
  if (d.calendar.lowest.balance < 0) n.push({ id: `low:${d.calendar.lowest.date}`, kind: 'Forecast', tone: 'rose', text: `Projected balance goes below zero on ${fmtDate(d.calendar.lowest.date)} (${fmtINR(d.calendar.lowest.balance)}).`, to: '#/calendar', at: d.today });
  for (const r of state.emergencyRequests.filter((x) => x.requesterId !== 'self' && x.status === 'open' && !x.ignored)) n.push({ id: `er:${r.id}`, kind: 'Emergency', tone: 'rose', text: `${r.requesterName} needs ${fmtINR(r.amount)} for ${r.reason.toLowerCase()} by ${fmtDate(r.requiredBy)}.`, to: '#/emergency', at: r.createdAt });
  for (const o of d.youOwe) n.push({ id: `owe:${o.contactId}`, kind: 'You owe', tone: '', text: `You owe ${o.name} ${fmtINR(o.amount)} (${o.items.map((i) => i.title).join(', ')}).`, to: '#/owe', at: o.items[0].createdAt });
  for (const r of [...state.reminders].reverse().slice(0, 5)) { const o = state.obligations.find((x) => x.id === r.obligationId); if (o) n.push({ id: `rem:${r.id}`, kind: 'Reminder', tone: 'green', text: `${r.auto ? 'Automatic reminder' : 'Reminder'} sent to ${state.contacts.find((c) => c.id === r.contactId)?.name} for ${o.title} (${fmtINR(o.remaining)}).`, to: '#/owe', at: r.at }); }
  if (d.scoreChange.delta !== 0) n.push({ id: `score:${d.score.score}`, kind: 'Money Health', tone: d.scoreChange.delta > 0 ? 'green' : 'marigold', text: d.scoreChange.text, to: '#/health', at: d.today });
  for (const p of d.patterns.patterns.slice(0, 2)) n.push({ id: `pat:${p.id}`, kind: 'Pattern', tone: '', text: p.text, to: '#/patterns', at: d.today });
  return n.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export default function Notifications() {
  const { state, d, dispatch, actions } = useStore();
  const items = useMemo(() => buildNotifications(state, d), [state, d]);
  const isRead = (i) => (i.server ? i.read : state.notificationsRead.includes(i.id));
  const unread = items.filter((i) => !isRead(i));
  return (
    <Page title="Notifications" lead="Everything that needs a decision or is worth knowing, in one place. Nothing here is a nudge to open the app; each item is a real event." actions={unread.length ? <button className="btn secondary sm" onClick={() => { dispatch({ type: 'markRead', payload: { ids: items.filter((i) => !i.server).map((i) => i.id) } }); actions.markServerRead([], true); }}>Mark all read</button> : null}>
      <Section>
        {items.length === 0 ? <Empty title="All clear">Nothing needs you right now.</Empty> : (
          <div className="stack-sm">
            {items.map((n, i) => {
              const read = isRead(n);
              return (
                <motion.a key={n.id} href={n.to} className="card press row" style={{ padding: '12px 14px', textDecoration: 'none', color: 'inherit', opacity: read ? 0.65 : 1 }} onClick={() => (n.server ? actions.markServerRead([n.id]) : dispatch({ type: 'markRead', payload: { ids: [n.id] } }))} initial={{ opacity: 0, y: 6 }} animate={{ opacity: read ? 0.65 : 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}>
                  <span className={`badge ${n.tone}`}>{n.kind}</span><span style={{ flex: 1 }}>{n.text}</span><span className="tiny muted">{fmtDate(n.at)}</span>
                </motion.a>);
            })}
          </div>
        )}
      </Section>
    </Page>
  );
}
