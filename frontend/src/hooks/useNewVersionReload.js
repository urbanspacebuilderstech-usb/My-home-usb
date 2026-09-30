import { useEffect, useRef } from 'react';

// Sep 30 2026 — A deploy replaces the build, but a page that is already open
// (the phone app resumed from the background, a desk tab left open) keeps
// running the old code until it is fully reloaded, so a shipped fix still
// looked broken. This compares the main bundle the page is running with the
// one the latest build lists, whenever the page comes back into view and
// every few minutes, and moves onto the new build: straight away when nothing
// is in progress (no popup open, not typing), otherwise on the next page change.
const CHECK_EVERY_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000;
// The bundle last reloaded for. If the reload still came back on old code,
// don't try that same build again (no reload loop).
const TRIED_KEY = 'mhu_version_reload_for';

const runningBundle = () => {
  const s = document.querySelector('script[src*="/static/js/main."]');
  return s ? new URL(s.src, window.location.href).pathname : null;
};

async function latestBundle() {
  const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!res.ok) return null;
  const main = (await res.json())?.files?.['main.js'];
  if (!main) return null;
  // Mid-deploy the manifest can name a bundle that isn't copied yet.
  const head = await fetch(main, { method: 'HEAD', cache: 'no-store' });
  return head.ok ? main : null;
}

const reloadOnto = (bundle) => {
  try { sessionStorage.setItem(TRIED_KEY, bundle); } catch {}
  window.location.reload();
};

const isBusy = () => {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  const el = document.activeElement;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

export function useNewVersionReload(pathname) {
  const outdated = useRef(null); // the newer bundle, once seen
  const lastPath = useRef(pathname);

  useEffect(() => {
    const running = runningBundle();
    if (!running) return undefined; // dev server: no hashed bundle to compare
    let stopped = false;
    let lastCheck = 0;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      if (outdated.current) {
        if (!isBusy()) reloadOnto(outdated.current);
        return;
      }
      if (Date.now() - lastCheck < MIN_GAP_MS) return;
      lastCheck = Date.now();
      try {
        const latest = await latestBundle();
        if (stopped || !latest || latest === running) return;
        let tried = null;
        try { tried = sessionStorage.getItem(TRIED_KEY); } catch {}
        if (tried === latest) return;
        outdated.current = latest;
        if (!isBusy()) reloadOnto(latest);
      } catch {
        // Offline or mid-deploy: the next check tries again.
      }
    };

    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, []);

  // A page change already drops whatever the old page had open, so it is a
  // safe moment to load the new build (the URL has already moved on).
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (outdated.current) reloadOnto(outdated.current);
  }, [pathname]);
}
