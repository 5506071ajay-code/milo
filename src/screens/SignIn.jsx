import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Auth, IS_NATIVE, getServerUrl, setServerUrl } from '../api.js';
import { openGoogleNative, onDeepLink } from '../native.js';
import { useEffect } from 'react';
import { Field, I, stagger, rise } from '../components/ui.jsx';

const ERRORS = { google_not_configured: 'Google sign-in is not configured on this server yet.', invalid_state: 'The sign-in link expired. Try again.', email_not_verified: 'Your Google account email is not verified.', auth_failed: 'Google sign-in failed. Try again.', access_denied: 'You cancelled the Google sign-in.', session_expired: 'Your session ended. Sign in again to continue.', callback_unauthorized: 'That connection link did not belong to your session.' };

export default function SignIn() {
  const { auth, actions, refreshAuth } = useStore();
  const { route } = useRouter();
  const [server, setServer] = useState(getServerUrl());
  const [serverErr, setServerErr] = useState(''); const [checking, setChecking] = useState(false);
  const [nativeMsg, setNativeMsg] = useState('');
  useEffect(() => onDeepLink((r) => { if (r.error) setNativeMsg(ERRORS[r.error] || r.error); else { setNativeMsg(''); refreshAuth(); window.location.hash = sessionStorage.getItem('milo:firstRun') ? '#/welcome' : '#/home'; } }), [refreshAuth]);
  const saveServer = async (e) => {
    e.preventDefault(); setServerErr(''); setChecking(true);
    let u = server.trim(); if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
    try { const cfg = await Auth.ping(u); if (typeof cfg.googleConfigured !== 'boolean') throw new Error('not MILO'); setServerUrl(u); setServer(u); await refreshAuth(); }
    catch { setServerErr('No MILO server answered at that address. Check the URL (e.g. https://milo.yourcollege.edu) and that it is online.'); }
    finally { setChecking(false); }
  };
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const errCode = route.params.error || auth.error;
  const cfg = auth.config || {};
  const dev = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { await actions.devLogin(email.trim(), name.trim()); window.location.hash = '#/home'; } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <div className="auth">
      <motion.div className="auth-card" initial="hidden" animate="show" variants={stagger}>
        <motion.div variants={rise} className="row" style={{ gap: 12 }}><span className="brand-mark lg" aria-hidden="true" /><div><div className="brand-word">MILO</div><div className="tiny muted">Student financial identity</div></div></motion.div>
        <motion.h1 variants={rise} style={{ marginTop: 28 }}>One identity above all your accounts.</motion.h1>
        <motion.p variants={rise} className="lead">Your Google account is your MILO account. No passwords to invent, nothing to remember, nothing stored that a bank should keep.</motion.p>
        {errCode && <motion.div variants={rise} className="notice rose" role="alert">{ERRORS[errCode] || 'Sign-in problem: ' + errCode}</motion.div>}
        {route.params.invite && <motion.div variants={rise} className="notice blue">You were invited to MILO. Sign in with the invited email and the invitation links automatically.</motion.div>}
        {IS_NATIVE && (
          <motion.form variants={rise} onSubmit={saveServer} className="card flat stack-sm" style={{ marginTop: 16 }}>
            <div className="row between"><b className="small">MILO server</b>{getServerUrl() ? <span className="badge green">Connected</span> : <span className="badge marigold">Not set</span>}</div>
            <p className="tiny sub">This app talks to a MILO server run by your college or team. Enter its address once; it is remembered on this phone.</p>
            <div className="row"><input className="input" inputMode="url" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://milo.example.com" aria-label="MILO server URL" /><button className="btn secondary sm" type="submit" disabled={checking || !server.trim()}>{checking ? 'Checking…' : 'Use'}</button></div>
            {serverErr && <span className="small" style={{ color: 'var(--rose)' }} role="alert">{serverErr}</span>}
          </motion.form>
        )}
        {nativeMsg && <motion.div variants={rise} className="notice rose" role="alert">{nativeMsg}</motion.div>}
        <motion.div variants={rise} style={{ marginTop: 18 }}>
          {IS_NATIVE && !getServerUrl() ? (
            <div className="card flat small"><b>Set the server address above to sign in.</b><div className="tiny sub" style={{ marginTop: 4 }}>Nothing on this phone is fake: MILO shows only what your server and your consents provide.</div></div>
          ) : cfg.googleConfigured ? (
            IS_NATIVE ? <button className="btn google block" onClick={openGoogleNative}><GoogleMark /> Continue with Google</button> : <a className="btn google block" href={Auth.googleUrl()}><GoogleMark /> Continue with Google</a>
          ) : (
            <div className="card flat small"><b>Google sign-in is not configured on this server.</b><div className="tiny sub" style={{ marginTop: 4 }}>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (OAuth client with redirect URI <code>{cfg.publicUrl}/auth/google/callback</code>) and restart.</div></div>
          )}
        </motion.div>
        {cfg.devMode && (
          <motion.form variants={rise} onSubmit={dev} className="card flat stack-sm" style={{ marginTop: 16 }}>
            <div className="row between"><b className="small">Developer sign-in</b><span className="badge marigold">Local only</span></div>
            <p className="tiny sub">Same account model as Google sign-in, without Google. Available only because <code>MILO_AUTH_DEV_MODE=true</code>; never in production.</p>
            <div className="grid-2">
              <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" /></Field>
              <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
            </div>
            {err && <span className="small" style={{ color: 'var(--rose)' }} role="alert">{err}</span>}
            <button className="btn secondary" type="submit" disabled={busy || !email}>{busy ? 'Signing in…' : 'Sign in as developer'}</button>
          </motion.form>
        )}
        <motion.ul variants={rise} className="auth-points">
          <li>{I.shield} Bank and broker access only through authorised providers, after your explicit consent.</li>
          <li>{I.check} No banking passwords, OTPs, PINs or card numbers ever touch MILO.</li>
          <li>{I.split} Splits and IOUs only with verified MILO users, never a typed name.</li>
        </motion.ul>
      </motion.div>
      <div className="auth-art" aria-hidden="true"><div className="orb a" /><div className="orb b" /><div className="orb c" /></div>
    </div>
  );
}

function GoogleMark() { return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 7.2-9.9 7.2-16.9z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.3-5.7c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>; }
