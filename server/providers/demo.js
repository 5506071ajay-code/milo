// Demo sandbox provider. It is the ONLY source of synthetic data in MILO, it must be connected
// deliberately by the user, and every account/transaction it produces is flagged demo=true so the
// UI can label it. It exists so the product can be explored before a real institution is linked.
import { buildSeed } from '../../src/data/seed.js';

export default {
  id: 'demo_sandbox', name: 'Demo sandbox (sample data)', kind: 'demo', demo: true,
  covers: 'A realistic sample student: two savings accounts, mutual funds, demat, FD, credit card and an education loan, with 110 days of transactions. Clearly labelled as demo everywhere.',
  scopes: ['Nothing real: no institution is contacted'],
  status() { return process.env.MILO_DISABLE_DEMO === 'true' ? { available: false, reason: 'Demo data is disabled on this server.' } : { available: true }; },
  async start() { return { ready: true }; },
  async complete(conn) { return { tokens: { seed: conn.id }, providerRef: 'demo', label: 'Demo sandbox', consentExpiresAt: null }; },
  async sync() {
    const s = buildSeed(new Date());
    const accounts = s.accounts.filter((a) => a.connected).map((a) => ({ externalId: a.id, name: a.name, institution: a.institution, type: a.type, kind: a.kind, balance: a.balance, mask: a.mask, meta: a.limit ? { limit: a.limit } : null }));
    const transactions = s.transactions.map((t) => ({ accountExternalId: t.accountId, externalId: t.id, date: t.date, amount: t.amount, direction: t.direction, merchant: t.merchant, descriptor: t.descriptor, channel: t.channel, category: t.category || null, meaning: t.meaning || null, purpose: t.purpose || null, counterpartAccountExternalId: t.counterpartAccountId || null, raw: { internalTransfer: !!t.internalTransfer, purposeAllocations: t.purposeAllocations || null } }));
    return { accounts, transactions, suggestedCommitments: s.commitments, suggestedSubscriptions: s.subscriptions, suggestedAllowance: s.allowance };
  },
  async revoke() { /* nothing to revoke */ },
};
