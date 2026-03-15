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

  useEffect(() => {
    savedCallback.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        savedCallback.current(false);
      }
    };

    intervalRef.current = setInterval(tick, interval);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Immediately refresh when tab becomes visible again
        savedCallback.current(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [interval, enabled]);
}
