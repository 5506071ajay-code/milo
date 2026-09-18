import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { db, now, uid, audit, publicUser, getDoc, putDoc, defaultDoc } from './db.js';
import { encrypt, decrypt, signValue, verifyValue, ENCRYPTION_KEY_IS_DEV, SESSION_SECRET_IS_DEV } from './crypto.js';
import { PROVIDERS, getProvider, describeProviders } from './providers/index.js';
import { computeSplit } from '../src/engines/split.js';

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = process.env.MILO_PUBLIC_URL || `http://localhost:${PORT}`;
const PROD = process.env.NODE_ENV === 'production';
const GOOGLE = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
const GOOGLE_CONFIGURED = !!(GOOGLE.id && GOOGLE.secret);
const DEV_AUTH = process.env.MILO_AUTH_DEV_MODE === 'true' && !PROD;
const SESSION_DAYS = 30;
const COOKIE = 'milo_session';

if (!GOOGLE_CONFIGURED) console.warn('[milo] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: Google sign-in is disabled.' + (DEV_AUTH ? ' Developer sign-in is ON (MILO_AUTH_DEV_MODE=true).' : ' Set MILO_AUTH_DEV_MODE=true for local development.'));
if (ENCRYPTION_KEY_IS_DEV) console.warn('[milo] MILO_ENCRYPTION_KEY not set: using a development key. Never run production like this.');
if (SESSION_SECRET_IS_DEV) console.warn('[milo] MILO_SESSION_SECRET not set: using a development secret.');
if (PROD && (ENCRYPTION_KEY_IS_DEV || SESSION_SECRET_IS_DEV)) { console.error('[milo] Refusing to start in production without MILO_ENCRYPTION_KEY and MILO_SESSION_SECRET.'); process.exit(1); }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// ---------- security headers ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://lh3.googleusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com");
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ---------- cookies & sessions ----------
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])); }
function setSessionCookie(res, sid) { res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(signValue(sid))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? '; Secure' : ''}`); }
function clearSessionCookie(res) { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${PROD ? '; Secure' : ''}`); }
function createSession(res, req, userId) {
  const id = uid('ses'); const exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)').run(id, userId, now(), exp, req.ip, (req.headers['user-agent'] || '').slice(0, 300));
  setSessionCookie(res, id); return id;
}
const NATIVE_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', process.env.MILO_EXTRA_ORIGIN].filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && NATIVE_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});
app.use((req, res, next) => {
  req.user = null; req.session = null;
  // Browser: signed httpOnly cookie. Native app: the same session id as a signed bearer token (no cookies across WebView origins).
  const bearer = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const sid = verifyValue(bearer || parseCookies(req)[COOKIE]);
  if (sid) {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
    if (s && !s.revoked_at && s.expires_at > now()) { req.session = s; req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id) || null; }
    else if (s && !bearer) clearSessionCookie(res);
  }
  next();
});
const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'not_authenticated' }));
// State-changing API calls must come from our own origin (CSRF defence in depth on top of SameSite=Lax).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    const allowed = [PUBLIC_URL, `http://localhost:${PORT}`, 'http://localhost:5173', process.env.MILO_EXTRA_ORIGIN, ...NATIVE_ORIGINS].filter(Boolean).map((u) => new URL(u).origin);
    if (origin && !allowed.includes(origin)) return res.status(403).json({ error: 'bad_origin' });
  }
  next();
});
// Small in-memory rate limit for auth endpoints.
const hits = new Map();
const rateLimit = (max, windowMs) => (req, res, next) => { const k = `${req.ip}:${req.path}`; const t = Date.now(); const arr = (hits.get(k) || []).filter((x) => t - x < windowMs); arr.push(t); hits.set(k, arr); if (arr.length > max) return res.status(429).json({ error: 'rate_limited' }); next(); };

// ---------- validation helpers ----------
const isStr = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isMoney = (v, max = 1e8) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
const bad = (res, msg) => res.status(400).json({ error: 'invalid_input', message: msg });

// ---------- auth ----------
app.get('/auth/config', (req, res) => res.json({ googleConfigured: GOOGLE_CONFIGURED, devMode: DEV_AUTH, publicUrl: PUBLIC_URL }));

function upsertGoogleUser(payload, req) {
  const email = payload.email.toLowerCase();
  let u = db.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ?').get(payload.sub, email);
  const domain = email.split('@')[1];
  if (!u) {
    const id = uid('usr');
    db.prepare('INSERT INTO users (id, google_sub, email, email_verified, name, picture, college_domain, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, payload.sub, email, payload.email_verified ? 1 : 0, payload.name || email.split('@')[0], payload.picture || null, domain, now(), now());
    putDoc(id, defaultDoc(), null);
    db.prepare('UPDATE invites SET accepted_user_id = ?, accepted_at = ? WHERE email = ? AND accepted_user_id IS NULL').run(id, now(), email);
    audit(id, 'user.created', id, req.ip, { via: 'google' });
    u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return { user: u, created: true };
  }
  db.prepare('UPDATE users SET google_sub = COALESCE(google_sub, ?), name = ?, picture = ?, email_verified = ?, last_login_at = ? WHERE id = ?').run(payload.sub, payload.name || u.name, payload.picture || u.picture, payload.email_verified ? 1 : 0, now(), u.id);
  return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), created: false };
}

