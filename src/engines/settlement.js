// Settlement Engine: minimise number of payments needed to settle a group.
// Approach: net every member's balance, cancel exact opposite pairs first, then greedily
// match the largest debtor with the largest creditor. This is the standard debt-simplification
// heuristic; it never produces more than n-1 payments for n non-zero members.
import { round2 } from './utils.js';

/**
 * @param {Array<{from:string,to:string,amount:number}>} debts  "from owes to amount"
 * @returns {{net: Record<string,number>, payments: Array<{from,to,amount}>, originalCount:number}}
 */
export function settleGroup(debts) {
  const net = {};
  for (const d of debts) {
    if (!d.amount) continue;
    net[d.from] = round2((net[d.from] || 0) - d.amount);
    net[d.to] = round2((net[d.to] || 0) + d.amount);
  }
  let debtors = Object.entries(net).filter(([, v]) => v < -0.005).map(([id, v]) => ({ id, amt: -v }));
  let creditors = Object.entries(net).filter(([, v]) => v > 0.005).map(([id, v]) => ({ id, amt: v }));
  const payments = [];

  // exact matches first
  for (const d of debtors) {
    const c = creditors.find((x) => x.amt > 0 && Math.abs(x.amt - d.amt) < 0.005);
    if (c) { payments.push({ from: d.id, to: c.id, amount: round2(d.amt) }); c.amt = 0; d.amt = 0; }
  }
  debtors = debtors.filter((d) => d.amt > 0.005).sort((a, b) => b.amt - a.amt);
  creditors = creditors.filter((c) => c.amt > 0.005).sort((a, b) => b.amt - a.amt);
  let i = 0; let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amt, creditors[j].amt));
    payments.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt = round2(debtors[i].amt - pay);
    creditors[j].amt = round2(creditors[j].amt - pay);
    if (debtors[i].amt <= 0.005) i++;
    if (creditors[j].amt <= 0.005) j++;
  }
  return { net, payments, originalCount: debts.filter((d) => d.amount).length };
}
