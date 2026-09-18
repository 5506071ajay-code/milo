// AI Categorisation Engine + UPI Merchant Intelligence + internal-transfer recognition.
// Deterministic scoring over the signals named in the spec: merchant, history, amount,
// frequency, direction, known contacts, prior corrections, related transactions, group info.

import { PEER_MEANINGS, topCategory } from './taxonomy.js';
import { daysBetween, toDate } from './utils.js';

/** Default merchant memory. User corrections extend/override this at runtime. */
export const DEFAULT_MERCHANT_MEMORY = {
  starbucks: { category: 'coffee', label: 'Coffee', ambiguous: false },
  blinkit: { category: 'groceries', label: 'Groceries', ambiguous: false },
  uber: { category: 'transport', label: 'Transport', ambiguous: false },
  ola: { category: 'transport', label: 'Transport', ambiguous: false },
  rapido: { category: 'transport', label: 'Transport', ambiguous: false },
  amazon: { category: 'shopping', label: 'Shopping', ambiguous: false },
  flipkart: { category: 'shopping', label: 'Shopping', ambiguous: false },
  swiggy: { category: 'food_delivery', label: 'Food delivery', ambiguous: false },
  zomato: { category: 'food_delivery', label: 'Food delivery', ambiguous: false },
  netflix: { category: 'subscription', label: 'Subscription', ambiguous: false },
  spotify: { category: 'subscription', label: 'Subscription', ambiguous: false },
  bookmyshow: { category: 'entertainment', label: 'Entertainment', ambiguous: false },
  bmtc: { category: 'transport', label: 'Transport', ambiguous: false },
  metro: { category: 'transport', label: 'Transport', ambiguous: false },
  'chai point': { category: 'coffee', label: 'Coffee', ambiguous: false },
  'campus canteen': { category: 'food', label: 'Food', ambiguous: false },
  'xerox': { category: 'college', label: 'College', ambiguous: false },
  'stationery': { category: 'college', label: 'College', ambiguous: false },
  'pharmacy': { category: 'health', label: 'Health', ambiguous: false },
};

/** Parse a raw UPI descriptor like "UPI – ABC ENTERPRISES – ₹650" or "UPI/123/RAHUL S". */
export function parseUpiDescriptor(raw) {
  if (!raw) return { merchant: '', raw: '' };
  const cleaned = raw.replace(/₹\s?[\d,]+(\.\d+)?/g, '').replace(/\bUPI\b/gi, '');
  const parts = cleaned.split(/[–—\-\/|]/).map((s) => s.trim()).filter(Boolean);
  const merchant = parts.find((p) => !/^\d+$/.test(p)) || parts[0] || raw;
  return { merchant: merchant.replace(/\s+/g, ' ').trim(), raw };
}

