// Real-time expense splitting: equal, unequal (item allocation + shared pool), partial payments.
import { round2, sum } from './utils.js';

/**
 * Compute a split.
 * @param {object} p
 * @param {number} p.total          full payment made by the user
 * @param {Array}  p.participants   [{id, name, isSelf, itemAmount?, paid?}]
 * @param {'equal'|'unequal'} p.mode
 * @param {number} [p.sharedAmount] for unequal mode: amount shared equally by all
 * Rounding: shares are computed to paise; the last share absorbs any rounding remainder so shares always add to total.
 */
export function computeSplit({ total, participants, mode = 'equal', sharedAmount = 0, payerId }) {
  const n = participants.length;
  if (!n || total <= 0) return { shares: [], userExpense: 0, recoverable: 0, remaining: 0, valid: false, error: 'Add at least one participant and a positive total.' };
  const payer = payerId ? participants.find((p) => p.id === payerId) : participants.find((p) => p.isSelf);
  let shares;
  if (mode === 'equal') {
    const base = Math.floor((total / n) * 100) / 100;
    shares = participants.map((p) => ({ ...p, share: base }));
    const drift = round2(total - base * n);
    shares[n - 1].share = round2(shares[n - 1].share + drift);
  } else {
    const items = sum(participants, (p) => Number(p.itemAmount) || 0);
    const shared = Number(sharedAmount) || 0;
    if (round2(items + shared) !== round2(total)) {
      return { shares: [], userExpense: 0, recoverable: 0, remaining: 0, valid: false, error: `Item allocations (${items.toFixed(2)}) plus shared amount (${shared.toFixed(2)}) must equal the total (${total.toFixed(2)}).` };
    }
    const perShared = round2(shared / n); // ₹1,400 ÷ 3 = ₹466.67 as in the source; the last share absorbs the paise drift
    shares = participants.map((p) => ({ ...p, share: round2((Number(p.itemAmount) || 0) + perShared), sharedPart: perShared }));
    const drift = round2(total - sum(shares, (s) => s.share));
    shares[n - 1].share = round2(shares[n - 1].share + drift);
  }
  shares = shares.map((s) => {
    const paid = Number(s.paid) || 0;
    const isPayer = payer && s.id === payer.id;
    return { ...s, paid: isPayer ? s.share : paid, remaining: isPayer ? 0 : round2(Math.max(0, s.share - paid)) };
  });
  const userShare = shares.find((s) => s.isSelf)?.share || 0;
  const payerIsSelf = !payer || payer.isSelf;
  const recoverable = payerIsSelf ? round2(total - userShare) : 0;
  const remaining = payerIsSelf ? round2(sum(shares.filter((s) => !s.isSelf), (s) => s.remaining)) : 0;
  return { shares, userExpense: userShare, paymentOutflow: payerIsSelf ? total : 0, recoverable, remaining, valid: true };
}

/** Record a partial payment against a share; returns updated split. */
export function applyPartialPayment(split, participantId, amount) {
  const shares = split.shares.map((s) => {
    if (s.id !== participantId) return s;
    const paid = round2(Math.min(s.share, (s.paid || 0) + amount));
    return { ...s, paid, remaining: round2(s.share - paid) };
  });
  const remaining = round2(sum(shares.filter((s) => !s.isSelf), (s) => s.remaining));
  return { ...split, shares, remaining };
}
