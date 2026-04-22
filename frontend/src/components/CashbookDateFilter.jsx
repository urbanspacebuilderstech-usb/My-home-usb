import React from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { DayPicker } from 'react-day-picker';
import { Calendar, X } from 'lucide-react';

const MONTHS = [
  { v: 1, n: 'Jan' }, { v: 2, n: 'Feb' }, { v: 3, n: 'Mar' }, { v: 4, n: 'Apr' },
  { v: 5, n: 'May' }, { v: 6, n: 'Jun' }, { v: 7, n: 'Jul' }, { v: 8, n: 'Aug' },
  { v: 9, n: 'Sep' }, { v: 10, n: 'Oct' }, { v: 11, n: 'Nov' }, { v: 12, n: 'Dec' },
];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function monthBoundsISO(year, month) {
  // month is 1-12
  const from = toISO(new Date(year, month - 1, 1));
  const to = toISO(new Date(year, month, 0));
  return { from, to };
}

/**
 * Unified filter: date range (day-level) + Month + Year dropdowns
 *
 * Props:
 *   dateFrom, dateTo (ISO YYYY-MM-DD strings, may be empty)
 *   setDateFrom, setDateTo
 *   testIdPrefix (string, default 'cashbook')
 *   accent (tailwind color name like 'amber', 'green', 'red') — default 'amber'
 */
