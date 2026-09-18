import { describe, it, expect } from 'vitest';
import { computeSplit, applyPartialPayment } from '../src/engines/split.js';
import { settleGroup } from '../src/engines/settlement.js';
import { committedVsFlexible, projectCalendar, irregularIncomeModel, expandCommitments } from '../src/engines/forecast.js';
import { allowanceStatus, AVG_MONTH_DAYS } from '../src/engines/allowance.js';
import { goalMath } from '../src/engines/goals.js';
import { microSpending, monthSummary, whySpendingChanged } from '../src/engines/spending.js';
import { detectDuplicates } from '../src/engines/duplicates.js';
import { parseUpiDescriptor, inferUpiMerchant, DEFAULT_MERCHANT_MEMORY, interpretPeerTransaction, detectInternalTransfers, contextPath } from '../src/engines/categorise.js';
import { inferPurpose, validateAllocation, purposeBalances } from '../src/engines/purpose.js';
import { computeScore, explainScoreChange } from '../src/engines/score.js';
import { detectPatterns } from '../src/engines/patterns.js';
import { computeStreaks } from '../src/engines/streaks.js';
import { answerQuestion, detectIntent } from '../src/engines/cfo.js';
import { buildSeed } from '../src/data/seed.js';
import { derive } from '../src/store/derive.js';
import { fmtINR } from '../src/engines/utils.js';

const TODAY = new Date(2026, 8, 18, 12, 0, 0); // Fri 18 Sep 2026

