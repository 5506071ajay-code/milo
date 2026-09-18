import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { useRouter } from '../components/router.jsx';
import { Page, Section, Modal, useToast, Money, I, Empty } from '../components/ui.jsx';
import { fmtINR, fmtDate, fmtTime } from '../engines/utils.js';

const STATUS = { connected: ['green', 'Connected'], pending: ['blue', 'Waiting for consent'], error: ['rose', 'Connection failed'], expired: ['marigold', 'Re-authorisation needed'], disconnected: ['', 'Disconnected'] };
const TYPE_LABELS = { savings: 'Savings', current: 'Current', credit_card: 'Credit card', deposit: 'Fixed deposit', loan: 'Loan', demat: 'Demat', mutual_fund: 'Mutual funds', broker_cash: 'Broker cash', insurance: 'Insurance', pension: 'NPS', other: 'Account' };

export default function Accounts() {
  const { state, d, actions } = useStore();
  const { route } = useRouter();
  const toast = useToast();
  const [consent, setConsent] = useState(null); // provider being consented to
  const [agree, setAgree] = useState(false);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(route.params.error ? decodeURIComponent(route.params.error) : '');
  const connect = async () => {
    if (!agree) { setError('Tick the consent box first. MILO will not request anything without it.'); return; }
    for (const f of consent.inputs || []) { const v = String(inputs[f.key] || '').trim(); if (!v || (f.pattern && !new RegExp(f.pattern).test(v))) { setError(`${f.label}: please enter a valid value.`); return; } }
    setBusy(consent.id); setError('');
    try { const r = await actions.connect(consent.id, inputs); if (!r.redirectUrl) { toast(`${consent.name} connected. ${r.synced.accounts} accounts, ${r.synced.transactionsAdded} transactions journaled.`, 'green'); setConsent(null); setAgree(false); } }
    catch (e) { setError(e.body?.message || e.message); }
    finally { setBusy(null); }
  };
  const sync = async (c) => { setBusy(c.id); try { const r = await actions.sync(c.id); toast(`Synced. ${r.synced.transactionsAdded} new transactions.`, 'green'); } catch (e) { toast(e.code === 'reauth_required' ? 'The provider session expired. Re-authorise to continue syncing.' : `Sync failed: ${e.body?.message || e.message}`, 'rose'); await actions.sync && null; } finally { setBusy(null); } };
  const disconnect = async (c) => { if (!window.confirm(`Disconnect ${c.label || c.provider}? Its accounts and transactions are removed from MILO and the provider consent is revoked.`)) return; setBusy(c.id); try { await actions.disconnect(c.id); toast('Disconnected and consent revoked.'); } catch (e) { toast(e.message, 'rose'); } finally { setBusy(null); } };

  const real = state.providers.filter((p) => !p.demo); const demo = state.providers.find((p) => p.demo);
  return (
    <Page title="Accounts & connections" lead="Every rupee shown in MILO traces back to a connection you approved. Nothing here is guessed." actions={<a className="btn secondary sm" href="#/welcome">How it works</a>}>
      <div className="stack">
        {state.accounts.length > 0 && (
          <Section>
            <div className="hero">
              <div className="grid-3">
                <div className="stat"><span className="label">Assets</span><Money value={d.totalAssets} className="mid pos" /></div>
                <div className="stat"><span className="label">Liabilities</span><Money value={d.totalLiabilities} className="mid neg" /></div>
                <div className="stat"><span className="label">Net position</span><Money value={d.netPosition} className="big" /></div>
              </div>
              {state.hasDemo && <div className="notice" style={{ marginTop: 12 }}><span><b>Includes demo data.</b> Figures from the demo sandbox are sample numbers, labelled DEMO, and are not your money.</span></div>}
            </div>
          </Section>
        )}
        {error && <Section><div className="notice rose" role="alert"><span style={{ flex: 1 }}>{error}</span><button className="btn ghost sm" onClick={() => setError('')}>{I.x}</button></div></Section>}

        <Section>
          <div className="section-head"><h2>Your connections</h2></div>
          {state.connections.length === 0 ? <Empty title="No connections yet">Pick a provider below. MILO shows you exactly what it will read before asking for consent.</Empty> : (
            <div className="stack-sm">
              {state.connections.map((c) => { const [tone, label] = STATUS[c.status] || ['', c.status]; const accs = state.accounts.filter((a) => a.connectionId === c.id); return (
                <motion.div key={c.id} className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
                    <div><div className="row" style={{ gap: 8 }}><b>{c.label || c.provider}</b><span className={`badge ${tone}`}>{label}</span>{c.demo && <span className="badge marigold">DEMO</span>}</div><div className="tiny muted" style={{ marginTop: 4 }}>{c.provider} · consented {fmtDate(c.consentGrantedAt)} · scopes: {c.consentScopes.join(', ')}{c.consentExpiresAt ? ` · consent valid till ${fmtDate(c.consentExpiresAt)}` : ''}</div>{c.lastSyncAt && <div className="tiny muted">Last synced {fmtDate(c.lastSyncAt)} {fmtTime(c.lastSyncAt)}</div>}{c.lastError && <div className="tiny" style={{ color: 'var(--rose)', marginTop: 4 }}>{c.lastError}</div>}</div>
                    <div className="row" style={{ gap: 6 }}>
                      {c.providerId === 'statement_import' && <a className="btn secondary sm" href={`#/import?append=${c.id}`}>{I.plus} Add statement</a>}
                      {['connected', 'error', 'expired'].includes(c.status) && c.providerId !== 'statement_import' && <button className="btn secondary sm" onClick={() => sync(c)} disabled={busy === c.id}><motion.span animate={busy === c.id ? { rotate: 360 } : { rotate: 0 }} transition={busy === c.id ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : {}} style={{ display: 'inline-flex' }}>{I.refresh}</motion.span> {c.status === 'expired' ? 'Re-authorise' : 'Sync'}</button>}
                      <button className="btn ghost sm" onClick={() => disconnect(c)} disabled={busy === c.id}>Disconnect</button>
                    </div>
                  </div>
                  {accs.length > 0 && <div className="list" style={{ marginTop: 10, borderTop: '1px solid var(--line)' }}>{accs.map((a) => <div key={a.id} className="list-row"><div className={`avatar ${a.kind === 'liability' ? 'out' : 'in'}`}>{(a.institution || a.name).charAt(0)}</div><div className="body"><div className="title">{a.name} <span className="tiny muted">{a.mask}</span></div><div className="meta"><span>{a.institution} · {TYPE_LABELS[a.type] || a.type}</span><span>balance as of {fmtDate(a.balanceAsOf)} {fmtTime(a.balanceAsOf)}</span>{a.meta?.limit && <span>limit {fmtINR(a.meta.limit)}</span>}</div></div><div className={`amt ${a.kind === 'liability' ? 'neg' : ''}`}>{a.kind === 'liability' ? '−' : ''}{fmtINR(a.balance)}</div></div>)}</div>}
                </motion.div>); })}
            </div>
          )}
        </Section>

        <Section>
          <div className="section-head"><h2>Connect a bank or broker</h2></div>
          <div className="grid-2">
            {real.map((p) => <ProviderCard key={p.id} p={p} onConnect={() => { if (p.id === 'statement_import') { window.location.hash = '#/import'; return; } setConsent(p); setAgree(false); setError(''); }} connected={state.connections.some((c) => c.providerId === p.id && c.status === 'connected')} />)}
          </div>
        </Section>
        {demo && (
          <Section>
            <div className="section-head"><h2>Try MILO with sample data</h2></div>
            <ProviderCard p={demo} onConnect={() => { setConsent(demo); setAgree(false); setError(''); }} connected={state.hasDemo} />
          </Section>
        )}
        <Section><p className="tiny muted">MILO never sees or stores your banking password, OTP, PIN or card CVV. Providers hand MILO a scoped token; it is encrypted at rest and deleted the moment you disconnect.</p></Section>
      </div>

      <Modal open={!!consent} onClose={() => { if (!busy) setConsent(null); }} title={consent ? `Consent: ${consent.name}` : ''} lead="Read what MILO will access. Nothing happens until you approve.">
        {consent && (
          <div className="stack-sm" style={{ marginTop: 12 }}>
            <div className="card flat small stack-sm">
              <div><b>Data MILO will read</b><ul style={{ margin: '4px 0 0 18px' }}>{consent.scopes.map((s) => <li key={s}>{s}</li>)}</ul></div>
              <div><b>Purpose</b><div className="sub">Continuous financial journal and unified view. Read-only. MILO cannot move money.</div></div>
              <div><b>Duration</b><div className="sub">{consent.demo ? 'Until you disconnect.' : 'Up to 12 months, or until you revoke it here or at the provider.'}</div></div>
              {consent.demo && <div className="notice"><span><b>This is sample data.</b> It will be marked DEMO on every screen and can be removed with one click.</span></div>}
              {!consent.demo && <div className="tiny muted">You will be sent to {consent.name.split(' (')[0]}'s own consent screen. MILO never sees the credentials you enter there.</div>}
            </div>
            {(consent.inputs || []).map((f) => <div key={f.key} className="field"><label>{f.label}</label><input className="input" inputMode="numeric" placeholder={f.placeholder} value={inputs[f.key] || ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />{f.hint && <span className="hint">{f.hint}</span>}</div>)}
            {consent.sandbox && <div className="notice blue"><span><b>Sandbox mode.</b> This server is connected to Setu's test environment: use the test mobile numbers and OTPs from Setu's sandbox documentation, not your real bank.</span></div>}
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I approve MILO reading this data</label>
            {error && <span className="small" style={{ color: 'var(--rose)' }} role="alert">{error}</span>}
            <div className="row"><button className="btn" onClick={connect} disabled={!!busy}>{busy ? 'Connecting…' : 'Approve and connect'}</button><button className="btn ghost" onClick={() => setConsent(null)} disabled={!!busy}>Cancel</button></div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

function ProviderCard({ p, onConnect, connected }) {
  return (
    <div className={`card provider ${p.available ? '' : 'muted-card'}`}>
      <div className="row between" style={{ alignItems: 'flex-start' }}><div><b>{p.name}</b><div className="tiny muted" style={{ marginTop: 2 }}>{p.id === 'statement_import' ? 'Any bank · no registration' : p.kind === 'bank' ? 'Banks · RBI Account Aggregator (registered companies only)' : p.kind === 'demat' ? 'Demat / broker' : 'Sample data'}</div></div>{connected ? <span className="badge green">Connected</span> : p.available ? <span className="badge blue">Available</span> : <span className="badge marigold">Not available</span>}</div>
      <p className="small sub" style={{ marginTop: 8 }}>{p.covers}</p>
      {p.available ? <button className="btn sm" style={{ marginTop: 10 }} onClick={onConnect} disabled={connected && p.demo}>{connected ? (p.demo ? 'Connected' : p.id === 'statement_import' ? 'Import another' : 'Connect another') : p.id === 'statement_import' ? 'Import' : 'Connect'}</button> : (
        <div className="card flat tiny" style={{ marginTop: 10 }}><b>Unavailable on this server.</b> {p.reason}{p.requiredEnv?.length ? <> Required configuration: <code>{p.requiredEnv.join(', ')}</code>.</> : null}{p.id === 'setu_aa' && <> Live bank data through the Account Aggregator is only granted to registered companies; individuals should import a statement instead.</>}</div>
      )}
    </div>
  );
}
