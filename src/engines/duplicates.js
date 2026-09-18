// Duplicate Payment Detector: same amount across sources within 3 days, or opposite-direction
// pairs (possible reversal/refund). Never auto-deletes; flags for user review.
import { daysBetween, isoDay, toDate } from './utils.js';

export function detectDuplicates(transactions, accounts) {
  const acct = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const flags = [];
  const seen = new Set();
  const list = transactions.filter((t) => !t.internalTransfer && t.category !== 'peer');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j];
      if (Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) > 0.5) continue;
      if (Math.abs(daysBetween(a.date, b.date)) > 3) continue;
      const key = [a.id, b.id].sort().join('|');
      if (seen.has(key)) continue;
      const sameMerchant = norm(a.merchant) && norm(a.merchant) === norm(b.merchant);
      const differentSource = a.accountId !== b.accountId || a.channel !== b.channel;
      if (a.direction !== b.direction && (sameMerchant || differentSource)) {
        seen.add(key);
        flags.push({ id: key, kind: 'reversal', pair: [a, b], resolved: a.dupResolution || b.dupResolution, reason: `A ${chan(a, acct)} ${a.direction === 'out' ? 'payment' : 'credit'} and a ${chan(b, acct)} ${b.direction === 'out' ? 'payment' : 'credit'} of the same amount within ${Math.abs(daysBetween(a.date, b.date))} day(s). This may be a reversal or refund rather than two real transactions.` });
        continue;
      }
      // Same-source repeats (e.g. canteen ₹100 on Monday and Thursday) are normal life, not duplicates:
      // only flag them when they land on the same day and are large enough to matter.
      const sameDay = isoDay(a.date) === isoDay(b.date);
      const sameSourceSuspicious = sameMerchant && sameDay && Math.abs(a.amount) >= 300;
      if (a.direction === b.direction && a.direction === 'out' && (differentSource || sameSourceSuspicious)) {
        seen.add(key);
        flags.push({ id: key, kind: 'duplicate', pair: [a, b], resolved: a.dupResolution || b.dupResolution, reason: `Two ${a.direction === 'out' ? 'payments' : 'credits'} of the same amount${sameMerchant ? ` to ${a.merchant}` : ''} via ${chan(a, acct)} and ${chan(b, acct)} within ${Math.abs(daysBetween(a.date, b.date))} day(s). Either the same transaction was imported twice, or it was paid once and reversed.` });
      }
    }
  }
  return flags;
}

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function chan(t, acct) { return t.channel === 'card' ? 'credit-card' : t.channel === 'upi' ? 'UPI' : (acct[t.accountId]?.name || 'bank'); }
