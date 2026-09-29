import { useEffect, useState } from 'react';

// Sep 29 2026 — true below Tailwind's `md` breakpoint (768px). For pages that
// build a different layout on phones (cards instead of a wide table) rather
// than hiding one with CSS, so only one of the two is ever rendered.
const QUERY = '(max-width: 767px)';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    // Safari < 14 only has the old addListener API.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    setIsMobile(mql.matches);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return isMobile;
}
