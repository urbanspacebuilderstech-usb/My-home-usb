import { useEffect, useRef } from 'react';

/**
 * Auto-refresh hook - silently polls for data updates every `interval` ms.
 * Calls the provided refresh function in the background without showing loading spinners.
 * Pauses when the browser tab is hidden and resumes when visible.
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
      if (document.visibilityState === 'visible') {
        runRefresh();
      }
    };

    intervalRef.current = setInterval(tick, interval);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Immediately refresh when tab becomes visible again
        runRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [interval, enabled]);
}
