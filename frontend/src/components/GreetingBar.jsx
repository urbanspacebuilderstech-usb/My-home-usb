import { useEffect, useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Oct 30 2026 — a friendly first line on every page (rendered by AppHeader):
// "Good Morning, <name>" plus a water check and, between 12 and 3 pm, a lunch
// check. Yes gets a smile and the question goes quiet (water for an hour,
// lunch for the rest of the day); No gets an angry face and the question
// comes back in REMIND_MS. Always one row: phones get the short question and
// the name truncates before anything wraps. Below it, HR's quote for today's
// day of the month (HR Portal → Quote).

const MINUTE = 60 * 1000;
const REMIND_MS = 15 * MINUTE;

// The 31 quotes, shared by every page's greeting. Fetched at most every
// QUOTES_TTL_MS; HR's Save pushes the new list straight in.
const QUOTES_TTL_MS = 10 * MINUTE;
const QUOTES_EVENT = 'mhu-daily-quotes';
let quotesCache = { at: 0, quotes: null };

export function setDailyQuotes(quotes) {
  quotesCache = { at: Date.now(), quotes };
  window.dispatchEvent(new Event(QUOTES_EVENT));
}

function loadDailyQuotes() {
  if (Date.now() - quotesCache.at < QUOTES_TTL_MS) return;
  quotesCache.at = Date.now(); // one request at a time across pages
  axios.get(`${API}/hr/daily-quotes`)
    .then((r) => setDailyQuotes(r.data?.quotes || []))
    .catch(() => { /* no quote line; retried after the TTL */ });
}

const QUESTIONS = {
  lunch: { icon: '🍱', text: 'Did you eat lunch?', short: 'Had lunch?', yes: 'Hope it was tasty!', no: 'Go eat lunch now!' },
  water: { icon: '💧', text: 'Did you drink water?', short: 'Had water?', yes: 'Great, keep it up!', no: 'Go drink water now!' },
};

// When to ask again after a Yes.
const nextAfterYes = {
  water: (now) => now.getTime() + 60 * MINUTE,
  lunch: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(),
};

const PERIOD_ICON = { Morning: '🌅', Afternoon: '☀️', Evening: '🌇' };

// Each question stores the time (ms) it may next be asked, per user. Kept in
// localStorage and a cookie, so a refresh never re-asks even where one of
// them isn't kept (the phone app keeps cookies — it signs in with them).
const readCookie = (k) => {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${k}=`));
  return hit ? hit.slice(k.length + 1) : null;
};
const readNext = (k) => {
  let local = null;
  try { local = localStorage.getItem(k); } catch { /* storage blocked */ }
  return Math.max(Number(local) || 0, Number(readCookie(k)) || 0);
};
const writeNext = (k, v) => {
  try { localStorage.setItem(k, String(v)); } catch { /* storage blocked */ }
  document.cookie = `${k}=${v}; max-age=${2 * 24 * 3600}; path=/; SameSite=Lax`;
};

// "Murugan.P" → "Murugan"; initials-first names like "S. Ramya" keep the
// full name.
const firstName = (name = '') => {
  const first = name.trim().split(/\s+/)[0].replace(/\.[A-Za-z]$/, '');
  return first.length > 2 ? first : name.trim();
};

export default function GreetingBar({ user }) {
  const [now, setNow] = useState(() => new Date());
  const [feedback, setFeedback] = useState(null);
  // Same times as the stored ones, in case both stores are blocked.
  const [answered, setAnswered] = useState({});
  const [quotes, setQuotes] = useState(quotesCache.quotes);
  const signedIn = !!user;

  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 30000);
    // Phones resume old pages — re-check as soon as it's visible.
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, []);

  useEffect(() => {
    const onQuotes = () => setQuotes(quotesCache.quotes);
    window.addEventListener(QUOTES_EVENT, onQuotes);
    return () => window.removeEventListener(QUOTES_EVENT, onQuotes);
  }, []);

  // Runs on every tick but only fetches once the cache is stale.
  useEffect(() => { if (signedIn) loadDailyQuotes(); }, [signedIn, now]);

  useEffect(() => {
    if (!feedback) return undefined;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (!user) return null;

  const h = now.getHours();
  const period = h < 12 ? 'Morning' : h < 15 ? 'Afternoon' : 'Evening';
  // Cookie-safe: user ids are letters, digits and _ ; emails get encoded.
  const uid = encodeURIComponent(user.user_id || user.email || user.name);
  const ids = h >= 12 && h < 15 ? ['lunch', 'water'] : ['water'];
  const pendingId = ids.find((id) => {
    const key = `mhu_${id}_${uid}`;
    return now.getTime() >= Math.max(readNext(key), answered[key] || 0);
  });
  const question = feedback || !pendingId ? null : { id: pendingId, key: `mhu_${pendingId}_${uid}`, ...QUESTIONS[pendingId] };
  // Quote N on day N; day 31 only exists in 31-day months.
  const quote = (quotes?.[now.getDate() - 1] || '').trim();

  const answer = (q, yes) => {
    const next = yes ? nextAfterYes[q.id](new Date()) : Date.now() + REMIND_MS;
    writeNext(q.key, next);
    setAnswered((a) => ({ ...a, [q.key]: next }));
    setFeedback({ happy: yes, text: yes ? q.yes : q.no });
  };

  return (
    <div data-testid="greeting">
      <div className="flex items-center gap-1.5 sm:gap-4 min-h-9" data-testid="greeting-bar">
        <span className="min-w-0 truncate text-[13px] sm:text-lg font-semibold text-gray-800 dark:text-gray-100">
          {/* Phones drop the icon while a question or reply shares the row, so the name fits. */}
          <span className={question || feedback ? 'hidden sm:inline' : ''}>{PERIOD_ICON[period]} </span>
          Good {period}, <span className="text-amber-600">{firstName(user.name)}</span>
        </span>
        {question && (
          <span
            className="inline-flex shrink-0 items-center gap-1 sm:gap-2 animate-in fade-in zoom-in-95"
            data-testid={`greeting-ask-${question.id}`}
          >
            <span className="text-[11px] sm:text-sm font-medium text-sky-800 whitespace-nowrap dark:text-sky-200">
              {question.icon} <span className="sm:hidden">{question.short}</span><span className="hidden sm:inline">{question.text}</span>
            </span>
            <button
              type="button"
              onClick={() => answer(question, true)}
              className="h-6 sm:h-7 rounded-full bg-emerald-600 px-2 sm:px-3 text-[11px] sm:text-xs font-semibold text-white hover:bg-emerald-700"
              data-testid="greeting-yes"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => answer(question, false)}
              className="h-6 sm:h-7 rounded-full border border-gray-300 bg-white px-2 sm:px-3 text-[11px] sm:text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              data-testid="greeting-no"
            >
              No
            </button>
          </span>
        )}
        {feedback && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap ${
              feedback.happy ? 'text-emerald-700 animate-in zoom-in-50 dark:text-emerald-400' : 'text-red-600 animate-shake dark:text-red-400'
            }`}
            data-testid="greeting-feedback"
          >
            <span className="text-xl sm:text-2xl leading-none">{feedback.happy ? '😊' : '😠'}</span>
            {feedback.text}
          </span>
        )}
      </div>
      {quote && (
        <p className="mt-0.5 text-xs sm:text-sm italic text-gray-500 dark:text-gray-400" data-testid="greeting-quote">
          “{quote}”
        </p>
      )}
    </div>
  );
}
