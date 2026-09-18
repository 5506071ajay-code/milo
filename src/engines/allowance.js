// Allowance Survival Mode.
// Daily safe spending = (allowance − non-daily buckets) / average days in a month (30.4).
// With the source example (₹12,000; Savings ₹2,000, Emergency ₹1,000, College ₹1,500 held back)
// the daily-spendable pool is ₹7,500 → ₹7,500 / 30.4 = ₹247/day, matching the source.
// After spending, tomorrow's safe amount = (pool − spent so far this month) / days left in the month.
import { daysBetween, endOfMonth, isoDay, round2, startOfMonth, sum, toDate } from './utils.js';

export const AVG_MONTH_DAYS = 30.4;
export const DAILY_BUCKETS = ['Food', 'Transport', 'Entertainment'];

export function defaultAllocation(allowance) {
  // Proportions from the source example (₹12,000 → 4000/2000/1500/1500/1000/2000)
  const w = { Food: 4000, Transport: 2000, College: 1500, Entertainment: 1500, Emergency: 1000, Savings: 2000 };
  const total = 12000;
  const out = Object.entries(w).map(([name, v]) => ({ name, amount: Math.round((v / total) * allowance) }));
  const drift = allowance - sum(out, (o) => o.amount);
  out[0].amount += drift;
  return out;
}

export function allowanceStatus({ allowance, buckets, transactions, today = new Date() }) {
  const dailyPool = sum(buckets.filter((b) => DAILY_BUCKETS.includes(b.name)), (b) => b.amount);
  const dailySafe = Math.round(dailyPool / AVG_MONTH_DAYS);
  const som = startOfMonth(today); const eom = endOfMonth(today);
  const isDaily = (t) => t.direction === 'out' && !t.internalTransfer && !t.excluded && t.category !== 'peer' && ['food', 'food_delivery', 'coffee', 'dining', 'groceries', 'transport', 'entertainment', 'cash'].includes(t.category);
  const inMonth = transactions.filter((t) => isDaily(t) && toDate(t.date) >= som && toDate(t.date) <= eom);
  const amt = (t) => (t.splitId && t.userExpense != null ? t.userExpense : Math.abs(t.amount));
  const todayKey = isoDay(today);
  const spentToday = round2(sum(inMonth.filter((t) => isoDay(t.date) === todayKey), amt));
  const spentMonth = round2(sum(inMonth, amt));
  const daysLeft = Math.max(1, daysBetween(today, eom)); // days after today
  const remainingPool = round2(dailyPool - spentMonth);
  const tomorrowSafe = Math.max(0, Math.round(remainingPool / daysLeft));
  const overspend = round2(spentToday - dailySafe);
  return {
    dailyPool, dailySafe, spentToday, spentMonth, remainingPool, daysLeft, tomorrowSafe,
    overspend: overspend > 0 ? overspend : 0,
    underspend: overspend < 0 ? -overspend : 0,
    buckets: buckets.map((b) => {
      const spent = round2(sum(inMonth.filter((t) => bucketOf(t.category) === b.name), amt));
      return { ...b, spent, left: round2(b.amount - spent) };
    }),
  };
}

function bucketOf(cat) {
  if (['food', 'food_delivery', 'coffee', 'dining', 'groceries', 'cash'].includes(cat)) return 'Food';
  if (cat === 'transport') return 'Transport';
  if (cat === 'entertainment') return 'Entertainment';
  if (cat === 'college') return 'College';
  return null;
}
