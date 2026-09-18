// Financial Streaks: restrained, factual. Computed, not gamified with badges.
import { expenseOf } from './spending.js';
import { DISCRETIONARY } from './taxonomy.js';
import { addDays, daysBetween, isoDay, sum, toDate } from './utils.js';

export function computeStreaks({ transactions, goals, subscriptions, budgets, allowance }, today = new Date()) {
  const streaks = [];
  // Days without discretionary ("unnecessary") spending, counting back from today
  let days = 0;
  for (let i = 0; i < 60; i++) {
    const k = isoDay(addDays(today, -i));
    const hit = transactions.some((t) => isoDay(t.date) === k && DISCRETIONARY.includes(t.category) && expenseOf(t) > 0);
    if (hit) break; days++;
  }
  streaks.push({ id: 'no_unnecessary', label: `${days} day${days === 1 ? '' : 's'} without unnecessary spending`, value: days, unit: 'days', outcome: days ? 'Food delivery, coffee, entertainment and shopping stayed at zero.' : 'A food-delivery, coffee, entertainment or shopping payment happened today.', kind: 'discipline' });

  // Money saved this month into goals
  const saved = sum(transactions.filter((t) => t.goalId && t.direction === 'out' && toDate(t.date).getMonth() === toDate(today).getMonth()), (t) => Math.abs(t.amount));
  streaks.push({ id: 'saved', label: `₹${saved.toLocaleString('en-IN')} saved this month`, value: saved, unit: '₹', outcome: 'Moved into goals.', kind: 'saving' });

  // Weeks within the food budget
  const weeklyFood = (budgets?.foodWeekly) || ((allowance?.buckets?.find((b) => b.name === 'Food')?.amount || 4000) / 4.34);
  let weeks = 0;
  for (let w = 0; w < 12; w++) {
    const wkEnd = addDays(today, -7 * w); const wkStart = addDays(wkEnd, -6);
    const spent = sum(transactions.filter((t) => ['food', 'food_delivery', 'coffee', 'dining', 'groceries'].includes(t.category) && toDate(t.date) >= wkStart && toDate(t.date) <= wkEnd), expenseOf);
    if (spent <= weeklyFood) weeks++; else break;
  }
  streaks.push({ id: 'budget_weeks', label: `${weeks} week${weeks === 1 ? '' : 's'} within budget`, value: weeks, unit: 'weeks', outcome: `Food spending stayed under ₹${Math.round(weeklyFood).toLocaleString('en-IN')} a week.`, kind: 'budget' });

  // Recovered from cancelled subscriptions
  const recovered = sum(subscriptions.filter((s) => s.status === 'cancelled'), (s) => s.amount);
  streaks.push({ id: 'recovered', label: `₹${recovered.toLocaleString('en-IN')} recovered from unnecessary subscriptions`, value: recovered, unit: '₹', outcome: recovered ? `${subscriptions.filter((s) => s.status === 'cancelled').map((s) => s.name).join(', ')} cancelled.` : 'No subscriptions cancelled yet.', kind: 'subscriptions' });
  return streaks;
}
