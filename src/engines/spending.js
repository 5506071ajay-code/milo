// "Bro, Where Did My Money Go?", The ₹100 Problem, "Why did my spending increase?"
import { MICRO_THRESHOLD, topCategory, categoryLabel, CATEGORIES } from './taxonomy.js';
import { addMonths, monthKey, pct, round2, startOfMonth, sum, toDate } from './utils.js';

/** Economic expense of a transaction (split-aware; excludes transfers, peer, duplicates). */
export function expenseOf(t) {
  if (t.direction !== 'out' || t.internalTransfer || t.excluded || t.category === 'peer' || t.category === 'credit_card_bill') return 0;
  return t.splitId && t.userExpense != null ? t.userExpense : Math.abs(t.amount);
}

export function isSpend(t) { return expenseOf(t) > 0; }

export function monthTransactions(transactions, d) {
  const k = monthKey(d);
  return transactions.filter((t) => monthKey(t.date) === k);
}

export function categoryTotals(transactions) {
  const totals = {};
  for (const t of transactions) {
    const e = expenseOf(t); if (!e) continue;
    const c = topCategory(t.category);
    totals[c] = round2((totals[c] || 0) + e);
  }
  return Object.entries(totals).map(([category, total]) => ({ category, label: categoryLabel(category), total })).sort((a, b) => b.total - a.total);
}

/** Month summary with comparison to last month. */
/** Like-for-like: when the current month is still running, previous months are cut at the same day-of-month. */
function toDay(list, dayOfMonth) { return list.filter((t) => toDate(t.date).getDate() <= dayOfMonth); }

export function monthSummary(transactions, today = new Date()) {
  const cur = monthTransactions(transactions, today);
  const prev = toDay(monthTransactions(transactions, addMonths(today, -1)), toDate(today).getDate());
  const curTotals = categoryTotals(cur);
  const prevMap = Object.fromEntries(categoryTotals(prev).map((x) => [x.category, x.total]));
  const rows = curTotals.map((r) => {
    const last = prevMap[r.category] || 0;
    const change = last ? Math.round(((r.total - last) / last) * 100) : null;
    return { ...r, last, change };
  });
  const total = round2(sum(rows, (r) => r.total));
  const lastTotal = round2(sum(prev, expenseOf));
  const insights = [];
  for (const r of rows) {
    if (r.change !== null && Math.abs(r.change) >= 15 && r.total >= 500) insights.push(`${r.label} is ${Math.abs(r.change)}% ${r.change > 0 ? 'higher' : 'lower'} than last month.`);
  }
  const micro = microSpending(cur);
  if (micro.count) insights.push(`${micro.totalFmt} went on ${micro.count} purchases under ₹${MICRO_THRESHOLD}.`);
  return { rows, total, lastTotal, insights: insights.slice(0, 4), micro, txCount: cur.filter(isSpend).length, comparedToDay: toDate(today).getDate() };
}

/** The ₹100 Problem: count/total of purchases under the threshold and a 25% reduction estimate. */
export function microSpending(transactions, threshold = MICRO_THRESHOLD, reductionRate = 0.25) {
  const small = transactions.filter((t) => isSpend(t) && expenseOf(t) < threshold);
  const total = round2(sum(small, expenseOf));
  const saving = Math.round(total * reductionRate);
  const byHour = {};
  for (const t of small) { const h = toDate(t.date).getHours(); byHour[h] = (byHour[h] || 0) + 1; }
  return { count: small.length, total, totalFmt: `₹${total.toLocaleString('en-IN')}`, saving, reductionRate, threshold, items: small.sort((a, b) => toDate(b.date) - toDate(a.date)), byHour };
}

/**
 * "Why did my spending increase?"
 * Compares this month to the average of the previous three months and decomposes the change into
 * category contributions and one-time purchases (large non-recurring transactions in shopping/travel/other).
 */
export function whySpendingChanged(transactions, today = new Date()) {
  const cur = monthTransactions(transactions, today);
  const dom = toDate(today).getDate();
  const prevMonths = [1, 2, 3].map((n) => toDay(monthTransactions(transactions, addMonths(today, -n)), dom));
  const prevAvgTotal = round2(sum(prevMonths, (m) => sum(m, expenseOf)) / 3);
  const curTotal = round2(sum(cur, expenseOf));
  const diff = round2(curTotal - prevAvgTotal);
  const curCats = Object.fromEntries(categoryTotals(cur).map((x) => [x.category, x.total]));
  const prevCats = {};
  for (const m of prevMonths) for (const r of categoryTotals(m)) prevCats[r.category] = (prevCats[r.category] || 0) + r.total / 3;
  const cats = new Set([...Object.keys(curCats), ...Object.keys(prevCats)]);
  const contributions = [...cats].map((c) => {
    const delta = round2((curCats[c] || 0) - (prevCats[c] || 0));
    return { category: c, label: categoryLabel(c), delta, share: diff ? Math.round((delta / diff) * 100) : 0 };
  }).sort((a, b) => b.delta - a.delta);
  const oneTime = cur.filter((t) => isSpend(t) && expenseOf(t) >= 1500 && ['shopping', 'travel', 'other', 'health'].includes(topCategory(t.category)));
  const oneTimeTotal = round2(sum(oneTime, expenseOf));
  const exclOneTime = round2(curTotal - oneTimeTotal);
  const exclPct = prevAvgTotal ? Math.round(((exclOneTime - prevAvgTotal) / prevAvgTotal) * 100) : 0;
  const daysElapsed = toDate(today).getDate();
  return { curTotal, prevAvgTotal, diff, pctChange: prevAvgTotal ? Math.round((diff / prevAvgTotal) * 100) : 0, contributions, oneTime, oneTimeTotal, exclOneTime, exclPct, daysElapsed, partialMonth: daysElapsed < 28 };
}
