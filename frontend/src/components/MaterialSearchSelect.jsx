import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, Check, ChevronDown } from 'lucide-react';

const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Searchable material dropdown (Radix Popover) — mirrors ProjectSearchSelect.
 * Each option shows the material name plus a details line (qty/unit,
 * entry count, total amount) so the accountant can tell materials apart
 * before filtering the expense table down to it.
 */
export default function MaterialSearchSelect({
  materials = [], // [{ name, qty, unit, count, amount }]
  value = '',
  onChange,
  placeholder = 'Search Material',
  testId = 'material-search-select',
  width = 'w-64',
  accent = 'red',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = materials.find(m => m.name.toLowerCase() === value.toLowerCase());
  const selectedLabel = selected ? selected.name : placeholder;
  const filtered = query.trim()
    ? materials.filter(m => m.name.toLowerCase().includes(query.trim().toLowerCase()))
    : materials;
  const accentBg = accent === 'indigo' ? 'bg-indigo-50 text-indigo-700' :
                    accent === 'amber' ? 'bg-amber-50 text-amber-700' :
                    accent === 'blue' ? 'bg-blue-50 text-blue-700' :
                    'bg-red-50 text-red-700';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`${width} h-9 justify-between text-xs font-normal`}
          data-testid={testId}
        >
          <span className="truncate text-left flex-1 flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
            {selectedLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${width} p-0`} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              autoFocus
              placeholder="Search material..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid={`${testId}-input`}
            />
          </div>
        </div>
        <div className="max-h-72 overflow-auto py-1">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${!value ? `${accentBg} font-medium` : 'text-gray-700'}`}
            data-testid={`${testId}-all`}
          >
            <Check className={`h-3.5 w-3.5 ${!value ? 'opacity-100' : 'opacity-0'}`} />
            All Materials
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">No materials found</p>
          ) : filtered.map(m => (
            <button
              key={m.name}
              type="button"
              onClick={() => { onChange(m.name); setOpen(false); setQuery(''); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5 hover:bg-gray-50 ${value.toLowerCase() === m.name.toLowerCase() ? `${accentBg} font-medium` : 'text-gray-700'}`}
              data-testid={`${testId}-item-${m.name}`}
            >
              <span className="flex items-center gap-2">
                <Check className={`h-3.5 w-3.5 flex-shrink-0 ${value.toLowerCase() === m.name.toLowerCase() ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{m.name}</span>
              </span>
              <span className="pl-5.5 ml-5 text-[10px] text-gray-400 font-normal">
                {m.qty ? `Qty: ${m.qty.toLocaleString('en-IN')}${m.unit ? ` ${m.unit}` : ''} · ` : ''}
                {m.count} {m.count === 1 ? 'entry' : 'entries'} · {fmtAmt(m.amount)}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