export function CashbookDateFilter({
  dateFrom, dateTo, setDateFrom, setDateTo,
  testIdPrefix = 'cashbook',
  accent = 'amber',
}) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // Is the current from/to exactly a full-month range?
  const deduceMonthYear = () => {
    if (!dateFrom || !dateTo) return { month: 0, year: 0 };
    const f = new Date(dateFrom + 'T00:00:00');
    const t = new Date(dateTo + 'T00:00:00');
    const lastDay = new Date(f.getFullYear(), f.getMonth() + 1, 0);
    if (
      f.getDate() === 1 &&
      f.getFullYear() === t.getFullYear() &&
      f.getMonth() === t.getMonth() &&
      t.getDate() === lastDay.getDate()
    ) {
      return { month: f.getMonth() + 1, year: f.getFullYear() };
    }
    return { month: 0, year: 0 };
  };

  const { month: detectedMonth, year: detectedYear } = deduceMonthYear();
  const selectedMonth = detectedMonth || 0; // 0 = custom / all
  const selectedYear = detectedYear || (dateFrom ? new Date(dateFrom + 'T00:00:00').getFullYear() : 0);

  const yearsList = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const applyMonthYear = (month, year) => {
    if (!month) {
      // "All Months" selected → use Jan 1 to Dec 31 for that year
      setDateFrom(toISO(new Date(year, 0, 1)));
      setDateTo(toISO(new Date(year, 11, 31)));
      return;
    }
    const { from, to } = monthBoundsISO(year, month);
    setDateFrom(from);
    setDateTo(to);
  };

  const handleMonthChange = (v) => {
    const m = parseInt(v, 10);
    const y = selectedYear || currentYear;
    applyMonthYear(m, y);
  };

  const handleYearChange = (v) => {
    const y = parseInt(v, 10);
    const m = selectedMonth || currentMonth;
    applyMonthYear(m, y);
  };

  const clearAll = () => { setDateFrom(''); setDateTo(''); };

  const rangeLabel = () => {
    if (!dateFrom) return 'Select Date';
    const f = new Date(dateFrom + 'T00:00:00');
    if (!dateTo || dateFrom === dateTo) {
      return f.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    const t = new Date(dateTo + 'T00:00:00');
    return `${f.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  };

  const isActive = !!(dateFrom || dateTo);
  const accentMap = {
    amber: { trigger: 'bg-amber-50 border-amber-400 text-amber-700', day: 'hover:bg-amber-50', sel: 'bg-amber-600 text-white hover:bg-amber-700', today: 'text-amber-600', mid: 'bg-amber-50 text-amber-700', presetHover: 'hover:bg-amber-50 hover:text-amber-700' },
    green: { trigger: 'bg-green-50 border-green-400 text-green-700', day: 'hover:bg-green-50', sel: 'bg-green-600 text-white hover:bg-green-700', today: 'text-green-600', mid: 'bg-green-50 text-green-700', presetHover: 'hover:bg-green-50 hover:text-green-700' },
    red: { trigger: 'bg-red-50 border-red-400 text-red-700', day: 'hover:bg-red-50', sel: 'bg-red-600 text-white hover:bg-red-700', today: 'text-red-600', mid: 'bg-red-50 text-red-700', presetHover: 'hover:bg-red-50 hover:text-red-700' },
    blue: { trigger: 'bg-blue-50 border-blue-400 text-blue-700', day: 'hover:bg-blue-50', sel: 'bg-blue-600 text-white hover:bg-blue-700', today: 'text-blue-600', mid: 'bg-blue-50 text-blue-700', presetHover: 'hover:bg-blue-50 hover:text-blue-700' },
  };
  const c = accentMap[accent] || accentMap.amber;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date Range Picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`h-9 text-xs gap-1.5 rounded-lg shadow-sm ${isActive ? c.trigger + ' font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
            data-testid={`${testIdPrefix}-date-picker-btn`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {rangeLabel()}
            {isActive && (
              <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); clearAll(); }} />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-0" align="start">
          <div className="flex">
            <div className="w-32 border-r bg-gray-50 p-2 space-y-0.5 rounded-l-xl">
              {[
                { label: 'Today', fn: () => { const d = toISO(today); setDateFrom(d); setDateTo(d); } },
                { label: 'Yesterday', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toISO(d); setDateFrom(s); setDateTo(s); } },
                { label: 'This Week', fn: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); setDateFrom(toISO(mon)); setDateTo(toISO(sun)); } },
                { label: 'Last 7 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 6); setDateFrom(toISO(s)); setDateTo(toISO(e)); } },
                { label: 'This Month', fn: () => { const now = new Date(); setDateFrom(toISO(new Date(now.getFullYear(), now.getMonth(), 1))); setDateTo(toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))); } },
                { label: 'Last Month', fn: () => { const now = new Date(); setDateFrom(toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setDateTo(toISO(new Date(now.getFullYear(), now.getMonth(), 0))); } },
                { label: 'Last 30 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 30); setDateFrom(toISO(s)); setDateTo(toISO(e)); } },
                { label: 'Last 90 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate() - 90); setDateFrom(toISO(s)); setDateTo(toISO(e)); } },
                { label: 'Clear', fn: clearAll },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={p.fn}
                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${p.label === 'Clear' ? 'text-red-500 hover:bg-red-50 mt-2' : `text-gray-700 ${c.presetHover}`}`}
                  data-testid={`${testIdPrefix}-preset-${p.label.toLowerCase().replace(/ /g, '-')}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="p-3">
              <DayPicker
                mode="range"
                selected={dateFrom ? { from: new Date(dateFrom + 'T00:00:00'), to: dateTo ? new Date(dateTo + 'T00:00:00') : new Date(dateFrom + 'T00:00:00') } : undefined}
                onSelect={(range) => {
                  if (range?.from) {
                    const from = toISO(range.from);
                    const to = range.to ? toISO(range.to) : from;
                    setDateFrom(from);
                    setDateTo(to);
                  } else {
                    clearAll();
                  }
                }}
                numberOfMonths={2}
                classNames={{
                  months: 'flex gap-4',
                  month: 'space-y-3',
                  caption: 'flex justify-center relative items-center h-8',
                  caption_label: 'text-sm font-semibold text-gray-800',
                  nav: 'flex items-center gap-1',
                  nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-lg hover:bg-gray-100',
                  table: 'w-full border-collapse',
                  head_row: 'flex',
                  head_cell: 'text-gray-400 rounded-md w-8 font-normal text-[10px] uppercase',
                  row: 'flex w-full mt-1',
                  cell: 'relative p-0 text-center text-sm focus-within:relative',
                  day: `h-8 w-8 p-0 font-normal text-xs rounded-lg ${c.day} transition-colors inline-flex items-center justify-center`,
                  day_selected: c.sel + ' font-medium',
                  day_today: `bg-gray-100 font-semibold ${c.today}`,
                  day_range_middle: c.mid + ' rounded-none',
                  day_range_start: c.sel + ' rounded-l-lg rounded-r-none',
                  day_range_end: c.sel + ' rounded-r-lg rounded-l-none',
                  day_outside: 'text-gray-300',
                  day_disabled: 'text-gray-300',
                }}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Month dropdown */}
      <Select value={String(selectedMonth)} onValueChange={handleMonthChange}>
        <SelectTrigger className="h-9 w-[110px] text-xs" data-testid={`${testIdPrefix}-month-select`}>
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">All Months</SelectItem>
          {MONTHS.map(m => <SelectItem key={m.v} value={String(m.v)}>{m.n}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Year dropdown */}
      <Select value={String(selectedYear || currentYear)} onValueChange={handleYearChange}>
        <SelectTrigger className="h-9 w-[90px] text-xs" data-testid={`${testIdPrefix}-year-select`}>
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {yearsList.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>

      {isActive && (
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearAll}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

/**
 * Utility: filter an array of records by date_from/date_to using a date-getter.
 * @param records - array
 * @param getDate - function(record) → ISO date string
 */
export function filterByDateRange(records, dateFrom, dateTo, getDate) {
  if (!dateFrom && !dateTo) return records;
  return records.filter(r => {
    const raw = getDate(r);
    if (!raw) return false;
    const d = (typeof raw === 'string' ? raw : new Date(raw).toISOString()).slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
}
