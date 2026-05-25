import { useEffect, useState, useCallback } from 'react';

/**
 * Minimal light/dark theme hook.
 *
 * Phase 1 rollout — only flips the `dark` class on <html>. Most pages still
 * render with their hard-coded light palette; this is a scaffolding pass so
 * the toggle works and shell chrome darkens. Subsequent phases will add
 * `dark:` variants per page.
 */
const STORAGE_KEY = 'usb_theme';

function readInitial() {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    // Fall back to system preference on first load.
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    /* localStorage may be blocked in private mode */
  }
  return 'light';
}

function applyClass(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = theme; // helps native form controls
}

export function useTheme() {
  const [theme, setThemeState] = useState(readInitial);

  // Sync to <html> + storage on every change
  useEffect(() => {
    applyClass(theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}

// Apply persisted theme on first JS load, before React paints.
// Importing this module in App.js is enough to fire this side-effect.
if (typeof document !== 'undefined') {
  applyClass(readInitial());
}
