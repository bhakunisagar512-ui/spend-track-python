import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, Tooltip, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { expensesAPI } from '../api';
import { fmt } from '../utils/gemini';
import themeModule from '../tailwindTheme';
import useIsMobile from '../hooks/useIsMobile';

ChartJS.register(Tooltip, CategoryScale, LinearScale, BarElement);

const { appTheme: T } = themeModule;

const WINDOW = 10;

// Dates are handled as local "YYYY-MM-DD" keys; toISOString() would shift days in non-UTC timezones
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const clamp = (k, min, max) => (k < min ? min : k > max ? max : k);
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return toKey(new Date(y, mo, 0)); };
const shortDate = (k, withYear) => fromKey(k).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(withYear && { year: 'numeric' }) });

// Which 10-day starting points are allowed: inside the selected month, never running past today
function windowBounds(monthFilter, months) {
  const today = toKey(new Date());
  const latestStart = addDays(today, -(WINDOW - 1));
  if (monthFilter) {
    const min = `${monthFilter}-01`;
    const lastFull = addDays(monthEnd(monthFilter), -(WINDOW - 1));
    return { min, max: [lastFull, latestStart > min ? latestStart : min].sort()[0] };
  }
  const earliest = months?.length ? `${[...months].sort()[0]}-01` : latestStart;
  return { min: earliest < latestStart ? earliest : latestStart, max: latestStart };
}

const btn = (disabled) => ({
  background: 'transparent', border: 'none', color: disabled ? T.text3 : T.text2, cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1, width: 32, height: 32, fontSize: 16, lineHeight: 1, fontFamily: T.fonts.display,
});

export default function TrendChart({ monthFilter, months, refreshKey, cardStyle, titleStyle }) {
  const isMobile = useIsMobile();
  const bounds = useMemo(() => windowBounds(monthFilter, months), [monthFilter, months]);
  const defaultStart = useMemo(() => {
    const today = toKey(new Date());
    return clamp(addDays(today, -(WINDOW - 1)), bounds.min, bounds.max);
  }, [bounds]);

  const [start, setStart] = useState(null);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef(null);

  // Jump back to the latest window whenever the month filter changes
  useEffect(() => { setStart(null); }, [monthFilter]);

  const from = clamp(start || defaultStart, bounds.min, bounds.max);
  const to = addDays(from, WINDOW - 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    expensesAPI.getDaily({ from, to })
      .then(res => { if (!cancelled) setDaily(res.data.daily); })
      .catch(err => console.error('Trend fetch error:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, refreshKey]);

  const days = [...Array(WINDOW)].map((_, i) => addDays(from, i));
  const values = days.map(day => { const found = daily.find(d => d.day === day); return found ? parseFloat(found.total) : 0; });
  const windowTotal = values.reduce((s, v) => s + v, 0);
  const today = toKey(new Date());

  const canPrev = from > bounds.min;
  const canNext = from < bounds.max;
  const shift = (dir) => setStart(clamp(addDays(from, dir * WINDOW), bounds.min, bounds.max));

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };

  const data = {
    labels: days.map(d => shortDate(d)),
    datasets: [{
      label: 'Spent', borderRadius: 6, borderWidth: 1.5,
      data: values,
      backgroundColor: days.map(d => (d === today ? T.accent : `${T.accent}55`)),
      borderColor: T.accent,
    }],
  };

  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => shortDate(days[items[0].dataIndex], true), label: ctx => fmt(ctx.raw) } } },
    scales: {
      x: { ticks: { color: T.text3, font: { size: isMobile ? 9 : 10 }, maxRotation: 45 }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: T.text3, font: { size: 10 }, callback: v => fmt(v) }, grid: { color: `${T.border}44` } },
    },
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ ...titleStyle, marginBottom: 4 }}>10-Day Trend</div>
          <div style={{ fontSize: 12, color: T.text2 }}>
            <span style={{ fontFamily: T.fonts.mono, color: T.text }}>{fmt(windowTotal)}</span> spent in this period
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {from !== defaultStart && (
            <button onClick={() => setStart(null)}
              style={{ background: 'none', border: 'none', color: T.accent2, cursor: 'pointer', fontFamily: T.fonts.display, fontSize: 12, fontWeight: 600 }}>
              Latest
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 10, padding: 2 }}>
            <button onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous 10 days" title="Previous 10 days" style={btn(!canPrev)}>‹</button>
            <div style={{ position: 'relative' }}>
              <button onClick={openPicker} title="Pick a start date"
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, cursor: 'pointer', padding: '6px 12px', fontFamily: T.fonts.display, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.accent2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {shortDate(from)} – {shortDate(to, !isMobile)}
              </button>
              {/* Native picker, visually hidden under the pill; opened via showPicker() */}
              <input ref={pickerRef} type="date" value={from} min={bounds.min} max={bounds.max} aria-label="Trend start date"
                onChange={e => e.target.value && setStart(clamp(e.target.value, bounds.min, bounds.max))}
                style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 1, opacity: 0, pointerEvents: 'none', colorScheme: 'dark' }} />
            </div>
            <button onClick={() => shift(1)} disabled={!canNext} aria-label="Next 10 days" title="Next 10 days" style={btn(!canNext)}>›</button>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', height: 180, opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
