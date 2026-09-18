// Student Money Health score (0–100). Not a credit score.
// Six factors, weighted. Each factor is 0–100. Explanations are plain-language and cite the numbers.
import { expenseOf } from './spending.js';
import { DISCRETIONARY } from './taxonomy.js';
import { addDays, addMonths, daysBetween, endOfMonth, isoDay, monthKey, round2, startOfMonth, sum, toDate } from './utils.js';
import { expandCommitments } from './forecast.js';

const WEIGHTS = { discipline: 0.2, savings: 0.2, buffer: 0.2, liabilities: 0.15, subscriptions: 0.1, budget: 0.15 };

export function computeScore(ctx, asOf = new Date()) {
  const { transactions, bankBalance, commitments, goals, subscriptions, budgets, allowance } = ctx;
  const f = {};
  const monthSpend = (d) => sum(transactions.filter((t) => monthKey(t.date) === monthKey(d)), expenseOf);
  const cur = monthSpend(asOf);
  const daysInMonth = endOfMonth(asOf).getDate();
  const elapsed = Math.min(daysInMonth, toDate(asOf).getDate());
  const prevAvg = sum([1, 2, 3], (n) => monthSpend(addMonths(asOf, -n))) / 3;
  const projected = elapsed ? (cur / elapsed) * daysInMonth : cur;

  // 1. Spending discipline: projected spend vs 3-month average
  const ratio = prevAvg ? projected / prevAvg : 1;
  f.discipline = { score: clamp100(100 - (ratio - 0.9) * 200), detail: `This month is on track for ₹${Math.round(projected).toLocaleString('en-IN')} versus a ₹${Math.round(prevAvg).toLocaleString('en-IN')} three-month average.` };

  // 2. Savings consistency: months with a goal contribution / SIP in the last 3
  const saveMonths = new Set(transactions.filter((t) => t.direction === 'out' && (t.category === 'sip' || t.goalId) && toDate(t.date) > addMonths(asOf, -3)).map((t) => monthKey(t.date)));
  const goalSaved = sum(goals, (g) => g.saved);
  f.savings = { score: clamp100((saveMonths.size / 3) * 80 + (goalSaved > 0 ? 20 : 0)), detail: `You put money aside in ${saveMonths.size} of the last 3 months; ₹${goalSaved.toLocaleString('en-IN')} is sitting in goals.` };

  // 3. Emergency buffer: months of average spend covered by balance
  const monthlyAvg = prevAvg || cur || 1;
  const months = bankBalance / monthlyAvg;
  f.buffer = { score: clamp100(months * 33), detail: `Your bank balance covers about ${months.toFixed(1)} months of typical spending.` };

  // 4. Upcoming liabilities: fixed outflows in the next 30 days vs balance
  const out = sum(expandCommitments(commitments, asOf, addDays(asOf, 30)).filter((e) => e.direction === 'out'), (e) => e.amount);
  const liabRatio = bankBalance ? out / bankBalance : 1;
  f.liabilities = { score: clamp100(100 - liabRatio * 100), detail: `₹${out.toLocaleString('en-IN')} of commitments fall due in the next 30 days against a ₹${bankBalance.toLocaleString('en-IN')} balance.` };

  // 5. Subscription utilisation: active subs that were used recently
  const active = subscriptions.filter((s) => s.status === 'active');
  const used = active.filter((s) => s.lastUsed && daysBetween(s.lastUsed, asOf) <= 30);
  f.subscriptions = { score: active.length ? clamp100((used.length / active.length) * 100) : 100, detail: active.length ? `${used.length} of ${active.length} active subscriptions were used in the last 30 days.` : 'No active subscriptions.' };

  // 6. Budget adherence: consecutive weeks within the food budget (weekly budget from allowance Food bucket)
  const weeklyFood = (budgets?.foodWeekly) || ((allowance?.buckets?.find((b) => b.name === 'Food')?.amount || 4000) / 4.34);
  let streak = 0;
  for (let w = 0; w < 8; w++) {
    const wkEnd = addDays(asOf, -7 * w); const wkStart = addDays(wkEnd, -6);
    const spent = sum(transactions.filter((t) => ['food', 'food_delivery', 'coffee', 'dining', 'groceries'].includes(t.category) && toDate(t.date) >= wkStart && toDate(t.date) <= wkEnd), expenseOf);
    if (spent <= weeklyFood) streak++; else break;
  }
  f.budget = { score: clamp100(streak * 25), detail: streak ? `You have stayed within the food budget for ${streak} consecutive week${streak > 1 ? 's' : ''}.` : 'This week is over the food budget.' , weeks: streak };

  const total = Math.round(sum(Object.entries(WEIGHTS), ([k, w]) => f[k].score * w));
  return { score: total, factors: Object.entries(f).map(([id, v]) => ({ id, label: LABELS[id], weight: WEIGHTS[id], ...v, score: Math.round(v.score) })) };
}

const LABELS = { discipline: 'Spending discipline', savings: 'Savings consistency', buffer: 'Emergency buffer', liabilities: 'Upcoming liabilities', subscriptions: 'Subscription utilisation', budget: 'Budget adherence' };

/** Explain the movement from a previous score snapshot in plain language. */
export function explainScoreChange(current, previous) {
  if (!previous) return { delta: 0, text: 'This is your first Student Money Health reading. It is not a credit score; it reflects your own habits.' };
  const delta = current.score - previous.score;
  const diffs = current.factors.map((f) => { const p = previous.factors.find((x) => x.id === f.id); return { ...f, change: f.score - (p ? p.score : f.score) }; }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const top = diffs[0];
  if (delta === 0 || !top || top.change === 0) return { delta, text: 'Your score is unchanged since the last reading.' };
  return { delta, text: `Your score ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} mainly because ${top.label.toLowerCase()} ${top.change > 0 ? 'improved' : 'slipped'}: ${top.detail}`, driver: top };
}

function clamp100(n) { return Math.max(0, Math.min(100, n)); }
