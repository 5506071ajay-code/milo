import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, Money, I, Reveal } from '../components/ui.jsx';
import { TxRow } from '../components/tx.jsx';
import { fmtINR, fmtDate } from '../engines/utils.js';

export default function Home() {
  const { state, d } = useStore();
  const { cvf, purposes } = d;
  const bal = d.bankBalance || 1;
  const w = (v) => `${Math.max(0, Math.min(100, (v / bal) * 100))}%`;
  const attention = [];
  for (const t of d.purposePrompts) attention.push({ to: `#/purpose?tx=${t.id}`, badge: 'Purpose', text: `You received ${fmtINR(t.amount)} from ${t.merchant}. What is this money for?` });
  for (const t of d.splitPrompts) attention.push({ to: `#/split/${t.id}`, badge: 'Split', text: `${fmtINR(t.amount)} at ${t.merchant}. Who was involved?` });
  for (const t of d.needsReview) attention.push({ to: `#/tx/${t.id}`, badge: 'Review', text: t.contactId ? `${fmtINR(t.amount)} to ${t.merchant}: what was this for?` : `“${t.descriptor}” looks like a new merchant. Confirm what it was.` });
  for (const f of d.duplicates.slice(0, 1)) attention.push({ to: '#/duplicates', badge: 'Duplicate', text: `Possible duplicate transaction: ${fmtINR(Math.abs(f.pair[0].amount))} at ${f.pair[0].merchant} appears twice.` });
  if (d.allowanceState.overspend > 0) attention.push({ to: '#/allowance', badge: 'Allowance', text: `Today’s spending is ${fmtINR(d.allowanceState.overspend)} above your daily allowance.` });

  if (!state.accounts.length) return <NoAccounts state={state} />;
  return (
    <Page>
      {state.hasDemo && !state.hasRealData && <Section><div className="notice"><span><b>Demo data.</b> Everything below comes from the demo sandbox you connected, not from a real account. <a href="#/accounts">Connect a real bank or broker</a> or remove the demo under Accounts.</span></div></Section>}
      <Section>
        <div className="hero">
          <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="sub small">Good {greeting()}, {state.user.name}. Welcome to MILO, your money, in one place</div>
              <div className="stat" style={{ marginTop: 8 }}>
                <span className="label">Actually yours to spend</span>
                <Money value={cvf.flexible} className={`big ${cvf.flexible < 0 ? 'neg' : ''}`} />
              </div>
            </div>
            <div className="stat" style={{ textAlign: 'right' }}>
              <span className="label">Total bank balance</span>
              <span className="mid num">{fmtINR(d.bankBalance)}</span>
              <span className="tiny muted">across {d.bankAccounts.length} connected accounts</span>
            </div>
          </div>
          <div className="strip" aria-hidden="true">
            <motion.span className="s-res" style={{ width: w(purposes.reserved) }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.2 }} />
            <motion.span className="s-com" style={{ width: w(cvf.committed) }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.45 }} />
            <motion.span className="s-flex" style={{ width: w(Math.max(0, cvf.flexible)) }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 0.7 }} />
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--marigold)' }} />Reserved for purposes <b className="num">{fmtINR(purposes.reserved)}</b></span>
            <span><i style={{ background: 'var(--blue)' }} />Committed until {fmtDate(cvf.horizonEnd)} <b className="num">{fmtINR(cvf.committed)}</b></span>
            <span><i style={{ background: 'var(--green)' }} />Flexible <b className="num">{fmtINR(cvf.flexible)}</b></span>
          </div>
          <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
            <a href="#/accounts" className="btn secondary sm">Balance sheet · net {fmtINR(d.netPosition)}</a>
            <a href="#/forecast" className="btn secondary sm">Forecast</a>
            <a href="#/cfo" className="btn sm">Ask the AI CFO</a>
          </div>
        </div>
      </Section>

      {attention.length > 0 && (
        <Section>
          <div className="section-head"><h2>Needs you</h2><a href="#/notifications">All notifications</a></div>
          <div className="stack-sm">
            {attention.slice(0, 4).map((a, i) => (
              <a key={i} href={a.to} className="card press row" style={{ padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                <span className="badge blue">{a.badge}</span><span style={{ flex: 1 }}>{a.text}</span><span className="muted">›</span>
              </a>))}
          </div>
        </Section>
      )}

      <Section>
        <div className="grid-3" style={{ marginTop: 14 }}>
          <a href="#/owe" className="card press" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="stat"><span className="label">Split-Bill Memory</span><span className="mid"><span className="pos">{fmtINR(d.totalOthersOwe)}</span> <span className="tiny muted">owed to you</span></span><span className="small sub">You owe {fmtINR(d.totalYouOwe)} · {d.peerBalances.length} people</span></div>
          </a>
          <a href="#/calendar" className="card press" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="stat"><span className="label">Lowest projected balance</span><span className={`mid ${d.calendar.lowest.balance < 0 ? 'neg' : ''}`}>{fmtINR(d.calendar.lowest.balance)}</span><span className="small sub">on {fmtDate(d.calendar.lowest.date)} · {d.calendar.enoughAtMonthEnd ? (d.calendar.laterDip ? 'enough at month end, dips later' : 'enough at month end') : 'short at month end'}</span></div>
          </a>
          <a href="#/health" className="card press" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="stat"><span className="label">Student Money Health</span><span className="mid">{d.score.score}<span className="tiny muted"> /100</span></span><span className="small sub">{d.scoreChange.delta > 0 ? '▲' : d.scoreChange.delta < 0 ? '▼' : '•'} {Math.abs(d.scoreChange.delta)} since last week · not a credit score</span></div>
          </a>
        </div>
      </Section>

      <Section>
        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="card">
            <div className="section-head"><h2>Bro, where did my money go?</h2><a href="#/spending">Details</a></div>
            <div className="mid" style={{ margin: '6px 0 10px' }}>{fmtINR(d.summary.total)} <span className="tiny muted">this month</span></div>
            <div className="stack-sm">
              {d.summary.rows.slice(0, 4).map((r) => (
                <div key={r.category} className="row between small"><span>{r.label}</span><span className="num"><b>{fmtINR(r.total)}</b>{r.change !== null && <span className={`tiny ${r.change > 0 ? 'neg' : 'pos'}`} style={{ marginLeft: 6 }}>{r.change > 0 ? '+' : ''}{r.change}%</span>}</span></div>))}
            </div>
            {d.summary.insights[0] && <p className="small sub" style={{ marginTop: 10 }}>{d.summary.insights[0]}</p>}
          </div>
          <div className="card">
            <div className="section-head"><h2>Financial intelligence</h2><a href="#/patterns">Patterns</a></div>
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {d.patterns.patterns.slice(0, 2).map((p) => <p key={p.id} className="small">{p.text}</p>)}
              <p className="small">{d.micro.count} purchases under ₹{d.micro.threshold} this month add up to {fmtINR(d.micro.total)}. <a href="#/micro">The ₹100 Problem</a></p>
              {d.why.diff > 0 && <p className="small">Spending is {fmtINR(d.why.diff)} above your 3-month average. <a href="#/spending">Why?</a></p>}
            </div>
          </div>
        </div>
      </Section>

      <Reveal>
        <div className="section-head" style={{ marginTop: 18 }}><h2>Financial journal</h2><a href="#/journal">See all</a></div>
        <div className="card list" style={{ padding: '4px 12px' }}>
          {state.transactions.slice(0, 6).map((t) => <TxRow key={t.id} tx={t} />)}
        </div>
      </Reveal>

      <Reveal>
        <div className="section-head" style={{ marginTop: 18 }}><h2>Student tools</h2></div>
        <div className="tiles">
          <a className="tile" href="#/goals">{I.goals}<b>Goals</b><span>{state.goals.length} goals · {fmtINR(state.goals.reduce((a, g) => a + g.saved, 0))} saved</span></a>
          <a className="tile" href="#/allowance">{I.allowance}<b>Allowance Survival Mode</b><span>{fmtINR(d.allowanceState.dailySafe)}/day safe</span></a>
          <a className="tile" href="#/emergency">{I.emergency}<b>Emergency liquidity</b><span>{state.emergencyRequests.filter((r) => r.status === 'open' && r.requesterId !== 'self' && !r.ignored).length} peer requests</span></a>
          <a className="tile" href="#/streaks">{I.streaks}<b>Streaks</b><span>{d.streaks[0].label}</span></a>
          <a className="tile" href="#/settle">{I.settle}<b>Settlement</b><span>Fewest payments per group</span></a>
          <a className="tile" href="#/accounts">{I.accounts}<b>Accounts</b><span>{state.accounts.filter((a) => a.connected).length} connected</span></a>
        </div>
      </Reveal>
    </Page>
  );
}

