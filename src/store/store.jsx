import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Auth, Data, onUnauthorized, ApiError, IS_NATIVE, getServerUrl, setToken } from '../api.js';
import { initNative } from '../native.js';
import { derive } from './derive.js';
import { detectInternalTransfers } from '../engines/categorise.js';
import { inferPurpose } from '../engines/purpose.js';
import { computeScore } from '../engines/score.js';
import { addDays, daysBetween, round2, uid } from '../engines/utils.js';

const StoreCtx = createContext(null);
const INCOME_CATS = ['parent_allowance', 'scholarship', 'internship', 'income'];
const EMPTY_ALLOWANCE = { amount: 0, buckets: [] };

/** Assemble the flat state the engines/screens use from server slices + the user's own document. */
function assemble(me, slices, doc) {
  const accounts = slices.accounts.map((a) => ({ ...a, connected: true, lastSync: a.balanceAsOf }));
  const overrides = doc.txOverrides || {};
  const server = slices.transactions.map((t) => {
    const base = { id: t.id, date: t.date, amount: t.amount, direction: t.direction, merchant: t.merchant || '', descriptor: t.descriptor || '', channel: t.channel || 'bank', accountId: t.accountId, connectionId: t.connectionId, source: t.source, demo: t.demo, category: t.category, meaning: t.meaning, purpose: t.purpose, purposeAllocations: t.raw?.purposeAllocations || null, internalTransfer: !!t.raw?.internalTransfer || t.category === 'internal_transfer', counterpartAccountId: t.counterpartAccountExternalId || null };
    return { ...base, ...(overrides[t.id] || {}) };
  });
  const manual = (doc.manualTransactions || []).map((t) => ({ ...t, ...(overrides[t.id] || {}), manual: true, source: t.source || 'Manual' }));
  let transactions = [...manual, ...server].sort((a, b) => new Date(b.date) - new Date(a.date));
  transactions = detectInternalTransfers(transactions, accounts);
  for (const t of transactions) {
    if (t.category === 'internal_transfer') t.internalTransfer = true;
    if (!t.userCorrected) {
      t.needsReview = !t.internalTransfer && t.direction === 'out' && !t.category && !t.excluded;
      t.needsPurpose = t.direction === 'in' && !t.internalTransfer && INCOME_CATS.includes(t.category) && Math.abs(t.amount) >= 5000 && !(t.purposeAllocations?.length);
      if (t.splitPrompt == null) t.splitPrompt = t.direction === 'out' && ['dining', 'food_delivery', 'entertainment', 'travel'].includes(t.category) && Math.abs(t.amount) >= 1500 && !t.splitId;
    }
    if (t.upiUnknown == null) t.upiUnknown = t.needsReview;
  }
  const contacts = slices.contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, picture: c.picture, friend: true, college: c.collegeDomain === me.collegeDomain, helper: true }));
  const obligations = slices.obligations.map((o) => ({ ...o, contactName: o.contact?.name }));
  const groupNames = [...new Set(obligations.map((o) => o.groupId).filter(Boolean))];
  const groups = groupNames.map((g) => ({ id: g, name: g, type: 'group', active: true, memberIds: ['self', ...new Set(obligations.filter((o) => o.groupId === g).map((o) => o.contactId))] }));
  const splits = slices.splits.map((s) => ({ ...s, shares: s.shares.map((sh) => ({ ...sh, id: sh.userId, isSelf: sh.userId === me.id })) }));
  const emergencyRequests = [...slices.emergency.mine, ...slices.emergency.network].map((r) => ({ ...r, requesterId: r.mine ? 'self' : r.requesterId, requesterName: r.requester?.name }));
  return {
    user: { ...me, college: me.collegeDomain ? `@${me.collegeDomain}` : null, verified: true, helperOptIn: me.helperOptIn },
    accounts, transactions, contacts, groups, splits, obligations, groupDebts: [], emergencyRequests, emergencyMeta: { networkSize: slices.emergency.networkSize, collegeDomain: slices.emergency.collegeDomain },
    connections: slices.connections, providers: slices.providers, serverNotifications: slices.notifications, invites: slices.invites,
    commitments: doc.commitments || [], goals: doc.goals || [], subscriptions: doc.subscriptions || [], allowance: doc.allowance || EMPTY_ALLOWANCE, allowanceSet: !!doc.allowance,
    merchantMemory: doc.merchantMemory || {}, purposeMemory: doc.purposeMemory || {}, peerCorrections: doc.peerCorrections || [], reminders: doc.reminders || [], scoreHistory: doc.scoreHistory || [],
    notificationsRead: doc.notificationsRead || [], settings: doc.settings || {}, permissions: { cfoAccounts: true, cfoInvestments: true, cfoLoans: true, cfoPeers: true, cfoGoals: true, cfoCommitments: true, cfoDocuments: false, ...(doc.permissions || {}) },
    onboarded: !!doc.onboarded, hasDemo: slices.connections.some((c) => c.demo && c.status === 'connected'), hasRealData: slices.accounts.some((a) => !a.demo), txOverrides: overrides,
  };
}

