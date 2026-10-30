import { useEffect, useState } from 'react';

// Oct 30 2026 — a friendly line in the header: "Good Morning, <name>" plus a
// water check every clock hour and a lunch check once between 12 and 3 pm.
// Each check goes away once answered, after a smile (Yes) or an angry face
// (No). Answers are remembered per user in this browser only — it's a
// nudge, not a record.

const QUESTIONS = {
  lunch: { icon: '🍱', text: 'Did you eat lunch?', yes: 'Good! Hope it was tasty', no: 'Go eat your lunch now!' },
  water: { icon: '💧', text: 'Did you drink water?', yes: 'Great, keep it up!', no: 'Go drink water right now!' },
};

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

// Pass null to switch it off (no timer runs).
export function useHeaderGreeting(user) {
  const [now, setNow] = useState(() => new Date());
  const [feedback, setFeedback] = useState(null);
  // Same answers as localStorage, for browsers where storage is blocked.
  const [answered, setAnswered] = useState({});

  useEffect(() => {
    if (!user) return undefined;
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 30000);
    // Phones resume old pages — re-check the hour as soon as it's visible.
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [user]);

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

  return { period, name: firstName(user.name), question, feedback, answer };
}

const PERIOD_ICON = { Morning: '🌅', Afternoon: '☀️', Evening: '🌇' };

export default function HeaderGreeting({ period, name, question, feedback, answer }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0" data-testid="header-greeting">
      <span className="text-sm font-semibold text-gray-800 whitespace-nowrap dark:text-gray-100">
        {PERIOD_ICON[period]} Good {period}, <span className="text-amber-600">{name}</span>
      </span>
      {question && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 py-0.5 pl-2.5 pr-1 animate-in fade-in zoom-in-95 dark:border-sky-800 dark:bg-sky-950"
          data-testid={`greeting-ask-${question.id}`}
        >
          <span className="text-xs font-medium text-sky-800 whitespace-nowrap dark:text-sky-200">{question.icon} {question.text}</span>
          <button
            type="button"
            onClick={() => answer(question, true)}
            className="h-6 rounded-full bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
            data-testid="greeting-yes"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => answer(question, false)}
            className="h-6 rounded-full border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            data-testid="greeting-no"
          >
            No
          </button>
        </span>
      )}
      {feedback && (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${
            feedback.happy ? 'text-emerald-700 animate-in zoom-in-50 dark:text-emerald-400' : 'text-red-600 animate-shake dark:text-red-400'
          }`}
          data-testid="greeting-feedback"
        >
          <span className="text-xl leading-none">{feedback.happy ? '😊' : '😠'}</span>
          {feedback.text}
        </span>
      )}
    </div>
  );
}
