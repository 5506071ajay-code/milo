// Goal-based saving: daily target and progress.
import { addDays, daysBetween, round2, toDate } from './utils.js';

/** Daily saving needed: whole rupees, rounded up so the goal is reached on time. */
export function goalMath(goal, today = new Date()) {
  const horizonDays = Math.max(1, goal.horizonMonths ? Math.round(goal.horizonMonths * 30) : daysBetween(goal.createdAt || today, goal.targetDate));
  const planDaily = Math.ceil(goal.target / horizonDays);
  const targetDate = goal.targetDate || addDays(goal.createdAt || today, horizonDays);
  const daysLeft = Math.max(1, daysBetween(today, targetDate));
  const remaining = round2(Math.max(0, goal.target - (goal.saved || 0)));
  const requiredDaily = Math.ceil(remaining / daysLeft);
  const progressPct = Math.min(100, Math.round(((goal.saved || 0) / goal.target) * 100));
  return { horizonDays, planDaily, targetDate, daysLeft, remaining, requiredDaily, progressPct, done: remaining <= 0 };
}
