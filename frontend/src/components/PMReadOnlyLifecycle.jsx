// Read-only lifecycle viewer for PM Dashboard.
// Mirrors the Planning Board's filter-card pattern but suppresses any approval actions.
// Used for Material Requests and Labour Requests where PM can view but not approve.
import { useMemo, useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Eye, Package, HardHat, Truck, PackageCheck, FileClock, Wallet, ListChecks, Send, ClipboardList, Calendar, X } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import OrderDetailDialog from './OrderDetailDialog';

const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return s || '—'; } };

const MATERIAL_BUCKETS = [
  { key: 'all',                 label: 'All',                 cls: 'bg-violet-50 border-violet-200 text-violet-700',  active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'new_request',         label: 'New Request (SE)',    Icon: ClipboardList, cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'planning_awaiting',   label: 'Planning Awaiting',   Icon: Send,          cls: 'bg-yellow-50 border-yellow-200 text-yellow-700',  active: 'bg-yellow-600 text-white border-yellow-600' },
  { key: 'revision',            label: 'Revision',            Icon: FileClock,     cls: 'bg-orange-50 border-orange-200 text-orange-700',  active: 'bg-orange-600 text-white border-orange-600' },
  { key: 'awaiting_accountant', label: 'Awaiting Accountant', Icon: Wallet,        cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white border-cyan-600' },
  { key: 'transit',             label: 'Transit',             Icon: Truck,         cls: 'bg-sky-50 border-sky-200 text-sky-700',           active: 'bg-sky-600 text-white border-sky-600' },
  { key: 'delivered',           label: 'Delivered',           Icon: PackageCheck,  cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
];

function bucketForMaterial(req) {
  const status = (req.status || '').toLowerCase();
  if (status === 'requested' || status === 'pm_approved') return 'new_request';
  if (status === 'procurement_priced') return 'planning_awaiting';
  if (status === 'procurement_revision') return 'revision';
  if (['pending_accounts_approval', 'pending_balance_payment', 'accounts_approved', 'payment_approved'].includes(status)) return 'awaiting_accountant';
  if (status === 'in_transit') return 'transit';
  if (['delivered', 'completed', 'closed', 'received_partial', 'received_completed'].includes(status)) return 'delivered';
  return 'all';
}

export function PMMaterialReadOnlyList({ items }) {
  const [bucket, setBucket] = useState('all');
  // Selected request opens the shared OrderDetailDialog (Details + Timeline
  // tabs) in read-only mode — PM can audit the full lifecycle of any card
  // without enabling approval edits.
  const [selected, setSelected] = useState(null);
  // Project + date range filters. Empty strings = "all". `projectFilter` is
  // a project_id; the unique project list is derived from `items` so the
  // dropdown auto-populates with whichever projects have requests in scope.
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const projectOptions = useMemo(() => {
    const seen = new Map();
    items.forEach(r => {
      const id = r.project_id;
      if (id && !seen.has(id)) seen.set(id, r.project_name || 'Unknown');
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [items]);

  // Apply project + date filters BEFORE the bucket filter so the bucket
  // counts at the top accurately reflect what the user has narrowed to.
  const filteredItems = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() : null;
    return items.filter(r => {
      if (projectFilter && r.project_id !== projectFilter) return false;
      if (fromTs || toTs) {
        const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
        if (isNaN(t)) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [items, projectFilter, dateFrom, dateTo]);

  const visibleItems = useMemo(() => {
    if (bucket === 'all') return filteredItems;
    return filteredItems.filter(r => bucketForMaterial(r) === bucket);
  }, [filteredItems, bucket]);
  const counts = useMemo(() => {
    const c = { all: filteredItems.length };
    MATERIAL_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    filteredItems.forEach(r => { const b = bucketForMaterial(r); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [filteredItems]);

  return (
    <div className="space-y-2" data-testid="pm-mat-readonly">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-2"><Package className="h-4 w-4" /> Material Requests ({filteredItems.length}) <span className="ml-1 text-[10px] uppercase tracking-wide font-normal text-gray-400">(view-only)</span></h3>
      </div>

      {/* ── Project + Date filters ──────────────────────────────────────
          Sit between the heading and the bucket grid. Both filters apply
          BEFORE the buckets so the bucket counts reflect the narrowed
          scope. Project dropdown lists only projects that have requests
          in the current items set. Date pill mirrors the Sales / Sr. SE
          Meta-style popover for cross-app consistency. */}
      <div className="flex flex-wrap items-center gap-2" data-testid="pm-mat-filters">
        <Select value={projectFilter || 'all'} onValueChange={(v) => setProjectFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-[200px] text-xs bg-white" data-testid="pm-mat-project-filter">
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
              data-testid="pm-mat-date-trigger"
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
                    data-testid={`pm-mat-preset-${p.label.toLowerCase().replace(/\s+/g, '-')}`}
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
          <span className="text-[11px] text-gray-500 ml-1" data-testid="pm-mat-active-filters">
            Showing <span className="font-semibold text-amber-700">{filteredItems.length}</span> of {items.length}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {MATERIAL_BUCKETS.map(b => {
          const Icon = b.Icon || ListChecks;
          const active = bucket === b.key;
          const count = counts[b.key] || 0;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'}`} data-testid={`pm-mat-bucket-${b.key}`}>
              <Icon className="h-3.5 w-3.5" />
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{count}</span>
            </button>
          );
        })}
      </div>
      {visibleItems.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No material requests in this bucket</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visibleItems.map(r => {
            const cfg = MATERIAL_BUCKETS.find(b => b.key === bucketForMaterial(r));
            return (
              <Card
                key={r.request_id}
                data-testid={`pm-mat-card-${r.request_id}`}
                className="cursor-pointer hover:shadow-md hover:bg-amber-50/40 hover:border-amber-200 transition-all"
                onClick={() => setSelected(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r); } }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cfg && <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">#{r.order_id || r.request_id}</span>
                      <Eye className="h-3 w-3 text-amber-500" />
                    </div>
                    {r.total_amount && <span className="text-sm font-semibold text-gray-800">{fmt(r.total_amount)}</span>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="sm:col-span-2"><p className="text-[10px] uppercase font-semibold text-gray-400">Material</p><p className="font-medium truncate">{r.material_name}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Project</p><p className="font-medium truncate">{r.project_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Qty</p><p className="font-medium">{r.quantity} {r.unit}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Created</p><p className="font-medium">{fmtDate(r.created_at)}</p></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail popup for the selected material request — reuses the shared
          OrderDetailDialog (Details + Timeline tabs + Steel breakdown). PM
          statuses (`requested`, `pm_approved`, `procurement_priced`, etc.)
          aren't in the dialog's editable allow-list, so it renders fully
          read-only with the standard X close button in the top corner. */}
      <OrderDetailDialog
        open={!!selected}
        order={selected}
        onClose={() => setSelected(null)}
        onUpdate={() => setSelected(null)}
      />
    </div>
  );
}

const LABOUR_BUCKETS = [
  { key: 'all',                 label: 'All',                 cls: 'bg-violet-50 border-violet-200 text-violet-700',  active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'new_request',         label: 'New Request',         cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'planning_awaiting',   label: 'Planning Awaiting',   cls: 'bg-yellow-50 border-yellow-200 text-yellow-700',  active: 'bg-yellow-600 text-white border-yellow-600' },
  { key: 'awaiting_accountant', label: 'Awaiting Accountant', cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white border-cyan-600' },
  { key: 'paid',                label: 'Paid',                cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
];
function bucketForLabour(r) {
  const s = (r.status || '').toLowerCase();
  // New RAB lifecycle (project_work_orders.stages[].payment_requests[])
  //   requested → PM new
  //   pm_approved → QC review (still "new" from PM viewpoint until QC clears)
  //   qc_approved / planning_pending / planning_review → Planning step
  //   planning_approved / accountant_pending / pending_accounts_approval → Accountant
  //   approved / paid / completed → Paid
  if (s === 'requested') return 'new_request';
  if (s === 'pm_approved' || s === 'qc_approved') return 'planning_awaiting';
  if (s === 'planning_pending' || s === 'planning_review') return 'planning_awaiting';
  if (s === 'planning_approved' || s === 'accountant_pending' || s === 'pending_accounts_approval') return 'awaiting_accountant';
  if (['paid', 'completed', 'approved'].includes(s)) return 'paid';
  return 'all';
}

export function PMLabourReadOnlyList({ items }) {
  const [bucket, setBucket] = useState('all');
  const visibleItems = useMemo(() => bucket === 'all' ? items : items.filter(r => bucketForLabour(r) === bucket), [items, bucket]);
  const counts = useMemo(() => {
    const c = { all: items.length };
    LABOUR_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    items.forEach(r => { const b = bucketForLabour(r); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [items]);

  return (
    <div className="space-y-2" data-testid="pm-lab-readonly">
      <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2"><HardHat className="h-4 w-4" /> Work Order / Labour ({items.length}) <span className="ml-1 text-[10px] uppercase tracking-wide font-normal text-gray-400">(view-only)</span></h3>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {LABOUR_BUCKETS.map(b => {
          const active = bucket === b.key;
          const count = counts[b.key] || 0;
          return (
            <button key={b.key} onClick={() => setBucket(b.key)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[50px] ${active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'}`} data-testid={`pm-lab-bucket-${b.key}`}>
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{count}</span>
            </button>
          );
        })}
      </div>
      {visibleItems.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-xs text-gray-400">No labour requests in this bucket</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((r, i) => {
            const cfg = LABOUR_BUCKETS.find(b => b.key === bucketForLabour(r));
            return (
              <Card key={r.labour_expense_id || r.request_id || i} data-testid={`pm-lab-card-${r.labour_expense_id || i}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cfg && <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.label}</Badge>}
                      <span className="text-[10px] text-gray-400 font-mono">#{r.labour_expense_id || r.request_id}</span>
                      <Eye className="h-3 w-3 text-gray-300" />
                    </div>
                    {r.amount && <span className="text-sm font-semibold text-gray-800">{fmt(r.amount)}</span>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Type</p><p className="font-medium truncate">{r.rab_number ? `${r.rab_number} · ${r.stage_name || 'Stage Payment'}` : (r.labour_type || r.description || '—')}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Project</p><p className="font-medium truncate">{r.project_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Workers / Days</p><p className="font-medium">{r.workers_count || (r.rab_number ? (r.requested_by_name || r.site_engineer_name || '—') : '—')} / {r.days || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Contractor</p><p className="font-medium truncate">{r.contractor_name || '—'}</p></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
