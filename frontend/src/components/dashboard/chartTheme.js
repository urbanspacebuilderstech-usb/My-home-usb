import { useEffect, useState } from 'react';

/**
 * Oct 6 2026 — chart colours for the Super Admin Dashboard.
 *
 * Every hex comes from the documented data-viz palette and was run through
 * its validator against this app's own card surfaces (white / dark card
 * #181a20):
 *   • income / expense / material = categorical slots 1-3 (blue, orange,
 *     aqua) — pass all-pairs CVD + normal-vision in both modes. Aqua sits
 *     under 3:1 on white, so the material chart always shows value labels
 *     and a "View data" table.
 *   • ordinal4 / ordinal3 = one-hue blue ramps for ordered stages (sales
 *     funnel, skill tiers, project lifecycle) — pass the ordinal checks.
 *     In dark mode the ramp flips so "more" stays the lighter end.
 * Text never takes a series colour; it uses the ink tokens below.
 */
export const CHART_THEME = {
  light: {
    surface: '#ffffff',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    hover: 'rgba(11, 11, 11, 0.04)',
    income: '#2a78d6',
    expense: '#eb6834',
    material: '#1baf7a',
    ordinal4: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'],
    ordinal3: ['#86b6ef', '#3987e5', '#1c5cab'],
    meterFill: '#2a78d6',
    meterTrack: '#cde2fb',
  },
  dark: {
    surface: '#181a20',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    hover: 'rgba(255, 255, 255, 0.06)',
    income: '#3987e5',
    expense: '#d95926',
    material: '#199e70',
    ordinal4: ['#184f95', '#256abf', '#3987e5', '#6da7ec'],
    ordinal3: ['#184f95', '#3987e5', '#86b6ef'],
    meterFill: '#3987e5',
    meterTrack: '#0d366b',
  },
};

// Follows the `dark` class the header's theme toggle puts on <html>.
export function useIsDark() {
  const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const [isDark, setIsDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export const useChartTheme = () => CHART_THEME[useIsDark() ? 'dark' : 'light'];

export const inr = (n) => `${Number(n) < 0 ? '-' : ''}₹${Math.abs(Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Indian short form for headline figures and axis ticks: ₹26.47 L, ₹34.4 Cr.
export const inrCompact = (n) => {
  const v = Number(n || 0);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = (x, d) => Number(x.toFixed(d)).toLocaleString('en-IN', { maximumFractionDigits: d });
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, 2)} L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3, 1)} K`;
  return `${sign}₹${Math.round(a)}`;
};