/** Pull the document-owned parts back out of the flat state. */
function toDoc(state) {
  return { goals: state.goals, commitments: state.commitments, subscriptions: state.subscriptions, allowance: state.allowanceSet ? state.allowance : null, manualTransactions: state.transactions.filter((t) => t.manual).map(({ needsReview, needsPurpose, splitPrompt, upiUnknown, ...t }) => t), txOverrides: state.txOverrides, merchantMemory: state.merchantMemory, purposeMemory: state.purposeMemory, peerCorrections: state.peerCorrections, reminders: state.reminders, scoreHistory: state.scoreHistory, notificationsRead: state.notificationsRead, settings: state.settings, permissions: state.permissions, onboarded: state.onboarded };
}

function reducer(state, action) {
  const p = action.payload; const over = (id, patch) => ({ ...state.txOverrides, [id]: { ...(state.txOverrides[id] || {}), ...patch } });
  const applyTx = (id, patch) => state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t));
  switch (action.type) {
    case 'correctTransaction': {
      const tx = state.transactions.find((t) => t.id === p.id); if (!tx) return state;
      const patch = { ...p.patch, needsReview: false, userCorrected: true, upiUnknown: false };
      let { merchantMemory, peerCorrections, purposeMemory } = state;
      if (p.patch.category && tx.merchant && tx.category !== 'peer' && !tx.contactId) merchantMemory = { ...merchantMemory, [tx.merchant.toLowerCase()]: { category: p.patch.category, label: p.patch.meaning || p.patch.category, ambiguous: false, userCorrected: true, learnedAt: new Date().toISOString() } };
      if (p.patch.peerMeaning && tx.contactId) peerCorrections = [...peerCorrections, { contactId: tx.contactId, amount: Math.abs(tx.amount), meaning: p.patch.peerMeaning, at: new Date().toISOString() }];
      if (p.patch.purpose && tx.direction === 'in' && tx.merchant) purposeMemory = { ...purposeMemory, [tx.merchant.toLowerCase()]: { purpose: p.patch.purpose } };
      return { ...state, transactions: applyTx(p.id, patch), txOverrides: over(p.id, patch), merchantMemory, peerCorrections, purposeMemory };
    }
    case 'allocatePurpose': {
      const tx = state.transactions.find((t) => t.id === p.id); if (!tx) return state;
      const patch = { purposeAllocations: p.allocations, needsPurpose: false, purposeCorrected: p.corrected || false };
      const main = [...p.allocations].sort((a, b) => b.amount - a.amount)[0];
      const purposeMemory = tx.merchant && main ? { ...state.purposeMemory, [tx.merchant.toLowerCase()]: { purpose: main.purpose } } : state.purposeMemory;
      return { ...state, transactions: applyTx(p.id, patch), txOverrides: over(p.id, patch), purposeMemory };
    }
    case 'dismissSplitPrompt': return { ...state, transactions: applyTx(p.id, { splitPrompt: false }), txOverrides: over(p.id, { splitPrompt: false }) };
    case 'linkSplit': { const patch = { splitId: p.splitId, userExpense: p.userExpense, recoverable: p.recoverable, splitPrompt: false }; return { ...state, transactions: applyTx(p.txId, patch), txOverrides: over(p.txId, patch) }; }
    case 'addManual': {
      const tx = { id: uid('mtx'), date: p.date || new Date().toISOString(), amount: p.amount, direction: 'out', merchant: p.merchant, descriptor: 'Cash', category: p.category || 'cash', meaning: p.note || p.merchant, channel: 'cash', accountId: 'cash', source: 'Manual (cash)', manual: true, purpose: 'monthly_living' };
      return { ...state, transactions: [tx, ...state.transactions] };
    }
    case 'addCommitment': return { ...state, commitments: [...state.commitments, { id: uid('cm'), source: 'commitment', ...p }] };
    case 'updateCommitment': return { ...state, commitments: state.commitments.map((c) => (c.id === p.id ? { ...c, ...p.patch } : c)) };
    case 'removeCommitment': return { ...state, commitments: state.commitments.filter((c) => c.id !== p.id) };
    case 'addGoal': return { ...state, goals: [...state.goals, { id: uid('g'), saved: 0, createdAt: new Date().toISOString(), ...p }] };
    case 'selectGoal': return { ...state, goals: state.goals.map((g) => ({ ...g, selected: g.id === p.id })) };
    case 'goalMoney': {
      const goal = state.goals.find((g) => g.id === p.id); if (!goal) return state;
      const goals = state.goals.map((g) => (g.id === p.id ? { ...g, saved: round2(Math.max(0, g.saved + p.amount)) } : g));
      const tx = { id: uid('mtx'), date: new Date().toISOString(), amount: Math.abs(p.amount), direction: p.amount > 0 ? 'out' : 'in', merchant: `${goal.name} goal`, descriptor: 'Goal pocket', category: 'internal_transfer', internalTransfer: true, channel: 'bank', accountId: 'goal', goalId: goal.id, meaning: p.amount > 0 ? 'Set aside for goal' : 'Released from goal', source: 'Goal', manual: true };
      return { ...state, goals, transactions: [tx, ...state.transactions] };
    }
    case 'setPermission': return { ...state, permissions: { ...state.permissions, [p.key]: p.value } };
    case 'resolveDuplicate': {
      const [a, b] = p.ids; let overrides = state.txOverrides;
      const transactions = state.transactions.map((t) => {
        if (t.id !== a && t.id !== b) return t;
        const patch = { dupResolution: p.resolution, dupPairId: p.pairId };
        if (p.resolution === 'duplicate' && t.id === b) patch.excluded = true;
        if (p.resolution === 'refund') { patch.linkedTxId = t.id === a ? b : a; if (t.direction === 'in') patch.category = 'refund'; }
        overrides = { ...overrides, [t.id]: { ...(overrides[t.id] || {}), ...patch } };
        return { ...t, ...patch };
      });
      return { ...state, transactions, txOverrides: overrides };
    }
    case 'logReminder': return { ...state, reminders: [...state.reminders, { id: uid('rem'), obligationId: p.obligationId, contactId: p.contactId, at: new Date().toISOString(), auto: !!p.auto, channel: 'in-app' }] };
    case 'setAllowance': return { ...state, allowance: p, allowanceSet: true };
    case 'cancelSubscription': return { ...state, subscriptions: state.subscriptions.map((s) => (s.id === p.id ? { ...s, status: 'cancelled', cancelledAt: new Date().toISOString() } : s)) };
    case 'markRead': return { ...state, notificationsRead: [...new Set([...state.notificationsRead, ...p.ids])] };
    case 'snapshotScore': return { ...state, scoreHistory: [...state.scoreHistory.slice(-11), p] };
    case 'setSetting': return { ...state, settings: { ...state.settings, [p.key]: p.value } };
    case 'setOnboarded': return { ...state, onboarded: true };
    default: return state;
  }
}

