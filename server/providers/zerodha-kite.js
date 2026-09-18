// Zerodha Kite Connect adapter (Demat holdings + margins). Real API; needs an approved Kite Connect app.
import { createHash } from 'node:crypto';
const REQUIRED = ['KITE_API_KEY', 'KITE_API_SECRET', 'MILO_PUBLIC_URL'];
const configured = () => REQUIRED.every((k) => !!process.env[k]);
async function kite(path, token, method = 'GET', body) {
  const res = await fetch(`https://api.kite.trade${path}`, { method, headers: { 'X-Kite-Version': '3', Authorization: `token ${process.env.KITE_API_KEY}:${token}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body });
  const j = await res.json(); if (j.status !== 'success') throw new Error(`Kite ${path}: ${j.message || res.status}`); return j.data;
}
export default {
  id: 'zerodha_kite', name: 'Zerodha (Kite Connect)', kind: 'demat', demo: false,
  covers: 'Demat holdings, mutual fund holdings and available cash at Zerodha', scopes: ['Holdings', 'Positions', 'Margins'],
  status() { return configured() ? { available: true } : { available: false, reason: 'Kite Connect API key/secret are not configured on this server.', requiredEnv: REQUIRED }; },
  async start(user, conn) { return { redirectUrl: `https://kite.zerodha.com/connect/login?v=3&api_key=${process.env.KITE_API_KEY}&redirect_params=${encodeURIComponent(`conn=${conn.id}`)}` }; },
  async complete(conn, params) {
    const requestToken = params.request_token; if (!requestToken) throw new Error('Missing request_token');
    const checksum = createHash('sha256').update(process.env.KITE_API_KEY + requestToken + process.env.KITE_API_SECRET).digest('hex');
    const res = await fetch('https://api.kite.trade/session/token', { method: 'POST', headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ api_key: process.env.KITE_API_KEY, request_token: requestToken, checksum }) });
    const j = await res.json(); if (j.status !== 'success') throw new Error(j.message || 'Token exchange failed');
    // Kite access tokens expire daily at ~6 AM IST: the connection is marked expired on the next failed sync and the user re-authorises.
    return { tokens: { accessToken: j.data.access_token }, providerRef: j.data.user_id, label: `Zerodha ${j.data.user_id}`, consentExpiresAt: null };
  },
  async sync(conn, tokens) {
    const [holdings, margins] = await Promise.all([kite('/portfolio/holdings', tokens.accessToken), kite('/user/margins', tokens.accessToken)]);
    const value = holdings.reduce((a, h) => a + h.quantity * h.last_price, 0);
    return { accounts: [
      { externalId: `${conn.provider_ref}-demat`, name: 'Zerodha demat', institution: 'Zerodha (CDSL)', type: 'demat', kind: 'asset', balance: value, mask: conn.provider_ref, meta: { holdings: holdings.map((h) => ({ symbol: h.tradingsymbol, qty: h.quantity, ltp: h.last_price, pnl: h.pnl })) } },
      { externalId: `${conn.provider_ref}-cash`, name: 'Zerodha available cash', institution: 'Zerodha', type: 'broker_cash', kind: 'asset', balance: Number(margins.equity?.available?.cash || 0), mask: conn.provider_ref },
    ], transactions: [] };
  },
  async revoke(conn, tokens) { try { await fetch(`https://api.kite.trade/session/token?api_key=${process.env.KITE_API_KEY}&access_token=${tokens.accessToken}`, { method: 'DELETE', headers: { 'X-Kite-Version': '3' } }); } catch { /* best effort */ } },
};
