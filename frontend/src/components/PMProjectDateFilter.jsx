// Reusable Project + Date range filter card used across PM Dashboard tabs.
// Mirrors the pattern originally introduced for PMMaterialReadOnlyList so
// Work Order / Labour (RAB) and Petty Cash lists get the same UX.
//
// Usage:
//   const f = useProjectDateFilter(items);
//   const shown = f.filteredItems;   // items after project + date filters
//   return (
//     <>
//       <PMProjectDateFilter filter={f} itemsCount={items.length} testIdPrefix="pm-lab" />
//       {/* render shown */}
//     </>
//   );
import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Calendar, X } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

export function useProjectDateFilter(items, dateField = 'created_at') {
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const projectOptions = useMemo(() => {
    const seen = new Map();
    (items || []).forEach(r => {
      const id = r.project_id;
      if (id && !seen.has(id)) seen.set(id, r.project_name || 'Unknown');
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : null;
    return (items || []).filter(r => {
      if (projectFilter && r.project_id !== projectFilter) return false;
      if (fromTs || toTs) {
        const t = r[dateField] ? new Date(r[dateField]).getTime() : NaN;
        if (isNaN(t)) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [items, projectFilter, dateFrom, dateTo, dateField]);

  return { projectFilter, setProjectFilter, dateFrom, setDateFrom, dateTo, setDateTo, projectOptions, filteredItems };
}

export function PMProjectDateFilter({ filter, itemsCount, testIdPrefix = 'pm-filter' }) {
  const { projectFilter, setProjectFilter, dateFrom, setDateFrom, dateTo, setDateTo, projectOptions, filteredItems } = filter;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`${testIdPrefix}-filters`}>
      <Select value={projectFilter || 'all'} onValueChange={(v) => setProjectFilter(v === 'all' ? '' : v)}>
        <SelectTrigger className="h-9 w-[200px] text-xs bg-white" data-testid={`${testIdPrefix}-project-filter`}>
          <SelectValue placeholder="All Projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Projects</SelectItem>
          {projectOptions.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`h-9 text-xs gap-1.5 rounded-lg shadow-sm ${dateFrom ? 'bg-amber-50 border-amber-400 text-amber-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
            data-testid={`${testIdPrefix}-date-trigger`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {dateFrom ? (
              dateTo && dateFrom !== dateTo ? (
                `${new Date(dateFrom).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})} - ${new Date(dateTo).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}`
              ) : (
                new Date(dateFrom).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
              )
            ) : 'Date'}
            {dateFrom && (
              <X
                className="h-3 w-3 ml-1 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); setDateFrom(''); setDateTo(''); }}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-0" align="start">
          <div className="flex">
            <div className="w-32 border-r bg-gray-50 p-2 space-y-0.5 rounded-l-xl">
              {[
                { label: 'Today', fn: () => { const d = new Date().toISOString().split('T')[0]; setDateFrom(d); setDateTo(''); } },
                { label: 'Yesterday', fn: () => { const d = new Date(); d.setDate(d.getDate()-1); setDateFrom(d.toISOString().split('T')[0]); setDateTo(''); } },
                { label: 'This Week', fn: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate()-now.getDay()+1); const sun = new Date(mon); sun.setDate(mon.getDate()+6); setDateFrom(mon.toISOString().split('T')[0]); setDateTo(sun.toISOString().split('T')[0]); } },
                { label: 'Last 7 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate()-6); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
                { label: 'This Month', fn: () => { const now = new Date(); setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setDateTo(new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0]); } },
                { label: 'All Requests', fn: () => { setDateFrom(''); setDateTo(''); } },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={p.fn}
                  data-testid={`${testIdPrefix}-preset-${p.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${p.label === 'All Requests' ? 'text-red-500 hover:bg-red-50 mt-2' : 'text-gray-700 hover:bg-amber-50 hover:text-amber-700'}`}
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
                    const from = range.from.toLocaleDateString('en-CA');
                    const to = range.to ? range.to.toLocaleDateString('en-CA') : '';
                    setDateFrom(from);
                    setDateTo(from === to ? '' : to);
                  } else { setDateFrom(''); setDateTo(''); }
                }}
                classNames={{
                  months: 'flex gap-4', month: 'space-y-3',
                  caption: 'flex justify-center relative items-center h-8',
                  caption_label: 'text-sm font-semibold text-gray-800',
                  nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-lg hover:bg-gray-100',
                  table: 'w-full border-collapse', head_row: 'flex',
                  head_cell: 'text-gray-400 rounded-md w-8 font-normal text-[10px] uppercase',
                  row: 'flex w-full mt-1', cell: 'relative p-0 text-center text-sm',
                  day: 'h-8 w-8 p-0 font-normal text-xs rounded-lg hover:bg-amber-50 transition-colors inline-flex items-center justify-center',
                  day_selected: 'bg-amber-600 text-white hover:bg-amber-700 font-medium',
                  day_today: 'bg-gray-100 font-semibold text-amber-600',
                  day_range_middle: 'bg-amber-50 text-amber-700 rounded-none',
                  day_range_start: 'bg-amber-600 text-white rounded-l-lg rounded-r-none',
                  day_range_end: 'bg-amber-600 text-white rounded-r-lg rounded-l-none',
                  day_outside: 'text-gray-300',
                }}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {(projectFilter || dateFrom) && (
        <span className="text-[11px] text-gray-500 ml-1" data-testid={`${testIdPrefix}-active-filters`}>
          Showing <span className="font-semibold text-amber-700">{filteredItems.length}</span> of {itemsCount}
        </span>
      )}
    </div>
  );
}
