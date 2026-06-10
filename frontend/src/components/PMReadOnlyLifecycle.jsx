// Read-only lifecycle viewer for PM Dashboard.
// Mirrors the Planning Board's filter-card pattern but suppresses any approval actions.
// Used for Material Requests and Labour Requests where PM can view but not approve.
import { useMemo, useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Eye, Package, HardHat, Truck, PackageCheck, FileClock, Wallet, ListChecks, Send, ClipboardList } from 'lucide-react';
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
  const visibleItems = useMemo(() => {
    if (bucket === 'all') return items;
    return items.filter(r => bucketForMaterial(r) === bucket);
  }, [items, bucket]);
  const counts = useMemo(() => {
    const c = { all: items.length };
    MATERIAL_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    items.forEach(r => { const b = bucketForMaterial(r); c[b] = (c[b] || 0) + 1; });
    return c;
  }, [items]);

  return (
    <div className="space-y-2" data-testid="pm-mat-readonly">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-2"><Package className="h-4 w-4" /> Material Requests ({items.length}) <span className="ml-1 text-[10px] uppercase tracking-wide font-normal text-gray-400">(view-only)</span></h3>
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
  if (s === 'requested' || s === 'pm_approved') return 'new_request';
  if (s === 'planning_pending' || s === 'planning_review') return 'planning_awaiting';
  if (['accountant_pending', 'pending_accounts_approval'].includes(s)) return 'awaiting_accountant';
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
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Type</p><p className="font-medium truncate">{r.labour_type || r.description || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Project</p><p className="font-medium truncate">{r.project_name || '—'}</p></div>
                    <div><p className="text-[10px] uppercase font-semibold text-gray-400">Workers / Days</p><p className="font-medium">{r.workers_count || '—'} / {r.days || '—'}</p></div>
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
