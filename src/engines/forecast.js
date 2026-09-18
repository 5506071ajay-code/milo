// Fixed + Variable Expense Forecasting, irregular-income modelling, and the Money Calendar.
import { FIXED_TYPES, topCategory, CATEGORIES } from './taxonomy.js';
import { addDays, addMonths, daysBetween, endOfMonth, isoDay, monthKey, round2, startOfMonth, sum, toDate } from './utils.js';

/** Expand commitments into dated events inside [from, to]. Recurrence: none | monthly | weekly. */
export function expandCommitments(commitments, from, to) {
  const events = [];
  const start = new Date(isoDay(from) + 'T00:00:00'); const end = new Date(isoDay(to) + 'T23:59:59');
  for (const c of commitments) {
    if (c.status === 'cancelled') continue;
    const first = toDate(c.date);
    if (!c.recurrence || c.recurrence === 'none') {
      if (first >= start && first <= end) events.push(mk(c, first));
      continue;
    }
    let d = new Date(first);
    // walk forward in case the commitment started before the window
    let guard = 0;
    while (d < start && guard++ < 400) d = c.recurrence === 'weekly' ? addDays(d, 7) : addMonths(d, 1);
    guard = 0;
    while (d <= end && guard++ < 400) {
      events.push(mk(c, d));
      d = c.recurrence === 'weekly' ? addDays(d, 7) : addMonths(d, 1);
    }
  }
  return events.sort((a, b) => toDate(a.date) - toDate(b.date));
}

function mk(c, d) {
  return { id: `${c.id}_${isoDay(d)}`, commitmentId: c.id, title: c.title, type: c.type, amount: c.amount, direction: c.direction, date: isoDay(d), source: c.source || 'commitment' };
}

/**
 * Committed vs flexible money.
 * committed = fixed outflows due before the next inflow horizon (default: rest of the month)
 * flexible  = current bank balance − committed − purpose reservations
 */
export function committedVsFlexible({ bankBalance, commitments, reserved = 0, today = new Date(), horizonEnd }) {
  const end = horizonEnd || endOfMonth(today);
  const events = expandCommitments(commitments, today, end).filter((e) => e.direction === 'out');
  const committed = round2(sum(events, (e) => e.amount));
  const flexible = round2(bankBalance - committed - reserved);
  return { committed, flexible, reserved, bankBalance, items: events, horizonEnd: isoDay(end) };
}

/** Group income by month and derive minimum expected, typical (median), volatility, runway. */
export function irregularIncomeModel(transactions, { monthlyBurn, bankBalance, today = new Date(), months = 6 }) {
  const byMonth = {};
  const cutoff = addMonths(startOfMonth(today), -months);
  for (const t of transactions) {
    if (t.direction !== 'in' || t.internalTransfer || t.excluded) continue;
    if (toDate(t.date) < cutoff) continue;
    if (t.category === 'refund' || t.category === 'peer') continue;
    const k = monthKey(t.date);
    byMonth[k] = byMonth[k] || { month: k, total: 0, sources: {} };
    byMonth[k].total += Math.abs(t.amount);
    byMonth[k].sources[t.category] = (byMonth[k].sources[t.category] || 0) + Math.abs(t.amount);
  }
  const completed = Object.values(byMonth).filter((m) => m.month !== monthKey(today)).sort((a, b) => a.month.localeCompare(b.month));
  const totals = completed.map((m) => m.total);
  const sorted = [...totals].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
  const mean = totals.length ? sum(totals) / totals.length : 0;
  const sd = totals.length > 1 ? Math.sqrt(sum(totals, (t) => (t - mean) ** 2) / (totals.length - 1)) : 0;
  const volatility = mean ? round2(sd / mean) : 0;
  const minExpected = sorted.length ? sorted[0] : 0;
  const runwayMonths = monthlyBurn > 0 ? round2(bankBalance / monthlyBurn) : Infinity;
  return { months: completed, minExpected, typical: round2(median), volatility, volatilityLabel: volatility < 0.15 ? 'Stable' : volatility < 0.4 ? 'Moderate' : 'High', runwayMonths, monthlyBurn: round2(monthlyBurn), fixedMonthlyIncomeAssumed: false };
}

/** Average variable (non-fixed) spend per day over the last N days. */
export function variableDailyBurn(transactions, today = new Date(), days = 60) {
  const from = addDays(today, -days);
  let total = 0;
  for (const t of transactions) {
    if (t.direction !== 'out' || t.internalTransfer || t.excluded || t.category === 'peer') continue;
    const d = toDate(t.date);
    if (d < from || d > today) continue;
    if (!CATEGORIES[t.category]?.variable) continue;
    total += t.splitId && t.userExpense != null ? t.userExpense : Math.abs(t.amount);
  }
  return round2(total / days);
}

/**
 * Money Calendar projection. Walks day by day from today to horizon, applying dated events and
 * a daily variable-spend estimate, and finds the lowest projected balance.
 */
export function projectCalendar({ bankBalance, commitments, today = new Date(), horizonDays = 30, dailyBurn = 0, includeVariable = true }) {
  const end = addDays(today, horizonDays);
  const events = expandCommitments(commitments, addDays(today, 0), end);
  const byDay = {};
  for (const e of events) (byDay[e.date] = byDay[e.date] || []).push(e);
  const days = [];
  let bal = bankBalance;
  let lowest = null;
  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(today, i);
    const key = isoDay(d);
    const evs = byDay[key] || [];
    for (const e of evs) bal += e.direction === 'in' ? e.amount : -e.amount;
    if (includeVariable && i > 0) bal -= dailyBurn;
    bal = Math.round(bal); // projections are estimates; paise would be false precision
    days.push({ date: key, balance: bal, events: evs });
    if (!lowest || bal < lowest.balance) lowest = { balance: bal, date: key };
  }
  const monthEnd = endOfMonth(today);
  const monthEndDay = days.find((x) => x.date === isoDay(monthEnd)) || days[days.length - 1];
  const upcomingOut = round2(sum(events.filter((e) => e.direction === 'out'), (e) => e.amount));
  const upcomingIn = round2(sum(events.filter((e) => e.direction === 'in'), (e) => e.amount));
  const untilMonthEnd = days.filter((x) => toDate(x.date) <= monthEnd);
  const lowestThisMonth = untilMonthEnd.reduce((m, x) => (!m || x.balance < m.balance ? x : m), null) || lowest;
  const enoughAtMonthEnd = (monthEndDay?.balance ?? bal) >= 0 && lowestThisMonth.balance >= 0;
  return { days, events, lowest, lowestThisMonth, monthEndBalance: monthEndDay?.balance ?? bal, enoughAtMonthEnd, laterDip: enoughAtMonthEnd && lowest.balance < 0 ? lowest : null, upcomingOut, upcomingIn, dailyBurn };
}

export function isFixedType(type) { return FIXED_TYPES.includes(type); }
export function fixedOrVariable(category) { return CATEGORIES[category]?.variable ? 'variable' : 'fixed'; }
export { topCategory };