const oauth = GOOGLE_CONFIGURED ? new OAuth2Client(GOOGLE.id, GOOGLE.secret, `${PUBLIC_URL}/auth/google/callback`) : null;
db.exec('CREATE TABLE IF NOT EXISTS login_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT)');
const NATIVE_SCHEME = process.env.MILO_NATIVE_SCHEME || 'com.milo.app';
app.get('/auth/google', rateLimit(20, 60000), (req, res) => {
  const native = req.query.platform === 'native';
  if (!oauth) return res.redirect(native ? `${NATIVE_SCHEME}://auth?error=google_not_configured` : '/#/signin?error=google_not_configured');
  const state = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO oauth_states (state, created_at, redirect) VALUES (?,?,?)').run(state, now(), native ? 'native' : '/');
  const url = oauth.generateAuthUrl({ access_type: 'online', scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' });
  res.redirect(url);
});
app.get('/auth/google/callback', rateLimit(20, 60000), async (req, res) => {
  try {
    if (!oauth) throw new Error('google_not_configured');
    const { code, state, error } = req.query;
    const st = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(String(state || ''));
    const native = st?.redirect === 'native';
    const fail = (e) => res.redirect(native ? `${NATIVE_SCHEME}://auth?error=${encodeURIComponent(e)}` : `/#/signin?error=${encodeURIComponent(e)}`);
    if (error) return fail(String(error));
    db.prepare('DELETE FROM oauth_states WHERE state = ? OR created_at < ?').run(String(state || ''), new Date(Date.now() - 600000).toISOString());
    if (!st) return fail('invalid_state');
    const { tokens } = await oauth.getToken(String(code));
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE.id });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) return fail('email_not_verified');
    const { user, created } = upsertGoogleUser(payload, req);
    if (native) {
      // Hand the app a single-use code via its deep link; the session token is issued only on exchange from the app itself.
      const lc = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO login_codes (code, user_id, created_at) VALUES (?,?,?)').run(lc, user.id, now());
      audit(user.id, 'auth.login_code', user.id, req.ip, { via: 'google', created });
      return res.redirect(`${NATIVE_SCHEME}://auth?code=${lc}&created=${created ? 1 : 0}`);
    }
    createSession(res, req, user.id);
    audit(user.id, 'auth.login', user.id, req.ip, { via: 'google', created });
    res.redirect(created ? '/#/welcome' : '/#/home');
  } catch (e) {
    console.error('[auth]', e.message);
    res.redirect('/#/signin?error=auth_failed');
  }
});
// Native app: exchange a single-use login code (from the deep link) for a bearer session token.
app.post('/auth/exchange', rateLimit(30, 60000), (req, res) => {
  const code = String(req.body?.code || '');
  const lc = db.prepare('SELECT * FROM login_codes WHERE code = ?').get(code);
  db.prepare('DELETE FROM login_codes WHERE created_at < ?').run(new Date(Date.now() - 300000).toISOString());
  if (!lc || lc.used_at || lc.created_at < new Date(Date.now() - 300000).toISOString()) return res.status(400).json({ error: 'invalid_code', message: 'This sign-in code is invalid or expired. Try again.' });
  db.prepare('UPDATE login_codes SET used_at = ? WHERE code = ?').run(now(), code);
  const sid = createSession(res, req, lc.user_id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lc.user_id);
  audit(user.id, 'auth.login', user.id, req.ip, { via: 'google-native' });
  res.json({ token: signValue(sid), user: publicUser(user) });
});
// Developer sign-in: identical account model, but without Google. Only when MILO_AUTH_DEV_MODE=true and never in production.
app.post('/auth/dev-login', rateLimit(30, 60000), (req, res) => {
  if (!DEV_AUTH) return res.status(404).json({ error: 'not_found' });
  const { email, name } = req.body || {};
  if (!isStr(email, 120) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'A valid email is required.');
  const { user, created } = upsertGoogleUser({ sub: `dev:${email.toLowerCase()}`, email: email.toLowerCase(), email_verified: true, name: isStr(name, 80) ? name.trim() : email.split('@')[0], picture: null }, req);
  const sid = createSession(res, req, user.id);
  audit(user.id, 'auth.login', user.id, req.ip, { via: 'dev', created });
  res.json({ user: publicUser(user), created, token: req.body?.native ? signValue(sid) : undefined });
});
app.post('/auth/logout', (req, res) => {
  if (req.session) { db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now(), req.session.id); audit(req.user?.id, 'auth.logout', req.session.id, req.ip); }
  clearSessionCookie(res); res.json({ ok: true });
});
app.post('/auth/logout-all', requireAuth, (req, res) => { db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), req.user.id); clearSessionCookie(res); audit(req.user.id, 'auth.logout_all', null, req.ip); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  const sessions = db.prepare('SELECT id, created_at, ip, user_agent FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?').all(req.user.id, now());
  res.json({ user: { ...publicUser(req.user), helperOptIn: !!req.user.helper_opt_in, createdAt: req.user.created_at }, sessions: sessions.map((s) => ({ ...s, current: s.id === req.session.id })) });
});
app.post('/api/me', requireAuth, (req, res) => { const { helperOptIn } = req.body || {}; if (typeof helperOptIn === 'boolean') db.prepare('UPDATE users SET helper_opt_in = ? WHERE id = ?').run(helperOptIn ? 1 : 0, req.user.id); res.json({ ok: true }); });

