import React, { useState } from 'react';
import { useStore } from '../store/store.jsx';
import { Page, Section, I, Modal, useToast } from '../components/ui.jsx';
import { fmtINR } from '../engines/utils.js';
import { Auth } from '../api.js';

export const TOOLS = [
  ['/accounts', 'accounts', 'Accounts & identity', 'Balance sheet, consents'],
  ['/purpose', 'purpose', 'Purpose-Based Money', 'What each rupee is for'],
  ['/forecast', 'forecast', 'Forecast', 'Committed vs flexible'],
  ['/calendar', 'calendar', 'Money Calendar', 'Dated inflows and outflows'],
  ['/emergency', 'emergency', 'Emergency liquidity', 'Peer help, no interest'],
  ['/allowance', 'allowance', 'Allowance Survival Mode', 'Daily safe amount'],
  ['/spending', 'spending', 'Where did my money go?', 'Analysis and why'],
  ['/micro', 'micro', 'The ₹100 Problem', 'Small purchases'],
  ['/goals', 'goals', 'Goals', 'Targets and daily plans'],
  ['/streaks', 'streaks', 'Streaks', 'Outcome streaks'],
  ['/health', 'health', 'Student Money Health', '0–100, not a credit score'],
  ['/patterns', 'patterns', 'Behavioural patterns', 'Non-judgemental'],
  ['/duplicates', 'dup', 'Duplicates', 'Same amount, two channels'],
  ['/settle', 'settle', 'Settlement', 'Fewest payments'],
  ['/notifications', 'bell', 'Notifications', 'Everything that needs you'],
];

export default function More() {
  const { state, d, actions, auth } = useStore();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <Page title="Everything" lead={`${state.user.name} · ${state.user.email} · signed in with ${auth.config?.googleConfigured ? 'Google' : 'developer sign-in'}`}>
      <Section>
        <div className="tiles">
          {TOOLS.map(([to, icon, label, sub]) => <a key={to} className="tile" href={'#' + to}>{I[icon]}<b>{label}</b><span>{sub}</span></a>)}
        </div>
      </Section>
      <Section>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-head"><h2>Data & privacy</h2></div>
          <p className="small sub">{state.transactions.length} journal entries from {state.connections.filter((c) => c.status === 'connected').length} connection{state.connections.length === 1 ? '' : 's'}{state.hasDemo ? ' (includes demo data)' : ''}. Net position {fmtINR(d.netPosition)}. Provider tokens are encrypted at rest; every access is written to your audit trail.</p>
          <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn secondary sm" onClick={() => { const blob = new Blob([JSON.stringify({ user: state.user, accounts: state.accounts, transactions: state.transactions, goals: state.goals, commitments: state.commitments, obligations: state.obligations }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'milo-export.json'; a.click(); toast('Exported.'); }}>Export my data</button>
            <a className="btn secondary sm" href="#/accounts">Manage connections</a>
            <button className="btn rose sm" onClick={() => setConfirm(true)}>Sign out</button>
          </div>
          <div className="tiny muted" style={{ marginTop: 10 }}>Active sessions: {(auth.sessions || []).length}. <button className="link" onClick={async () => { await Auth.logoutAll(); window.location.hash = '#/signin'; window.location.reload(); }}>Sign out everywhere</button></div>
        </div>
      </Section>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Sign out?" lead="Your data stays safely on the server. Sign in with Google again to pick up where you left off.">
        <div className="row" style={{ marginTop: 12 }}><button className="btn rose" onClick={async () => { await actions.logout(); window.location.hash = '#/signin'; }}>Sign out</button><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
      </Modal>
    </Page>
  );
}
