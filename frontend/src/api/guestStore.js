// In-browser data store for guest mode. Mirrors the response shape of the
// backend expenses/budgets endpoints so the UI can't tell the difference.
// Data lives in sessionStorage: it survives reloads while the session is
// active and is wiped on logout (or when the tab is closed).

const GUEST_FLAG = 'spendai_guest';
const DATA_KEY = 'spendai_guest_data';

export const GUEST_USER = { id: 'guest', name: 'Guest', email: 'Guest session', avatar_url: null, is_guest: true };

const store = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { sessionStorage.setItem(key, val); } catch {} },
  remove(key) { try { sessionStorage.removeItem(key); } catch {} },
};

export const isGuestSession = () => store.get(GUEST_FLAG) === '1';

const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `g-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const pad = (n) => String(n).padStart(2, '0');
const localMonth = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const localDay = (d) => `${localMonth(d)}-${pad(d.getDate())}`;

// Noon local time keeps the calendar day stable across timezones
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString(); };

const toTimestamp = (date) => {
  if (!date) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // A date-only entry for today keeps the current time so it sorts as newest
    return date === localDay(new Date()) ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
  }
  const d = new Date(date);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
};

const SEED_EXPENSES = [
  [0, 120, 'Morning chai and snacks', 'Food', '🍜'],
  [0, 240, 'Uber to office', 'Transport', '🚗'],
  [1, 450, 'Swiggy dinner', 'Food', '🍜'],
  [1, 299, 'Jio mobile recharge', 'Recharge', '📱'],
  [2, 1899, 'Amazon headphones', 'Shopping', '🛍️'],
  [3, 180, 'Metro card top-up', 'Transport', '🚗'],
  [3, 650, 'Weekly groceries', 'Grocerries', '🛒'],
  [4, 499, 'Netflix subscription', 'Entertainment', '🎬'],
  [5, 320, 'Lunch with team', 'Food', '🍜'],
  [6, 850, 'Pharmacy medicines', 'Health', '💊'],
  [7, 1200, 'Petrol', 'Transport', '🚗'],
  [8, 380, 'Movie tickets', 'Entertainment', '🎬'],
  [9, 2499, 'Myntra jeans', 'Shopping', '🛍️'],
  [11, 560, 'Zomato biryani', 'Food', '🍜'],
  [13, 999, 'Online course', 'Education', '📚'],
  [16, 150, 'Coffee', 'Food', '🍜'],
  [20, 720, 'Vegetables and fruits', 'Grocerries', '🛒'],
  [26, 1500, 'Gym membership', 'Health', '💊'],
  [33, 600, 'Airtel broadband bill', 'Recharge', '📱'],
  [38, 410, 'Dinner at restaurant', 'Food', '🍜'],
  [45, 3200, 'Train tickets', 'Transport', '🚗'],
];

const SEED_BUDGETS = [
  ['Food', 2500],
  ['Transport', 3000],
  ['Shopping', 4000],
  ['Entertainment', 800],
];

const buildSeed = () => {
  const now = new Date().toISOString();
  return {
    expenses: SEED_EXPENSES.map(([ago, amount, description, category, emoji]) => ({
      id: newId(), user_id: 'guest', amount, description, category, emoji, date: daysAgo(ago), created_at: now,
    })),
    budgets: SEED_BUDGETS.map(([category, amount]) => ({
      id: newId(), user_id: 'guest', category, amount, created_at: now, updated_at: now,
    })),
  };
};

const load = () => {
  try {
    const data = JSON.parse(store.get(DATA_KEY));
    if (data && Array.isArray(data.expenses) && Array.isArray(data.budgets)) return data;
  } catch {}
  const seed = buildSeed();
  save(seed);
  return seed;
};

const save = (data) => store.set(DATA_KEY, JSON.stringify(data));

export const startGuestSession = () => {
  store.set(GUEST_FLAG, '1');
  save(buildSeed());
};

export const clearGuestSession = () => {
  store.remove(GUEST_FLAG);
  store.remove(DATA_KEY);
};

// Wrap results like axios so callers can keep using `res.data`
const ok = (data) => Promise.resolve({ data });
const fail = (status, error) => Promise.reject({ response: { status, data: { error } } });

const byDateDesc = (a, b) => (new Date(b.date) - new Date(a.date)) || (new Date(b.created_at) - new Date(a.created_at));
const inMonth = (month) => (e) => !month || localMonth(new Date(e.date)) === month;

export const guestExpensesAPI = {
  getAll: ({ month, category, limit = 100, offset = 0 } = {}) => {
    const { expenses } = load();
    const rows = expenses
      .filter(inMonth(month))
      .filter(e => !category || e.category === category)
      .sort(byDateDesc)
      .slice(Number(offset), Number(offset) + Number(limit));
    return ok({ expenses: rows });
  },

  create: ({ amount, description, category, emoji, date } = {}) => {
    const amt = parseFloat(amount);
    if (!amount || !description) return fail(400, 'Amount and description are required');
    if (isNaN(amt) || amt <= 0) return fail(400, 'Amount must be a positive number');
    const data = load();
    const expense = {
      id: newId(), user_id: 'guest', amount: amt, description: String(description).trim(),
      category: category || 'Other', emoji: emoji || '📦', date: toTimestamp(date), created_at: new Date().toISOString(),
    };
    data.expenses.push(expense);
    save(data);
    return ok({ expense });
  },

  update: (id, { amount, description, category, emoji } = {}) => {
    const data = load();
    const expense = data.expenses.find(e => e.id === id);
    if (!expense) return fail(404, 'Expense not found');
    if (amount != null) expense.amount = parseFloat(amount);
    if (description != null) expense.description = description;
    if (category != null) expense.category = category;
    if (emoji != null) expense.emoji = emoji;
    save(data);
    return ok({ expense });
  },

  delete: (id) => {
    const data = load();
    const before = data.expenses.length;
    data.expenses = data.expenses.filter(e => e.id !== id);
    if (data.expenses.length === before) return fail(404, 'Expense not found');
    save(data);
    return ok({ message: 'Expense deleted' });
  },

  getStats: ({ month } = {}) => {
    const { expenses } = load();
    const filtered = expenses.filter(inMonth(month));

    const catMap = {};
    filtered.forEach(e => {
      const c = catMap[e.category] || (catMap[e.category] = { category: e.category, emoji: e.emoji, total: 0, count: 0 });
      c.total += Number(e.amount);
      c.count += 1;
    });

    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const dailyMap = {};
    expenses.filter(e => new Date(e.date) >= cutoff).forEach(e => {
      const day = localDay(new Date(e.date));
      dailyMap[day] = (dailyMap[day] || 0) + Number(e.amount);
    });

    const currentMonth = localMonth(new Date());
    return ok({
      total: filtered.reduce((s, e) => s + Number(e.amount), 0),
      count: filtered.length,
      byCategory: Object.values(catMap).sort((a, b) => b.total - a.total),
      daily: Object.keys(dailyMap).sort().map(day => ({ day, total: dailyMap[day] })),
      activeDays: new Set(filtered.map(e => localDay(new Date(e.date)))).size,
      thisMonth: expenses.filter(inMonth(currentMonth)).reduce((s, e) => s + Number(e.amount), 0),
      months: [...new Set(expenses.map(e => localMonth(new Date(e.date))))].sort().reverse(),
    });
  },
};

// Mirrors GET /expenses/stats/daily: totals per local day in [from, to]
guestExpensesAPI.getDaily = ({ from, to } = {}) => {
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  if (!isDay(from) || !isDay(to) || from > to) return fail(400, 'Valid from and to dates (YYYY-MM-DD) are required');
  const dailyMap = {};
  load().expenses.forEach(e => {
    const day = localDay(new Date(e.date));
    if (day >= from && day <= to) dailyMap[day] = (dailyMap[day] || 0) + Number(e.amount);
  });
  return ok({ daily: Object.keys(dailyMap).sort().map(day => ({ day, total: dailyMap[day] })) });
};

export const guestBudgetsAPI = {
  getAll: () => {
    const { budgets } = load();
    return ok({ budgets: [...budgets].sort((a, b) => a.category.localeCompare(b.category)) });
  },

  upsert: ({ category, amount } = {}) => {
    const amt = parseFloat(amount);
    if (!category || isNaN(amt) || amt <= 0) return fail(400, 'Valid category and amount required');
    const data = load();
    const now = new Date().toISOString();
    let budget = data.budgets.find(b => b.category === category);
    if (budget) { budget.amount = amt; budget.updated_at = now; }
    else { budget = { id: newId(), user_id: 'guest', category, amount: amt, created_at: now, updated_at: now }; data.budgets.push(budget); }
    save(data);
    return ok({ budget });
  },

  delete: (category) => {
    const data = load();
    data.budgets = data.budgets.filter(b => b.category !== category);
    save(data);
    return ok({ message: 'Budget removed' });
  },
};
