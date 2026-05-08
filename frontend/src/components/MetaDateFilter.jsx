import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { Button } from './ui/button';

// Meta Ads-style date filter — preset chips + custom range picker.
// Returns {from, to, label} via onChange. Both ISO strings (YYYY-MM-DD).
const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'last7',      label: 'Last 7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom',     label: 'Custom range' },
];

function isoDay(d) { return d.toISOString().slice(0, 10); }

export function rangeForPreset(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  switch (key) {
    case 'today':      return { from: isoDay(today), to: isoDay(today), label: 'Today' };
    case 'yesterday':  return { from: isoDay(yesterday), to: isoDay(yesterday), label: 'Yesterday' };
    case 'last7': {
      const start = new Date(today); start.setDate(today.getDate() - 6);
      return { from: isoDay(start), to: isoDay(today), label: 'Last 7 days' };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: isoDay(start), to: isoDay(today), label: 'This month' };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: isoDay(start), to: isoDay(end), label: 'Last month' };
    }
    default: return null;
  }
}

export default function MetaDateFilter({ value, onChange, defaultPreset = 'last_month' }) {
  // value: {from, to, label, preset?}
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState(value?.preset || defaultPreset);
  const [customFrom, setCustomFrom] = useState(value?.from || '');
  const [customTo, setCustomTo] = useState(value?.to || '');
  const ref = useRef(null);

  useEffect(() => {
    if (!value) {
      const r = rangeForPreset(defaultPreset);
      if (r) onChange?.({ ...r, preset: defaultPreset });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const apply = (key) => {
    if (key === 'custom') {
      if (!customFrom || !customTo) return;
      onChange?.({ from: customFrom, to: customTo, label: `${customFrom} → ${customTo}`, preset: 'custom' });
    } else {
      const r = rangeForPreset(key);
      if (r) onChange?.({ ...r, preset: key });
    }
    setPreset(key);
    setOpen(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange?.(null);
    setPreset(null);
    setCustomFrom(''); setCustomTo('');
  };

  const display = value?.label || (preset && PRESETS.find(p => p.key === preset)?.label) || 'All time';

  return (
    <div className="relative inline-block" ref={ref} data-testid="meta-date-filter">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all min-h-[34px]"
        data-testid="meta-date-trigger"
      >
        <Calendar className="h-3.5 w-3.5 text-gray-500" />
        <span className="text-gray-700">{display}</span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            className="ml-1 hover:bg-gray-200 rounded p-0.5"
            data-testid="meta-date-clear"
          >
            <X className="h-3 w-3 text-gray-500" />
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 z-50 w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg p-2" data-testid="meta-date-panel">
          <div className="grid grid-cols-2 gap-1 mb-2">
            {PRESETS.filter(p => p.key !== 'custom').map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => apply(p.key)}
                className={`px-2 py-1.5 text-xs rounded text-left transition-colors ${
                  preset === p.key
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'hover:bg-amber-50 text-gray-700'
                }`}
                data-testid={`meta-date-preset-${p.key}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t pt-2">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Custom range</p>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-1 text-xs border rounded"
                data-testid="meta-date-custom-from"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-1 text-xs border rounded"
                data-testid="meta-date-custom-to"
              />
            </div>
            <Button
              size="sm"
              className="w-full h-7 mt-2 text-xs bg-amber-600 hover:bg-amber-700"
              onClick={() => apply('custom')}
              disabled={!customFrom || !customTo}
              data-testid="meta-date-custom-apply"
            >
              Apply custom range
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
