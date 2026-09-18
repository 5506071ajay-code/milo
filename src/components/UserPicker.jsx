import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { useToast, I } from './ui.jsx';

/**
 * Verified-user picker. A typed name is never enough: the person must be a registered MILO
 * account. States: idle → searching → one match / several matches / none (+ invite by email).
 */
export function UserPicker({ selected = [], onChange, single = false, exclude = [], placeholder = 'Search by name or email…', context }) {
  const { actions, state } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null); // { matches, canInvite, pendingInvite }
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const t = useRef(null);
  useEffect(() => {
    clearTimeout(t.current); setInviteLink(null);
    if (q.trim().length < 2) { setRes(null); return; }
    setBusy(true);
    t.current = setTimeout(async () => { try { setRes(await actions.searchUsers(q.trim())); } catch (e) { toast(e.message, 'rose'); } finally { setBusy(false); } }, 250);
    return () => clearTimeout(t.current);
  }, [q]); // eslint-disable-line
  const pick = (u) => { if (single) onChange([u]); else if (!selected.some((s) => s.id === u.id)) onChange([...selected, u]); setQ(''); setRes(null); };
  const remove = (id) => onChange(selected.filter((s) => s.id !== id));
  const invite = async () => { setInviting(true); try { const r = await actions.invite(q.trim().toLowerCase(), context); setInviteLink(r.invite.link || 'sent'); toast(r.emailSent ? 'Invitation emailed.' : 'Invitation created. Share the link below.', 'green'); } catch (e) { toast(e.message, 'rose'); } finally { setInviting(false); } };
  const recent = state.contacts.filter((c) => !selected.some((s) => s.id === c.id) && !exclude.includes(c.id));
  const matches = (res?.matches || []).filter((u) => !exclude.includes(u.id));

  return (
    <div className="picker">
      {selected.length > 0 && <div className="chips" style={{ marginBottom: 8 }}>{selected.map((u) => <span key={u.id} className="chip active" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Avatar u={u} size={18} />{u.name}<button type="button" aria-label={`Remove ${u.name}`} onClick={() => remove(u.id)} style={{ background: 'none', border: 0, color: 'inherit', display: 'inline-flex', padding: 0, cursor: 'pointer' }}>{I.x}</button></span>)}</div>}
      <div className="row"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search registered MILO users" autoComplete="off" />{busy && <span className="spinner" aria-label="Searching" />}</div>
      <AnimatePresence initial={false}>
        {q.trim().length >= 2 && res && (
          <motion.div className="picker-results" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {matches.length === 1 && <div className="tiny muted" style={{ padding: '4px 6px' }}>Registered user found</div>}
            {matches.length > 1 && <div className="tiny muted" style={{ padding: '4px 6px' }}>{matches.length} possible matches: pick the right one</div>}
            {matches.map((u) => <button key={u.id} type="button" className="picker-row" onClick={() => pick(u)}><Avatar u={u} /><span><b>{u.name}</b><div className="tiny muted">{u.email}</div></span><span className="badge green">Verified</span></button>)}
            {matches.length === 0 && (
              <div className="card flat small" style={{ margin: 4 }}>
                <b>No registered MILO user matches “{q.trim()}”.</b>
                <div className="tiny sub" style={{ marginTop: 4 }}>Only people with a MILO account (Google sign-in) can be added, so balances always point at a real, verified person.</div>
                {res.canInvite && !inviteLink && <button type="button" className="btn secondary sm" style={{ marginTop: 8 }} onClick={invite} disabled={inviting}>{res.pendingInvite ? 'Invitation already pending · resend' : `Invite ${q.trim().toLowerCase()}`}</button>}
                {!res.canInvite && <div className="tiny muted" style={{ marginTop: 6 }}>Type their full email address to send an invitation.</div>}
                {inviteLink && <div className="notice green" style={{ marginTop: 8 }}><span>Invite created. {inviteLink !== 'sent' ? <>Share this link: <code style={{ wordBreak: 'break-all' }}>{inviteLink}</code></> : 'They will get an email.'} Once they sign in with Google you can add them.</span></div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {q.trim().length < 2 && recent.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          <span className="tiny muted" style={{ alignSelf: 'center' }}>People you have split with:</span>
          {recent.slice(0, 8).map((u) => <button key={u.id} type="button" className="chip" onClick={() => pick(u)}><Avatar u={u} size={16} /> {u.name}</button>)}
        </div>
      )}
    </div>
  );
}

export function Avatar({ u, size = 28 }) {
  const initial = (u?.name || '?').charAt(0).toUpperCase();
  return u?.picture ? <img src={u.picture} alt="" width={size} height={size} style={{ borderRadius: '50%', flex: 'none' }} referrerPolicy="no-referrer" /> : <span className="avatar peer" style={{ width: size, height: size, fontSize: size * 0.45 }}>{initial}</span>;
}