function NoAccounts({ state }) {
  return (
    <Page title={`Good ${greeting()}, ${state.user.name.split(' ')[0]}.`} lead="MILO has nothing to show yet, and it will not invent anything. Connect a source and the journal, forecast and AI CFO fill in from your real data.">
      <Section>
        <div className="hero empty-hero">
          <div className="grid-3">
            <div className="card flat"><b>Connect a bank</b><div className="small sub">Through the RBI Account Aggregator framework, with your explicit consent.</div></div>
            <div className="card flat"><b>Connect a broker</b><div className="small sub">Demat holdings and funds from Zerodha or Upstox.</div></div>
            <div className="card flat"><b>Or try demo data</b><div className="small sub">A clearly-labelled sample student, removable in one click.</div></div>
          </div>
          <div className="row wrap" style={{ marginTop: 16, gap: 8 }}><a className="btn" href="#/accounts">{I.accounts} Connect an account</a><a className="btn secondary" href="#/owe">Split a bill with friends</a></div>
        </div>
      </Section>
      <Section>
        <div className="section-head" style={{ marginTop: 18 }}><h2>Works without bank data</h2></div>
        <div className="tiles">
          <a className="tile" href="#/owe">{I.split}<b>Split-Bill Memory</b><span>Splits and IOUs with verified MILO users</span></a>
          <a className="tile" href="#/goals">{I.goals}<b>Goals</b><span>Targets and daily plans</span></a>
          <a className="tile" href="#/emergency">{I.emergency}<b>Emergency liquidity</b><span>Peer help, no interest</span></a>
        </div>
      </Section>
    </Page>
  );
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
