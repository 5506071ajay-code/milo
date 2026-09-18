// Consent-based financial-data infrastructure boundary.
// This is a SIMULATED Account Aggregator client with the same shape a real integration would
// have (discover → consent → fetch). Swap the internals for a real AA provider (Finvu, Onemoney,
// etc.). The AA itself never sees or stores the financial information it transmits; here the
// "FIP" data is generated locally.
import { uid, addDays, isoDay } from '../engines/utils.js';

export const INSTITUTIONS = [
  { id: 'hdfc', name: 'HDFC Bank', types: ['savings', 'credit_card', 'deposit'] },
  { id: 'sbi', name: 'State Bank of India', types: ['savings', 'loan'] },
  { id: 'icici', name: 'ICICI Bank', types: ['savings', 'credit_card'] },
  { id: 'axis', name: 'Axis Bank', types: ['savings', 'credit_card'] },
  { id: 'kotak', name: 'Kotak Mahindra', types: ['savings'] },
  { id: 'zerodha', name: 'Zerodha (CDSL)', types: ['demat'] },
  { id: 'groww', name: 'Groww (CAMS)', types: ['mutual_fund'] },
  { id: 'star', name: 'Star Health', types: ['insurance'] },
  { id: 'nsdl', name: 'NSDL NPS', types: ['pension'] },
];

export const TYPE_LABELS = { savings: 'Savings account', current: 'Current account', credit_card: 'Credit card', deposit: 'Fixed deposit', loan: 'Loan', demat: 'Demat', mutual_fund: 'Mutual funds', insurance: 'Insurance', pension: 'Pension / NPS' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Step 1: discover accounts the user holds at the institution (simulated). */
export async function discoverAccounts(institutionId, type) {
  await wait(700);
  const inst = INSTITUTIONS.find((i) => i.id === institutionId);
  return [{ id: uid('disc'), institution: inst.name, type, mask: `••${Math.floor(1000 + Math.random() * 9000)}` }];
}

/** Step 2: user grants consent. Returns a consent artefact. */
export async function grantConsent({ institution, type, purpose, months }) {
  await wait(500);
  return { id: uid('cons'), provider: 'Account Aggregator (Finvu)', scope: `${institution} · ${TYPE_LABELS[type]}`, purpose, validTill: isoDay(addDays(new Date(), months * 30)), status: 'active', grantedAt: new Date().toISOString() };
}

/** Step 3: fetch balances + recent transactions through the consent (simulated FIP data). */
export async function fetchAccountData(discovered, type) {
  await wait(1100);
  const balance = type === 'credit_card' ? 4200 : type === 'loan' ? 55000 : type === 'demat' ? 18000 : type === 'mutual_fund' ? 12500 : type === 'deposit' ? 25000 : 6400;
  const kind = ['credit_card', 'loan'].includes(type) ? 'liability' : 'asset';
  const account = { id: uid('acc'), name: `${discovered.institution.split(' ')[0]} ${TYPE_LABELS[type]}`, institution: discovered.institution, type, kind, balance, mask: discovered.mask, connected: true, connectedAt: new Date().toISOString(), lastSync: new Date().toISOString() };
  const txs = [];
  if (['savings', 'credit_card'].includes(type)) {
    const now = new Date();
    const mk = (daysAgo, hour, amount, merchant, descriptor, category, meaning) => { const d = addDays(now, -daysAgo); d.setHours(hour, 0, 0, 0); return { id: uid('tx'), date: d.toISOString(), amount, direction: 'out', merchant, descriptor, category, meaning, channel: type === 'credit_card' ? 'card' : 'upi', accountId: account.id, source: 'Account Aggregator', purpose: 'monthly_living' }; };
    txs.push(mk(1, 13, 140, 'Campus Canteen', 'UPI/CAMPUS CANTEEN', 'food', 'Lunch'));
    txs.push(mk(2, 20, 380, 'Zomato', 'UPI/ZOMATO', 'food_delivery', 'Order'));
    txs.push(mk(4, 9, 45, 'BMTC', 'UPI/BMTC', 'transport', 'Bus'));
    txs.push({ ...mk(5, 19, 720, 'RK FOODS AND CATERERS', 'UPI – RK FOODS AND CATERERS – ₹720', null, null), needsReview: true, upiUnknown: true, purpose: undefined });
  }
  return { account, transactions: txs };
}

/** Refresh: simulate a sync pass that returns nothing new. */
export async function refreshAccount() {
  await wait(800);
  return { newTransactions: [], syncedAt: new Date().toISOString() };
}
