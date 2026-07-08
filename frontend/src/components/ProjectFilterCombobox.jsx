/**
 * Reusable searchable project filter combobox.
 *
 * Drop-in replacement for the plain <Select> project-filter dropdowns that
 * were scattered across every dashboard (Procurement, Accountant, SE, Income,
 * Expenses, Cashbook, PM, etc.). Behaviour:
 *   • Collapsed by default — displays the currently selected project name
 *     (or the caller-supplied placeholder if `value === 'all'`).
 *   • Clicking the trigger expands an inline panel with a search input +
 *     scrollable list. Filters by project name / project_id / any label
 *     characters the caller-provided options carry.
 *   • Selecting an option collapses the panel and fires `onChange`.
 *
 * Props:
 *   value             string  — current selected id (`'all'` for no filter)
 *   onChange          fn(id)  — receives the new id
 *   options           Array<{ id, name, ...anything }>
 *   allLabel          string  — label for the "All" entry (default: 'All Projects')
 *   placeholder       string  — placeholder text before a project is chosen
 *   className         string  — extra Tailwind classes on the outer wrapper
 *   testId            string  — root data-testid; child ids derive from it
 *   disabled          bool
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

export default function ProjectFilterCombobox({
  value = 'all',
  onChange,
  options = [],
  allLabel = 'All Projects',
  placeholder = 'All Projects',
  className = '',
  testId = 'project-filter',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  // Click-outside collapses the panel so it feels like a dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = value === 'all' ? null : options.find(o => o.id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => {
      const hay = `${o.name || ''} ${o.id || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  return (
    <div ref={wrapRef} className={`relative ${className}`} data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className={`flex h-8 w-48 items-center justify-between rounded-md border border-gray-200 bg-white px-3 text-xs text-left transition-colors hover:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60 disabled:cursor-not-allowed ${selected ? 'text-gray-800' : 'text-gray-500'}`}
        data-testid={`${testId}-trigger`}
      >
        <span className="truncate">{selected ? selected.name : (placeholder || allLabel)}</span>
        <ChevronDown className={`h-3.5 w-3.5 opacity-50 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-md border border-amber-300 bg-white shadow-lg overflow-hidden" data-testid={`${testId}-panel`}>
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50/60">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project…"
              autoFocus
              className="flex-1 bg-transparent outline-none text-xs placeholder:text-gray-400"
              data-testid={`${testId}-search`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100" data-testid={`${testId}-list`}>
            <button
              type="button"
              onClick={() => { onChange && onChange('all'); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center gap-2 ${value === 'all' ? 'bg-amber-100 font-semibold' : ''}`}
              data-testid={`${testId}-option-all`}
            >
              <Check className={`h-3.5 w-3.5 shrink-0 ${value === 'all' ? 'text-amber-700' : 'invisible'}`} />
              <span className="flex-1 truncate">{allLabel}</span>
            </button>
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">No projects match</p>
            ) : filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange && onChange(p.id); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center gap-2 ${value === p.id ? 'bg-amber-100 font-semibold' : ''}`}
                data-testid={`${testId}-option-${p.id}`}
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${value === p.id ? 'text-amber-700' : 'invisible'}`} />
                <span className="flex-1 truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
