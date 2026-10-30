import { useEffect, useState } from 'react';

// Oct 30 2026 — a friendly first line on every page (rendered by AppHeader):
// "Good Morning, <name>" plus a water check every clock hour and a lunch
// check once between 12 and 3 pm. Each check goes away once answered, after
// a smile (Yes) or an angry face (No). Answers are remembered per user in
// this browser only — it's a nudge, not a record. Always one row: phones get
// the short question and the name truncates before anything wraps.

const QUESTIONS = {
  lunch: { icon: '🍱', text: 'Did you eat lunch?', short: 'Had lunch?', yes: 'Hope it was tasty!', no: 'Go eat lunch now!' },
  water: { icon: '💧', text: 'Did you drink water?', short: 'Had water?', yes: 'Great, keep it up!', no: 'Go drink water now!' },
};

const PERIOD_ICON = { Morning: '🌅', Afternoon: '☀️', Evening: '🌇' };

const hourKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}`;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const readKey = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeKey = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

// "Murugan.P" → "Murugan"; initials-first names like "S. Ramya" keep the
// full name.
const firstName = (name = '') => {
  const first = name.trim().split(/\s+/)[0].replace(/\.[A-Za-z]$/, '');
  return first.length > 2 ? first : name.trim();
};

export default function GreetingBar({ user }) {
  const [now, setNow] = useState(() => new Date());
  const [feedback, setFeedback] = useState(null);
  // Same answers as localStorage, for browsers where storage is blocked.
  const [answered, setAnswered] = useState({});

  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 30000);
    // Phones resume old pages — re-check the hour as soon as it's visible.
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (!user) return null;

  const h = now.getHours();
  const period = h < 12 ? 'Morning' : h < 15 ? 'Afternoon' : 'Evening';
  const uid = user.user_id || user.email || user.name;
  const due = [];
  if (h >= 12 && h < 15) due.push({ id: 'lunch', key: `mhu_lunch_${uid}`, value: dayKey(now) });
  due.push({ id: 'water', key: `mhu_water_${uid}`, value: hourKey(now) });
  const pending = due.find((q) => answered[q.key] !== q.value && readKey(q.key) !== q.value);
  const question = feedback || !pending ? null : { ...pending, ...QUESTIONS[pending.id] };

  const answer = (q, yes) => {
    writeKey(q.key, q.value);
    setAnswered((a) => ({ ...a, [q.key]: q.value }));
    setFeedback({ happy: yes, text: yes ? q.yes : q.no });
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-4 min-h-9" data-testid="greeting-bar">
      <span className="min-w-0 truncate text-[13px] sm:text-lg font-semibold text-gray-800 dark:text-gray-100">
        {/* Phones drop the icon while a question or reply shares the row, so the name fits. */}
        <span className={question || feedback ? 'hidden sm:inline' : ''}>{PERIOD_ICON[period]} </span>
        Good {period}, <span className="text-amber-600">{firstName(user.name)}</span>
      </span>
      {question && (
        <span
          className="inline-flex shrink-0 items-center gap-1 sm:gap-2 rounded-full border border-sky-200 bg-sky-50 py-0.5 sm:py-1 pl-2 sm:pl-3 pr-0.5 sm:pr-1 animate-in fade-in zoom-in-95 dark:border-sky-800 dark:bg-sky-950"
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
  );
}
