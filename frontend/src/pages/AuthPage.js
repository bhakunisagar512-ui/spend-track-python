import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleButton from '../components/GoogleButton';
import { CAT_COLORS } from '../utils/gemini';

const GOOGLE_ENABLED = !!process.env.REACT_APP_GOOGLE_CLIENT_ID;

const FEATURES = [
  { icon: '⚡', title: 'Log in seconds', text: 'Type "250 chai" — amount and category are picked up for you.' },
  { icon: '🎯', title: 'Stay on budget', text: 'Set limits per category and get warned before you overshoot.' },
  { icon: '✨', title: 'Ask AI', text: 'Get plain-language answers about where your money goes.' },
];

const PREVIEW_BARS = [38, 62, 45, 80, 52, 70, 95, 58, 66, 48];
const PREVIEW_CATS = [['Food', '₹4,210'], ['Transport', '₹2,840'], ['Shopping', '₹1,899']];

function Logo({ size = 'text-2xl' }) {
  return (
    <div className={`${size} font-bold tracking-tight text-app-text`}>
      spend<span className="text-app-accent">&amp;Track</span>
    </div>
  );
}

// Static mock of the dashboard so first-time visitors see what they get.
// Tagged "Sample data" so nobody mistakes the figures for real results.
function DashboardPreview() {
  const peak = Math.max(...PREVIEW_BARS);
  return (
    <div className="rounded-card border border-app-border bg-app-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-app-text3">This month · <span className="text-app-text2">▼ 8% vs last</span></div>
        <span className="rounded-full border border-app-border px-2 py-0.5 text-[10px] font-semibold text-app-text3">Sample data</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-medium text-app-text">₹12,480</span>
        <span className="text-sm text-app-accent2">tracked</span>
      </div>
      <div className="mt-5 flex h-16 items-end gap-1.5">
        {PREVIEW_BARS.map((h, i) => (
          <div key={i}
            className={`flex-1 rounded-t-[4px] ${h === peak ? 'bg-app-accent shadow-[0_0_16px_rgba(47,143,107,0.45)]' : 'bg-app-accent/30'}`}
            style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-4 space-y-2 border-t border-app-border pt-4">
        {PREVIEW_CATS.map(([cat, amt]) => (
          <div key={cat} className="flex items-center gap-2.5 text-[13px]">
            <span className="h-2 w-2 rounded-full" style={{ background: CAT_COLORS[cat] }} />
            <span className="flex-1 text-app-text2">{cat}</span>
            <span className="font-mono text-app-text">{amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, id, children }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-app-text2">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-[10px] border border-app-border bg-app-bg3 px-3.5 py-3 text-sm text-app-text outline-none transition-colors focus:border-app-accent';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, googleTokenLogin, startGuest } = useAuth();
  const navigate = useNavigate();

  const isLogin = mode === 'login';

  const switchMode = (m) => { setMode(m); setError(''); };
  const update = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (accessToken) => {
    setError(''); setLoading(true);
    try {
      await googleTokenLogin(accessToken);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    setError('');
    startGuest();
    navigate('/');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app-bg px-4 py-8 font-display text-app-text sm:px-6">
      {/* Soft mint glow behind the card for depth */}
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[28rem] w-[28rem] rounded-full bg-app-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-app-accent/10 blur-3xl" />

      <div className="relative w-full max-w-[1040px] overflow-hidden rounded-panel border border-app-border bg-app-bg shadow-soft lg:grid lg:grid-cols-2">
        {/* ── Brand panel (wide screens only) ── */}
        <aside className="hidden border-r border-app-border bg-app-bg2 p-10 lg:block xl:p-11">
          <Logo size="text-base" />
          <h1 className="mt-8 text-[40px] font-bold leading-[1.1] tracking-tight">
            Know where every <span className="text-app-accent">rupee</span> goes.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-app-text2">
            Track spending, set budgets and get AI insights — without spreadsheets.
          </p>
          <div className="mt-8"><DashboardPreview /></div>
          <ul className="mt-7 space-y-4">
            {FEATURES.map(f => (
              <li key={f.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-bg3 text-[13px]">{f.icon}</span>
                <p className="text-[13px] leading-relaxed text-app-text2">
                  <span className="font-semibold text-app-text">{f.title}.</span> {f.text}
                </p>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Auth form ── */}
        <main className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-[340px]">
            <div className="mb-8 text-center lg:hidden">
              <Logo size="text-3xl" />
              <p className="mt-2 text-sm text-app-text2">Your AI-powered finance assistant</p>
            </div>

            <h2 className="text-2xl font-bold tracking-tight">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
            <p className="mt-1 text-sm text-app-text2">
              {isLogin ? 'Sign in to pick up where you left off.' : 'Start tracking your spending in under a minute.'}
            </p>

            {error && (
              <div role="alert" className="mt-5 rounded-lg border border-app-danger/40 bg-app-danger/10 px-3.5 py-2.5 text-[13px] text-app-danger">
                {error}
              </div>
            )}

            {GOOGLE_ENABLED && (
              <>
                <div className="mt-6">
                  <GoogleButton
                    label={isLogin ? 'Continue with Google' : 'Sign up with Google'}
                    disabled={loading}
                    onToken={handleGoogle}
                    onError={setError}
                  />
                </div>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-app-border" />
                  <span className="text-xs text-app-text3">or with email</span>
                  <div className="h-px flex-1 bg-app-border" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className={GOOGLE_ENABLED ? '' : 'mt-6'}>
              {!isLogin && (
                <Field label="Full name" id="name">
                  <input id="name" className={inputCls} placeholder="Jane Doe" autoComplete="name"
                    value={form.name} onChange={update('name')} required />
                </Field>
              )}
              <Field label="Email" id="email">
                <input id="email" type="email" className={inputCls} placeholder="you@example.com" autoComplete="email"
                  value={form.email} onChange={update('email')} required />
              </Field>
              <Field label="Password" id="password">
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} className={`${inputCls} pr-16`}
                    placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    minLength={isLogin ? undefined : 6}
                    value={form.password} onChange={update('password')} required />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 px-3.5 text-xs font-semibold text-app-text3 hover:text-app-text2">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>

              <button type="submit" disabled={loading}
                className="mt-2 w-full rounded-[10px] bg-app-accent py-3 text-[15px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-app-text2">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button type="button" onClick={() => switchMode(isLogin ? 'register' : 'login')}
                className="font-semibold text-app-accent2 hover:underline">
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>

            {/* ── Guest mode ── */}
            <button type="button" onClick={handleGuest} disabled={loading}
              className="mt-7 flex w-full items-start gap-3 rounded-card border border-app-border bg-app-bg2 p-4 text-left transition hover:border-app-accent/60 hover:bg-app-bg3 disabled:cursor-not-allowed disabled:opacity-60">
              <span className="text-lg leading-5">👀</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-app-text">Just looking? Try guest mode</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-app-text3">
                  Explore with sample data, no account needed. Everything is wiped when you sign out.
                </span>
              </span>
            </button>

            <p className="mt-6 text-center text-xs text-app-text3">© {new Date().getFullYear()} spend&amp;Track</p>
          </div>
        </main>
      </div>
    </div>
  );
}
