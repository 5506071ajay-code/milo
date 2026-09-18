import React from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { Page, Section, I } from '../components/ui.jsx';
import { Avatar } from '../components/UserPicker.jsx';

/** First-run onboarding: explain the consent model, then hand over to account connection. */
export default function Welcome() {
  const { state, dispatch, auth } = useStore();
  const steps = [
    ['1', 'Sign in with Google', 'Done. Your MILO profile was created from your Google identity.', true],
    ['2', 'Consent to a data source', 'Nothing is read until you approve a specific provider and its scopes. You can revoke any time.', state.connections.length > 0],
    ['3', 'MILO does the rest', 'Every transaction is journaled automatically, categorised, and turned into answers.', state.accounts.length > 0],
  ];
  return (
    <Page title={`Welcome, ${auth.user.name.split(' ')[0]}.`} lead="MILO is a layer above your accounts, not a bank. Here is exactly how your data gets in, and what never does.">
      <Section>
        <div className="card row" style={{ gap: 14 }}><Avatar u={auth.user} size={44} /><div><b>{auth.user.name}</b><div className="small muted">{auth.user.email} · signed in with Google</div></div><span className="badge green" style={{ marginLeft: 'auto' }}>Account ready</span></div>
      </Section>
      <Section>
        <div className="stack-sm" style={{ marginTop: 14 }}>
          {steps.map(([n, t, s, done], i) => <motion.div key={n} className="card row" style={{ gap: 14, alignItems: 'flex-start' }} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}><span className={`step ${done ? 'done' : ''}`}>{done ? I.check : n}</span><div><b>{t}</b><div className="small sub">{s}</div></div></motion.div>)}
        </div>
      </Section>
      <Section>
        <div className="card" style={{ marginTop: 14 }}>
          <b>What MILO never asks for</b>
          <ul className="small sub" style={{ margin: '6px 0 0 18px' }}><li>Net-banking passwords, OTPs, PINs or card CVVs</li><li>Access to accounts you did not explicitly approve</li><li>More scopes than a feature needs (balances and transactions only)</li></ul>
        </div>
        <div className="row wrap" style={{ marginTop: 16, gap: 8 }}>
          <a className="btn" href="#/accounts" onClick={() => dispatch({ type: 'setOnboarded' })}>{I.accounts} Connect an account</a>
          <a className="btn ghost" href="#/home" onClick={() => dispatch({ type: 'setOnboarded' })}>Look around first</a>
        </div>
      </Section>
    </Page>
  );
}