// ---------- providers & connections ----------
app.get('/api/providers', requireAuth, (req, res) => res.json({ providers: describeProviders() }));
const connRow = (c) => ({ id: c.id, providerId: c.provider_id, provider: getProvider(c.provider_id)?.name || c.provider_id, kind: getProvider(c.provider_id)?.kind, status: c.status, label: c.label, consentScopes: JSON.parse(c.consent_scopes || '[]'), consentGrantedAt: c.consent_granted_at, consentExpiresAt: c.consent_expires_at, lastSyncAt: c.last_sync_at, lastError: c.last_error, createdAt: c.created_at, demo: !!c.demo });
app.get('/api/connections', requireAuth, (req, res) => res.json({ connections: db.prepare('SELECT * FROM connections WHERE user_id = ? AND status != ? ORDER BY created_at').all(req.user.id, 'disconnected').map(connRow) }));

async function runSync(conn, user) {
  const p = getProvider(conn.provider_id);
  const tokens = decrypt(conn.token_ciphertext);
  const result = await p.sync(conn, tokens);
  const accById = new Map();
  const upAcc = db.prepare('INSERT INTO accounts (id, user_id, connection_id, external_id, name, institution, type, kind, balance, mask, meta, balance_as_of, demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, balance=excluded.balance, meta=excluded.meta, balance_as_of=excluded.balance_as_of');
  for (const a of result.accounts) {
    const existing = db.prepare('SELECT id FROM accounts WHERE connection_id = ? AND external_id = ?').get(conn.id, a.externalId);
    const id = existing?.id || uid('acc');
    upAcc.run(id, user.id, conn.id, a.externalId, a.name, a.institution || null, a.type, a.kind, a.balance, a.mask || null, a.meta ? JSON.stringify(a.meta) : null, now(), p.demo ? 1 : 0);
    accById.set(a.externalId, id);
  }
  const insTx = db.prepare('INSERT OR IGNORE INTO transactions (id, user_id, account_id, connection_id, external_id, date, amount, direction, merchant, descriptor, channel, category, meaning, purpose, counterpart_account_external_id, raw, demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  let added = 0;
  const tx = db.prepare('BEGIN'); tx.run();
  try {
    for (const t of result.transactions) { const accId = accById.get(t.accountExternalId); if (!accId) continue; const r = insTx.run(uid('tx'), user.id, accId, conn.id, t.externalId, t.date, Math.abs(t.amount), t.direction, t.merchant || null, t.descriptor || null, t.channel || null, t.category || null, t.meaning || null, t.purpose || null, t.counterpartAccountExternalId || null, t.raw ? JSON.stringify(t.raw) : null, p.demo ? 1 : 0); added += r.changes; }
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  if (result.tokens) db.prepare('UPDATE connections SET token_ciphertext = ? WHERE id = ?').run(encrypt(result.tokens), conn.id);
  db.prepare('UPDATE connections SET status = ?, last_sync_at = ?, last_error = NULL WHERE id = ?').run('connected', now(), conn.id);
  // Provider-suggested recurring items land in the user's doc only if the doc has none yet (never overwrite user edits).
  if (result.suggestedCommitments || result.suggestedSubscriptions || result.suggestedAllowance) {
    const { doc, version } = getDoc(user.id);
    let changed = false;
    if (result.suggestedCommitments && !doc.commitments.length) { doc.commitments = result.suggestedCommitments.map((c) => ({ ...c, source: p.demo ? 'demo' : 'detected' })); changed = true; }
    if (result.suggestedSubscriptions && !doc.subscriptions.length) { doc.subscriptions = result.suggestedSubscriptions; changed = true; }
    if (result.suggestedAllowance && !doc.allowance) { doc.allowance = result.suggestedAllowance; changed = true; }
    if (changed) putDoc(user.id, doc, version);
  }
  return { accounts: result.accounts.length, transactionsAdded: added };
}

app.post('/api/connections', requireAuth, async (req, res) => {
  const { providerId, consent } = req.body || {};
  const inputs = req.body?.inputs && typeof req.body.inputs === 'object' ? req.body.inputs : {};
  const p = getProvider(String(providerId || ''));
  if (!p) return bad(res, 'Unknown provider.');
  if (consent !== true) return res.status(400).json({ error: 'consent_required', message: 'You must explicitly consent before MILO requests access to this data.' });
  const st = p.status(); if (!st.available) return res.status(409).json({ error: 'provider_unavailable', message: st.reason, requiredEnv: st.requiredEnv || [] });
  const id = uid('con');
  db.prepare('INSERT INTO connections (id, user_id, provider_id, status, label, consent_scopes, consent_granted_at, created_at, demo) VALUES (?,?,?,?,?,?,?,?,?)').run(id, req.user.id, p.id, 'pending', p.name, JSON.stringify(p.scopes), now(), now(), p.demo ? 1 : 0);
  audit(req.user.id, 'connection.consent', id, req.ip, { provider: p.id, scopes: p.scopes });
  try {
    const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
    const start = await p.start(req.user, conn, inputs);
    if (start.providerRef) db.prepare('UPDATE connections SET provider_ref = ? WHERE id = ?').run(start.providerRef, id);
    if (start.redirectUrl) return res.json({ connection: connRow(conn), redirectUrl: start.redirectUrl });
    const done = await p.complete(conn, {});
    db.prepare('UPDATE connections SET token_ciphertext = ?, provider_ref = ?, label = ?, consent_expires_at = ?, status = ? WHERE id = ?').run(encrypt(done.tokens), done.providerRef, done.label, done.consentExpiresAt, 'connected', id);
    const synced = await runSync(db.prepare('SELECT * FROM connections WHERE id = ?').get(id), req.user);
    audit(req.user.id, 'connection.connected', id, req.ip, { provider: p.id, ...synced });
    res.json({ connection: connRow(db.prepare('SELECT * FROM connections WHERE id = ?').get(id)), synced });
  } catch (e) {
    db.prepare('UPDATE connections SET status = ?, last_error = ? WHERE id = ?').run('error', e.message.slice(0, 500), id);
    audit(req.user.id, 'connection.error', id, req.ip, { message: e.message });
    res.status(502).json({ error: 'connection_failed', message: e.message, connection: connRow(db.prepare('SELECT * FROM connections WHERE id = ?').get(id)) });
  }
});
// OAuth / consent return leg for providers that redirect. The session cookie identifies the user; the connection must belong to them.
app.get('/api/connections/:id/callback', async (req, res) => {
  const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  if (!req.user || !conn || conn.user_id !== req.user.id) return res.redirect('/#/accounts?error=callback_unauthorized');
  const p = getProvider(conn.provider_id);
  try {
    const done = await p.complete(conn, req.query);
    db.prepare('UPDATE connections SET token_ciphertext = ?, provider_ref = ?, label = ?, consent_expires_at = ?, status = ? WHERE id = ?').run(encrypt(done.tokens), done.providerRef, done.label, done.consentExpiresAt, 'connected', conn.id);
    await runSync(db.prepare('SELECT * FROM connections WHERE id = ?').get(conn.id), req.user);
    audit(req.user.id, 'connection.connected', conn.id, req.ip, { provider: p.id });
    res.redirect('/#/accounts?connected=' + conn.id);
  } catch (e) {
    db.prepare('UPDATE connections SET status = ?, last_error = ? WHERE id = ?').run('error', e.message.slice(0, 500), conn.id);
    res.redirect('/#/accounts?error=' + encodeURIComponent(e.message.slice(0, 120)));
  }
});
app.post('/api/connections/:id/sync', requireAuth, async (req, res) => {
  const conn = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conn) return res.status(404).json({ error: 'not_found' });
  if (!['connected', 'error', 'expired'].includes(conn.status)) return res.status(409).json({ error: 'not_connected' });
  try { const synced = await runSync(conn, req.user); audit(req.user.id, 'connection.sync', conn.id, req.ip, synced); res.json({ connection: connRow(db.prepare('SELECT * FROM connections WHERE id = ?').get(conn.id)), synced }); }
  catch (e) {
    const expired = /401|expired|invalid.?token|TokenException/i.test(e.message);
    db.prepare('UPDATE connections SET status = ?, last_error = ? WHERE id = ?').run(expired ? 'expired' : 'error', e.message.slice(0, 500), conn.id);
    res.status(502).json({ error: expired ? 'reauth_required' : 'sync_failed', message: e.message, connection: connRow(db.prepare('SELECT * FROM connections WHERE id = ?').get(conn.id)) });
  }
});
app.delete('/api/connections/:id', requireAuth, async (req, res) => {
  const conn = db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conn) return res.status(404).json({ error: 'not_found' });
  const p = getProvider(conn.provider_id);
  try { await p?.revoke(conn, decrypt(conn.token_ciphertext)); } catch { /* best effort */ }
  db.prepare('DELETE FROM transactions WHERE connection_id = ? AND user_id = ?').run(conn.id, req.user.id);
  db.prepare('DELETE FROM accounts WHERE connection_id = ? AND user_id = ?').run(conn.id, req.user.id);
  db.prepare('UPDATE connections SET status = ?, token_ciphertext = NULL, disconnected_at = ? WHERE id = ?').run('disconnected', now(), conn.id);
  audit(req.user.id, 'connection.disconnected', conn.id, req.ip, { provider: conn.provider_id });
  res.json({ ok: true });
});

