// Upstox adapter (OAuth 2.0). Real API; needs an Upstox developer app.
const REQUIRED = ['UPSTOX_API_KEY', 'UPSTOX_API_SECRET', 'MILO_PUBLIC_URL'];
const configured = () => REQUIRED.every((k) => !!process.env[k]);
export default {
  id: 'upstox', name: 'Upstox', kind: 'demat', demo: false, covers: 'Demat holdings and funds at Upstox', scopes: ['Holdings', 'Funds'],
  status() { return configured() ? { available: true } : { available: false, reason: 'Upstox API key/secret are not configured on this server.', requiredEnv: REQUIRED }; },
  async start(user, conn) { return { redirectUrl: `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${process.env.UPSTOX_API_KEY}&redirect_uri=${encodeURIComponent(`${process.env.MILO_PUBLIC_URL}/api/connections/${conn.id}/callback`)}&state=${conn.id}` }; },
  async complete(conn, params) {
    const res = await fetch('https://api.upstox.com/v2/login/authorization/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ code: params.code, client_id: process.env.UPSTOX_API_KEY, client_secret: process.env.UPSTOX_API_SECRET, redirect_uri: `${process.env.MILO_PUBLIC_URL}/api/connections/${conn.id}/callback`, grant_type: 'authorization_code' }) });
    const j = await res.json(); if (!j.access_token) throw new Error(j.message || 'Token exchange failed');
    return { tokens: { accessToken: j.access_token }, providerRef: j.user_id, label: `Upstox ${j.user_name || j.user_id}`, consentExpiresAt: null };
  },
  async sync(conn, tokens) {
    const h = { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' };
    const [hold, funds] = await Promise.all([fetch('https://api.upstox.com/v2/portfolio/long-term-holdings', { headers: h }).then((r) => r.json()), fetch('https://api.upstox.com/v2/user/get-funds-and-margin', { headers: h }).then((r) => r.json())]);
    if (hold.status !== 'success') throw new Error(hold.errors?.[0]?.message || 'Holdings failed');
    const value = (hold.data || []).reduce((a, x) => a + x.quantity * x.last_price, 0);
    return { accounts: [{ externalId: `${conn.provider_ref}-demat`, name: 'Upstox demat', institution: 'Upstox', type: 'demat', kind: 'asset', balance: value, mask: conn.provider_ref }, { externalId: `${conn.provider_ref}-cash`, name: 'Upstox funds', institution: 'Upstox', type: 'broker_cash', kind: 'asset', balance: Number(funds.data?.equity?.available_margin || 0), mask: conn.provider_ref }], transactions: [] };
  },
  async revoke(conn, tokens) { try { await fetch('https://api.upstox.com/v2/logout', { method: 'DELETE', headers: { Authorization: `Bearer ${tokens.accessToken}` } }); } catch { /* best effort */ } },
};
