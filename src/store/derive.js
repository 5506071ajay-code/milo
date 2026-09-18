// One place where all derived numbers are computed, so every screen and the AI CFO agree.
import { purposeBalances, pendingPurposePrompts } from '../engines/purpose.js';
import { committedVsFlexible, projectCalendar, variableDailyBurn, irregularIncomeModel, expandCommitments } from '../engines/forecast.js';
import { monthSummary, whySpendingChanged, microSpending, monthTransactions, expenseOf } from '../engines/spending.js';
import { detectPatterns } from '../engines/patterns.js';
import { computeScore, explainScoreChange } from '../engines/score.js';
import { computeStreaks } from '../engines/streaks.js';
import { detectDuplicates } from '../engines/duplicates.js';
import { settleGroup } from '../engines/settlement.js';
import { goalMath } from '../engines/goals.js';
import { allowanceStatus } from '../engines/allowance.js';
import { addDays, addMonths, daysBetween, round2, sum, toDate } from '../engines/utils.js';

export function derive(state, today = new Date()) {
  const { accounts, transactions, commitments, obligations, groupDebts, goals, subscriptions, allowance, contacts, groups } = state;
  const active = transactions.filter((t) => !t.excluded);
  const bankAccounts = accounts.filter((a) => a.connected && ['savings', 'current'].includes(a.type));
  const bankBalance = round2(sum(bankAccounts, (a) => a.balance));
  const assets = accounts.filter((a) => a.connected && a.kind === 'asset');
  const liabilities = accounts.filter((a) => a.connected && a.kind === 'liability');
  const totalAssets = round2(sum(assets, (a) => a.balance));
  const totalLiabilities = round2(sum(liabilities, (a) => a.balance));
  const netPosition = round2(totalAssets - totalLiabilities);

  const purposes = purposeBalances(active);
  const purposePrompts = pendingPurposePrompts(active);
  const goalPocket = round2(sum(goals, (g) => g.saved || 0));
  const cvf = committedVsFlexible({ bankBalance, commitments, reserved: round2(purposes.reserved + goalPocket), today });
  cvf.goalPocket = goalPocket;
  const dailyBurn = variableDailyBurn(active, today);
  const calendar = projectCalendar({ bankBalance, commitments, today, horizonDays: 45, dailyBurn });
  const monthlyBurn = dailyBurn * 30.4 + sum(expandCommitments(commitments, addDays(today, 1), addDays(today, 31)).filter((e) => e.direction === 'out'), (e) => e.amount);
  const income = irregularIncomeModel(active, { monthlyBurn, bankBalance, today });
  const summary = monthSummary(active, today);
  const why = whySpendingChanged(active, today);
  const patterns = detectPatterns(active, today);
  const score = computeScore({ transactions: active, bankBalance, commitments, goals, subscriptions, allowance }, today);
  const prevScore = state.scoreHistory?.length ? state.scoreHistory[state.scoreHistory.length - 1] : computeScore({ transactions: active, bankBalance, commitments, goals, subscriptions, allowance }, addDays(today, -7));
  const scoreChange = explainScoreChange(score, prevScore);
  const streaks = computeStreaks({ transactions: active, goals, subscriptions, allowance }, today);
  const duplicates = detectDuplicates(transactions, accounts).filter((f) => !f.resolved);
  const allowanceState = allowanceStatus({ allowance: allowance?.amount || 0, buckets: allowance?.buckets || [], transactions: active, today });

  // Peer balances (Split-Bill Memory)
  const byContact = {};
  for (const o of obligations) {
    if (o.remaining <= 0.005) continue;
    const c = byContact[o.contactId] || (byContact[o.contactId] = { contactId: o.contactId, name: contacts.find((x) => x.id === o.contactId)?.name || o.contactId, iOwe: 0, theyOwe: 0, items: [] });
    if (o.direction === 'i_owe') c.iOwe += o.remaining; else c.theyOwe += o.remaining;
    c.items.push(o);
  }
  const peerBalances = Object.values(byContact).map((c) => ({ ...c, iOwe: round2(c.iOwe), theyOwe: round2(c.theyOwe), net: round2(c.theyOwe - c.iOwe) }));
  const youOwe = peerBalances.filter((c) => c.iOwe > 0).map((c) => ({ ...c, amount: c.iOwe })).sort((a, b) => b.amount - a.amount);
  const othersOwe = peerBalances.filter((c) => c.theyOwe > 0).map((c) => ({ ...c, amount: c.theyOwe })).sort((a, b) => b.amount - a.amount);
  const totalYouOwe = round2(sum(youOwe, (c) => c.amount));
  const totalOthersOwe = round2(sum(othersOwe, (c) => c.amount));

  // Settlement per group
  const settlements = groups.map((g) => {
    const debts = [];
    for (const o of obligations) if (o.groupId === g.id && o.remaining > 0.005) debts.push(o.direction === 'i_owe' ? { from: 'self', to: o.contactId, amount: o.remaining, title: o.title } : { from: o.contactId, to: 'self', amount: o.remaining, title: o.title });
    for (const d of groupDebts) if (d.groupId === g.id && d.amount > 0.005) debts.push({ from: d.from, to: d.to, amount: d.amount, title: d.title });
    const result = settleGroup(debts);
    return { group: g, debts, ...result };
  });

  const goalsMath = goals.map((g) => ({ ...g, math: goalMath(g, today) }));
  const upcomingReminders = obligations.filter((o) => o.remaining > 0.005 && o.direction === 'they_owe').map((o) => ({ ...o, daysOpen: daysBetween(o.createdAt, today), lastReminded: state.reminders.filter((r) => r.obligationId === o.id).slice(-1)[0]?.at }));
  const needsReview = active.filter((t) => t.needsReview);
  const splitPrompts = active.filter((t) => t.splitPrompt && !t.splitId);
  const micro = summary.micro;
  const thisMonthSpend = summary.total;

  return { today, bankBalance, bankAccounts, assets, liabilities, totalAssets, totalLiabilities, netPosition, purposes, purposePrompts, cvf, dailyBurn, calendar, income, summary, why, patterns, score, prevScore, scoreChange, streaks, duplicates, allowanceState, peerBalances, youOwe, othersOwe, totalYouOwe, totalOthersOwe, settlements, goalsMath, upcomingReminders, needsReview, splitPrompts, micro, thisMonthSpend, monthlyBurn: round2(monthlyBurn) };
}
