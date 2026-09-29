import { useEffect, useRef } from 'react';

// Sep 29 2026 — Also pause while nobody is using the page. A tab left visible
// on an unattended screen kept polling every 15s all day, and with 29 pages
// polling one single-worker backend, that idle traffic is what made everyone
// else's requests wait seconds. After IDLE_AFTER_MS without input, ticks are
// skipped; the first input afterwards refreshes straight away, the same way
// returning to a hidden tab does. Shared by every hook instance on the page.
const IDLE_AFTER_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
let lastActivityAt = Date.now();
const resumeListeners = new Set();
const isIdle = () => Date.now() - lastActivityAt > IDLE_AFTER_MS;

if (typeof window !== 'undefined') {
  const onActivity = () => {
    const wasIdle = isIdle();
    lastActivityAt = Date.now();
    if (wasIdle) resumeListeners.forEach(fn => fn());
  };
  // Capture phase so scrolling inside panels and tables counts too.
  ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true, capture: true }));
}

/**
 * Auto-refresh hook - silently polls for data updates every `interval` ms.
 * Calls the provided refresh function in the background without showing loading spinners.
 * Pauses when the browser tab is hidden or the user has been idle for 2 minutes,
 * and refreshes immediately when they come back.
 * 
 * @param {Function} refreshFn - Function to call for data refresh (should accept `false` to skip loading)
 * @param {number} interval - Polling interval in milliseconds (default: 15000 = 15s)
 * @param {boolean} enabled - Whether auto-refresh is active (default: true)
 */
export function useAutoRefresh(refreshFn, interval = 15000, enabled = true) {
  const savedCallback = useRef(refreshFn);
  const intervalRef = useRef(null);
  // Aug 14 2026 — Guards against overlapping refresh cycles. Without this,
  // a tick that fires while the previous refreshFn call is still in flight
  // (e.g. a slow multi-request page under load) starts a second concurrent
  // call on top of the first, compounding backend load exactly when it's
  // already under pressure. Also closes the same race against the
  // visibilitychange handler below, which can otherwise fire its own call
  // while an interval-triggered one is still running.
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    savedCallback.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    if (!enabled) return;

    const runRefresh = async () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        await savedCallback.current(false);
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const tick = () => {
      if (document.visibilityState === 'visible' && !isIdle()) {
        runRefresh();
      }
    };

    intervalRef.current = setInterval(tick, interval);
    resumeListeners.add(runRefresh);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Immediately refresh when tab becomes visible again
        runRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalRef.current);
      resumeListeners.delete(runRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [interval, enabled]);
}
