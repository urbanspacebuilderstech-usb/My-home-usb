import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, Check, ChevronDown } from 'lucide-react';

/**
 * Searchable project dropdown (Radix Popover) — plain name list, no stats
 * subtitle. Pass `projects` as [{ project_id, name }].
 */
export default function ProjectSearchSelect({
  projects = [],
  value = '',
  onChange,
  placeholder = 'All Projects',
  testId = 'project-search-select',
  width = 'w-64',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = projects.find(p => p.project_id === value);
  const selectedLabel = selected ? (selected.name || selected.project_name) : placeholder;
  const filtered = query.trim()
    ? projects.filter(p => (p.name || p.project_name || '').toLowerCase().includes(query.trim().toLowerCase()))
    : projects;
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
              placeholder="Search project..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid={`${testId}-input`}
            />
          </div>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${!value ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-700'}`}
            data-testid={`${testId}-all`}
          >
            <Check className={`h-3.5 w-3.5 ${!value ? 'opacity-100' : 'opacity-0'}`} />
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">No projects found</p>
          ) : filtered.map(p => (
            <button
              key={p.project_id}
              type="button"
              onClick={() => { onChange(p.project_id); setOpen(false); setQuery(''); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${value === p.project_id ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-700'}`}
              data-testid={`${testId}-item-${p.project_id}`}
            >
              <Check className={`h-3.5 w-3.5 ${value === p.project_id ? 'opacity-100' : 'opacity-0'}`} />
              <span className="truncate">{p.name || p.project_name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
