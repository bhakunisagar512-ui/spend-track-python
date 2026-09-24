import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { useAuth } from '../context/AuthContext';
import { expensesAPI, budgetsAPI } from '../api';
import TrendChart from '../components/TrendChart';
import useIsMobile from '../hooks/useIsMobile';
import { parseExpense, askGemini, CAT_COLORS, CAT_ICONS, fmt } from '../utils/gemini';
import themeModule from '../tailwindTheme';

ChartJS.register(ArcElement, Tooltip, Legend);

const { appTheme: T } = themeModule;

// ─── Gemini API key lives in .env, never in user state ───────────────────────
// In your .env file: REACT_APP_GEMINI_API_KEY=your_key_here
const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;

function StatCard({ label, value, sub, subColor, compact }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: compact ? '12px 14px' : '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: '1.2px', color: T.text3, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: compact ? 18 : 22, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: subColor || T.text2, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const currentMonthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function Dashboard() {
  const budgetCategories = ['Food', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Recharge', 'Education', 'Grocerries', 'Other'];
  const { user, isGuest, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(900);
  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState({ total: 0, count: 0, byCategory: [], daily: [] });
  const [budgets, setBudgets] = useState({});
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [monthFilter, setMonthFilter] = useState(currentMonthKey);
  const [askQ, setAskQ] = useState('');
  const [aiResp, setAiResp] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [budgetEdit, setBudgetEdit] = useState({});
  const [newBudgetCategory, setNewBudgetCategory] = useState('Food');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  // Month list comes from the server (unfiltered) so selecting a month doesn't hide the others
  // The current month is always selectable (it's the default) even before anything is logged in it
  const months = [...new Set([currentMonthKey(), ...(stats.months || expenses.map(e => e.date?.slice(0, 7)).filter(Boolean))])].sort().reverse();

  const fetchAll = useCallback(async () => {
    try {
      const [expRes, statsRes, budRes] = await Promise.all([
        expensesAPI.getAll(monthFilter ? { month: monthFilter } : {}),
        expensesAPI.getStats(monthFilter ? { month: monthFilter } : {}),
        budgetsAPI.getAll(),
      ]);
      setExpenses(expRes.data.expenses);
      setStats(statsRes.data);
      const budMap = {};
      budRes.data.budgets.forEach(b => { budMap[b.category] = parseFloat(b.amount); });
      setBudgets(budMap);
      setDataVersion(v => v + 1);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoadingData(false);
    }
  }, [monthFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Local (rule-based) parser — used for all known categories ───────────────
  // Falls back to a simple "amount + description" split; category defaults to 'Other'
  const parseLocal = (text) => {
    const trimmed = text.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (!match) return null;
    const [, amountStr, description] = match;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return null;

    // Simple keyword → category mapping (extend as needed)
    const lc = description.toLowerCase();
    let category = 'Other';
    if (/food|chai|coffee|lunch|dinner|breakfast|snack|restaurant|eat|meal|swiggy|zomato/.test(lc)) category = 'Food';
    else if (/uber|ola|bus|metro|auto|taxi|petrol|fuel|travel|train|flight/.test(lc)) category = 'Transport';
    else if (/amazon|flipkart|shop|cloth|dress|shirt|shoe|buy|order/.test(lc)) category = 'Shopping';
    else if (/doctor|medicine|hospital|pharmacy|health|clinic|med/.test(lc)) category = 'Health';
    else if (/netflix|movie|game|concert|entertain|show|ott|prime/.test(lc)) category = 'Entertainment';
    else if (/recharge|mobile|sim|internet|broadband|airtel|jio|vi/.test(lc)) category = 'Recharge';
    else if (/course|book|class|tuition|school|college|education|learn/.test(lc)) category = 'Education';
    else if (/grocer|vegetable|fruit|milk|sabzi|kirana|grocery/.test(lc)) category = 'Grocerries';

    return {
      amount,
      description,
      category,
      date: new Date().toISOString().slice(0, 10),
      emoji: CAT_ICONS[category] || '📦',
    };
  };

  // ─── Add expense: use Gemini ONLY when category resolves to 'Other' ──────────
  const addExpense = async () => {
    if (!input.trim() || parsing) return;
    setParsing(true);
    try {
      // Step 1: fast local parse
      let parsed = parseLocal(input);

      if (!parsed) {
        alert('Please enter like: "250 chai" or "500 uber"');
        return;
      }

      // Step 2: only call Gemini when local parser couldn't determine a specific category
      if (parsed.category === 'Other' && GEMINI_API_KEY) {
        const aiParsed = await parseExpense(input, GEMINI_API_KEY);
        if (aiParsed) parsed = aiParsed;         // use AI result if valid
        // if AI also returns null / fails, we keep the local parse (category = 'Other')
      }

      await expensesAPI.create(parsed);
      setInput('');
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add expense');
    } finally {
      setParsing(false);
    }
  };

  const deleteExpense = async (id) => {
    try {
      await expensesAPI.delete(id);
      fetchAll();
    } catch (err) {
      alert('Failed to delete expense');
    }
  };

  const saveBudget = async (cat) => {
    const val = parseFloat(budgetEdit[cat]);
    if (isNaN(val) || val <= 0) return;
    try {
      await budgetsAPI.upsert({ category: cat, amount: val });
      setBudgetEdit(p => ({ ...p, [cat]: '' }));
      fetchAll();
    } catch (err) {
      alert('Failed to save budget');
    }
  };

  const addBudget = async () => {
    const amount = parseFloat(newBudgetAmount);
    if (!newBudgetCategory || isNaN(amount) || amount <= 0 || budgetSaving) return;
    setBudgetSaving(true);
    try {
      await budgetsAPI.upsert({ category: newBudgetCategory, amount });
      setNewBudgetAmount('');
      const nextCategory = budgetCategories.find(cat => !budgets[cat] && cat !== newBudgetCategory) || newBudgetCategory;
      setNewBudgetCategory(nextCategory);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add budget');
    } finally {
      setBudgetSaving(false);
    }
  };

  // ─── "Ask AI" uses env key, not user key ─────────────────────────────────────
  const doAsk = async () => {
    if (!askQ.trim() || !GEMINI_API_KEY) return;
    setAiLoading(true); setAiResp('');
    const r = await askGemini(askQ, stats, budgets, GEMINI_API_KEY);
    setAiResp(r); setAiLoading(false); setAskQ('');
  };

  const topCat = stats.byCategory?.[0];
  const days = stats.activeDays ?? stats.daily?.length ?? 1;
  const avgPerDay = stats.total / Math.max(days, 1);
  const thisMonthTotal = stats.thisMonth ?? expenses.filter(e => e.date?.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, e) => s + parseFloat(e.amount), 0);

  const budgetAlerts = Object.entries(budgets).flatMap(([cat, bud]) => {
    const spent = stats.byCategory?.find(c => c.category === cat);
    const s = spent ? parseFloat(spent.total) : 0;
    const pct = s / bud * 100;
    if (pct >= 100) return [{ msg: `${cat} budget exceeded! ${fmt(s)} of ${fmt(bud)}`, type: 'danger' }];
    if (pct >= 80) return [{ msg: `${cat} at ${Math.round(pct)}% — ${fmt(bud - s)} left`, type: 'warn' }];
    return [];
  });

  const budgetCards = [
    ...budgetCategories.filter(cat => budgets[cat]),
    ...Object.keys(budgets).filter(cat => !budgetCategories.includes(cat)),
  ];

  const donutData = {
    labels: stats.byCategory?.map(c => c.category) || [],
    datasets: [{
      data: stats.byCategory?.map(c => parseFloat(c.total)) || [],
      backgroundColor: stats.byCategory?.map(c => CAT_COLORS[c.category] || T.accent) || [],
      borderWidth: 2, borderColor: T.card, hoverOffset: 5,
    }],
  };

  const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

  const s = {
    wrap: { background: T.bg, minHeight: '100vh', fontFamily: T.fonts.display, color: T.text, paddingBottom: 40 },
    topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: isMobile ? '14px 12px 12px' : '18px 20px 14px', borderBottom: `1px solid ${T.border}` },
    body: { padding: isMobile ? '0 12px' : '0 20px', maxWidth: 1100, margin: '0 auto' },
    card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: isMobile ? 14 : 20, marginBottom: isMobile ? 12 : 16 },
    panelTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: T.text3, textTransform: 'uppercase', marginBottom: 14 },
  };

  if (loadingData) return (
    <div style={{ ...s.wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: T.text2 }}>
      Loading your data...
    </div>
  );

  return (
    <div style={s.wrap}>
      {/* ── Top bar: removed "Set Key" / AI On button ── */}
      <div style={s.topbar}>
        <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
          spend &<span style={{ color: T.accent }}>Track</span>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 6 : 10, alignItems: 'center', minWidth: 0 }}>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            style={{ background: T.bg3, border: `1px solid ${T.border}`, color: T.text, padding: '6px 10px', borderRadius: 8, fontFamily: T.fonts.display, fontSize: 12, cursor: 'pointer', minWidth: 0 }}>
            <option value="">All time</option>
            {months.map(m => <option key={m} value={m}>{new Date(m + '-01T00:00:00').toLocaleString('default', { month: isMobile ? 'short' : 'long', year: 'numeric' })}</option>)}
          </select>
          {/* Settings button kept for other settings, not for Gemini key */}
          <button onClick={() => navigate('/settings')} aria-label="Settings" title="Settings"
            style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, padding: isMobile ? '6px 9px' : '6px 12px', cursor: 'pointer', fontFamily: T.fonts.display, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {isMobile ? '⚙' : '⚙ Settings'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />
              : <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.accent + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: T.accent }}>{user?.name?.charAt(0)}</div>
            }
            {!isMobile && <span style={{ fontSize: 13, color: T.text2 }}>{user?.name}</span>}
          </div>
        </div>
      </div>

      <div style={s.body}>
        {isGuest && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: `${T.accent}18`, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 13, color: T.accent2 }}>
            <span>You're in guest mode with sample data. Changes last for this session only and are wiped when you sign out.</span>
            <button onClick={() => { logout(); navigate('/login'); }}
              style={{ background: T.accent, border: 'none', borderRadius: 8, color: '#fff', padding: '6px 12px', cursor: 'pointer', fontFamily: T.fonts.display, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              Sign up / Sign in
            </button>
          </div>
        )}

        {budgetAlerts.length > 0 && (
          <div style={{ background: `${budgetAlerts[0].type === 'danger' ? T.danger : T.warn}18`, border: `1px solid ${budgetAlerts[0].type === 'danger' ? T.danger : T.warn}44`, borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 13, color: budgetAlerts[0].type === 'danger' ? T.danger : T.warn }}>
            {budgetAlerts.map(a => a.msg).join('  ·  ')}
          </div>
        )}

        {/* ── Log Expense ── */}
        <div style={{ marginTop: 16, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: isMobile ? 14 : 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: T.text3, textTransform: 'uppercase', marginBottom: 10 }}>Log Expense</div>
          <div style={{ display: 'flex', gap: isMobile ? 8 : 10 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExpense()} disabled={parsing}
              placeholder={isMobile ? 'e.g. "250 uber"' : 'e.g. "250 banana shake" or "500 uber"'}
              style={{ flex: 1, minWidth: 0, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 15px', color: T.text, fontFamily: T.fonts.mono, fontSize: 14, outline: 'none' }} />
            <button onClick={addExpense} disabled={parsing}
              style={{ background: T.accent, border: 'none', borderRadius: 10, padding: isMobile ? '0 14px' : '0 22px', color: '#fff', fontFamily: T.fonts.display, fontWeight: 700, fontSize: 14, cursor: parsing ? 'not-allowed' : 'pointer', opacity: parsing ? 0.5 : 1, height: 48, whiteSpace: 'nowrap' }}>
              {parsing ? 'Parsing...' : '+ Add'}
            </button>
          </div>
          {/* Status line: shows AI active only when env key is set */}
          <div style={{ fontSize: 11, color: GEMINI_API_KEY ? T.accent2 : T.text3, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GEMINI_API_KEY ? T.accent2 : T.text3, display: 'inline-block' }} />
            {GEMINI_API_KEY
              ? 'AI assist active — for uncategorised expenses'
              : 'Category parsing tool active'}
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isTablet ? 2 : 4}, minmax(0,1fr))`, gap: 10, marginTop: 16 }}>
          <StatCard compact={isMobile} label="Total Spent" value={fmt(stats.total)} sub={`${stats.count} expenses`} />
          <StatCard compact={isMobile} label="This Month" value={fmt(thisMonthTotal)} sub={new Date().toLocaleString('default', { month: 'long' })} />
          <StatCard compact={isMobile} label="Top Category" value={topCat?.category || '—'} sub={topCat ? fmt(parseFloat(topCat.total)) : '—'} subColor={topCat ? CAT_COLORS[topCat.category] : T.text2} />
          <StatCard compact={isMobile} label="Avg / Day" value={fmt(avgPerDay)} sub="daily average" />
        </div>

        {/* ── Charts + Recent ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'minmax(0,1fr)' : 'minmax(0,1fr) 320px', gap: isMobile ? 0 : 14, marginTop: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={s.card}>
              <div style={s.panelTitle}>Category Breakdown</div>
              <div style={{ position: 'relative', height: isMobile ? 180 : 210 }}>
                {stats.byCategory?.length > 0
                  ? <Doughnut data={donutData} options={{ ...chartOpts, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.raw)}` } } } }} />
                  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.text3, fontSize: 13 }}>No data yet</div>
                }
              </div>
              {stats.byCategory?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14 }}>
                  {stats.byCategory.map(c => (
                    <span key={c.category} style={{ fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[c.category] || T.accent }} />
                      {c.category} {fmt(parseFloat(c.total))}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <TrendChart monthFilter={monthFilter} months={months} refreshKey={dataVersion} cardStyle={s.card} titleStyle={s.panelTitle} />
          </div>

          <div>
            <div style={{ ...s.card, maxHeight: 330, overflow: 'hidden', minWidth: 0 }}>
              <div style={s.panelTitle}>Recent Expenses</div>
              <div style={{ overflowY: 'auto', maxHeight: 260 }}>
                {expenses.length === 0
                  ? <div style={{ textAlign: 'center', padding: '30px 0', color: T.text3, fontSize: 13 }}>No expenses yet</div>
                  : expenses.slice(0, 30).map(exp => (
                    <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: (CAT_COLORS[exp.category] || T.accent) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                        {exp.emoji || CAT_ICONS[exp.category] || '📦'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.text }}>{exp.description}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{exp.category} · {new Date(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.fonts.mono, color: T.danger, flexShrink: 0 }}>-{fmt(parseFloat(exp.amount))}</div>
                      <button onClick={() => deleteExpense(exp.id)} aria-label="Delete expense" style={{ background: 'none', border: 'none', color: T.text3, cursor: 'pointer', fontSize: 12, padding: isMobile ? '6px' : '0 2px', opacity: 0.6 }}>✕</button>
                    </div>
                  ))
                }
              </div>
            </div>

            <div style={s.card}>
              <div style={s.panelTitle}>Category Stats</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stats.byCategory?.length === 0
                  ? <div style={{ color: T.text3, fontSize: 13 }}>No data yet</div>
                  : stats.byCategory?.map(c => {
                    const pct = stats.total ? parseFloat(c.total) / stats.total * 100 : 0;
                    return (
                      <div key={c.category}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: T.text2 }}>{CAT_ICONS[c.category] || '📦'} {c.category}</span>
                          <span style={{ fontFamily: T.fonts.mono, color: T.text2 }}>{fmt(parseFloat(c.total))} · {pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 4, background: T.bg3, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: CAT_COLORS[c.category] || T.accent, borderRadius: 3, transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── Budget Limits ── */}
        <div style={{ ...s.card, marginTop: 0 }}>
          <div style={s.panelTitle}>Budget Limits</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1.2fr) minmax(0, 1fr) auto', gap: 10, marginBottom: 14 }}>
            <select
              value={newBudgetCategory}
              onChange={e => setNewBudgetCategory(e.target.value)}
              style={{ background: T.bg3, border: `1px solid ${T.border}`, color: T.text, padding: '10px 12px', borderRadius: 9, fontFamily: T.fonts.display, fontSize: 13, cursor: 'pointer', minWidth: 0 }}
            >
              {budgetCategories.map(cat => (
                <option key={cat} value={cat}>{CAT_ICONS[cat] || '📦'} {cat}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Budget limit"
              value={newBudgetAmount}
              onChange={e => setNewBudgetAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBudget()}
              style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 9, padding: '10px 12px', color: T.text, fontFamily: T.fonts.mono, fontSize: 13, outline: 'none', minWidth: 0 }}
            />
            <button
              onClick={addBudget}
              disabled={budgetSaving}
              style={{ background: T.accent, border: 'none', borderRadius: 9, padding: isMobile ? '11px 16px' : '0 16px', color: '#fff', fontFamily: T.fonts.display, fontWeight: 700, fontSize: 12, cursor: budgetSaving ? 'not-allowed' : 'pointer', opacity: budgetSaving ? 0.6 : 1, whiteSpace: 'nowrap', gridColumn: isMobile ? '1 / -1' : 'auto' }}
            >
              {budgetSaving ? 'Adding...' : '+ Add Budget'}
            </button>
          </div>
          {budgetCards.length === 0 && (
            <div style={{ marginBottom: 14, padding: '12px 14px', background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, color: T.text2 }}>
              No budgets added yet. Create one above and it will appear here with its limit.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 1 : isTablet ? 2 : 3}, minmax(0,1fr))`, gap: 10 }}>
            {budgetCards.map(cat => {
              const catStat = stats.byCategory?.find(c => c.category === cat);
              const spent = catStat ? parseFloat(catStat.total) : 0;
              const budget = budgets[cat] || 0;
              const pct = budget ? Math.min(spent / budget * 100, 100) : 0;
              const color = pct >= 100 ? T.danger : pct >= 80 ? T.warn : T.accent2;
              return (
                <div key={cat} style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{CAT_ICONS[cat]} {cat}</span>
                    {budget > 0 && <span style={{ fontSize: 11, fontFamily: T.fonts.mono, color }}>{Math.round(pct)}%</span>}
                  </div>
                  {budget > 0 && (
                    <div style={{ height: 4, background: T.bg2, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>{budget > 0 ? `${fmt(spent)} / ${fmt(budget)}` : 'No limit set'}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" placeholder="₹ limit" value={budgetEdit[cat] || ''}
                      onChange={e => setBudgetEdit(p => ({ ...p, [cat]: e.target.value }))}
                      style={{ flex: 1, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 7, padding: isMobile ? '8px 10px' : '5px 8px', color: T.text, fontFamily: T.fonts.mono, fontSize: 12, outline: 'none', minWidth: 0 }} />
                    <button onClick={() => saveBudget(cat)}
                      style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 7, padding: isMobile ? '8px 14px' : '5px 10px', color: T.text2, cursor: 'pointer', fontSize: 11, fontFamily: T.fonts.display }}>
                      Set
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Ask AI ── */}
        <div style={{ ...s.card, marginTop: 0 }}>
          <div style={s.panelTitle}>Ask AI About Your Spending</div>
          {!GEMINI_API_KEY && (
            <div style={{ fontSize: 12, color: T.warn, marginBottom: 12, padding: '8px 12px', background: `${T.warn}12`, borderRadius: 8, border: `1px solid ${T.warn}33` }}>
              Gemini API key not configured. Add <code>REACT_APP_GEMINI_API_KEY</code> to your <code>.env</code> file.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 12 }}>
            <input value={askQ} onChange={e => setAskQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doAsk()} disabled={aiLoading}
              placeholder={isMobile ? 'Where am I overspending?' : 'Ask: Where am I overspending? How can I save more?'}
              style={{ flex: 1, minWidth: 0, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', color: T.text, fontFamily: T.fonts.display, fontSize: 13, outline: 'none' }} />
            <button onClick={doAsk} disabled={aiLoading || !GEMINI_API_KEY}
              style={{ background: T.bg3, border: `1px solid ${T.accent}`, color: T.accent, borderRadius: 10, padding: '12px 18px', fontFamily: T.fonts.display, fontSize: 13, fontWeight: 700, cursor: (!GEMINI_API_KEY || aiLoading) ? 'not-allowed' : 'pointer', opacity: (!GEMINI_API_KEY || aiLoading) ? 0.4 : 1, whiteSpace: 'nowrap' }}>
              {aiLoading ? 'Thinking...' : 'Ask AI'}
            </button>
          </div>
          {aiResp && (
            <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.7, padding: '12px 14px', background: T.bg3, borderRadius: 10, borderLeft: `3px solid ${T.accent}` }}>
              {aiResp}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}