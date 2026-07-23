import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, Check, ChevronDown, X } from 'lucide-react';

const fmtAmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Searchable material dropdown (Radix Popover) — mirrors ProjectSearchSelect.
 * Each option shows the material name plus a details line (qty/unit,
 * entry count, total amount) so the accountant can tell materials apart
 * before filtering the expense table down to it.
 *
 * Pass `multiple` to let several materials be checked at once (e.g. "8mm
 * steel" + "16mm steel" + "Steel" together) — `value`/`onChange` then work
 * with a string[] instead of a single string, and the popover stays open
 * after each pick so multiple boxes can be checked in one go.
 */
export default function MaterialSearchSelect({
  materials = [], // [{ name, qty, unit, count, amount }]
  value = '',
  onChange,
  placeholder = 'Search Material',
  testId = 'material-search-select',
  width = 'w-64',
  accent = 'red',
  multiple = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedNames = multiple ? (Array.isArray(value) ? value : []) : (value ? [value] : []);
  const selectedNamesLower = selectedNames.map(n => n.toLowerCase());
  const isSelected = (name) => selectedNamesLower.includes(name.toLowerCase());

  const selectedLabel = multiple
    ? (selectedNames.length === 0 ? placeholder : selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} materials selected`)
    : (materials.find(m => m.name.toLowerCase() === (value || '').toLowerCase())?.name || placeholder);

  const filtered = query.trim()
    ? materials.filter(m => m.name.toLowerCase().includes(query.trim().toLowerCase()))
    : materials;
  const accentBg = accent === 'indigo' ? 'bg-indigo-50 text-indigo-700' :
                    accent === 'amber' ? 'bg-amber-50 text-amber-700' :
                    accent === 'blue' ? 'bg-blue-50 text-blue-700' :
                    'bg-red-50 text-red-700';

  const selectAll = () => {
    if (multiple) { onChange([]); } else { onChange(''); }
    setOpen(false);
    setQuery('');
  };

  const toggleItem = (name) => {
    if (!multiple) {
      onChange(name);
      setOpen(false);
      setQuery('');
      return;
    }
    const next = isSelected(name)
      ? selectedNames.filter(n => n.toLowerCase() !== name.toLowerCase())
      : [...selectedNames, name];
    onChange(next);
    // Keep the popover open in multi-select mode so several boxes can be
    // checked in one sitting — only "All Materials" or clicking away closes it.
  };

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
          {multiple && selectedNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selectedNames.map(name => (
                <span key={name} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${accentBg}`}>
                  {name}
                  <button type="button" onClick={() => toggleItem(name)} className="hover:opacity-70" data-testid={`${testId}-remove-${name}`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-72 overflow-auto py-1">
          <button
            type="button"
            onClick={selectAll}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${selectedNames.length === 0 ? `${accentBg} font-medium` : 'text-gray-700'}`}
            data-testid={`${testId}-all`}
          >
            <Check className={`h-3.5 w-3.5 ${selectedNames.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
            All Materials
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">No materials found</p>
          ) : filtered.map(m => (
            <button
              key={m.name}
              type="button"
              onClick={() => toggleItem(m.name)}
              className={`w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5 hover:bg-gray-50 ${isSelected(m.name) ? `${accentBg} font-medium` : 'text-gray-700'}`}
              data-testid={`${testId}-item-${m.name}`}
            >
              <span className="flex items-center gap-2">
                <Check className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected(m.name) ? 'opacity-100' : 'opacity-0'}`} />
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
