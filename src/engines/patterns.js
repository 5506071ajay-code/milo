// Behavioural Pattern Detection: non-judgmental observations from time-series transactions.
import { expenseOf } from './spending.js';
import { DISCRETIONARY, FOOD_GROUP } from './taxonomy.js';
import { addDays, daysBetween, endOfMonth, isoDay, sum, toDate } from './utils.js';

const MIN_DAYS = 45;

export function detectPatterns(transactions, today = new Date()) {
  const spends = transactions.filter((t) => expenseOf(t) > 0 && toDate(t.date) <= today);
  const days = new Set(spends.map((t) => isoDay(t.date)));
  const first = spends.length ? spends.reduce((m, t) => (toDate(t.date) < m ? toDate(t.date) : m), toDate(spends[0].date)) : today;
  const history = daysBetween(first, today);
  const patterns = [];
  if (history < MIN_DAYS || days.size < 20) return { patterns, enoughData: false, historyDays: history };

  // 1. Weekend vs weekday spend per day
  const wk = { weekend: [], weekday: [] };
  const perDay = {};
  for (const t of spends) { const k = isoDay(t.date); perDay[k] = (perDay[k] || 0) + expenseOf(t); }
  for (let i = 0; i <= history; i++) {
    const d = addDays(first, i); const k = isoDay(d); const v = perDay[k] || 0;
    (d.getDay() === 0 || d.getDay() === 6 ? wk.weekend : wk.weekday).push(v);
  }
  const avg = (a) => (a.length ? sum(a) / a.length : 0);
  const we = avg(wk.weekend); const wd = avg(wk.weekday);
  if (wd > 0 && Math.abs(we - wd) / wd >= 0.15) {
    const p = Math.round(((we - wd) / wd) * 100);
    patterns.push({ id: 'weekend', category: 'Timing', window: 'Weekends', text: `Your weekend spending is ${Math.abs(p)}% ${p > 0 ? 'higher' : 'lower'} than weekdays (₹${Math.round(we)} vs ₹${Math.round(wd)} a day).` });
  }

  // 2. Discretionary spend in the last 5 days of the month vs the rest
  let lastFive = 0; let lastFiveDays = 0; let rest = 0; let restDays = 0;
  for (let i = 0; i <= history; i++) {
    const d = addDays(first, i); const eom = endOfMonth(d);
    const isLast5 = daysBetween(d, eom) < 5;
    const v = sum(spends.filter((t) => isoDay(t.date) === isoDay(d) && DISCRETIONARY.includes(t.category)), expenseOf);
    if (isLast5) { lastFive += v; lastFiveDays++; } else { rest += v; restDays++; }
  }
  const l5 = lastFiveDays ? lastFive / lastFiveDays : 0; const rs = restDays ? rest / restDays : 0;
  if (rs > 0 && (l5 - rs) / rs >= 0.15) patterns.push({ id: 'month_end', category: 'Timing', window: 'Last 5 days of month', text: `Discretionary spending rises ${Math.round(((l5 - rs) / rs) * 100)}% during the last five days of the month.` });

  // 3. Post-income spike: 3 days after any income credit vs baseline
  const incomes = transactions.filter((t) => t.direction === 'in' && !t.internalTransfer && !t.excluded && ['parent_allowance', 'internship', 'scholarship', 'income'].includes(t.category) && Math.abs(t.amount) >= 5000);
  let post = 0; let postDays = 0;
  for (const inc of incomes) for (let i = 1; i <= 3; i++) { const k = isoDay(addDays(inc.date, i)); if (perDay[k] != null || days.has(k)) { post += perDay[k] || 0; postDays++; } }
  const baseline = history ? sum(Object.values(perDay)) / (history + 1) : 0;
  const postAvg = postDays ? post / postDays : 0;
  if (baseline > 0 && incomes.length >= 2 && (postAvg - baseline) / baseline >= 0.25) patterns.push({ id: 'post_income', category: 'Timing', window: '3 days after money arrives', text: `Spending runs ${Math.round(((postAvg - baseline) / baseline) * 100)}% above your daily average for three days after money comes in.` });

  // 4. Late-night food delivery concentration (9 PM – midnight)
  const delivery = spends.filter((t) => t.category === 'food_delivery');
  const late = delivery.filter((t) => toDate(t.date).getHours() >= 21);
  if (delivery.length >= 6 && late.length / delivery.length >= 0.5) patterns.push({ id: 'late_food', category: 'Food', window: '9 PM – midnight', text: `${Math.round((late.length / delivery.length) * 100)}% of your food-delivery orders are placed between 9 PM and midnight.` });

  // 5. Food share of spend
  const food = sum(spends.filter((t) => FOOD_GROUP.includes(t.category)), expenseOf);
  const all = sum(spends, expenseOf);
  if (all && food / all >= 0.4) patterns.push({ id: 'food_share', category: 'Food', window: 'All history', text: `Food is ${Math.round((food / all) * 100)}% of everything you spend.` });

  return { patterns, enoughData: true, historyDays: history };
}
