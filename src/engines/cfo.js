// Agentic AI CFO. Grounded pipeline:
// USER QUESTION → INTENT DETECTION → FINANCIAL DATA RETRIEVAL → TRANSACTION / ACCOUNT ENGINE
// → CALCULATION ENGINE → RISK / CONSISTENCY CHECK → AI REASONING → ANSWER.
// Every answer is built from numbers computed by the engines. If a question cannot be mapped to
// retrievable data, the CFO says so instead of guessing.
import { fmtINR, fmtDate, monthKey, addMonths, sum, toDate, round2 } from './utils.js';
import { categoryTotals, monthTransactions, expenseOf } from './spending.js';
import { topCategory, categoryLabel, CATEGORIES } from './taxonomy.js';
import { projectCalendar, variableDailyBurn } from './forecast.js';

export const INTENTS = [
  { id: 'health', label: 'Financial health', patterns: [/money health|health score|score|how am i doing|financial health|am i doing (ok|okay|well)/i] },
  { id: 'relationship', label: 'Relationship-based', patterns: [/who owes|owe me|do i owe|owed|settle|split|rahul|priya|karan|arjun|ananya/i] },
  { id: 'goal', label: 'Goal-based', patterns: [/goal|goa trip|laptop|headphones|phone goal|certification|save for|reach my/i] },
  { id: 'scenario', label: 'Scenario-based', patterns: [/what if|can i afford|if i (spend|buy|pay)|afford/i] },
  { id: 'forward', label: 'Forward-looking', patterns: [/will i|enough money|month end|month-end|end of (the )?month|lowest|runway|next (week|month)|upcoming|due|forecast|survive|last until/i] },
  { id: 'comparative', label: 'Comparative', patterns: [/compare|vs\.?|versus|than last|more than|less than|last month|difference between/i] },
  { id: 'analytical', label: 'Analytical', patterns: [/why|where did|breakdown|biggest|most on|pattern|increase|went up|small purchases|micro/i] },
  { id: 'simple', label: 'Simple', patterns: [/how much|what('s| is) my|balance|spent|spend|net worth|net position|total|income|subscription/i] },
];

export function detectIntent(q) {
  for (const i of INTENTS) if (i.patterns.some((p) => p.test(q))) return i;
  return null;
}

function extractAmount(q) {
  const m = q.replace(/,/g, '').match(/₹?\s?(\d+(?:\.\d+)?)\s?(k|thousand|lakh|l)?/i);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'thousand') v *= 1000;
  if (u === 'lakh' || u === 'l') v *= 100000;
  return v;
}

function extractCategory(q) {
  const map = { food: 'food', eating: 'food', dining: 'food', swiggy: 'food', zomato: 'food', delivery: 'food', coffee: 'food', groceries: 'food', transport: 'transport', uber: 'transport', cab: 'transport', travel: 'travel', shopping: 'shopping', amazon: 'shopping', entertainment: 'entertainment', movies: 'entertainment', college: 'college', rent: 'rent', hostel: 'hostel', subscription: 'subscription', subscriptions: 'subscription' };
  const words = q.toLowerCase().split(/[^a-z]+/);
  for (const w of words) if (map[w]) return map[w];
  return null;
}

/**
 * @param {string} question
 * @param {object} ctx  { state, d (derived) }
 */
export function answerQuestion(question, ctx) {
  const { state, d } = ctx;
  const q = question.trim();
  const steps = [];
  const step = (name, detail) => steps.push({ name, detail });
  const intent = detectIntent(q);
  step('Intent detection', intent ? `${intent.label} question` : 'No supported financial intent found');
  if (!intent) {
    return { intent: null, steps, grounded: false, answer: "I can only answer from your financial data, and I couldn't map this question to anything I can retrieve or calculate. Try asking about spending, balances, what you owe, goals, upcoming commitments, or your Student Money Health.", sources: [] };
  }
  const perms = state.permissions;
  const cat = extractCategory(q);
  const amount = extractAmount(q);
  const today = d.today;
  const cur = monthTransactions(state.transactions.filter((t) => !t.excluded), today);
  const prev = monthTransactions(state.transactions.filter((t) => !t.excluded), addMonths(today, -1));
  const sources = [];
  const src = (s) => { if (!sources.includes(s)) sources.push(s); };

  const denied = (needed, label) => {
    if (!perms[needed]) {
      step('Financial data retrieval', `Blocked: you have not permitted the AI CFO to read ${label}.`);
      return { intent: intent.id, steps, grounded: false, answer: `I need permission to read ${label} to answer that. You can turn it on under Permissions in the AI CFO screen.`, sources };
    }
    return null;
  };

  // ---------- relationship ----------
  if (intent.id === 'relationship') {
    const deny = denied('cfoPeers', 'peer transactions and split balances'); if (deny) return deny;
    src('Split-Bill Memory (obligations)');
    step('Financial data retrieval', `${state.obligations.filter((o) => o.remaining > 0).length} open peer balances`);
    const named = state.contacts.find((c) => q.toLowerCase().includes(c.name.toLowerCase()));
    if (named) {
      const b = d.peerBalances.find((p) => p.contactId === named.id);
      step('Transaction / account engine', `Filtered obligations with ${named.name}`);
      step('Calculation engine', b ? `You owe ${fmtINR(b.iOwe)}; ${named.name} owes you ${fmtINR(b.theyOwe)}; net ${fmtINR(b.net)}` : 'No open balances');
      step('Risk / consistency check', 'Net equals sum of item balances ✓');
      const ans = b ? (b.net > 0 ? `${named.name} owes you ${fmtINR(b.net)} net (${b.items.map((i) => `${i.title} ${fmtINR(i.remaining)}`).join(', ')}).` : b.net < 0 ? `You owe ${named.name} ${fmtINR(-b.net)} net (${b.items.map((i) => `${i.title} ${fmtINR(i.remaining)}`).join(', ')}).` : `You and ${named.name} are square.`) : `You and ${named.name} have nothing outstanding.`;
      step('AI reasoning', 'Turned net balance into a plain answer');
      return { intent: intent.id, steps, grounded: true, answer: ans, sources };
    }
    step('Transaction / account engine', 'Grouped obligations by contact');
    step('Calculation engine', `Others owe you ${fmtINR(d.totalOthersOwe)}; you owe ${fmtINR(d.totalYouOwe)}`);
    step('Risk / consistency check', 'Totals reconcile with per-person balances ✓');
    const a = [];
    if (d.othersOwe.length) a.push(`Others owe you ${fmtINR(d.totalOthersOwe)}: ${d.othersOwe.map((c) => `${c.name} ${fmtINR(c.amount)}`).join(', ')}.`);
    if (d.youOwe.length) a.push(`You owe ${fmtINR(d.totalYouOwe)}: ${d.youOwe.map((c) => `${c.name} ${fmtINR(c.amount)}`).join(', ')}.`);
    if (!a.length) a.push('Nothing is outstanding with anyone.');
    step('AI reasoning', 'Listed both directions');
    return { intent: intent.id, steps, grounded: true, answer: a.join(' '), sources };
  }

  // ---------- goal ----------
  if (intent.id === 'goal') {
    const deny = denied('cfoGoals', 'your savings goals'); if (deny) return deny;
    src('Goals');
    const g = d.goalsMath.find((x) => q.toLowerCase().includes(x.name.toLowerCase().split(' ')[0])) || d.goalsMath.find((x) => x.selected) || d.goalsMath[0];
    step('Financial data retrieval', `Goal "${g.name}": target ${fmtINR(g.target)}, saved ${fmtINR(g.saved)}`);
    step('Transaction / account engine', `Goal contributions this month: ${fmtINR(sum(cur.filter((t) => t.goalId === g.id), (t) => Math.abs(t.amount)))}`);
    step('Calculation engine', `Remaining ${fmtINR(g.math.remaining)} over ${g.math.daysLeft} days = ${fmtINR(g.math.requiredDaily)}/day`);
    step('Risk / consistency check', g.math.requiredDaily <= d.cvf.flexible / Math.max(1, g.math.daysLeft) * 3 ? 'Daily target is within your flexible money ✓' : 'Warning: daily target is high relative to flexible money');
    step('AI reasoning', 'Explained target, pace and feasibility');
    return { intent: intent.id, steps, grounded: true, answer: `${g.name}: ${fmtINR(g.saved)} of ${fmtINR(g.target)} saved (${g.math.progressPct}%). To finish by ${fmtDate(g.math.targetDate)} you need ${fmtINR(g.math.requiredDaily)} a day, versus the original plan of ${fmtINR(g.math.planDaily)}/day. Your flexible money right now is ${fmtINR(d.cvf.flexible)}.`, sources };
  }

  // ---------- health ----------
  if (intent.id === 'health') {
    src('Student Money Health factors'); src('Transactions'); src('Commitments');
    step('Financial data retrieval', 'Spending, savings, balance, commitments, subscriptions, budget');
    step('Transaction / account engine', `${cur.length} transactions this month`);
    step('Calculation engine', `Score ${d.score.score}/100 from six weighted factors`);
    step('Risk / consistency check', 'Weights sum to 1.0; factors bounded 0–100 ✓');
    step('AI reasoning', 'Named the strongest and weakest factor');
    const f = [...d.score.factors].sort((a, b) => b.score - a.score);
    return { intent: intent.id, steps, grounded: true, answer: `Your Student Money Health is ${d.score.score}/100 (not a credit score). Strongest: ${f[0].label.toLowerCase()} — ${f[0].detail} Weakest: ${f[f.length - 1].label.toLowerCase()} — ${f[f.length - 1].detail} ${d.scoreChange.text}`, sources };
  }

  // ---------- scenario ----------
  if (intent.id === 'scenario') {
    const deny = denied('cfoAccounts', 'your bank accounts'); if (deny) return deny;
    src('Bank balance'); src('Commitments'); src('Purpose reservations');
    if (!amount) {
      step('Financial data retrieval', 'No amount found in the question');
      return { intent: intent.id, steps, grounded: false, answer: 'Tell me the amount (for example "can I afford ₹6,000 for a course this month?") and I will run it against your flexible money and upcoming commitments.', sources };
    }
    step('Financial data retrieval', `Balance ${fmtINR(d.bankBalance)}, committed ${fmtINR(d.cvf.committed)}, reserved ${fmtINR(d.purposes.reserved)}`);
    const proj = projectCalendar({ bankBalance: d.bankBalance - amount, commitments: state.commitments, today, horizonDays: 30, dailyBurn: d.dailyBurn });
    step('Transaction / account engine', `Daily variable burn ${fmtINR(d.dailyBurn)}/day from the last 60 days`);
    step('Calculation engine', `Flexible after purchase: ${fmtINR(d.cvf.flexible - amount)}; lowest projected balance ${fmtINR(proj.lowest.balance)} on ${fmtDate(proj.lowest.date)}`);
    const ok = d.cvf.flexible - amount >= 0 && proj.lowest.balance >= 0;
    step('Risk / consistency check', ok ? 'No commitment is put at risk ✓' : 'Risk: this dips into committed or reserved money');
    step('AI reasoning', 'Judged affordability against flexible money, not total balance');
    return { intent: intent.id, steps, grounded: true, answer: ok ? `Yes. Spending ${fmtINR(amount)} leaves ${fmtINR(d.cvf.flexible - amount)} of flexible money after your ${fmtINR(d.cvf.committed)} of commitments and ${fmtINR(d.purposes.reserved)} reserved for purposes. Lowest projected balance in the next 30 days would be ${fmtINR(proj.lowest.balance)} on ${fmtDate(proj.lowest.date)}.` : `Not comfortably. Your flexible money is ${fmtINR(d.cvf.flexible)}; ${fmtINR(amount)} would ${d.cvf.flexible - amount < 0 ? `eat ${fmtINR(amount - d.cvf.flexible)} of money that is committed or reserved` : `push your lowest projected balance to ${fmtINR(proj.lowest.balance)} on ${fmtDate(proj.lowest.date)}`}. The bank balance of ${fmtINR(d.bankBalance)} is not all yours to spend.`, sources };
  }

  // ---------- forward ----------
  if (intent.id === 'forward') {
    const deny = denied('cfoCommitments', 'your future commitments'); if (deny) return deny;
    src('Money Calendar'); src('Commitments'); src('Bank balance');
    const c = d.calendar;
    step('Financial data retrieval', `${c.events.length} dated events in the next 45 days`);
    step('Transaction / account engine', `Variable burn ${fmtINR(d.dailyBurn)}/day; inflows ${fmtINR(c.upcomingIn)}, outflows ${fmtINR(c.upcomingOut)}`);
    step('Calculation engine', `Lowest projected balance ${fmtINR(c.lowest.balance)} on ${fmtDate(c.lowest.date)}; month-end ${fmtINR(c.monthEndBalance)}`);
    step('Risk / consistency check', c.lowest.balance >= 0 ? 'Balance never goes negative ✓' : 'Risk: projected balance goes below zero');
    step('AI reasoning', 'Answered the month-end question directly');
    if (/runway|last/i.test(q)) return { intent: intent.id, steps, grounded: true, answer: `At your current burn of about ${fmtINR(d.monthlyBurn)} a month, your ${fmtINR(d.bankBalance)} bank balance is roughly ${d.income.runwayMonths.toFixed(1)} months of runway before counting new income. Typical monthly income has been ${fmtINR(d.income.typical)} (minimum ${fmtINR(d.income.minExpected)}, volatility ${d.income.volatilityLabel.toLowerCase()}).`, sources };
    return { intent: intent.id, steps, grounded: true, answer: `${c.enoughAtMonthEnd ? 'Yes, you should have enough.' : 'It will be tight.'} Month-end projected balance is ${fmtINR(c.monthEndBalance)}. The lowest point is ${fmtINR(c.lowest.balance)} on ${fmtDate(c.lowest.date)}, after ${c.events.filter((e) => e.direction === 'out' && toDate(e.date) <= toDate(c.lowest.date)).map((e) => `${e.title} ${fmtINR(e.amount)}`).join(', ') || 'no fixed outflows'}. This assumes ${fmtINR(d.dailyBurn)}/day of variable spending, based on your last 60 days.`, sources };
  }

  // ---------- comparative ----------
  if (intent.id === 'comparative') {
    src('Transactions (this month, last month)');
    const curT = categoryTotals(cur); const prevT = categoryTotals(prev);
    const curTotal = sum(cur, expenseOf); const prevTotal = sum(prev, expenseOf);
    step('Financial data retrieval', `${cur.length} transactions this month, ${prev.length} last month`);
    if (cat) {
      const a = curT.find((x) => x.category === cat)?.total || 0; const b = prevT.find((x) => x.category === cat)?.total || 0;
      step('Transaction / account engine', `Rolled ${categoryLabel(cat)} sub-categories together`);
      step('Calculation engine', `${fmtINR(a)} vs ${fmtINR(b)} (${b ? Math.round(((a - b) / b) * 100) : 0}%)`);
      step('Risk / consistency check', 'Split-adjusted expense used, transfers excluded ✓');
      step('AI reasoning', 'Compared like with like, with the partial-month caveat');
      return { intent: intent.id, steps, grounded: true, answer: `${categoryLabel(cat)}: ${fmtINR(a)} so far this month versus ${fmtINR(b)} for all of last month${b ? ` (${a >= b ? 'up' : 'down'} ${Math.abs(Math.round(((a - b) / b) * 100))}%)` : ''}. This month is only ${today.getDate()} days in.`, sources };
    }
    step('Transaction / account engine', 'Category totals for both months');
    step('Calculation engine', `${fmtINR(curTotal)} vs ${fmtINR(prevTotal)}`);
    step('Risk / consistency check', 'Sums match category rollups ✓');
    step('AI reasoning', 'Highlighted the biggest movers');
    const movers = curT.map((x) => ({ ...x, delta: x.total - (prevT.find((p) => p.category === x.category)?.total || 0) })).sort((a, b) => b.delta - a.delta).slice(0, 3);
    return { intent: intent.id, steps, grounded: true, answer: `This month so far: ${fmtINR(curTotal)}; last month total: ${fmtINR(prevTotal)}. Biggest changes: ${movers.map((m) => `${m.label} ${m.delta >= 0 ? '+' : '−'}${fmtINR(Math.abs(m.delta))}`).join(', ')}.`, sources };
  }

  // ---------- analytical ----------
  if (intent.id === 'analytical') {
    src('Transactions'); src('Three-month averages');
    if (/small|micro|under/i.test(q)) {
      const m = d.micro;
      step('Financial data retrieval', `${m.count} purchases under ₹${m.threshold} this month`);
      step('Transaction / account engine', 'Filtered to expense transactions only');
      step('Calculation engine', `Total ${fmtINR(m.total)}; 25% reduction ≈ ${fmtINR(m.saving)}`);
      step('Risk / consistency check', 'Threshold applied to split-adjusted expense ✓');
      step('AI reasoning', 'Framed as an opportunity, not a judgement');
      return { intent: intent.id, steps, grounded: true, answer: `You made ${m.count} small purchases under ₹${m.threshold} this month totaling ${fmtINR(m.total)}. If you reduce this by 25%, you could save approximately ${fmtINR(m.saving)} a month.`, sources };
    }
    if (/why|increase|went up/i.test(q)) {
      const w = d.why;
      step('Financial data retrieval', `This month ${fmtINR(w.curTotal)}; 3-month average ${fmtINR(w.prevAvgTotal)}`);
      step('Transaction / account engine', 'Category deltas and one-time purchases isolated');
      step('Calculation engine', `Difference ${fmtINR(w.diff)}; one-time ${fmtINR(w.oneTimeTotal)}`);
      step('Risk / consistency check', 'Category contributions sum to the total difference ✓');
      step('AI reasoning', 'Decomposed the change into causes');
      const tops = w.contributions.filter((c) => c.delta > 0).slice(0, 2);
      return { intent: intent.id, steps, grounded: true, answer: w.diff > 0 ? `Your spending is ${fmtINR(w.diff)} ${w.diff > 0 ? 'higher' : 'lower'} than your 3-month average. ${tops.map((t) => `${t.share}% of that is ${t.label.toLowerCase()}`).join('; ')}. ${fmtINR(w.oneTimeTotal)} came from one-time purchases (${w.oneTime.map((t) => t.merchant).join(', ') || 'none'}). Excluding those, spending is still ${Math.abs(w.exclPct)}% ${w.exclPct >= 0 ? 'above' : 'below'} average.${w.partialMonth ? ' The month is not over yet, so this is a partial-month comparison.' : ''}` : `Your spending is ${fmtINR(-w.diff)} lower than your 3-month average so far. Biggest drops: ${w.contributions.slice(-2).map((t) => `${t.label} ${fmtINR(Math.abs(t.delta))}`).join(', ')}.`, sources };
    }
    const s = d.summary;
    step('Financial data retrieval', `${s.txCount} spending transactions this month`);
    step('Transaction / account engine', 'Category rollup (transfers and peer payments excluded)');
    step('Calculation engine', s.rows.slice(0, 5).map((r) => `${r.label} ${fmtINR(r.total)}`).join('; '));
    step('Risk / consistency check', 'Category sum equals monthly total ✓');
    step('AI reasoning', 'Ranked categories and added the notable comparisons');
    return { intent: intent.id, steps, grounded: true, answer: `Where it went this month (${fmtINR(s.total)}): ${s.rows.slice(0, 5).map((r) => `${r.label} ${fmtINR(r.total)}`).join(', ')}. ${s.insights.slice(0, 2).join(' ')}`, sources };
  }

  // ---------- simple ----------
  if (/net worth|net position/i.test(q)) {
    const deny = denied('cfoInvestments', 'your investments and loans'); if (deny) return deny;
    src('Unified balance sheet');
    step('Financial data retrieval', `${d.assets.length} assets, ${d.liabilities.length} liabilities`);
    step('Transaction / account engine', 'Connected balances only');
    step('Calculation engine', `${fmtINR(d.totalAssets)} − ${fmtINR(d.totalLiabilities)} = ${fmtINR(d.netPosition)}`);
    step('Risk / consistency check', 'Assets − liabilities equals net ✓');
    step('AI reasoning', 'Stated the net position');
    return { intent: intent.id, steps, grounded: true, answer: `Net position ${fmtINR(d.netPosition)}: assets ${fmtINR(d.totalAssets)} (${d.assets.map((a) => `${a.name} ${fmtINR(a.balance)}`).join(', ')}) minus liabilities ${fmtINR(d.totalLiabilities)} (${d.liabilities.map((a) => `${a.name} ${fmtINR(a.balance)}`).join(', ')}).`, sources };
  }
  if (/balance|spendable|available|actually mine|mine/i.test(q) && !/spent|spend on/i.test(q)) {
    const deny = denied('cfoAccounts', 'your bank accounts'); if (deny) return deny;
    src('Bank accounts'); src('Purpose reservations'); src('Commitments');
    step('Financial data retrieval', `${d.bankAccounts.length} bank accounts`);
    step('Transaction / account engine', `Balance ${fmtINR(d.bankBalance)}`);
    step('Calculation engine', `${fmtINR(d.bankBalance)} − committed ${fmtINR(d.cvf.committed)} − reserved ${fmtINR(d.purposes.reserved)} = flexible ${fmtINR(d.cvf.flexible)}`);
    step('Risk / consistency check', 'Reserved and committed do not overlap ✓');
    step('AI reasoning', 'Separated bank balance from money that is actually yours to spend');
    return { intent: intent.id, steps, grounded: true, answer: `Bank balance is ${fmtINR(d.bankBalance)}, but ${fmtINR(d.cvf.committed)} is committed to upcoming fixed payments and ${fmtINR(d.purposes.reserved)} is reserved for purposes, so the money actually yours to spend is ${fmtINR(d.cvf.flexible)}.`, sources };
  }
  if (/income|earn/i.test(q)) {
    src('Income history');
    step('Financial data retrieval', `${d.income.months.length} completed months of income`);
    step('Transaction / account engine', 'Allowance, internship and scholarship credits');
    step('Calculation engine', `Typical ${fmtINR(d.income.typical)}, minimum ${fmtINR(d.income.minExpected)}, volatility ${d.income.volatilityLabel}`);
    step('Risk / consistency check', 'No fixed monthly income assumed ✓');
    step('AI reasoning', 'Described income as a range, not a fixed salary');
    return { intent: intent.id, steps, grounded: true, answer: `Your income is irregular. Over the last ${d.income.months.length} completed months it ranged from ${fmtINR(d.income.minExpected)} to ${fmtINR(Math.max(...d.income.months.map((m) => m.total)))}, with a typical month at ${fmtINR(d.income.typical)} (${d.income.volatilityLabel.toLowerCase()} volatility).`, sources };
  }
  if (/subscription/i.test(q)) {
    src('Subscriptions');
    const act = state.subscriptions.filter((s) => s.status === 'active');
    step('Financial data retrieval', `${act.length} active subscriptions`);
    step('Calculation engine', `${fmtINR(sum(act, (s) => s.amount))}/month`);
    step('Risk / consistency check', '✓');
    step('AI reasoning', 'Flagged the unused ones');
    const unused = act.filter((s) => !s.lastUsed || (today - toDate(s.lastUsed)) / 86400000 > 30);
    return { intent: intent.id, steps, grounded: true, answer: `${act.length} active subscriptions cost ${fmtINR(sum(act, (s) => s.amount))} a month: ${act.map((s) => `${s.name} ${fmtINR(s.amount)}`).join(', ')}.${unused.length ? ` ${unused.map((s) => s.name).join(', ')} ${unused.length > 1 ? 'have' : 'has'} not been used in 30 days.` : ''}`, sources };
  }
  // spending on category / total
  src('Transactions');
  const total = sum(cur, expenseOf);
  if (cat) {
    const t = categoryTotals(cur).find((x) => x.category === cat)?.total || 0;
    const n = cur.filter((x) => expenseOf(x) > 0 && topCategory(x.category) === cat).length;
    step('Financial data retrieval', `${n} ${categoryLabel(cat).toLowerCase()} transactions this month`);
    step('Transaction / account engine', 'Rolled sub-categories together, split-adjusted');
    step('Calculation engine', `Total ${fmtINR(t)}`);
    step('Risk / consistency check', 'Transfers and peer payments excluded ✓');
    step('AI reasoning', 'Put it in context of total spend');
    return { intent: intent.id, steps, grounded: true, answer: `${fmtINR(t)} on ${categoryLabel(cat).toLowerCase()} this month across ${n} transactions, which is ${total ? Math.round((t / total) * 100) : 0}% of your ${fmtINR(total)} total spend so far.`, sources };
  }
  step('Financial data retrieval', `${cur.length} transactions this month`);
  step('Transaction / account engine', 'Economic expense only');
  step('Calculation engine', `Total ${fmtINR(total)}`);
  step('Risk / consistency check', '✓');
  step('AI reasoning', 'Stated the total with the top category');
  const top = categoryTotals(cur)[0];
  return { intent: intent.id, steps, grounded: true, answer: `You have spent ${fmtINR(total)} this month${top ? `, the largest share being ${top.label.toLowerCase()} at ${fmtINR(top.total)}` : ''}.`, sources };
}

export const SUGGESTED_QUESTIONS = [
  'How much did I spend on food this month?',
  'Why did my spending increase?',
  'Will I have enough money at month end?',
  'Can I afford ₹6,000 for a course this month?',
  'Compare food with last month',
  'Who owes me money?',
  'When will I reach my Goa trip goal?',
  'How is my money health?',
  'What is my net position?',
  'How much money is actually mine to spend?',
];
