// Data layer. SQLite via node:sqlite (no native build step). Every table that holds user data is
// keyed by user id, and every query in routes.js filters by the authenticated user.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.MILO_DB_PATH || path.join(process.cwd(), 'data', 'milo.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, email TEXT UNIQUE NOT NULL, email_verified INTEGER DEFAULT 0,
  name TEXT NOT NULL, picture TEXT, college_domain TEXT, created_at TEXT NOT NULL, last_login_at TEXT, helper_opt_in INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  ip TEXT, user_agent TEXT, revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider_id TEXT NOT NULL,
  status TEXT NOT NULL, -- pending | connected | error | expired | disconnected
  label TEXT, consent_scopes TEXT, consent_granted_at TEXT, consent_expires_at TEXT,
  token_ciphertext TEXT, provider_ref TEXT, last_sync_at TEXT, last_error TEXT, created_at TEXT NOT NULL, disconnected_at TEXT, demo INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conn_user ON connections(user_id);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  external_id TEXT, name TEXT NOT NULL, institution TEXT, type TEXT NOT NULL, kind TEXT NOT NULL, balance REAL NOT NULL, currency TEXT DEFAULT 'INR',
  mask TEXT, meta TEXT, balance_as_of TEXT, demo INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_acc_user ON accounts(user_id);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL, external_id TEXT, date TEXT NOT NULL, amount REAL NOT NULL, direction TEXT NOT NULL, merchant TEXT, descriptor TEXT,
  channel TEXT, category TEXT, meaning TEXT, purpose TEXT, counterpart_account_external_id TEXT, raw TEXT, demo INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_ext ON transactions(connection_id, external_id);
CREATE TABLE IF NOT EXISTS user_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, doc TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS splits (
  id TEXT PRIMARY KEY, payer_user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, total REAL NOT NULL, mode TEXT NOT NULL,
  shared_amount REAL DEFAULT 0, group_name TEXT, source_tx_id TEXT, shares TEXT NOT NULL, user_expense REAL NOT NULL, recoverable REAL NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY, split_id TEXT REFERENCES splits(id) ON DELETE CASCADE, creditor_user_id TEXT NOT NULL REFERENCES users(id), debtor_user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, title TEXT NOT NULL, amount REAL NOT NULL, remaining REAL NOT NULL, group_name TEXT, due_date TEXT, created_at TEXT NOT NULL, settled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ob_c ON obligations(creditor_user_id); CREATE INDEX IF NOT EXISTS idx_ob_d ON obligations(debtor_user_id);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES obligations(id) ON DELETE CASCADE, recorded_by TEXT NOT NULL, amount REAL NOT NULL, at TEXT NOT NULL, via TEXT
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY, inviter_user_id TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL, context TEXT, created_at TEXT NOT NULL, accepted_user_id TEXT, accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, text TEXT NOT NULL, link TEXT, ref TEXT, created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE TABLE IF NOT EXISTS emergency_requests (
  id TEXT PRIMARY KEY, requester_user_id TEXT NOT NULL REFERENCES users(id), amount REAL NOT NULL, reason TEXT NOT NULL, required_by TEXT NOT NULL, repayment_date TEXT NOT NULL,
  visibility TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT
);
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES emergency_requests(id) ON DELETE CASCADE, contributor_user_id TEXT NOT NULL REFERENCES users(id), amount REAL NOT NULL, at TEXT NOT NULL, obligation_id TEXT
);
CREATE TABLE IF NOT EXISTS request_ignores (user_id TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY (user_id, request_id));
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, target TEXT, ip TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, created_at TEXT NOT NULL, redirect TEXT);
`);

export const now = () => new Date().toISOString();
export const uid = (p = 'id') => `${p}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

export function audit(userId, action, target, ip, detail) {
  db.prepare('INSERT INTO audit_log (at, user_id, action, target, ip, detail) VALUES (?,?,?,?,?,?)').run(now(), userId || null, action, target || null, ip || null, detail ? JSON.stringify(detail).slice(0, 2000) : null);
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, picture: u.picture || null, collegeDomain: u.college_domain || null };
}

export function defaultDoc() {
  return { goals: [], commitments: [], subscriptions: [], allowance: null, manualTransactions: [], txOverrides: {}, merchantMemory: {}, purposeMemory: {}, peerCorrections: [], reminders: [], scoreHistory: [], notificationsRead: [], settings: { reminderEveryDays: 7 }, contactsCache: [], onboarded: false };
}

export function getDoc(userId) {
  const row = db.prepare('SELECT doc, version, updated_at FROM user_state WHERE user_id = ?').get(userId);
  if (!row) return { doc: defaultDoc(), version: 0, updatedAt: null };
  return { doc: { ...defaultDoc(), ...JSON.parse(row.doc) }, version: row.version, updatedAt: row.updated_at };
}

export function putDoc(userId, doc, expectedVersion) {
  const cur = db.prepare('SELECT version FROM user_state WHERE user_id = ?').get(userId);
  if (cur && expectedVersion != null && cur.version !== expectedVersion) return { conflict: true, version: cur.version };
  const version = (cur?.version || 0) + 1;
  if (cur) db.prepare('UPDATE user_state SET doc = ?, version = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(doc), version, now(), userId);
  else db.prepare('INSERT INTO user_state (user_id, doc, version, updated_at) VALUES (?,?,?,?)').run(userId, JSON.stringify(doc), version, now());
  return { version };
}