// ---------- financial data (read) ----------
app.get('/api/accounts', requireAuth, (req, res) => res.json({ accounts: db.prepare('SELECT a.*, c.status AS connection_status FROM accounts a JOIN connections c ON c.id = a.connection_id WHERE a.user_id = ? AND c.status != ?').all(req.user.id, 'disconnected').map((a) => ({ id: a.id, connectionId: a.connection_id, name: a.name, institution: a.institution, type: a.type, kind: a.kind, balance: a.balance, mask: a.mask, meta: a.meta ? JSON.parse(a.meta) : null, balanceAsOf: a.balance_as_of, demo: !!a.demo, connectionStatus: a.connection_status })) }));
app.get('/api/transactions', requireAuth, (req, res) => res.json({ transactions: db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 5000').all(req.user.id).map((t) => ({ id: t.id, accountId: t.account_id, connectionId: t.connection_id, date: t.date, amount: t.amount, direction: t.direction, merchant: t.merchant, descriptor: t.descriptor, channel: t.channel, category: t.category, meaning: t.meaning, purpose: t.purpose, counterpartAccountExternalId: t.counterpart_account_external_id, raw: t.raw ? JSON.parse(t.raw) : null, demo: !!t.demo, source: t.demo ? 'Demo sandbox' : 'Connected account' })) }));

// ---------- user document (preferences, corrections, goals, commitments…) ----------
const DOC_KEYS = Object.keys(defaultDoc());
app.get('/api/state', requireAuth, (req, res) => res.json(getDoc(req.user.id)));
app.put('/api/state', requireAuth, (req, res) => {
  const { doc, version } = req.body || {};
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return bad(res, 'doc must be an object');
  const clean = {}; for (const k of DOC_KEYS) if (k in doc) clean[k] = doc[k];
  if (JSON.stringify(clean).length > 1_500_000) return bad(res, 'doc too large');
  for (const g of clean.goals || []) if (!isStr(g.name, 80) || !isMoney(g.target)) return bad(res, 'invalid goal');
  for (const c of clean.commitments || []) if (!isStr(c.title, 80) || !isMoney(c.amount) || !isDate(c.date)) return bad(res, 'invalid commitment');
  for (const t of clean.manualTransactions || []) if (!isMoney(t.amount) || !isDate(t.date)) return bad(res, 'invalid manual transaction');
  const r = putDoc(req.user.id, { ...defaultDoc(), ...clean }, typeof version === 'number' ? version : null);
  if (r.conflict) return res.status(409).json({ error: 'version_conflict', version: r.version });
  res.json({ version: r.version });
});

// ---------- verified user directory ----------
app.get('/api/users/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ matches: [], query: q });
  const rows = q.includes('@')
    ? db.prepare('SELECT * FROM users WHERE id != ? AND lower(email) = ? LIMIT 8').all(req.user.id, q)
    : db.prepare('SELECT * FROM users WHERE id != ? AND (lower(name) LIKE ? OR lower(email) LIKE ?) ORDER BY name LIMIT 8').all(req.user.id, `${q}%`, `${q}%`);
  const pendingInvite = q.includes('@') ? db.prepare('SELECT id FROM invites WHERE inviter_user_id = ? AND email = ? AND accepted_user_id IS NULL').get(req.user.id, q) : null;
  audit(req.user.id, 'users.search', null, req.ip, { q: q.slice(0, 60), n: rows.length });
  res.json({ matches: rows.map(publicUser), query: q, pendingInvite: !!pendingInvite, canInvite: q.includes('@') && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q) && rows.length === 0 });
});
app.post('/api/invites', requireAuth, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Enter a valid email address.');
  if (email === req.user.email) return bad(res, 'That is your own email.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'already_registered', message: 'This person already has a MILO account. Search for them instead.' });
  const existing = db.prepare('SELECT id FROM invites WHERE inviter_user_id = ? AND email = ? AND accepted_user_id IS NULL').get(req.user.id, email);
  if (existing) return res.json({ invite: { id: existing.id, email }, existing: true });
  const id = uid('inv'); db.prepare('INSERT INTO invites (id, inviter_user_id, email, context, created_at) VALUES (?,?,?,?,?)').run(id, req.user.id, email, isStr(req.body?.context, 200) ? req.body.context : null, now());
  audit(req.user.id, 'invite.created', id, req.ip, { email });
  // Email delivery requires an SMTP/ESP configuration; until then the invite link is shown to the inviter to share.
  res.json({ invite: { id, email, link: `${PUBLIC_URL}/#/signin?invite=${id}` }, emailSent: false });
});
app.get('/api/invites', requireAuth, (req, res) => res.json({ invites: db.prepare('SELECT id, email, context, created_at, accepted_user_id, accepted_at FROM invites WHERE inviter_user_id = ? ORDER BY created_at DESC').all(req.user.id) }));
app.get('/api/contacts', requireAuth, (req, res) => {
  const ids = new Set();
  for (const r of db.prepare('SELECT creditor_user_id a, debtor_user_id b FROM obligations WHERE creditor_user_id = ? OR debtor_user_id = ?').all(req.user.id, req.user.id)) { ids.add(r.a); ids.add(r.b); }
  for (const r of db.prepare('SELECT shares FROM splits WHERE payer_user_id = ?').all(req.user.id)) for (const s of JSON.parse(r.shares)) ids.add(s.userId);
  ids.delete(req.user.id);
  const users = [...ids].map((id) => publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))).filter(Boolean);
  res.json({ contacts: users });
});

