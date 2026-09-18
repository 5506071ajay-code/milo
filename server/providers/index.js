// Provider registry. Adding an institution = adding one adapter file that implements:
//   status()               -> { available, reason, requiredEnv }
//   start(user, conn)      -> { redirectUrl } | { ready: true }   (consent / OAuth hand-off)
//   complete(conn, params) -> { tokens, providerRef, label, consentExpiresAt }
//   sync(conn, tokens)     -> { accounts:[], transactions:[], tokens? }
//   revoke(conn, tokens)   -> void
// Nothing in the core application knows anything provider-specific.
import demo from './demo.js';
import setuAA from './setu-aa.js';
import zerodha from './zerodha-kite.js';
import upstox from './upstox.js';

export const PROVIDERS = [setuAA, zerodha, upstox, demo];
export function getProvider(id) { return PROVIDERS.find((p) => p.id === id) || null; }
export function describeProviders() {
  return PROVIDERS.map((p) => ({ id: p.id, name: p.name, kind: p.kind, covers: p.covers, scopes: p.scopes, demo: !!p.demo, inputs: p.inputs || [], ...p.status() }));
}