describe('2.3 Expense splitting', () => {
  it('₹4,500 dinner for 5 → ₹900 each, user expense ₹900, ₹3,600 recoverable', () => {
    const r = computeSplit({ total: 4500, mode: 'equal', participants: [{ id: 'self', isSelf: true }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
    expect(r.valid).toBe(true);
    expect(r.shares.every((s) => s.share === 900)).toBe(true);
    expect(r.userExpense).toBe(900);
    expect(r.paymentOutflow).toBe(4500);
    expect(r.recoverable).toBe(3600);
    expect(r.remaining).toBe(3600);
  });
  it('unequal ₹4,000: items 800/1200/600 + shared 1,400 ÷ 3 = 466.67 each', () => {
    const r = computeSplit({ total: 4000, mode: 'unequal', sharedAmount: 1400, participants: [{ id: 'self', isSelf: true, itemAmount: 800 }, { id: 'rahul', itemAmount: 1200 }, { id: 'priya', itemAmount: 600 }] });
    expect(r.valid).toBe(true);
    expect(r.shares[0].sharedPart).toBe(466.67);
    expect(r.shares[0].share).toBe(1266.67);
    expect(r.shares[1].share).toBe(1666.67);
    expect(r.shares[2].share).toBe(1066.66); // absorbs rounding so total = 4000
    expect(r.shares.reduce((a, s) => a + s.share, 0)).toBeCloseTo(4000, 2);
  });
  it('rejects unequal allocations that do not total the bill', () => {
    const r = computeSplit({ total: 4000, mode: 'unequal', sharedAmount: 1000, participants: [{ id: 'self', isSelf: true, itemAmount: 800 }, { id: 'r', itemAmount: 1200 }] });
    expect(r.valid).toBe(false);
  });
  it('partial payment: ₹900 share less ₹300 paid leaves ₹600', () => {
    const r = computeSplit({ total: 4500, mode: 'equal', participants: [{ id: 'self', isSelf: true }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
    const p = applyPartialPayment(r, 'a', 300);
    expect(p.shares.find((s) => s.id === 'a').remaining).toBe(600);
    expect(p.remaining).toBe(3300);
  });
});

describe('2.4 Settlement engine', () => {
  it('Rahul→Ajay 800, Ajay→Priya 300, Priya→Rahul 200 settles in 2 payments', () => {
    const r = settleGroup([{ from: 'rahul', to: 'ajay', amount: 800 }, { from: 'ajay', to: 'priya', amount: 300 }, { from: 'priya', to: 'rahul', amount: 200 }]);
    expect(r.originalCount).toBe(3);
    expect(r.payments.length).toBe(2);
    expect(r.net.ajay).toBe(500); expect(r.net.rahul).toBe(-600); expect(r.net.priya).toBe(100);
    const total = r.payments.reduce((a, p) => a + p.amount, 0);
    expect(total).toBe(600);
  });
  it('exact opposite pairs cancel in one payment', () => {
    const r = settleGroup([{ from: 'a', to: 'b', amount: 500 }, { from: 'b', to: 'c', amount: 500 }]);
    expect(r.payments).toEqual([{ from: 'a', to: 'c', amount: 500 }]);
  });
});

describe('2.8 Forecast: committed vs flexible', () => {
  it('₹40,000 − 15,000 − 8,000 − 5,000 − 3,000 = ₹31,000 committed, ₹9,000 flexible', () => {
    const cms = [
      { id: 'h', title: 'Hostel', type: 'hostel', amount: 15000, direction: 'out', date: '2026-09-20', recurrence: 'none' },
      { id: 'c', title: 'Card', type: 'credit_card_bill', amount: 8000, direction: 'out', date: '2026-09-22', recurrence: 'none' },
      { id: 's', title: 'SIP', type: 'sip', amount: 5000, direction: 'out', date: '2026-09-25', recurrence: 'none' },
      { id: 'u', title: 'Subs', type: 'subscription', amount: 3000, direction: 'out', date: '2026-09-28', recurrence: 'none' },
    ];
    const r = committedVsFlexible({ bankBalance: 40000, commitments: cms, today: TODAY });
    expect(r.committed).toBe(31000);
    expect(r.flexible).toBe(9000);
  });
  it('monthly recurrence expands across the window', () => {
    const ev = expandCommitments([{ id: 'r', title: 'Rent', type: 'rent', amount: 1, direction: 'out', date: '2026-07-05', recurrence: 'monthly' }], new Date(2026, 8, 1), new Date(2026, 10, 30));
    expect(ev.map((e) => e.date)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
  });
});

describe('2.19 Money Calendar', () => {
  it('walks the source events and finds the lowest projected balance', () => {
    const cms = [
      { id: '1', title: 'Salary', type: 'income', amount: 70000, direction: 'in', date: '2026-09-18' },
      { id: '2', title: 'Rent', type: 'rent', amount: 22000, direction: 'out', date: '2026-09-20' },
      { id: '3', title: 'EMI', type: 'emi', amount: 8000, direction: 'out', date: '2026-09-22' },
      { id: '4', title: 'SIP', type: 'sip', amount: 10000, direction: 'out', date: '2026-09-25' },
      { id: '5', title: 'Credit card', type: 'credit_card_bill', amount: 18500, direction: 'out', date: '2026-09-28' },
      { id: '6', title: 'Insurance', type: 'insurance', amount: 4000, direction: 'out', date: '2026-09-30' },
    ];
    const r = projectCalendar({ bankBalance: 19900, commitments: cms, today: TODAY, horizonDays: 12, dailyBurn: 0 });
    const d28 = r.days.find((x) => x.date === '2026-09-28');
    expect(d28.balance).toBe(31400);
    expect(r.lowest.balance).toBe(27400);
    expect(r.lowest.date).toBe('2026-09-30');
    expect(r.enoughAtMonthEnd).toBe(true);
    const neg = projectCalendar({ bankBalance: 1000, commitments: cms.slice(1), today: TODAY, horizonDays: 12, dailyBurn: 0 });
    expect(neg.enoughAtMonthEnd).toBe(false);
  });
});

describe('2.10 Allowance Survival Mode', () => {
  const buckets = [{ name: 'Food', amount: 4000 }, { name: 'Transport', amount: 2000 }, { name: 'College', amount: 1500 }, { name: 'Entertainment', amount: 1500 }, { name: 'Emergency', amount: 1000 }, { name: 'Savings', amount: 2000 }];
  it('₹12,000 allowance → ₹247/day', () => {
    const r = allowanceStatus({ allowance: 12000, buckets, transactions: [], today: TODAY });
    expect(r.dailyPool).toBe(7500);
    expect(r.dailySafe).toBe(247);
  });
  it('spending ₹600 today → ₹353 over, and tomorrow is recalculated', () => {
    const tx = [{ id: 'x', date: new Date(2026, 8, 18, 13).toISOString(), amount: 600, direction: 'out', category: 'food' }];
    const r = allowanceStatus({ allowance: 12000, buckets, transactions: tx, today: TODAY });
    expect(r.spentToday).toBe(600);
    expect(r.overspend).toBe(353);
    expect(r.daysLeft).toBe(12);
    expect(r.tomorrowSafe).toBe(Math.round((7500 - 600) / 12));
  });
});

describe('2.14 Goals', () => {
  it('Goa trip ₹12,000 over 6 months → ₹67/day; progress 2,340/12,000', () => {
    const m = goalMath({ target: 12000, saved: 2340, horizonMonths: 6, createdAt: '2026-09-18', targetDate: '2027-03-17' }, TODAY);
    expect(m.planDaily).toBe(67);
    expect(m.progressPct).toBe(20);
    expect(m.remaining).toBe(9660);
  });
});

describe('2.11 / 2.12 / 2.18 Spending intelligence', () => {
  it('micro-spending aggregates purchases under ₹200 and estimates 25% saving', () => {
    const tx = [80, 120, 150, 90, 180, 110, 350].map((a, i) => ({ id: String(i), date: TODAY.toISOString(), amount: a, direction: 'out', category: 'food' }));
    const m = microSpending(tx);
    expect(m.count).toBe(6); expect(m.total).toBe(730); expect(m.saving).toBe(Math.round(730 * 0.25));
  });
  it('34 purchases totaling ₹3,920 → ≈ ₹980/month saving', () => {
    const m = microSpending(Array.from({ length: 34 }, (_, i) => ({ id: String(i), date: TODAY.toISOString(), amount: 3920 / 34, direction: 'out', category: 'food' })));
    expect(m.count).toBe(34); expect(Math.round(m.total)).toBe(3920); expect(m.saving).toBe(980);
  });
  it('why-increase decomposes vs the 3-month average and isolates one-time purchases', () => {
    const tx = [];
    for (const mo of [5, 6, 7]) { tx.push({ id: `f${mo}`, date: new Date(2026, mo, 10).toISOString(), amount: 3000, direction: 'out', category: 'food' }); }
    tx.push({ id: 'f8', date: new Date(2026, 8, 10).toISOString(), amount: 4500, direction: 'out', category: 'food' });
    tx.push({ id: 's8', date: new Date(2026, 8, 11).toISOString(), amount: 2100, direction: 'out', category: 'shopping' });
    tx.push({ id: 'transfer', date: new Date(2026, 8, 12).toISOString(), amount: 9999, direction: 'out', category: 'internal_transfer', internalTransfer: true });
    const w = whySpendingChanged(tx, TODAY);
    expect(w.prevAvgTotal).toBe(3000); expect(w.curTotal).toBe(6600); expect(w.diff).toBe(3600);
    expect(w.oneTimeTotal).toBe(2100); expect(w.exclOneTime).toBe(4500); expect(w.exclPct).toBe(50);
    expect(w.contributions.reduce((a, c) => a + c.delta, 0)).toBeCloseTo(3600, 1);
  });
  it('split-aware: a ₹4,500 dinner counts as the user share only', () => {
    const tx = [{ id: 'd', date: TODAY.toISOString(), amount: 4500, direction: 'out', category: 'dining', splitId: 's1', userExpense: 900 }];
    expect(monthSummary(tx, TODAY).total).toBe(900);
  });
});

describe('2.20 Duplicate detector', () => {
  const accounts = [{ id: 'a', name: 'HDFC' }, { id: 'cc', name: 'Card' }];
  it('flags ₹2,500 UPI + ₹2,500 card as possible duplicate and a refund pair as reversal', () => {
    const tx = [
      { id: '1', date: '2026-09-12T10:00:00', amount: 2500, direction: 'out', merchant: 'Decathlon', channel: 'upi', accountId: 'a' },
      { id: '2', date: '2026-09-13T10:00:00', amount: 2500, direction: 'out', merchant: 'Decathlon', channel: 'card', accountId: 'cc' },
      { id: '3', date: '2026-09-09T10:00:00', amount: 1299, direction: 'out', merchant: 'Myntra', channel: 'card', accountId: 'cc' },
      { id: '4', date: '2026-09-11T10:00:00', amount: 1299, direction: 'in', merchant: 'Myntra', channel: 'card', accountId: 'cc' },
    ];
    const f = detectDuplicates(tx, accounts);
    expect(f.find((x) => x.kind === 'duplicate')).toBeTruthy();
    expect(f.find((x) => x.kind === 'reversal')).toBeTruthy();
  });
});

describe('2.2 / 2.21 Categorisation + UPI intelligence', () => {
  it('parses "UPI – ABC ENTERPRISES – ₹650" and infers a dinner at 8 PM', () => {
    expect(parseUpiDescriptor('UPI – ABC ENTERPRISES – ₹650').merchant).toBe('ABC ENTERPRISES');
    const r = inferUpiMerchant({ descriptor: 'UPI – ABC ENTERPRISES – ₹650', amount: 650, date: '2026-09-18T20:05:00' }, DEFAULT_MERCHANT_MEMORY);
    expect(r.category).toBe('dining'); expect(r.meaning).toBe('Dinner');
  });
  it('merchant memory: Starbucks=Coffee, Blinkit=Groceries, Uber=Transport, Amazon=Shopping', () => {
    for (const [m, c] of [['Starbucks Indiranagar', 'coffee'], ['BLINKIT', 'groceries'], ['UBER INDIA', 'transport'], ['Amazon Pay', 'shopping']]) {
      expect(inferUpiMerchant({ descriptor: m, amount: 300, date: '2026-09-18T12:00:00' }, DEFAULT_MERCHANT_MEMORY).category).toBe(c);
    }
  });
  it('learned corrections win over heuristics', () => {
    const mem = { ...DEFAULT_MERCHANT_MEMORY, 'abc enterprises': { category: 'groceries', label: 'Groceries', userCorrected: true } };
    const r = inferUpiMerchant({ descriptor: 'UPI – ABC ENTERPRISES – ₹650', amount: 650, date: '2026-09-18T20:05:00' }, mem);
    expect(r.category).toBe('groceries'); expect(r.confidence).toBeGreaterThan(0.95);
  });
  it('₹1,500 to Rahul: loan repayment wins when it matches an open balance; correction memory shifts it', () => {
    const contact = { id: 'c_rahul', name: 'Rahul' };
    const tx = { id: 't', amount: 1500, direction: 'out', date: '2026-09-17T22:15:00' };
    const r = interpretPeerTransaction(tx, { contact, obligations: [{ contactId: 'c_rahul', direction: 'i_owe', remaining: 1500, title: 'Loan', kind: 'informal' }] });
    expect(r.top.id).toBe('loan_repayment');
    const r2 = interpretPeerTransaction(tx, { contact, obligations: [], corrections: [{ contactId: 'c_rahul', amount: 1400, meaning: 'trip_expense' }] });
    expect(r2.top.id).toBe('trip_expense');
  });
  it('HDFC → SBI ₹10,000 is an internal transfer, not an expense', () => {
    const accounts = [{ id: 'hdfc' }, { id: 'sbi' }];
    const tx = detectInternalTransfers([
      { id: '1', date: '2026-09-15T11:30:00', amount: 10000, direction: 'out', accountId: 'hdfc', descriptor: 'IMPS SELF SBI', merchant: 'Self' },
      { id: '2', date: '2026-09-15T11:31:00', amount: 10000, direction: 'in', accountId: 'sbi', descriptor: 'IMPS FROM HDFC', merchant: 'Self' },
    ], accounts);
    expect(tx.every((t) => t.internalTransfer)).toBe(true);
    expect(contextPath(tx[0])).toEqual(['Internal transfer', 'Not an expense']);
    expect(monthSummary(tx, TODAY).total).toBe(0);
  });
  it('context paths follow the source format', () => {
    expect(contextPath({ direction: 'in', category: 'parent_allowance', meaning: 'Monthly allowance' })).toEqual(['Income', 'Parent allowance', 'Monthly allowance']);
    expect(contextPath({ direction: 'out', category: 'food_delivery', merchant: 'Swiggy' })).toEqual(['Expense', 'Food', 'Food delivery', 'Swiggy']);
    expect(contextPath({ direction: 'out', category: 'peer', contactId: 'r', peerMeaning: 'money_transfer' }, [{ id: 'r', name: 'Rahul' }])).toEqual(['Peer transaction', 'Rahul', 'Money transfer']);
  });
});

describe('2.7 Purpose-based money', () => {
  it('infers purpose from source, learns from memory, validates allocations', () => {
    expect(inferPurpose({ category: 'parent_allowance', merchant: 'Papa' }).purpose).toBe('monthly_living');
    expect(inferPurpose({ category: 'scholarship', merchant: 'Portal' }).purpose).toBe('tuition');
    expect(inferPurpose({ category: 'parent_allowance', merchant: 'Papa (Sunil)' }, { papa: { purpose: 'hostel' } }).purpose).toBe('hostel');
    expect(validateAllocation(30000, [{ purpose: 'hostel', amount: 10000 }, { purpose: 'monthly_living', amount: 7000 }]).ok).toBe(false);
    expect(validateAllocation(30000, [{ purpose: 'hostel', amount: 10000 }, { purpose: 'monthly_living', amount: 7000 }, { purpose: 'travel', amount: 3000 }, { purpose: 'tuition', amount: 5000 }, { purpose: 'emergency', amount: 2000 }, { purpose: 'unrestricted', amount: 3000 }]).ok).toBe(true);
  });
  it('reserved money excludes unrestricted and nets consumption', () => {
    const tx = [{ id: 'in', direction: 'in', amount: 30000, date: TODAY.toISOString(), purposeAllocations: [{ purpose: 'hostel', amount: 10000 }, { purpose: 'unrestricted', amount: 20000 }] }, { id: 'out', direction: 'out', amount: 4000, purpose: 'hostel', date: TODAY.toISOString(), category: 'hostel' }];
    const p = purposeBalances(tx);
    expect(p.reserved).toBe(6000);
  });
});

describe('Seed + derived state', () => {
  const state = buildSeed(TODAY);
  const d = derive(state, TODAY);
  it('balance sheet matches the source example: assets 3,80,000, liabilities 2,40,000, net 1,40,000', () => {
    expect(d.totalAssets).toBe(380000); expect(d.totalLiabilities).toBe(240000); expect(d.netPosition).toBe(140000);
  });
  it('bank balance is 1,50,000 and flexible < balance', () => {
    expect(d.bankBalance).toBe(150000); expect(d.cvf.flexible).toBeLessThan(d.bankBalance);
  });
  it('split-bill memory shows the source names', () => {
    expect(d.youOwe.map((c) => c.name).sort()).toEqual(['Ananya', 'Priya', 'Rahul']);
    expect(d.othersOwe.map((c) => c.name).sort()).toEqual(['Arjun', 'Karan', 'Rahul']);
  });
  it('Goa group settles in fewer payments than raw debts', () => {
    const goa = d.settlements.find((s) => s.group.id === 'g_goa');
    expect(goa.payments.length).toBeLessThanOrEqual(goa.originalCount);
  });
  it('patterns detected with enough history, score bounded, streaks present', () => {
    expect(d.patterns.enoughData).toBe(true);
    expect(d.patterns.patterns.length).toBeGreaterThanOrEqual(2);
    expect(d.score.score).toBeGreaterThanOrEqual(0); expect(d.score.score).toBeLessThanOrEqual(100);
    expect(d.streaks.length).toBe(4);
    expect(d.duplicates.length).toBeGreaterThanOrEqual(2);
    expect(d.purposePrompts.length).toBe(1);
  });
  it('AI CFO answers every intent type from data and refuses unknown questions', () => {
    const qs = ['How much did I spend on food this month?', 'Why did my spending increase?', 'Will I have enough money at month end?', 'Can I afford ₹6,000 for a course this month?', 'Compare food with last month', 'Who owes me money?', 'When will I reach my Goa trip goal?', 'How is my money health?', 'What is my net position?', 'How much money is actually mine to spend?'];
    for (const q of qs) { const a = answerQuestion(q, { state, d }); expect(a.grounded, q).toBe(true); expect(a.steps.length).toBeGreaterThanOrEqual(5); expect(a.answer).toMatch(/₹|\d/); }
    const bad = answerQuestion('Tell me a joke about cats', { state, d });
    expect(bad.grounded).toBe(false); expect(bad.intent).toBe(null);
    const perm = answerQuestion('Who owes me money?', { state: { ...state, permissions: { ...state.permissions, cfoPeers: false } }, d });
    expect(perm.grounded).toBe(false);
  });
  it('formats Indian currency', () => {
    expect(fmtINR(150000)).toBe('₹1,50,000'); expect(fmtINR(900)).toBe('₹900'); expect(fmtINR(466.67, { decimals: 2 })).toBe('₹466.67'); expect(fmtINR(-500)).toBe('−₹500');
  });
});