// ---------- splits & obligations (verified users only) ----------
function notify(userId, kind, text, link, ref) { db.prepare('INSERT INTO notifications (id, user_id, kind, text, link, ref, created_at) VALUES (?,?,?,?,?,?,?)').run(uid('ntf'), userId, kind, text, link || null, ref || null, now()); }
const obRow = (o, me) => {
  const other = o.creditor_user_id === me ? o.debtor_user_id : o.creditor_user_id;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(other);
  return { id: o.id, splitId: o.split_id, direction: o.creditor_user_id === me ? 'they_owe' : 'i_owe', contactId: other, contact: publicUser(u), kind: o.kind, title: o.title, amount: o.amount, remaining: o.remaining, groupId: o.group_name || null, dueDate: o.due_date, createdAt: o.created_at, settledAt: o.settled_at, payments: db.prepare('SELECT amount, at, via, recorded_by FROM payments WHERE obligation_id = ? ORDER BY at').all(o.id) };
};
app.get('/api/obligations', requireAuth, (req, res) => res.json({ obligations: db.prepare('SELECT * FROM obligations WHERE creditor_user_id = ? OR debtor_user_id = ? ORDER BY created_at DESC').all(req.user.id, req.user.id).map((o) => obRow(o, req.user.id)) }));
app.get('/api/splits', requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM splits WHERE payer_user_id = ? OR shares LIKE ? ORDER BY created_at DESC").all(req.user.id, `%"userId":"${req.user.id}"%`);
  res.json({ splits: rows.map((s) => ({ id: s.id, payerUserId: s.payer_user_id, payer: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(s.payer_user_id)), title: s.title, total: s.total, mode: s.mode, sharedAmount: s.shared_amount, groupId: s.group_name, sourceTxId: s.payer_user_id === req.user.id ? s.source_tx_id : null, shares: JSON.parse(s.shares), userExpense: s.user_expense, recoverable: s.recoverable, createdAt: s.created_at })) });
});
app.post('/api/splits', requireAuth, (req, res) => {
  const { title, total, mode, sharedAmount, participants, groupName, sourceTxId } = req.body || {};
  if (!isStr(title, 120) || !isMoney(total) || !['equal', 'unequal'].includes(mode)) return bad(res, 'title, total and mode are required');
  if (!Array.isArray(participants) || participants.length < 1 || participants.length > 20) return bad(res, 'Add between 1 and 20 other people');
  const seen = new Set();
  for (const pt of participants) {
    if (!isStr(pt.userId, 60) || pt.userId === req.user.id || seen.has(pt.userId)) return bad(res, 'Each participant must be a distinct registered MILO user other than you');
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(pt.userId)) return res.status(422).json({ error: 'unregistered_participant', message: `${pt.userId} is not a registered MILO user.` });
    if (pt.itemAmount != null && !(typeof pt.itemAmount === 'number' && pt.itemAmount >= 0)) return bad(res, 'Item amounts must be non-negative numbers');
    seen.add(pt.userId);
  }
  const ps = [{ id: req.user.id, name: req.user.name, isSelf: true, itemAmount: Number(req.body.selfItemAmount) || 0 }, ...participants.map((pt) => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(pt.userId); return { id: u.id, name: u.name, isSelf: false, itemAmount: Number(pt.itemAmount) || 0 }; })];
  const result = computeSplit({ total, mode, sharedAmount: Number(sharedAmount) || 0, participants: ps });
  if (!result.valid) return bad(res, result.error);
  const id = uid('spl'); const at = now();
  const shares = result.shares.map((s) => ({ userId: s.id, name: s.name, isSelf: s.isSelf, share: s.share, itemAmount: s.itemAmount, sharedPart: s.sharedPart, paid: s.paid, remaining: s.remaining }));
  db.prepare('INSERT INTO splits (id, payer_user_id, title, total, mode, shared_amount, group_name, source_tx_id, shares, user_expense, recoverable, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, req.user.id, title.trim(), total, mode, Number(sharedAmount) || 0, isStr(groupName, 60) ? groupName.trim() : null, isStr(sourceTxId, 80) ? sourceTxId : null, JSON.stringify(shares), result.userExpense, result.recoverable, at);
  for (const s of shares) {
    if (s.isSelf || s.remaining <= 0) continue;
    const oid = uid('obl');
    db.prepare('INSERT INTO obligations (id, split_id, creditor_user_id, debtor_user_id, kind, title, amount, remaining, group_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(oid, id, req.user.id, s.userId, 'split', title.trim(), s.share, s.remaining, isStr(groupName, 60) ? groupName.trim() : null, at);
    notify(s.userId, 'split', `${req.user.name} split "${title.trim()}": your share is ₹${s.share}.`, '#/owe', oid);
  }
  audit(req.user.id, 'split.created', id, req.ip, { total, participants: shares.length });
  res.json({ split: { id, title, total, mode, shares, userExpense: result.userExpense, recoverable: result.recoverable, groupId: groupName || null, sourceTxId: sourceTxId || null, createdAt: at } });
});
app.post('/api/obligations', requireAuth, (req, res) => {
  const { counterpartUserId, direction, amount, title, kind } = req.body || {};
  if (!['i_owe', 'they_owe'].includes(direction) || !isMoney(amount) || !isStr(title, 120)) return bad(res, 'direction, amount and title are required');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(String(counterpartUserId || ''));
  if (!u || u.id === req.user.id) return res.status(422).json({ error: 'unregistered_participant', message: 'Pick a registered MILO user.' });
  const id = uid('obl');
  const [creditor, debtor] = direction === 'i_owe' ? [u.id, req.user.id] : [req.user.id, u.id];
  db.prepare('INSERT INTO obligations (id, creditor_user_id, debtor_user_id, kind, title, amount, remaining, created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, creditor, debtor, ['informal', 'emergency'].includes(kind) ? kind : 'informal', title.trim(), amount, amount, now());
  notify(u.id, 'obligation', direction === 'i_owe' ? `${req.user.name} recorded that they owe you ₹${amount} (${title.trim()}).` : `${req.user.name} recorded that you owe them ₹${amount} (${title.trim()}).`, '#/owe', id);
  audit(req.user.id, 'obligation.created', id, req.ip, { direction, amount });
  res.json({ obligation: obRow(db.prepare('SELECT * FROM obligations WHERE id = ?').get(id), req.user.id) });
});
function loadOb(req, res) { const o = db.prepare('SELECT * FROM obligations WHERE id = ?').get(req.params.id); if (!o || (o.creditor_user_id !== req.user.id && o.debtor_user_id !== req.user.id)) { res.status(404).json({ error: 'not_found' }); return null; } return o; }
app.post('/api/obligations/:id/payments', requireAuth, (req, res) => {
  const o = loadOb(req, res); if (!o) return;
  const amount = Number(req.body?.amount);
  if (!isMoney(amount) || amount > o.remaining + 0.005) return bad(res, `Amount must be between 0 and ${o.remaining}.`);
  const remaining = Math.round(Math.max(0, o.remaining - amount) * 100) / 100;
  db.prepare('INSERT INTO payments (id, obligation_id, recorded_by, amount, at, via) VALUES (?,?,?,?,?,?)').run(uid('pay'), o.id, req.user.id, amount, now(), 'manual');
  db.prepare('UPDATE obligations SET remaining = ?, settled_at = ? WHERE id = ?').run(remaining, remaining <= 0.005 ? now() : null, o.id);
  const other = o.creditor_user_id === req.user.id ? o.debtor_user_id : o.creditor_user_id;
  notify(other, 'payment', `${req.user.name} recorded a payment of ₹${amount} on "${o.title}". ${remaining > 0 ? `₹${remaining} still open.` : 'Settled.'}`, '#/owe', o.id);
  audit(req.user.id, 'obligation.payment', o.id, req.ip, { amount });
  res.json({ obligation: obRow(db.prepare('SELECT * FROM obligations WHERE id = ?').get(o.id), req.user.id) });
});
app.post('/api/obligations/:id/remind', requireAuth, (req, res) => {
  const o = loadOb(req, res); if (!o) return;
  if (o.creditor_user_id !== req.user.id) return res.status(403).json({ error: 'forbidden', message: 'Only the person who is owed can send a reminder.' });
  notify(o.debtor_user_id, 'reminder', `Reminder from ${req.user.name}: ₹${o.remaining} for "${o.title}" is still open.`, '#/owe', o.id);
  audit(req.user.id, 'obligation.remind', o.id, req.ip);
  res.json({ ok: true, at: now() });
});
app.post('/api/obligations/settle-group', requireAuth, (req, res) => {
  const g = String(req.body?.groupName || ''); if (!isStr(g, 60)) return bad(res, 'groupName required');
  const rows = db.prepare('SELECT * FROM obligations WHERE group_name = ? AND remaining > 0 AND (creditor_user_id = ? OR debtor_user_id = ?)').all(g, req.user.id, req.user.id);
  for (const o of rows) { db.prepare('INSERT INTO payments (id, obligation_id, recorded_by, amount, at, via) VALUES (?,?,?,?,?,?)').run(uid('pay'), o.id, req.user.id, o.remaining, now(), 'settlement'); db.prepare('UPDATE obligations SET remaining = 0, settled_at = ? WHERE id = ?').run(now(), o.id); notify(o.creditor_user_id === req.user.id ? o.debtor_user_id : o.creditor_user_id, 'settlement', `${req.user.name} marked "${g}" as settled.`, '#/owe', o.id); }
  audit(req.user.id, 'group.settled', g, req.ip, { count: rows.length });
  res.json({ settled: rows.length });
});

// ---------- notifications ----------
app.get('/api/notifications', requireAuth, (req, res) => res.json({ notifications: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id).map((n) => ({ id: n.id, kind: n.kind, text: n.text, link: n.link, ref: n.ref, createdAt: n.created_at, readAt: n.read_at })) }));
app.post('/api/notifications/read', requireAuth, (req, res) => { const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => isStr(x, 60)) : []; const st = db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL'); for (const id of ids) st.run(now(), req.user.id, id); if (req.body?.all) db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), req.user.id); res.json({ ok: true }); });

// ---------- emergency liquidity ----------
const reqRow = (r, me) => ({ id: r.id, requesterId: r.requester_user_id, requester: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.requester_user_id)), amount: r.amount, reason: r.reason, requiredBy: r.required_by, repaymentDate: r.repayment_date, visibility: r.visibility, status: r.status, createdAt: r.created_at, mine: r.requester_user_id === me, contributions: db.prepare('SELECT c.amount, c.at, c.contributor_user_id, u.name FROM contributions c JOIN users u ON u.id = c.contributor_user_id WHERE c.request_id = ?').all(r.id).map((c) => ({ amount: c.amount, at: c.at, contributorId: c.contributor_user_id, name: c.name })), ignored: !!db.prepare('SELECT 1 FROM request_ignores WHERE user_id = ? AND request_id = ?').get(me, r.id) });
function myNetwork(userId) { const ids = new Set(); for (const r of db.prepare('SELECT creditor_user_id a, debtor_user_id b FROM obligations WHERE creditor_user_id = ? OR debtor_user_id = ?').all(userId, userId)) { ids.add(r.a); ids.add(r.b); } ids.delete(userId); return ids; }
app.get('/api/emergency', requireAuth, (req, res) => {
  const mine = db.prepare('SELECT * FROM emergency_requests WHERE requester_user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const open = db.prepare("SELECT * FROM emergency_requests WHERE requester_user_id != ? AND status = 'open' ORDER BY created_at DESC").all(req.user.id);
  const net = myNetwork(req.user.id);
  const visible = open.filter((r) => { const requester = db.prepare('SELECT college_domain FROM users WHERE id = ?').get(r.requester_user_id); return r.visibility === 'friends' ? net.has(r.requester_user_id) : requester?.college_domain && requester.college_domain === req.user.college_domain; });
  res.json({ mine: mine.map((r) => reqRow(r, req.user.id)), network: visible.map((r) => reqRow(r, req.user.id)), networkSize: net.size, collegeDomain: req.user.college_domain });
});
app.post('/api/emergency', requireAuth, (req, res) => {
  const { amount, reason, requiredBy, repaymentDate, visibility } = req.body || {};
  if (!isMoney(amount, 50000) || !isStr(reason, 200) || !isDate(requiredBy) || !isDate(repaymentDate) || !['friends', 'college'].includes(visibility)) return bad(res, 'amount (≤ 50,000), reason, dates and visibility are required');
  if (repaymentDate <= requiredBy) return bad(res, 'Repayment must come after the required-by date.');
  const id = uid('emr'); db.prepare('INSERT INTO emergency_requests (id, requester_user_id, amount, reason, required_by, repayment_date, visibility, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, req.user.id, amount, reason.trim(), requiredBy, repaymentDate, visibility, 'open', now());
  for (const uidx of myNetwork(req.user.id)) if (visibility === 'friends') notify(uidx, 'emergency', `${req.user.name} needs ₹${amount} for ${reason.trim()} by ${requiredBy}.`, '#/emergency', id);
  audit(req.user.id, 'emergency.created', id, req.ip, { amount, visibility });
  res.json({ request: reqRow(db.prepare('SELECT * FROM emergency_requests WHERE id = ?').get(id), req.user.id) });
});
app.post('/api/emergency/:id/contribute', requireAuth, (req, res) => {
  const r = db.prepare("SELECT * FROM emergency_requests WHERE id = ? AND status = 'open'").get(req.params.id); if (!r || r.requester_user_id === req.user.id) return res.status(404).json({ error: 'not_found' });
  const amount = Number(req.body?.amount); const funded = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM contributions WHERE request_id = ?').get(r.id).s;
  if (!isMoney(amount) || amount > r.amount - funded + 0.005) return bad(res, `Only ₹${Math.max(0, r.amount - funded)} is still needed.`);
  const oid = uid('obl'); const at = now();
  db.prepare('INSERT INTO obligations (id, creditor_user_id, debtor_user_id, kind, title, amount, remaining, due_date, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(oid, req.user.id, r.requester_user_id, 'emergency', `Emergency help: ${r.reason}`, amount, amount, r.repayment_date, at);
  db.prepare('INSERT INTO contributions (id, request_id, contributor_user_id, amount, at, obligation_id) VALUES (?,?,?,?,?,?)').run(uid('ctr'), r.id, req.user.id, amount, at, oid);
  if (funded + amount >= r.amount - 0.005) db.prepare("UPDATE emergency_requests SET status = 'funded' WHERE id = ?").run(r.id);
  notify(r.requester_user_id, 'emergency', `${req.user.name} lent you ₹${amount} (no interest). Repay by ${r.repayment_date}.`, '#/owe', oid);
  audit(req.user.id, 'emergency.contributed', r.id, req.ip, { amount });
  res.json({ ok: true });
});
app.post('/api/emergency/:id/ignore', requireAuth, (req, res) => { db.prepare('INSERT OR IGNORE INTO request_ignores (user_id, request_id) VALUES (?,?)').run(req.user.id, req.params.id); res.json({ ok: true }); });
app.post('/api/emergency/:id/close', requireAuth, (req, res) => { const r = db.prepare('UPDATE emergency_requests SET status = ?, closed_at = ? WHERE id = ? AND requester_user_id = ?').run('closed', now(), req.params.id, req.user.id); res.json({ ok: r.changes > 0 }); });

// ---------- audit (own entries only) ----------
app.get('/api/audit', requireAuth, (req, res) => res.json({ entries: db.prepare('SELECT at, action, target, ip FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id) }));

// ---------- static ----------
const SITE = path.join(process.cwd(), 'site');
if (fs.existsSync(SITE)) app.use('/site', express.static(SITE));
const DIST = path.join(process.cwd(), 'dist');
if (fs.existsSync(DIST)) { app.use(express.static(DIST, { index: false })); app.get(/^(?!\/(api|auth)\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html'))); }
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => { console.error('[milo]', err.message); if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' }); res.status(500).json({ error: 'server_error' }); });

app.listen(PORT, () => console.log(`[milo] listening on ${PUBLIC_URL} (google=${GOOGLE_CONFIGURED ? 'on' : 'off'}, devAuth=${DEV_AUTH ? 'on' : 'off'}, providers=${PROVIDERS.map((p) => `${p.id}:${p.status().available ? 'ok' : 'needs-config'}`).join(',')})`));
