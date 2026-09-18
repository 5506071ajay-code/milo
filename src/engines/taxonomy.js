// Product vocabulary shared across engines and UI.

export const PURPOSES = [
  { id: 'monthly_living', label: 'Monthly living' },
  { id: 'tuition', label: 'Tuition' },
  { id: 'hostel', label: 'Hostel' },
  { id: 'travel', label: 'Travel' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'investment', label: 'Investment' },
  { id: 'unrestricted', label: 'Unrestricted' },
];

export const CATEGORIES = {
  income: { label: 'Income', kind: 'income', variable: false },
  parent_allowance: { label: 'Parent allowance', kind: 'income', variable: false },
  scholarship: { label: 'Scholarship', kind: 'income', variable: false },
  internship: { label: 'Internship income', kind: 'income', variable: false },
  refund: { label: 'Refund', kind: 'income', variable: false },
  food: { label: 'Food', kind: 'expense', variable: true, purpose: 'monthly_living' },
  food_delivery: { label: 'Food delivery', kind: 'expense', variable: true, parent: 'food', purpose: 'monthly_living' },
  coffee: { label: 'Coffee', kind: 'expense', variable: true, parent: 'food', purpose: 'monthly_living' },
  dining: { label: 'Dining', kind: 'expense', variable: true, parent: 'food', purpose: 'monthly_living' },
  groceries: { label: 'Groceries', kind: 'expense', variable: true, parent: 'food', purpose: 'monthly_living' },
  transport: { label: 'Transport', kind: 'expense', variable: true, purpose: 'monthly_living' },
  entertainment: { label: 'Entertainment', kind: 'expense', variable: true, purpose: 'unrestricted' },
  shopping: { label: 'Shopping', kind: 'expense', variable: true, purpose: 'unrestricted' },
  travel: { label: 'Travel', kind: 'expense', variable: true, purpose: 'travel' },
  college: { label: 'College', kind: 'expense', variable: true, purpose: 'tuition' },
  rent: { label: 'Rent', kind: 'expense', variable: false, purpose: 'hostel' },
  hostel: { label: 'Hostel', kind: 'expense', variable: false, purpose: 'hostel' },
  tuition: { label: 'Tuition', kind: 'expense', variable: false, purpose: 'tuition' },
  emi: { label: 'EMI', kind: 'expense', variable: false },
  insurance: { label: 'Insurance', kind: 'expense', variable: false },
  subscription: { label: 'Subscription', kind: 'expense', variable: false, purpose: 'unrestricted' },
  sip: { label: 'SIP', kind: 'expense', variable: false, purpose: 'investment' },
  credit_card_bill: { label: 'Credit card bill', kind: 'expense', variable: false },
  health: { label: 'Health', kind: 'expense', variable: true, purpose: 'emergency' },
  cash: { label: 'Cash spend', kind: 'expense', variable: true, purpose: 'monthly_living' },
  peer: { label: 'Peer transaction', kind: 'peer', variable: false },
  internal_transfer: { label: 'Internal transfer', kind: 'transfer', variable: false },
  other: { label: 'Other', kind: 'expense', variable: true },
};

export const FOOD_GROUP = ['food', 'food_delivery', 'coffee', 'dining', 'groceries'];
export const DISCRETIONARY = ['food_delivery', 'coffee', 'entertainment', 'shopping', 'dining'];
export const FIXED_TYPES = ['rent', 'hostel', 'tuition', 'emi', 'insurance', 'subscription', 'sip', 'credit_card_bill', 'recurring_transfer'];
export const VARIABLE_TYPES = ['food', 'transport', 'entertainment', 'shopping', 'travel'];

export const PEER_MEANINGS = [
  { id: 'dinner_split', label: 'Dinner split' },
  { id: 'loan_repayment', label: 'Loan repayment' },
  { id: 'money_transfer', label: 'Money transfer' },
  { id: 'gift', label: 'Gift' },
  { id: 'rent_contribution', label: 'Rent contribution' },
  { id: 'trip_expense', label: 'Trip expense' },
];

/** Roll a category up to its top-level spending group for summaries. */
export function topCategory(cat) {
  const c = CATEGORIES[cat];
  if (!c) return 'other';
  return c.parent || cat;
}

export function categoryLabel(cat) {
  return CATEGORIES[cat]?.label || cat;
}

export function purposeLabel(id) {
  return PURPOSES.find((p) => p.id === id)?.label || id;
}

/** Micro-spending threshold. The source shows "under ₹200"; treated as a documented default. */
export const MICRO_THRESHOLD = 200;
