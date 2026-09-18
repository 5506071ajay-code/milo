// RBI Account Aggregator adapter (Setu FIU APIs, v2). Sandbox base is fiu-uat.setu.co; production is
// the FIU sub-domain Setu provisions after Sahamati onboarding. Needs credentials from bridge.setu.co.
const BASE = process.env.SETU_AA_BASE_URL || 'https://fiu-uat.setu.co';
const REQUIRED = ['SETU_AA_CLIENT_ID', 'SETU_AA_CLIENT_SECRET', 'SETU_AA_PRODUCT_INSTANCE_ID', 'MILO_PUBLIC_URL'];
const configured = () => REQUIRED.every((k) => !!process.env[k]);
const headers = () => ({ 'Content-Type': 'application/json', 'x-client-id': process.env.SETU_AA_CLIENT_ID, 'x-client-secret': process.env.SETU_AA_CLIENT_SECRET, 'x-product-instance-id': process.env.SETU_AA_PRODUCT_INSTANCE_ID });
async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${BASE}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`Setu AA ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export default {
  id: 'setu_aa', name: 'Bank accounts via Account Aggregator (Setu)', kind: 'bank', demo: false,
  covers: 'Savings, current, deposits, credit cards, loans and mutual funds at any RBI-AA-enabled institution (HDFC, SBI, ICICI, Axis, Kotak and 100+ more)',
  scopes: ['Profile', 'Summary (balances)', 'Transactions (last 12 months)'],
  // Extra input MILO must collect before starting: the mobile number registered with the bank (the AA identity).
  inputs: [{ key: 'mobile', label: 'Mobile number registered with your bank', placeholder: '10-digit mobile', pattern: '^[6-9][0-9]{9}$', hint: 'Used only to identify you on the Account Aggregator. Never shared elsewhere.' }],
  status() {
    return configured() ? { available: true, sandbox: BASE.includes('uat') } : { available: false, reason: 'Account Aggregator credentials are not configured on this server.', requiredEnv: REQUIRED };
  },
  async start(user, conn, inputs = {}) {
    const mobile = String(inputs.mobile || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new Error('A valid 10-digit Indian mobile number is required.');
    const from = new Date(); from.setFullYear(from.getFullYear() - 1);
    const consent = await api('/v2/consents', {
      vua: mobile,
      consentDuration: { unit: 'MONTH', value: 12 },
      consentMode: 'STORE',
      fetchType: 'PERIODIC',
      frequency: { unit: 'DAY', value: 1 },
      dataLife: { unit: 'MONTH', value: 12 },
      consentTypes: ['PROFILE', 'SUMMARY', 'TRANSACTIONS'],
      fiTypes: ['DEPOSIT', 'TERM_DEPOSIT', 'RECURRING_DEPOSIT', 'CREDIT_CARD', 'MUTUAL_FUNDS'],
      purpose: { code: '101', refUri: 'https://api.rebit.org.in/aa/purpose/101.xml', text: 'Wealth management service', category: { type: 'string' } },
      dataRange: { from: iso(from), to: iso(new Date()) },
      context: [{ key: 'accountSelectionMode', value: 'multi' }],
      redirectUrl: `${process.env.MILO_PUBLIC_URL}/api/connections/${conn.id}/callback`,
    });
    return { redirectUrl: consent.url, providerRef: consent.id };
  },
  async complete(conn, params) {
    if (params.success === 'false' || params.success === false) throw new Error(params.errorcode === '1' ? 'You rejected the consent request.' : params.errorcode === '5' ? 'You cancelled the consent request.' : `Consent was not approved (${params.errormsg || params.errorcode || 'unknown reason'}).`);
    const status = await api(`/v2/consents/${conn.provider_ref}`);
    if (status.status !== 'ACTIVE') throw new Error(`Consent is ${status.status}, not ACTIVE yet. Try syncing again in a minute.`);
    const dr = status.detail?.FIDataRange || status.detail?.dataRange || status.Detail?.FIDataRange;
    const from = new Date(); from.setFullYear(from.getFullYear() - 1);
    const session = await api('/v2/sessions', { consentId: conn.provider_ref, dataRange: dr ? { from: dr.from, to: dr.to } : { from: iso(from), to: iso(new Date()) }, format: 'json' });
    return { tokens: { consentId: conn.provider_ref, sessionId: session.id }, providerRef: conn.provider_ref, label: `Account Aggregator (${status.detail?.Customer?.id || status.vua || 'bank'})`, consentExpiresAt: status.detail?.consentExpiry || null };
  },
  async sync(conn, tokens) {
    let data = await api(`/v2/sessions/${tokens.sessionId}`);
    if (data.status === 'PENDING') { await new Promise((r) => setTimeout(r, 4000)); data = await api(`/v2/sessions/${tokens.sessionId}`); }
    if (['EXPIRED', 'FAILED'].includes(data.status)) {
      // Data sessions are single-use; open a fresh one under the same consent.
      const from = new Date(); from.setFullYear(from.getFullYear() - 1);
      const session = await api('/v2/sessions', { consentId: tokens.consentId, dataRange: { from: iso(from), to: iso(new Date()) }, format: 'json' });
      await new Promise((r) => setTimeout(r, 4000));
      data = await api(`/v2/sessions/${session.id}`); tokens = { ...tokens, sessionId: session.id };
    }
    if (data.status === 'PENDING') throw new Error('The bank has not delivered the data yet. Sync again in a minute.');
    const accounts = []; const transactions = [];
    for (const fip of data.fips || []) for (const acc of fip.accounts || []) {
      const a = acc.data?.account || {};
      const summary = a.summary || {};
      const fiType = String(acc.FIType || acc.fiType || a.type || '').toUpperCase();
      const type = fiType.includes('TERM') ? 'deposit' : fiType.includes('RECURRING') ? 'deposit' : fiType.includes('CREDIT') ? 'credit_card' : fiType.includes('MUTUAL') ? 'mutual_fund' : (String(a.type || summary.type || '').toLowerCase().includes('current') ? 'current' : 'savings');
      const kind = type === 'credit_card' ? 'liability' : 'asset';
      const balance = Number(summary.currentBalance ?? summary.currentValue ?? summary.balance ?? 0);
      accounts.push({ externalId: acc.linkRefNumber, name: `${fip.fipName || fip.fipID} ${type === 'credit_card' ? 'credit card' : type}`, institution: fip.fipName || fip.fipID, type, kind, balance: kind === 'liability' ? Math.abs(balance) : balance, mask: `••${String(acc.maskedAccNumber || '').slice(-4)}`, meta: { fiType, branch: summary.branch, ifsc: summary.ifscCode } });
      for (const t of a.transactions?.transaction || []) transactions.push({ accountExternalId: acc.linkRefNumber, externalId: t.txnId || `${acc.linkRefNumber}:${t.transactionTimestamp}:${t.amount}:${t.currentBalance}`, date: t.transactionTimestamp || t.valueDate, amount: Number(t.amount), direction: t.type === 'CREDIT' ? 'in' : 'out', merchant: (t.narration || '').trim().slice(0, 80), descriptor: t.narration, channel: (t.mode || '').toLowerCase() || 'bank' });
    }
    return { accounts, transactions, tokens };
  },
  async revoke(conn) { try { await api(`/v2/consents/${conn.provider_ref}/revoke`, {}); } catch { /* best effort */ } },
};
