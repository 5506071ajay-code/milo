// Thin API client. Cookies carry the session; nothing secret lives in the browser.
export const IS_NATIVE = typeof window !== 'undefined' && (!!window.Capacitor?.isNativePlatform?.() || window.__MILO_NATIVE__ === true);
const KEY_BASE = 'milo:serverUrl'; const KEY_TOKEN = 'milo:token';
export function getServerUrl() { try { return (localStorage.getItem(KEY_BASE) || import.meta.env.VITE_API_BASE || '').replace(/\/$/, ''); } catch { return ''; } }
export function setServerUrl(u) { try { localStorage.setItem(KEY_BASE, u.replace(/\/$/, '')); } catch { /* ignore */ } }
export function getToken() { try { return localStorage.getItem(KEY_TOKEN); } catch { return null; } }
export function setToken(t) { try { if (t) localStorage.setItem(KEY_TOKEN, t); else localStorage.removeItem(KEY_TOKEN); } catch { /* ignore */ } }
export const API_BASE = getServerUrl();

export class ApiError extends Error {
  constructor(status, body) { super(body?.message || body?.error || `HTTP ${status}`); this.status = status; this.code = body?.error; this.body = body; }
}

const listeners = new Set();
export function onUnauthorized(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function api(path, { method = 'GET', body } = {}) {
  const base = IS_NATIVE ? getServerUrl() : API_BASE;
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  const tok = getToken(); if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`${base}${path}`, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (res.status === 401) { listeners.forEach((fn) => fn()); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const Auth = {
  config: () => api('/auth/config'),
  me: () => api('/api/me'),
  devLogin: (email, name) => api('/auth/dev-login', { method: 'POST', body: { email, name, native: IS_NATIVE } }),
  exchange: (code) => api('/auth/exchange', { method: 'POST', body: { code } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  ping: (base) => fetch(`${base.replace(/\/$/, '')}/auth/config`).then((r) => r.json()),
  logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
  googleUrl: () => `${IS_NATIVE ? getServerUrl() : API_BASE}/auth/google${IS_NATIVE ? '?platform=native' : ''}`,
};
export const Data = {
  providers: () => api('/api/providers'),
  connections: () => api('/api/connections'),
  connect: (providerId, inputs) => api('/api/connections', { method: 'POST', body: { providerId, consent: true, inputs } }),
  sync: (id) => api(`/api/connections/${id}/sync`, { method: 'POST' }),
  disconnect: (id) => api(`/api/connections/${id}`, { method: 'DELETE' }),
  accounts: () => api('/api/accounts'),
  transactions: () => api('/api/transactions'),
  state: () => api('/api/state'),
  putState: (doc, version) => api('/api/state', { method: 'PUT', body: { doc, version } }),
  searchUsers: (q) => api(`/api/users/search?q=${encodeURIComponent(q)}`),
  invite: (email, context) => api('/api/invites', { method: 'POST', body: { email, context } }),
  invites: () => api('/api/invites'),
  contacts: () => api('/api/contacts'),
  splits: () => api('/api/splits'),
  createSplit: (body) => api('/api/splits', { method: 'POST', body }),
  obligations: () => api('/api/obligations'),
  createObligation: (body) => api('/api/obligations', { method: 'POST', body }),
  pay: (id, amount) => api(`/api/obligations/${id}/payments`, { method: 'POST', body: { amount } }),
  remind: (id) => api(`/api/obligations/${id}/remind`, { method: 'POST' }),
  settleGroup: (groupName) => api('/api/obligations/settle-group', { method: 'POST', body: { groupName } }),
  notifications: () => api('/api/notifications'),
  markRead: (ids, all) => api('/api/notifications/read', { method: 'POST', body: { ids, all } }),
  emergency: () => api('/api/emergency'),
  createRequest: (body) => api('/api/emergency', { method: 'POST', body }),
  contribute: (id, amount) => api(`/api/emergency/${id}/contribute`, { method: 'POST', body: { amount } }),
  ignoreRequest: (id) => api(`/api/emergency/${id}/ignore`, { method: 'POST' }),
  closeRequest: (id) => api(`/api/emergency/${id}/close`, { method: 'POST' }),
  setHelper: (v) => api('/api/me', { method: 'POST', body: { helperOptIn: v } }),
  audit: () => api('/api/audit'),
};
