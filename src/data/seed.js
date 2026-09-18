// Demo dataset for one student (Ajay). Deterministic and anchored to "today" so the calendar,
// patterns and month comparisons are always live. Contains the source examples verbatim where
// they are meant to be demonstrated (₹4,500 dinner, ₹1,500 to Rahul, ₹30,000 from parent,
// HDFC→SBI transfer, "UPI – ABC ENTERPRISES – ₹650", duplicate ₹2,500 pair, calendar events).
import { addDays, addMonths, isoDay, mulberry32, startOfMonth } from '../engines/utils.js';
import { detectInternalTransfers } from '../engines/categorise.js';

export const SEED_VERSION = 3;

export function buildSeed(today = new Date()) {
  const rand = mulberry32(20260918);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  const at = (daysAgo, hour = 12, minute = 0) => { const d = addDays(t0, -daysAgo); d.setHours(hour, minute, 0, 0); return d.toISOString(); };

  const accounts = [
    { id: 'acc_hdfc', name: 'HDFC Savings', institution: 'HDFC Bank', type: 'savings', kind: 'asset', balance: 40000, mask: '••4821', connected: true, connectedAt: at(140), lastSync: at(0, 8) },
    { id: 'acc_sbi', name: 'SBI Savings', institution: 'State Bank of India', type: 'savings', kind: 'asset', balance: 110000, mask: '••1190', connected: true, connectedAt: at(140), lastSync: at(0, 8) },
    { id: 'acc_mf', name: 'Mutual funds', institution: 'Groww (CAMS)', type: 'mutual_fund', kind: 'asset', balance: 80000, mask: 'Folio 771', connected: true, connectedAt: at(120), lastSync: at(0, 8) },
    { id: 'acc_demat', name: 'Demat / stocks', institution: 'Zerodha (CDSL)', type: 'demat', kind: 'asset', balance: 120000, mask: 'BO ••3390', connected: true, connectedAt: at(120), lastSync: at(0, 8) },
    { id: 'acc_fd', name: 'Fixed deposit', institution: 'HDFC Bank', type: 'deposit', kind: 'asset', balance: 30000, mask: 'FD ••02', connected: true, connectedAt: at(140), lastSync: at(0, 8) },
    { id: 'acc_cc', name: 'HDFC credit card', institution: 'HDFC Bank', type: 'credit_card', kind: 'liability', balance: 40000, mask: '••7723', connected: true, connectedAt: at(140), lastSync: at(0, 8), limit: 60000 },
    { id: 'acc_loan', name: 'Education loan', institution: 'SBI', type: 'loan', kind: 'liability', balance: 200000, mask: 'EDU ••55', connected: true, connectedAt: at(140), lastSync: at(0, 8) },
    { id: 'acc_ins', name: 'Health insurance', institution: 'Star Health', type: 'insurance', kind: 'asset', balance: 0, mask: 'Policy ••88', connected: false, cover: 300000 },
    { id: 'acc_pension', name: 'NPS / pension', institution: 'NSDL', type: 'pension', kind: 'asset', balance: 0, mask: 'PRAN', connected: false },
  ];

  const contacts = [
    { id: 'c_rahul', name: 'Rahul', handle: 'rahul.s@upi', roommate: true, college: true, friend: true, helper: true },
    { id: 'c_priya', name: 'Priya', handle: 'priya.m@upi', college: true, friend: true, helper: true },
    { id: 'c_ananya', name: 'Ananya', handle: 'ananya@upi', college: true, friend: true, helper: false },
    { id: 'c_karan', name: 'Karan', handle: 'karan.k@upi', college: true, friend: true, helper: true },
    { id: 'c_arjun', name: 'Arjun', handle: 'arjun@upi', college: true, friend: false, helper: true },
    { id: 'c_parent', name: 'Papa (Sunil)', handle: 'sunil.p@upi', family: true },
  ];

  const groups = [
    { id: 'g_goa', name: 'Goa trip', type: 'trip', active: true, memberIds: ['self', 'c_rahul', 'c_priya', 'c_karan'] },
    { id: 'g_flat', name: 'Flat 302', type: 'home', active: true, memberIds: ['self', 'c_rahul', 'c_ananya'] },
  ];

  const tx = [];
  let n = 0;
  const push = (o) => { tx.push({ id: `tx_${String(++n).padStart(4, '0')}`, channel: 'upi', accountId: 'acc_hdfc', source: 'Account Aggregator', ...o }); return tx[tx.length - 1]; };

  // ---- Income history (irregular: allowance + internship + scholarship) ----
  const incomePlan = [
    { m: -4, allowance: 12000, intern: 0, sch: 0 }, { m: -3, allowance: 12000, intern: 8000, sch: 0 }, { m: -2, allowance: 12000, intern: 0, sch: 15000 }, { m: -1, allowance: 12000, intern: 11000, sch: 0 },
  ];
  for (const p of incomePlan) {
    const som = startOfMonth(addMonths(t0, p.m));
    const d = (day, h) => { const x = new Date(som); x.setDate(day); x.setHours(h, 5, 0, 0); return x.toISOString(); };
    push({ date: d(2, 9), amount: p.allowance, direction: 'in', merchant: 'Papa (Sunil)', descriptor: 'UPI/SUNIL P/allowance', category: 'parent_allowance', meaning: 'Monthly allowance', contactId: 'c_parent', channel: 'upi', accountId: 'acc_sbi', purposeAllocations: [{ purpose: 'monthly_living', amount: p.allowance }] });
    if (p.intern) push({ date: d(10, 11), amount: p.intern, direction: 'in', merchant: 'Nexa Labs Pvt Ltd', descriptor: 'NEFT NEXA LABS STIPEND', category: 'internship', meaning: 'Internship stipend', channel: 'bank', accountId: 'acc_hdfc', purposeAllocations: [{ purpose: 'unrestricted', amount: p.intern }] });
    if (p.sch) push({ date: d(15, 10), amount: p.sch, direction: 'in', merchant: 'State Scholarship Portal', descriptor: 'NEFT DBT SCHOLARSHIP', category: 'scholarship', meaning: 'Merit scholarship', channel: 'bank', accountId: 'acc_sbi', purposeAllocations: [{ purpose: 'tuition', amount: p.sch }] });
  }
  // This month: allowance already allocated; parent sent ₹30,000 for the semester → needs purpose
  const somNow = startOfMonth(t0);
  const thisMonthDay = (day, h) => { const x = new Date(somNow); x.setDate(day); x.setHours(h, 5, 0, 0); return x.toISOString(); };
  if (t0.getDate() >= 2) push({ date: thisMonthDay(2, 9), amount: 12000, direction: 'in', merchant: 'Papa (Sunil)', descriptor: 'UPI/SUNIL P/allowance', category: 'parent_allowance', meaning: 'Monthly allowance', contactId: 'c_parent', accountId: 'acc_sbi', purposeAllocations: [{ purpose: 'monthly_living', amount: 12000 }] });
  push({ date: at(1, 10), amount: 30000, direction: 'in', merchant: 'Papa (Sunil)', descriptor: 'UPI/SUNIL P/sem', category: 'parent_allowance', meaning: 'Money from parent', contactId: 'c_parent', accountId: 'acc_hdfc', needsPurpose: true });

  // ---- Fixed monthly outflows in history ----
  for (let m = -4; m <= -1; m++) {
    const som = startOfMonth(addMonths(t0, m));
    const d = (day, h) => { const x = new Date(som); x.setDate(day); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    push({ date: d(5, 9), amount: 8000, direction: 'out', merchant: 'Sunrise PG', descriptor: 'UPI/SUNRISE PG/hostel', category: 'hostel', meaning: 'Hostel fee', purpose: 'hostel' });
    push({ date: d(7, 9), amount: 2000, direction: 'out', merchant: 'Groww SIP', descriptor: 'ACH SIP GROWW', category: 'sip', meaning: 'SIP', channel: 'bank', purpose: 'investment', goalId: null, counterpartAccountId: 'acc_mf' });
    push({ date: d(12, 9), amount: 199, direction: 'out', merchant: 'Spotify', descriptor: 'SPOTIFY INDIA', category: 'subscription', meaning: 'Spotify', channel: 'card', accountId: 'acc_cc' });
    push({ date: d(14, 9), amount: 649, direction: 'out', merchant: 'Netflix', descriptor: 'NETFLIX.COM', category: 'subscription', meaning: 'Netflix', channel: 'card', accountId: 'acc_cc' });
  }

  // ---- Variable spending: generate ~110 days of behaviour with the source's patterns baked in ----
  const merchants = {
    food: [['Campus Canteen', 60, 140], ['Sri Sai Tiffins', 80, 160], ['Chai Point', 40, 120]],
    coffee: [['Starbucks', 220, 380], ['Third Wave Coffee', 200, 340]],
    food_delivery: [['Swiggy', 160, 360], ['Zomato', 180, 400]],
    groceries: [['Blinkit', 120, 420], ['Zepto', 100, 380]],
    transport: [['BMTC', 25, 60], ['Namma Metro', 30, 70], ['Uber', 120, 320], ['Rapido', 60, 150]],
    entertainment: [['BookMyShow', 250, 600], ['Steam', 300, 900]],
    shopping: [['Amazon', 300, 1500], ['Flipkart', 400, 1800], ['Myntra', 600, 2200]],
    college: [['Xerox Point', 20, 120], ['Campus Stationery', 60, 300]],
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const amt = (lo, hi) => Math.round(lo + rand() * (hi - lo));
  for (let day = 110; day >= 0; day--) {
    const d = addDays(t0, -day);
    const dow = d.getDay(); const weekend = dow === 0 || dow === 6;
    const dom = d.getDate(); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const monthEnd = dim - dom < 5;
    const postIncome = dom >= 3 && dom <= 5; // allowance lands on the 2nd
    const isThisMonth = d.getMonth() === t0.getMonth();
    const foodBoost = isThisMonth ? 1.35 : 1; // "Food is 38% higher than last month"
    // canteen/tea: most days
    if (rand() < 0.85) push({ date: at(day, 13, amt(0, 50)), amount: amt(...merchants.food[0].slice(1)), direction: 'out', merchant: 'Campus Canteen', descriptor: 'UPI/CAMPUS CANTEEN', category: 'food', meaning: 'Lunch', purpose: 'monthly_living' });
    if (rand() < 0.6) push({ date: at(day, 10, amt(0, 50)), amount: amt(40, 110), direction: 'out', merchant: 'Chai Point', descriptor: 'UPI/CHAI POINT', category: 'coffee', meaning: 'Tea', purpose: 'monthly_living' });
    if (rand() < 0.3) push({ date: at(day, 17, amt(0, 50)), amount: amt(...merchants.food[1].slice(1)), direction: 'out', merchant: 'Sri Sai Tiffins', descriptor: 'UPI/SRI SAI TIFFINS', category: 'food', meaning: 'Snacks', purpose: 'monthly_living' });
    // transport
    if (rand() < 0.7) { const [mname, lo, hi] = pick(merchants.transport.slice(0, 2)); push({ date: at(day, 8, amt(30, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `UPI/${mname.toUpperCase()}`, category: 'transport', meaning: 'Commute', purpose: 'monthly_living' }); }
    if (rand() < (weekend ? 0.55 : 0.2)) { const [mname, lo, hi] = pick(merchants.transport.slice(2)); push({ date: at(day, weekend ? 20 : 19, amt(0, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `UPI/${mname.toUpperCase()}`, category: 'transport', meaning: 'Cab', purpose: 'monthly_living' }); }
    // food delivery: concentrated 9pm–midnight, more on weekends / month end / post income
    const deliveryP = 0.16 * (weekend ? 1.8 : 1) * (monthEnd ? 1.5 : 1) * (postIncome ? 1.6 : 1) * foodBoost;
    if (rand() < deliveryP) { const [mname, lo, hi] = pick(merchants.food_delivery); const late = rand() < 0.7; push({ date: at(day, late ? amt(21, 23) : amt(12, 20), amt(0, 59)), amount: Math.round(amt(lo, hi) * foodBoost), direction: 'out', merchant: mname, descriptor: `UPI/${mname.toUpperCase()}`, category: 'food_delivery', meaning: late ? 'Late-night order' : 'Order', purpose: 'monthly_living' }); }
    // coffee shop
    if (rand() < (weekend ? 0.28 : 0.1) * foodBoost) { const [mname, lo, hi] = pick(merchants.coffee); push({ date: at(day, amt(15, 18), amt(0, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `UPI/${mname.toUpperCase()}`, category: 'coffee', meaning: 'Coffee', purpose: 'monthly_living' }); }
    // groceries
    if (rand() < 0.12) { const [mname, lo, hi] = pick(merchants.groceries); push({ date: at(day, amt(18, 21), amt(0, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `UPI/${mname.toUpperCase()}`, category: 'groceries', meaning: 'Groceries', purpose: 'monthly_living' }); }
    // entertainment / shopping: weekend + month end + post-income heavier
    if (rand() < 0.08 * (weekend ? 2.2 : 1) * (monthEnd ? 1.6 : 1) * (postIncome ? 2 : 1)) { const [mname, lo, hi] = pick(merchants.entertainment); push({ date: at(day, amt(18, 21), amt(0, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `${mname.toUpperCase()}`, category: 'entertainment', meaning: 'Entertainment', channel: rand() < 0.5 ? 'card' : 'upi', accountId: rand() < 0.5 ? 'acc_cc' : 'acc_hdfc', purpose: 'unrestricted' }); }
    if (rand() < 0.06 * (weekend ? 1.8 : 1) * (monthEnd ? 1.5 : 1) * (postIncome ? 2.2 : 1)) { const [mname, lo, hi] = pick(merchants.shopping); push({ date: at(day, amt(11, 22), amt(0, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `${mname.toUpperCase()}`, category: 'shopping', meaning: 'Shopping', channel: 'card', accountId: 'acc_cc', purpose: 'unrestricted' }); }
    // college
    if (rand() < 0.12) { const [mname, lo, hi] = pick(merchants.college); push({ date: at(day, amt(9, 16), amt(0, 59)), amount: amt(lo, hi), direction: 'out', merchant: mname, descriptor: `UPI/${mname.toUpperCase()}`, category: 'college', meaning: 'College', purpose: 'tuition' }); }
  }

  // ---- Source examples ----
  const dinner = push({ date: at(2, 21, 10), amount: 4500, direction: 'out', merchant: 'Truffles', descriptor: 'UPI/TRUFFLES KORAMANGALA', category: 'dining', meaning: 'Dinner with friends', purpose: 'monthly_living', splitPrompt: true });
  push({ date: at(1, 22, 15), amount: 1500, direction: 'out', merchant: 'Rahul', descriptor: 'UPI/RAHUL S', category: 'peer', contactId: 'c_rahul', peerMeaning: null, needsReview: true });
  push({ date: at(0, 20, 5), amount: 650, direction: 'out', merchant: 'ABC ENTERPRISES', descriptor: 'UPI – ABC ENTERPRISES – ₹650', category: null, meaning: null, needsReview: true, upiUnknown: true });
  push({ date: at(3, 11, 30), amount: 10000, direction: 'out', merchant: 'Self transfer to SBI', descriptor: 'IMPS SELF SBI 1190', category: 'internal_transfer', channel: 'bank', accountId: 'acc_hdfc', counterpartAccountId: 'acc_sbi' });
  push({ date: at(3, 11, 31), amount: 10000, direction: 'in', merchant: 'Transfer from HDFC', descriptor: 'IMPS FROM HDFC 4821', category: 'internal_transfer', channel: 'bank', accountId: 'acc_sbi', counterpartAccountId: 'acc_hdfc' });
  push({ date: at(4, 21, 40), amount: 420, direction: 'out', merchant: 'Swiggy', descriptor: 'UPI/SWIGGY', category: 'food_delivery', meaning: 'Swiggy', purpose: 'monthly_living' });
  push({ date: at(7, 15, 20), amount: 2100, direction: 'out', merchant: 'Croma', descriptor: 'CROMA ELECTRONICS', category: 'shopping', meaning: 'Mechanical keyboard', channel: 'card', accountId: 'acc_cc', purpose: 'unrestricted' });
  // duplicate candidate: same ₹2,500 via UPI and credit card, same merchant, 1 day apart
  push({ date: at(6, 16, 0), amount: 2500, direction: 'out', merchant: 'Decathlon', descriptor: 'UPI/DECATHLON', category: 'shopping', meaning: 'Running shoes', channel: 'upi', accountId: 'acc_hdfc', purpose: 'unrestricted' });
  push({ date: at(5, 16, 3), amount: 2500, direction: 'out', merchant: 'Decathlon', descriptor: 'DECATHLON SPORTS', category: 'shopping', meaning: 'Running shoes', channel: 'card', accountId: 'acc_cc', purpose: 'unrestricted' });
  // reversal candidate
  push({ date: at(9, 12, 0), amount: 1299, direction: 'out', merchant: 'Myntra', descriptor: 'MYNTRA', category: 'shopping', meaning: 'Jacket', channel: 'card', accountId: 'acc_cc', purpose: 'unrestricted' });
  push({ date: at(7, 12, 0), amount: 1299, direction: 'in', merchant: 'Myntra', descriptor: 'MYNTRA REFUND', category: 'refund', meaning: 'Refund', channel: 'card', accountId: 'acc_cc' });
  // peer transfers feeding balances
  push({ date: at(12, 19, 0), amount: 350, direction: 'in', merchant: 'Karan', descriptor: 'UPI/KARAN K', category: 'peer', contactId: 'c_karan', peerMeaning: 'loan_repayment' });
  push({ date: at(20, 20, 0), amount: 800, direction: 'out', merchant: 'Priya', descriptor: 'UPI/PRIYA M', category: 'peer', contactId: 'c_priya', peerMeaning: 'trip_expense', note: 'goa hotel advance' });
  // credit card bill paid last month (not an expense: it settles card spending already recorded)
  push({ date: thisMonthDay(1, 10), amount: 18500, direction: 'out', merchant: 'HDFC Card bill', descriptor: 'HDFC CC PAYMENT', category: 'credit_card_bill', meaning: 'Credit card bill', channel: 'bank', accountId: 'acc_sbi' });
  // one-time purchase this month (drives the "why did spending increase" one-time bucket)
  push({ date: at(8, 14, 0), amount: 2100, direction: 'out', merchant: 'Amazon', descriptor: 'AMAZON', category: 'shopping', meaning: 'Bluetooth keyboard', channel: 'card', accountId: 'acc_cc', purpose: 'unrestricted' });
  // manual cash entries
  push({ date: at(2, 9, 0), amount: 150, direction: 'out', merchant: 'Auto (cash)', descriptor: 'Cash', category: 'cash', meaning: 'Auto fare', channel: 'cash', accountId: 'cash', purpose: 'monthly_living', manual: true });
  // goal contributions
  push({ date: thisMonthDay(3, 9), amount: 1200, direction: 'out', merchant: 'Goa trip goal', descriptor: 'Goal transfer', category: 'internal_transfer', internalTransfer: true, channel: 'bank', accountId: 'acc_hdfc', goalId: 'g_goa', meaning: 'Saved to goal' });

  const commitments = [
    { id: 'cm_salary', title: 'Internship salary', type: 'income', amount: 70000, direction: 'in', date: isoDay(t0), recurrence: 'none', source: 'commitment', note: 'Final internship payout' },
    { id: 'cm_rent', title: 'Rent', type: 'rent', amount: 22000, direction: 'out', date: isoDay(addDays(t0, 2)), recurrence: 'monthly' },
    { id: 'cm_emi', title: 'Laptop EMI', type: 'emi', amount: 8000, direction: 'out', date: isoDay(addDays(t0, 4)), recurrence: 'monthly' },
    { id: 'cm_sip', title: 'SIP', type: 'sip', amount: 10000, direction: 'out', date: isoDay(addDays(t0, 7)), recurrence: 'monthly' },
    { id: 'cm_cc', title: 'Credit card bill', type: 'credit_card_bill', amount: 18500, direction: 'out', date: isoDay(addDays(t0, 10)), recurrence: 'monthly' },
    { id: 'cm_ins', title: 'Insurance premium', type: 'insurance', amount: 4000, direction: 'out', date: isoDay(addDays(t0, 12)), recurrence: 'none' },
    { id: 'cm_hostel', title: 'Hostel fee', type: 'hostel', amount: 15000, direction: 'out', date: isoDay(addDays(t0, 5)), recurrence: 'monthly' },
    { id: 'cm_subs', title: 'Subscriptions', type: 'subscription', amount: 3000, direction: 'out', date: isoDay(addDays(t0, 14)), recurrence: 'monthly' },
    { id: 'cm_tuition', title: 'Semester tuition', type: 'tuition', amount: 45000, direction: 'out', date: isoDay(addDays(t0, 40)), recurrence: 'none' },
    { id: 'cm_allow', title: 'Monthly allowance', type: 'income', amount: 12000, direction: 'in', date: isoDay(addDays(startOfMonth(addMonths(t0, 1)), 1)), recurrence: 'monthly' },
  ];

  const splits = [];
  const obligations = [
    { id: 'ob_1', contactId: 'c_rahul', direction: 'i_owe', kind: 'split', title: 'Groceries for the flat', amount: 420, remaining: 420, createdAt: at(9), groupId: 'g_flat' },
    { id: 'ob_2', contactId: 'c_ananya', direction: 'i_owe', kind: 'split', title: 'Wi-Fi bill', amount: 180, remaining: 180, createdAt: at(11), groupId: 'g_flat' },
    { id: 'ob_3', contactId: 'c_karan', direction: 'they_owe', kind: 'split', title: 'Movie tickets', amount: 700, remaining: 350, createdAt: at(15), paidAt: at(12) },
    { id: 'ob_4', contactId: 'c_arjun', direction: 'they_owe', kind: 'informal', title: 'Lent for books', amount: 210, remaining: 210, createdAt: at(18) },
    { id: 'ob_5', contactId: 'c_rahul', direction: 'they_owe', kind: 'split', title: 'Goa hotel advance', amount: 800, remaining: 800, createdAt: at(20), groupId: 'g_goa' },
    { id: 'ob_6', contactId: 'c_priya', direction: 'i_owe', kind: 'split', title: 'Goa cab', amount: 300, remaining: 300, createdAt: at(19), groupId: 'g_goa' },
  ];
  // Peer-to-peer debts inside the Goa group (not involving self) for the settlement engine
  const groupDebts = [
    { id: 'gd_1', groupId: 'g_goa', from: 'c_priya', to: 'c_rahul', amount: 200, title: 'Breakfast' },
  ];

  const goals = [
    { id: 'g_goa', name: 'Goa trip', target: 12000, saved: 2340, horizonMonths: 6, createdAt: at(30), targetDate: isoDay(addDays(t0, 150)), selected: true },
    { id: 'g_head', name: 'New headphones', target: 8000, saved: 1500, horizonMonths: 3, createdAt: at(20), targetDate: isoDay(addDays(t0, 70)) },
    { id: 'g_laptop', name: 'Laptop', target: 60000, saved: 4000, horizonMonths: 12, createdAt: at(45), targetDate: isoDay(addDays(t0, 315)) },
    { id: 'g_phone', name: 'Phone', target: 25000, saved: 0, horizonMonths: 8, createdAt: at(10), targetDate: isoDay(addDays(t0, 230)) },
    { id: 'g_cert', name: 'Certification', target: 15000, saved: 900, horizonMonths: 4, createdAt: at(25), targetDate: isoDay(addDays(t0, 95)) },
  ];

  const subscriptions = [
    { id: 's_spotify', name: 'Spotify', amount: 199, status: 'active', lastUsed: at(1) },
    { id: 's_netflix', name: 'Netflix', amount: 649, status: 'active', lastUsed: at(40) },
    { id: 's_hotstar', name: 'Hotstar', amount: 299, status: 'cancelled', cancelledAt: at(30) },
    { id: 's_gym', name: 'Cult gym', amount: 151, status: 'cancelled', cancelledAt: at(50) },
  ];

  const allowance = { amount: 22000, buckets: [{ name: 'Food', amount: 9500 }, { name: 'Transport', amount: 2500 }, { name: 'College', amount: 1500 }, { name: 'Entertainment', amount: 2000 }, { name: 'Emergency', amount: 2000 }, { name: 'Savings', amount: 4500 }] };

  const emergencyRequests = [
    { id: 'er_1', requesterId: 'c_priya', requesterName: 'Priya', amount: 5000, reason: 'Emergency education expense (exam fee)', requiredBy: isoDay(t0), repaymentDate: isoDay(addDays(t0, 30)), visibility: 'friends', status: 'open', createdAt: at(0, 9), contributions: [{ contributorId: 'c_karan', name: 'Karan', amount: 2000, at: at(0, 10) }] },
    { id: 'er_2', requesterId: 'c_arjun', requesterName: 'Arjun', amount: 1500, reason: 'Medicines', requiredBy: isoDay(addDays(t0, 1)), repaymentDate: isoDay(addDays(t0, 15)), visibility: 'college', status: 'open', createdAt: at(0, 11), contributions: [] },
  ];

  const transactions = detectInternalTransfers(tx, accounts).sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const t of transactions) if (t.category === 'internal_transfer') t.internalTransfer = true;

  return {
    version: SEED_VERSION,
    user: { name: 'Ajay', college: 'RV College of Engineering', verified: true, helperOptIn: true },
    accounts, contacts, groups, transactions, commitments, splits, obligations, groupDebts, goals, subscriptions, allowance, emergencyRequests,
    merchantMemory: {}, purposeMemory: {}, peerCorrections: [], reminders: [], scoreHistory: [], consents: [
      { id: 'cons_1', provider: 'Account Aggregator (Finvu)', scope: 'Banks, deposits, MF, demat, loan, card', purpose: 'Continuous financial journal and unified view', validTill: isoDay(addDays(t0, 300)), status: 'active', grantedAt: at(140) },
    ],
    permissions: { cfoAccounts: true, cfoInvestments: true, cfoLoans: true, cfoPeers: true, cfoGoals: true, cfoDocuments: false, cfoCommitments: true },
    notificationsRead: [], settings: { reminderEveryDays: 7 },
  };
}