function normalise(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Look a merchant up in memory (memory keys are substrings of the merchant name). */
export function lookupMerchant(merchantName, memory) {
  const n = normalise(merchantName);
  for (const key of Object.keys(memory)) {
    if (n.includes(normalise(key))) return { key, ...memory[key] };
  }
  return null;
}

/**
 * Infer the meaning of an unknown UPI merchant from context: amount band, time of day,
 * descriptor keywords, and how the user previously classified similar amounts/merchants.
 */
export function inferUpiMerchant(tx, memory, history = []) {
  const { merchant } = parseUpiDescriptor(tx.descriptor || tx.merchant);
  const known = lookupMerchant(merchant, memory);
  if (known) {
    return {
      merchant,
      category: known.category,
      meaning: known.label,
      confidence: known.userCorrected ? 0.98 : 0.92,
      ambiguous: !!known.ambiguous,
      reason: known.userCorrected ? 'You taught this merchant earlier' : 'Known merchant in memory',
    };
  }
  const name = normalise(merchant);
  const hour = toDate(tx.date).getHours();
  const amt = Math.abs(tx.amount);
  const candidates = [];
  const push = (category, meaning, score, reason) => candidates.push({ category, meaning, score, reason });

  if (/enterprise|foods|restaurant|cafe|kitchen|hotel|dhaba|biryani|pizza|burger/.test(name)) {
    const isDinner = hour >= 19 && hour <= 23;
    const isLunch = hour >= 12 && hour <= 15;
    push('dining', isDinner ? 'Dinner' : isLunch ? 'Lunch' : 'Meal', 0.55 + (isDinner || isLunch ? 0.2 : 0), `Descriptor looks like a restaurant${isDinner ? ' and it was paid at dinner time' : ''}`);
  }
  if (/mart|store|super|bazaar|kirana|grocer/.test(name)) push('groceries', 'Groceries', 0.7, 'Descriptor looks like a store');
  if (/cab|auto|travels|bus|petrol|fuel/.test(name)) push('transport', 'Transport', 0.7, 'Descriptor looks like transport');
  if (/book|xerox|print|stationer|academy|college|univ/.test(name)) push('college', 'College', 0.7, 'Descriptor looks like college spending');
  if (/med|pharma|clinic|hospital/.test(name)) push('health', 'Health', 0.75, 'Descriptor looks like healthcare');

  // Amount + time heuristics for genuinely unknown merchants
  if (candidates.length === 0) {
    if (amt < 200) push('food', 'Small food purchase', 0.4, 'Small amount, typical of canteen/snack spending');
    else if (amt >= 200 && amt <= 1200 && hour >= 19) push('dining', 'Dinner', 0.5, 'Evening payment in a typical dinner range');
    else if (amt > 1200) push('shopping', 'Shopping', 0.35, 'Larger one-off payment');
    else push('other', 'Unclassified merchant', 0.3, 'No matching signal');
  }

  // Learn from similar history: same merchant name corrected before
  const similar = history.filter((h) => h.userCorrected && normalise(h.merchant) === name);
  if (similar.length) {
    const cat = similar[similar.length - 1].category;
    push(cat, similar[similar.length - 1].meaning || cat, 0.95, 'You corrected this merchant before');
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const ambiguous = top.score < 0.6 || (candidates[1] && candidates[1].score >= top.score - 0.1);
  return {
    merchant,
    category: top.category,
    meaning: top.meaning,
    confidence: top.score,
    ambiguous,
    reason: top.reason,
    alternatives: candidates.slice(1, 3),
  };
}

/**
 * Interpret a transfer to/from a known contact.
 * Returns ranked interpretations (dinner split, loan repayment, money transfer, gift,
 * rent contribution, trip expense) with the evidence used.
 */
export function interpretPeerTransaction(tx, ctx) {
  const { contact, obligations = [], groups = [], corrections = [], transactions = [] } = ctx;
  const amt = Math.abs(tx.amount);
  const date = toDate(tx.date);
  const hour = date.getHours();
  const dir = tx.direction; // 'out' | 'in'
  const scores = Object.fromEntries(PEER_MEANINGS.map((m) => [m.id, { score: 0.1, evidence: [] }]));
  const add = (id, s, why) => { scores[id].score += s; scores[id].evidence.push(why); };

  // Open obligations with this contact
  const open = obligations.filter((o) => o.contactId === contact?.id && o.remaining > 0.5);
  const iOweThem = open.filter((o) => o.direction === 'i_owe');
  const theyOweMe = open.filter((o) => o.direction === 'they_owe');
  if (dir === 'out' && iOweThem.length) {
    const exact = iOweThem.find((o) => Math.abs(o.remaining - amt) < 1);
    add('loan_repayment', exact ? 0.6 : 0.3, exact ? `Matches exactly what you owed ${contact.name} (${exact.title})` : `You have open balances with ${contact.name}`);
    if (iOweThem.some((o) => o.kind === 'split')) add('dinner_split', 0.15, 'Open split with this person');
  }
  if (dir === 'in' && theyOweMe.length) {
    const exact = theyOweMe.find((o) => Math.abs(o.remaining - amt) < 1);
    add('loan_repayment', exact ? 0.6 : 0.3, exact ? `Matches what ${contact.name} owed you` : `${contact.name} has open balances with you`);
  }

  // Active group trip
  const trip = groups.find((g) => g.memberIds?.includes(contact?.id) && g.type === 'trip' && g.active);
  if (trip) add('trip_expense', 0.35, `Both of you are in the active "${trip.name}" group`);

  // Recent restaurant transaction around the same time
  const dinnerNearby = transactions.find((t) => t.id !== tx.id && ['dining', 'food_delivery'].includes(t.category) && Math.abs(daysBetween(t.date, tx.date)) <= 1 && Math.abs(t.amount) > amt);
  if (dinnerNearby) add('dinner_split', 0.3, `A larger restaurant payment (${dinnerNearby.merchant}) happened within a day`);
  if (hour >= 19 && hour <= 23 && amt <= 2500) add('dinner_split', 0.15, 'Sent at dinner time');

  // Rent contribution: roommate + month-start + typical rent share
  if (contact?.roommate && date.getDate() <= 7 && amt >= 3000) add('rent_contribution', 0.5, `${contact.name} is your roommate and this is at the start of the month`);
  if (contact?.roommate && amt >= 3000) add('rent_contribution', 0.15, 'Amount is in a typical rent-share range');

  // Round numbers with no linked obligation feel like plain transfers
  if (amt % 500 === 0 && !open.length) add('money_transfer', 0.3, 'Round amount with nothing outstanding');
  if (tx.note && /birthday|gift|treat/i.test(tx.note)) add('gift', 0.6, 'Note mentions a gift');
  if (tx.note && /rent/i.test(tx.note)) add('rent_contribution', 0.5, 'Note mentions rent');
  if (tx.note && /dinner|lunch|food/i.test(tx.note)) add('dinner_split', 0.5, 'Note mentions food');
  if (tx.note && /trip|goa|travel/i.test(tx.note)) add('trip_expense', 0.5, 'Note mentions a trip');

  // Learning from corrections: same contact + similar amount band → prior meaning
  const past = corrections.filter((c) => c.contactId === contact?.id);
  for (const c of past) {
    const close = Math.abs(c.amount - amt) / Math.max(c.amount, 1) < 0.25;
    add(c.meaning, close ? 0.45 : 0.15, close ? `You previously marked a similar amount to ${contact.name} as ${PEER_MEANINGS.find((m) => m.id === c.meaning)?.label}` : 'Past correction with this person');
  }

  const ranked = PEER_MEANINGS.map((m) => ({ ...m, score: Math.min(scores[m.id].score, 0.99), evidence: scores[m.id].evidence }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const ambiguous = top.score < 0.5 || (ranked[1].score > top.score - 0.12);
  return { ranked, top, ambiguous };
}

/**
 * Internal-transfer recognition: an outflow from one of the user's accounts that matches an
 * inflow into another of the user's accounts (same amount, within 2 days).
 */
export function detectInternalTransfers(transactions, accounts) {
  const own = new Set(accounts.map((a) => a.id));
  const result = transactions.map((t) => ({ ...t }));
  for (const t of result) {
    if (t.internalTransfer || t.direction !== 'out' || !own.has(t.accountId)) continue;
    const match = result.find((u) => u.id !== t.id && u.direction === 'in' && own.has(u.accountId) && u.accountId !== t.accountId
      && Math.abs(Math.abs(u.amount) - Math.abs(t.amount)) < 1 && Math.abs(daysBetween(u.date, t.date)) <= 2 && !u.internalTransfer
      && (u.counterpartAccountId === t.accountId || t.counterpartAccountId === u.accountId || /transfer|neft|imps|self/i.test(`${t.descriptor} ${u.descriptor}`)));
    if (match) {
      t.internalTransfer = true; t.category = 'internal_transfer'; t.linkedTxId = match.id;
      match.internalTransfer = true; match.category = 'internal_transfer'; match.linkedTxId = t.id;
    }
  }
  return result;
}

/** Human readable context path: Income → Parent allowance → Monthly allowance */
export function contextPath(tx, contacts = []) {
  if (tx.internalTransfer) return ['Internal transfer', 'Not an expense'];
  if (tx.category === 'peer' || tx.contactId) {
    const c = contacts.find((x) => x.id === tx.contactId);
    const meaning = PEER_MEANINGS.find((m) => m.id === tx.peerMeaning)?.label || 'Money transfer';
    return ['Peer transaction', c?.name || tx.merchant, meaning];
  }
  if (tx.direction === 'in') {
    const src = tx.category === 'parent_allowance' ? 'Parent allowance' : tx.category === 'scholarship' ? 'Scholarship' : tx.category === 'internship' ? 'Internship income' : tx.category === 'refund' ? 'Refund' : 'Income';
    return ['Income', src, tx.meaning || tx.merchant];
  }
  if (!tx.category) return ['Expense', 'Unclassified', tx.meaning || tx.merchant || 'Unknown merchant'];
  const top = topCategory(tx.category);
  const path = ['Expense', cap(top)];
  if (top !== tx.category) path.push(cap(String(tx.category).replace('_', ' ')));
  path.push(tx.meaning || tx.merchant);
  return path;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
