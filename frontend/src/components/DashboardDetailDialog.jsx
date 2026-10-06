import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

/**
 * Oct 6 2026 — the popup behind every figure on the Super Admin Dashboard:
 * the rows that make up the number, searchable, with a totals line and a
 * link to the page that owns the data.
 *
 * columns: [{ key, label, align?: 'right', render?: (row) => node,
 *             sum?: (row) => number, format?: (n) => string, className? }]
 * chips:   optional filters — [{ key, label, value }]; picking one passes
 *          its key to `chipFilter(row, key)`.
 *
 * Give it a `key` per figure so each one opens with an empty search and its
 * own `initialChip`.
 */
export default function DashboardDetailDialog({
  open, onOpenChange, title, subtitle, columns = [], rows = [], loading = false,
  searchKeys = [], chips, chipFilter, initialChip = '', onRowClick, rowTitle,
  fullPageHref, fullPageLabel = 'Open full page', emptyText = 'Nothing to show for this period.',
  testId = 'dashboard-detail',
}) {
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState(initialChip);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (!chip || !chipFilter || chipFilter(r, chip)) &&
      (!q || searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(q)))
    );
  }, [rows, search, searchKeys, chip, chipFilter]);

  const hasTotals = columns.some(c => c.sum);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          {subtitle && <DialogDescription className="text-xs">{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {searchKeys.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                data-testid={`${testId}-search`}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
          {chips && chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid={`${testId}-chips`}>
              {[{ key: '', label: 'All' }, ...chips].map(c => (
                <button
                  key={c.key || 'all'}
                  type="button"
                  onClick={() => setChip(c.key)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors ${
                    chip === c.key ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {c.label}{c.value != null && <span className="ml-1 opacity-80">{c.value}</span>}
                </button>
              ))}
            </div>
          )}
          <span className="text-[11px] text-gray-400 sm:ml-auto">{loading ? '' : `${visible.length} row${visible.length === 1 ? '' : 's'}`}</span>
        </div>

        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-2.5 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">#</th>
                {columns.map(c => (
                  <th key={c.key} className={`px-2.5 py-2 text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={columns.length + 1} className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin text-amber-600 inline" /></td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="py-10 text-center text-gray-400 text-sm">{search || chip ? 'No matching rows.' : emptyText}</td></tr>
              ) : visible.map((r, i) => (
                <tr
                  key={i}
                  className={onRowClick ? 'hover:bg-amber-50/60 cursor-pointer' : 'hover:bg-gray-50'}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  title={onRowClick ? rowTitle : undefined}
                  data-testid={`${testId}-row-${i}`}
                >
                  <td className="px-2.5 py-1.5 text-gray-400">{i + 1}</td>
                  {columns.map(c => (
                    <td key={c.key} className={`px-2.5 py-1.5 ${c.align === 'right' ? 'text-right whitespace-nowrap' : ''} ${c.className || 'text-gray-700'}`}>
                      {c.render ? c.render(r) : (r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hasTotals && !loading && visible.length > 0 && (
              <tfoot className="bg-gray-50 border-t font-semibold">
                <tr>
                  <td className="px-2.5 py-2" />
                  {columns.map((c, idx) => (
                    <td key={c.key} className={`px-2.5 py-2 ${c.align === 'right' ? 'text-right whitespace-nowrap' : ''}`}>
                      {c.sum ? (c.format || String)(visible.reduce((s, r) => s + (Number(c.sum(r)) || 0), 0)) : (idx === 0 ? 'Total' : '')}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {fullPageHref && (
          <div className="flex justify-end">
            <Link to={fullPageHref} className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800" data-testid={`${testId}-full-page`}>
              {fullPageLabel} <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
