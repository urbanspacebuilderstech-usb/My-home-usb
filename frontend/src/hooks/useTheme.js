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
    // No saved preference → DEFAULT to Light Mode. We deliberately ignore the
    // OS-level `prefers-color-scheme: dark` because most users open the CRM
    // during business hours and expect the familiar light palette on first
    // login. The header toggle still lets anyone switch + persist their pick.
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
    // Broadcast to other same-origin frames (e.g. Finance Board iframes)
    // so they re-paint without needing a reload.
    try { window.postMessage({ type: 'usb-theme-change', theme }, window.location.origin); } catch {}
  }, [theme]);

  // Listen for theme changes from other frames (parent OR sibling iframes).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        setThemeState(e.newValue);
      }
    };
    const onMessage = (e) => {
      // Only accept same-origin messages and our message type
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'usb-theme-change' && (e.data.theme === 'dark' || e.data.theme === 'light')) {
        setThemeState(e.data.theme);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
    };
  }, []);

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
