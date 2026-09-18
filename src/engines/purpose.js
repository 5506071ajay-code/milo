// Purpose-Based Money: inference from source/context, allocation, reserved vs spendable money.
import { PURPOSES } from './taxonomy.js';
import { round2, sum } from './utils.js';

/** Infer a purpose for an incoming transaction from its source and learned memory. */
export function inferPurpose(tx, purposeMemory = {}) {
  const key = (tx.merchant || '').toLowerCase();
  const learned = Object.entries(purposeMemory).find(([k]) => key.includes(k));
  if (learned) return { purpose: learned[1].purpose, confidence: 0.95, reason: `You told us money from ${tx.merchant} is usually for ${label(learned[1].purpose)}` };
  if (tx.category === 'parent_allowance') return { purpose: 'monthly_living', confidence: 0.75, reason: 'Money from a parent is usually for monthly living' };
  if (tx.category === 'scholarship') return { purpose: 'tuition', confidence: 0.85, reason: 'Scholarship credits are usually education funding' };
  if (tx.category === 'internship') return { purpose: 'unrestricted', confidence: 0.7, reason: 'Internship income is usually yours to decide on' };
  if (tx.category === 'refund') return { purpose: 'unrestricted', confidence: 0.6, reason: 'Refunds return money to your flexible balance' };
  return { purpose: 'unrestricted', confidence: 0.4, reason: 'No strong signal about what this money is for' };
}

export function label(id) { return PURPOSES.find((p) => p.id === id)?.label || id; }

/** Validate an allocation set for an incoming amount. Allocations must total the transaction. */
export function validateAllocation(total, allocations) {
  const clean = allocations.filter((a) => Number(a.amount) > 0);
  const alloc = round2(sum(clean, (a) => Number(a.amount)));
  if (alloc > round2(total) + 0.005) return { ok: false, error: `Allocated ${alloc} is more than the ${total} received.` };
  if (alloc < round2(total) - 0.005) return { ok: false, error: `${round2(total - alloc)} is still unallocated. Put it somewhere, or mark it as unrestricted.`, unallocated: round2(total - alloc) };
  return { ok: true };
}

/**
 * Purpose buckets: allocated (from incoming allocations) minus consumed (expenses tagged to purpose).
 * Returns balance per purpose and the reserved total (everything except unrestricted).
 */
export function purposeBalances(transactions) {
  const buckets = Object.fromEntries(PURPOSES.map((p) => [p.id, { id: p.id, label: p.label, allocated: 0, consumed: 0, balance: 0 }]));
  for (const t of transactions) {
    if (t.excluded || t.internalTransfer) continue;
    if (t.direction === 'in' && t.purposeAllocations?.length) {
      for (const a of t.purposeAllocations) {
        if (buckets[a.purpose]) buckets[a.purpose].allocated += Number(a.amount) || 0;
      }
    }
    if (t.direction === 'out' && t.purpose && buckets[t.purpose]) {
      const expense = t.splitId && t.userExpense != null ? t.userExpense : Math.abs(t.amount);
      buckets[t.purpose].consumed += expense;
    }
  }
  for (const b of Object.values(buckets)) b.balance = round2(Math.max(0, b.allocated - b.consumed));
  const reserved = round2(sum(Object.values(buckets).filter((b) => b.id !== 'unrestricted'), (b) => b.balance));
  return { buckets: Object.values(buckets), reserved };
}

/** Incoming money that still needs a purpose. */
export function pendingPurposePrompts(transactions) {
  return transactions.filter((t) => t.direction === 'in' && !t.internalTransfer && !t.excluded && t.needsPurpose && !(t.purposeAllocations?.length));
}