export function StoreProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'loading', user: null, config: null, error: null });
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const version = useRef(0); const dirty = useRef(false); const timer = useRef(null); const stateRef = useRef(null); const userRef = useRef(null);
  stateRef.current = state;

  const loadAll = useCallback(async (me) => {
    setLoading(true); setLoadError(null);
    try {
      const [prov, conns, accs, txs, doc, obs, spl, cts, ntf, em, inv] = await Promise.all([Data.providers(), Data.connections(), Data.accounts(), Data.transactions(), Data.state(), Data.obligations(), Data.splits(), Data.contacts(), Data.notifications(), Data.emergency(), Data.invites()]);
      version.current = doc.version;
      setState(assemble(me, { providers: prov.providers, connections: conns.connections, accounts: accs.accounts, transactions: txs.transactions, obligations: obs.obligations, splits: spl.splits, contacts: cts.contacts, notifications: ntf.notifications, emergency: em, invites: inv.invites }, doc.doc));
    } catch (e) { setLoadError(e.message); }
    finally { setLoading(false); }
  }, []);

  const refreshAuth = useCallback(async () => {
    if (IS_NATIVE && !getServerUrl()) { setAuth({ status: 'anon', user: null, config: { googleConfigured: false, devMode: false, noServer: true }, error: null }); return; }
    try {
      const config = await Auth.config();
      try { const me = await Auth.me(); userRef.current = me.user; setAuth({ status: 'authed', user: me.user, config, sessions: me.sessions, error: null }); await loadAll(me.user); }
      catch (e) { if (e instanceof ApiError && e.status === 401) setAuth({ status: 'anon', user: null, config, error: null }); else throw e; }
    } catch (e) { setAuth({ status: 'error', user: null, config: null, error: e.message }); }
  }, [loadAll]);

  useEffect(() => { initNative().then(refreshAuth); }, [refreshAuth]);
  useEffect(() => onUnauthorized(() => setAuth((a) => (a.status === 'authed' ? { ...a, status: 'anon', user: null, error: 'session_expired' } : a))), []);

  const persist = useCallback(async () => {
    const s = stateRef.current; if (!s || !dirty.current) return; dirty.current = false;
    try { const r = await Data.putState(toDoc(s), version.current); version.current = r.version; }
    catch (e) { if (e instanceof ApiError && e.status === 409) await loadAll(userRef.current); else { console.error('persist failed', e.message); dirty.current = true; } }
  }, [loadAll]);
  const dispatch = useCallback((action) => {
    setState((s) => { if (!s) return s; const n = reducer(s, action); if (n !== s) { dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(persist, 500); } return n; });
  }, [persist]);
  useEffect(() => { const h = () => { if (dirty.current) { clearTimeout(timer.current); persist(); } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [persist]);

  const d = useMemo(() => (state ? derive(state) : null), [state]);

  const booted = useRef(false);
  useEffect(() => {
    if (!state || !d || booted.current) return; booted.current = true;
    const nowD = new Date();
    const last = state.scoreHistory[state.scoreHistory.length - 1];
    if (state.accounts.length && (!last || daysBetween(last.at, nowD) >= 7)) {
      const sc = computeScore({ transactions: state.transactions.filter((t) => !t.excluded), bankBalance: d.bankBalance, commitments: state.commitments, goals: state.goals, subscriptions: state.subscriptions, allowance: state.allowance }, addDays(nowD, -7));
      dispatch({ type: 'snapshotScore', payload: { ...sc, at: addDays(nowD, -7).toISOString() } });
    }
    for (const o of state.obligations) {
      if (o.direction !== 'they_owe' || o.remaining <= 0.005) continue;
      const lastRem = state.reminders.filter((r) => r.obligationId === o.id).slice(-1)[0];
      if (daysBetween(lastRem ? lastRem.at : o.createdAt, nowD) >= (state.settings.reminderEveryDays || 7)) Data.remind(o.id).then(() => dispatch({ type: 'logReminder', payload: { obligationId: o.id, contactId: o.contactId, auto: true } })).catch(() => {});
    }
  }, [state, d, dispatch]);

  const reload = useCallback(async () => { clearTimeout(timer.current); await persist(); if (userRef.current) await loadAll(userRef.current); }, [loadAll, persist]);
  const actions = useMemo(() => ({
    async logout() { clearTimeout(timer.current); await persist(); try { await Auth.logout(); } catch { /* already gone */ } setToken(null); userRef.current = null; setState(null); setAuth((a) => ({ ...a, status: 'anon', user: null, error: null })); booted.current = false; },
    async devLogin(email, name) { const r = await Auth.devLogin(email, name); if (r.token) setToken(r.token); booted.current = false; await refreshAuth(); return r; },
    async connect(providerId, inputs) { const r = await Data.connect(providerId, inputs); if (r.redirectUrl) { window.location.href = r.redirectUrl; return r; } await reload(); return r; },
    async sync(id) { const r = await Data.sync(id); await reload(); return r; },
    async disconnect(id) { await Data.disconnect(id); await reload(); },
    async createSplit(body) { const r = await Data.createSplit(body); if (body.sourceTxId) dispatch({ type: 'linkSplit', payload: { txId: body.sourceTxId, splitId: r.split.id, userExpense: r.split.userExpense, recoverable: r.split.recoverable } }); await reload(); return r; },
    async createObligation(body) { const r = await Data.createObligation(body); await reload(); return r; },
    async pay(id, amount) { await Data.pay(id, amount); await reload(); },
    async remind(id, contactId) { await Data.remind(id); dispatch({ type: 'logReminder', payload: { obligationId: id, contactId } }); },
    async settleGroup(name) { await Data.settleGroup(name); await reload(); },
    async createRequest(body) { await Data.createRequest(body); await reload(); },
    async contribute(id, amount) { await Data.contribute(id, amount); await reload(); },
    async ignoreRequest(id) { await Data.ignoreRequest(id); await reload(); },
    async closeRequest(id) { await Data.closeRequest(id); await reload(); },
    async setHelper(v) { await Data.setHelper(v); await refreshAuth(); },
    async markServerRead(ids, all) { await Data.markRead(ids, all); await reload(); },
    invite: (email, context) => Data.invite(email, context),
    searchUsers: (q) => Data.searchUsers(q),
  }), [persist, refreshAuth, reload, dispatch]);

  const value = useMemo(() => ({ auth, state, d, dispatch, actions, reload, loading, loadError, refreshAuth }), [auth, state, d, dispatch, actions, reload, loading, loadError, refreshAuth]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() { return useContext(StoreCtx); }
export { inferPurpose };
