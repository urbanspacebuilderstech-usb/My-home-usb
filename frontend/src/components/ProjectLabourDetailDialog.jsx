import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HardHat, ChevronDown, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Same format as AccountsBoard's fmtFull, so the popup reads like the table.
const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';
const fmtDay = (s) => {
  if (!s) return '';
  const d = new Date(String(s).length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Stage status is worked out by the backend (paid / payment pending / …).
const STAGE_STATUS = {
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-800 border-green-200' },
  payment_pending: { label: 'Payment pending', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  rework: { label: 'Returned', cls: 'bg-red-100 text-red-800 border-red-200' },
  part_paid: { label: 'Part paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'Work in progress', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  open: { label: 'Open', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  not_started: { label: 'Not started', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  not_on_work_order: { label: 'Not on work order', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const SKILLS = [
  { k: 'skilled', label: 'Skilled', cls: 'bg-blue-50 border-blue-100 text-blue-800' },
  { k: 'semi_skilled', label: 'Semi-skilled', cls: 'bg-teal-50 border-teal-100 text-teal-800' },
  { k: 'unskilled', label: 'Unskilled', cls: 'bg-amber-50 border-amber-100 text-amber-800' },
];

function WorkerMix({ w, rates, testId }) {
  if (!w) return null;
  const range = w.first_date ? `${fmtDay(w.first_date)}${w.last_date && w.last_date !== w.first_date ? ` – ${fmtDay(w.last_date)}` : ''}` : 'No reports';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid={testId}>
      {SKILLS.map(s => (
        <div key={s.k} className={`rounded-lg border px-2.5 py-1.5 ${s.cls}`}>
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">
            {s.label}{rates?.[s.k] ? ` · ₹${Number(rates[s.k]).toLocaleString('en-IN')}/day` : ''}
          </p>
          <p className="text-sm font-bold">
            {(w[s.k]?.count || 0).toLocaleString('en-IN')}
            <span className="text-[11px] font-medium opacity-80"> · {fmtFull(w[s.k]?.amount)}</span>
          </p>
        </div>
      ))}
      <div className="rounded-lg border px-2.5 py-1.5 bg-gray-50 border-gray-200 text-gray-800">
        <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">Days on site</p>
        <p className="text-sm font-bold">
          {w.days || 0}
          <span className="text-[11px] font-medium opacity-80"> · {range}</span>
        </p>
      </div>
    </div>
  );
}

function StageTable({ wo, scope }) {
  const stages = wo.stages || [];
  const listedAmount = stages.filter(s => s.on_work_order).reduce((a, s) => a + (s.amount || 0), 0);
  const foot = stages.reduce((a, s) => {
    const w = s.worked?.[scope] || {};
    a.workers += w.workers || 0;
    a.cost += w.cost || 0;
    if (s.on_work_order) {
      a.amount += s.amount || 0;
      a.paid += (s.paid || 0) + (s.advance || 0);
      a.pending += s.pending || 0;
      a.balance += s.balance || 0;
    }
    return a;
  }, { amount: 0, workers: 0, cost: 0, paid: 0, pending: 0, balance: 0 });
  const onWo = !wo.removed && !wo.no_work_order;
  const th = 'px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap';

  return (
    <div className="space-y-1.5" data-testid={`pw-labour-detail-wo-${wo.work_order_id || 'none'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-700">{wo.work_order_number || (wo.no_work_order ? 'Labour reports' : 'Work order')}</span>
          {wo.removed && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">Work order removed</Badge>}
          {wo.no_work_order && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">No work order</Badge>}
        </div>
        {onWo && (
          <span className="text-gray-500">
            Scope {fmtFull(wo.scope_total)}
            {wo.additional_total ? <> + Additional {fmtFull(wo.additional_total)}</> : null}
            {wo.deduction_total ? <> − Deductions {fmtFull(wo.deduction_total)}</> : null}
            {' = '}<strong className="text-gray-800">{fmtFull(wo.total_value)}</strong>
          </span>
        )}
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-xs min-w-[760px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className={`${th} text-left`}>#</th>
              <th className={`${th} text-left`}>Stage</th>
              <th className={`${th} text-right`}>Stage Amount</th>
              <th className={`${th} text-right`}>Workers</th>
              <th className={`${th} text-right`}>Days</th>
              <th className={`${th} text-right`} title="Workers × day rate, from the Daily Labour Reports">Labour Cost</th>
              <th className={`${th} text-right`}>Paid</th>
              <th className={`${th} text-right`}>Pending</th>
              <th className={`${th} text-right`}>Balance</th>
              <th className={`${th} text-center`}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stages.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-gray-400">No stages on this work order</td></tr>
            ) : stages.map((s, i) => {
              const w = s.worked?.[scope] || {};
              const st = STAGE_STATUS[s.status] || STAGE_STATUS.not_started;
              const dash = <span className="text-gray-300">—</span>;
              return (
                <tr key={s.stage_id || i} className={s.on_work_order ? 'hover:bg-gray-50' : 'bg-amber-50/40'} data-testid={`pw-labour-detail-stage-${s.stage_id || i}`}>
                  <td className="px-2.5 py-1.5 text-gray-400">{i + 1}</td>
                  <td className="px-2.5 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-medium text-gray-800">{s.name}</span>
                      {s.type === 'percentage' && s.value ? <span className="text-[10px] text-gray-400">({s.value}%)</span> : null}
                      {s.is_additional && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200">Additional</Badge>}
                    </div>
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-gray-700">{s.on_work_order ? fmtFull(s.amount) : dash}</td>
                  <td className="px-2.5 py-1.5 text-right font-semibold text-gray-900">{(w.workers || 0).toLocaleString('en-IN')}</td>
                  <td className="px-2.5 py-1.5 text-right text-gray-600">{w.days || 0}</td>
                  <td className="px-2.5 py-1.5 text-right text-gray-700">{fmtFull(w.cost)}</td>
                  <td className="px-2.5 py-1.5 text-right text-green-700 font-semibold">
                    {s.on_work_order ? fmtFull((s.paid || 0) + (s.advance || 0)) : dash}
                    {s.advance > 0 && <div className="text-[10px] font-normal text-gray-500">incl. {fmtFull(s.advance)} advance</div>}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-violet-700">{s.on_work_order ? (s.pending ? fmtFull(s.pending) : '—') : dash}</td>
                  <td className={`px-2.5 py-1.5 text-right font-semibold ${s.balance < 0 ? 'text-red-600' : 'text-amber-700'}`}>{s.on_work_order ? fmtFull(s.balance) : dash}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${st.cls}`}>{st.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {stages.length > 0 && (
            <tfoot className="bg-gray-50 border-t font-semibold">
              <tr>
                <td className="px-2.5 py-1.5" colSpan={2}>Total</td>
                <td className="px-2.5 py-1.5 text-right">{onWo ? fmtFull(foot.amount) : '—'}</td>
                <td className="px-2.5 py-1.5 text-right">{foot.workers.toLocaleString('en-IN')}</td>
                <td className="px-2.5 py-1.5 text-right">{wo.worked?.[scope]?.days || 0}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtFull(foot.cost)}</td>
                <td className="px-2.5 py-1.5 text-right text-green-700">{onWo ? fmtFull(foot.paid) : '—'}</td>
                <td className="px-2.5 py-1.5 text-right text-violet-700">{onWo ? fmtFull(foot.pending) : '—'}</td>
                <td className={`px-2.5 py-1.5 text-right ${foot.balance < 0 ? 'text-red-600' : 'text-amber-700'}`}>{onWo ? fmtFull(foot.balance) : '—'}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {onWo && Math.abs(listedAmount - (wo.total_value || 0)) > 1 && (
        <p className="text-[10px] text-gray-500">
          Stage amounts add up to {fmtFull(Math.round(listedAmount * 100) / 100)}; the work order value is {fmtFull(wo.total_value)}. The contractor's Balance above uses the work order value.
        </p>
      )}
      {!onWo && (
        <p className="text-[10px] text-gray-500">
          {wo.removed
            ? 'This work order was removed, but its labour reports are still counted in the workers total.'
            : 'These labour reports are not linked to a work order, so there is no contract or payment to compare them with.'}
        </p>
      )}
    </div>
  );
}

function ContractorCard({ c, scope, open, onToggle }) {
  const w = c.worked?.[scope] || {};
  const woNumbers = c.work_orders.map(wo => wo.work_order_number).filter(Boolean);
  const paid = (c.paid || 0) + (c.advance || 0);
  const rates = c.work_orders.length === 1 ? c.work_orders[0].labour_rates : null;
  const testKey = (c.contractor_id || c.contractor_name || '').replace(/\s+/g, '-');

  return (
    <div className="border rounded-xl overflow-hidden bg-white" data-testid={`pw-labour-detail-contractor-${testKey}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-3 py-2.5 bg-gray-50 hover:bg-amber-50/60 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {open ? <ChevronDown className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-gray-900">{c.contractor_name}</span>
              {c.contractor_type && <Badge variant="outline" className="text-[10px] bg-white">{c.contractor_type}</Badge>}
              {!c.on_work_order && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">No active work order</Badge>}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {woNumbers.length ? `${woNumbers.join(', ')} · ` : ''}
              {c.on_work_order
                ? `${c.stages_paid} of ${plural(c.stages_total, 'stage')} paid · ${c.stages_worked} worked on`
                : 'Labour reports only'}
              {c.pending_count ? ` · ${plural(c.pending_count, 'payment request')} pending` : ''}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 pl-6 sm:pl-0 sm:w-[28rem] shrink-0">
          <div>
            <p className="text-[10px] uppercase text-gray-500">Contract</p>
            <p className="text-xs sm:text-sm font-bold text-indigo-700">{fmtFull(c.total_value)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Paid</p>
            <p className="text-xs sm:text-sm font-bold text-green-700">{fmtFull(paid)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Balance</p>
            <p className={`text-xs sm:text-sm font-bold ${c.balance < 0 ? 'text-red-600' : 'text-amber-700'}`}>{fmtFull(c.balance)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Workers</p>
            <p className="text-xs sm:text-sm font-bold text-gray-900">
              {(w.workers || 0).toLocaleString('en-IN')}
              <span className="text-[10px] font-normal text-gray-500"> · {w.days || 0}d</span>
            </p>
          </div>
        </div>
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t">
          <WorkerMix w={w} rates={rates} testId={`pw-labour-detail-mix-${testKey}`} />
          {c.work_orders.map((wo, i) => <StageTable key={wo.work_order_id || `no-wo-${i}`} wo={wo} scope={scope} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Oct 15 2026 — Finance Board > Project Wise > Labour: clicking a project
 * row opens this. Contractor → work order → stage, with workers on site
 * (DLR), what each stage has been paid, and the balance left on the
 * contract. Worker figures follow the tab's date range (so they match the
 * row) with an All-time switch; contract / paid / balance are all-time.
 */
export default function ProjectLabourDetailDialog({ project, dateFrom, dateTo, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('range');
  const [expanded, setExpanded] = useState({});
  const hasRange = !!(dateFrom || dateTo);
  const projectId = project?.project_id;

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    setData(null);
    setError('');
    setLoading(true);
    setScope(dateFrom || dateTo ? 'range' : 'all');
    const params = new URLSearchParams();
    if (dateFrom) params.append('start_date', dateFrom);
    if (dateTo) params.append('end_date', dateTo);
    axios.get(`${API}/accountant/project-wise/labour-summary/${encodeURIComponent(projectId)}?${params}`)
      .then(res => {
        if (cancelled) return;
        const cs = res.data?.contractors || [];
        setData(res.data);
        // Open every card when there are only a couple; otherwise start folded.
        setExpanded(Object.fromEntries(cs.map(c => [c.key, cs.length <= 2])));
      })
      .catch(err => { if (!cancelled) setError(err.response?.data?.detail || 'Could not load labour details'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, dateFrom, dateTo]);

  const periodLabel = hasRange ? `${fmtDay(dateFrom) || '…'} – ${fmtDay(dateTo) || '…'}` : 'All dates';
  const scopeLabel = scope === 'range' ? periodLabel : 'all time';
  const t = data?.totals;
  const w = t?.worked?.[scope] || {};
  const contractors = data?.contractors || [];
  const cb = data?.cashbook;
  const otherRows = cb?.other_rows || [];
  const allOpen = contractors.length > 0 && contractors.every(c => expanded[c.key]);

  const paidAll = t ? (t.paid || 0) + (t.advance || 0) : 0;
  const tiles = t ? [
    { key: 'contract', label: 'Contract Value', value: fmtFull(t.contract_value), sub: `${plural(t.contractors, 'contractor')} · ${plural(t.work_orders, 'work order')}`, cls: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
    { key: 'paid', label: 'Paid to Contractors', value: fmtFull(paidAll), sub: `${pct(paidAll, t.contract_value)}% of contract${t.advance ? ` · incl. ${fmtFull(t.advance)} advance` : ''}`, cls: 'bg-green-50 border-green-200 text-green-800' },
    { key: 'pending', label: 'Awaiting Approval', value: fmtFull(t.pending), sub: plural(t.pending_count || 0, 'payment request'), cls: 'bg-violet-50 border-violet-200 text-violet-800' },
    t.balance < 0
      ? { key: 'balance', label: 'Paid Over Contract', value: fmtFull(-t.balance), sub: `${t.stages_paid} of ${plural(t.stages_total, 'stage')} fully paid`, cls: 'bg-red-50 border-red-200 text-red-700' }
      : { key: 'balance', label: 'Balance to Pay', value: fmtFull(t.balance), sub: `${t.stages_paid} of ${plural(t.stages_total, 'stage')} fully paid`, cls: 'bg-amber-50 border-amber-200 text-amber-800' },
    { key: 'workers', label: 'Workers', value: (w.workers || 0).toLocaleString('en-IN'), sub: `${plural(w.days || 0, 'day')} · ${fmtFull(w.cost)} labour cost`, cls: 'bg-sky-50 border-sky-200 text-sky-800 col-span-2 sm:col-span-1' },
  ] : [];

  return (
    <Dialog open={!!project} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-4 sm:p-6" data-testid="pw-labour-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <HardHat className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="truncate">{project?.project_name} — Labour</span>
          </DialogTitle>
          <DialogDescription>Contractors, their stages, workers on site and how the labour cost stands against the contract.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin text-amber-600" /> Loading labour details…
          </div>
        )}
        {!loading && error && (
          <div className="py-8 flex flex-col items-center gap-2 text-sm text-red-600" data-testid="pw-labour-detail-error">
            <AlertTriangle className="h-5 w-5" /> {error}
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" data-testid="pw-labour-detail-tiles">
              {tiles.map(tile => (
                <div key={tile.key} className={`rounded-xl border px-3 py-2.5 ${tile.cls}`} data-testid={`pw-labour-detail-tile-${tile.key}`}>
                  <p className="text-[11px] font-medium leading-tight">{tile.label}</p>
                  <p className="text-lg sm:text-xl font-bold mt-0.5">{tile.value}</p>
                  <p className="text-[11px] opacity-75 leading-tight mt-0.5">{tile.sub}</p>
                </div>
              ))}
            </div>

            {(w.workers || 0) > 0 && <WorkerMix w={w} testId="pw-labour-detail-mix-project" />}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800">
                  Contractors <span className="text-gray-400 font-normal">({contractors.length})</span>
                  <span className="ml-2 text-[11px] font-normal text-gray-500">
                    {t.contractors_worked?.[scope] || 0} worked in {scopeLabel}
                  </span>
                </h3>
                {contractors.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-amber-700"
                    onClick={() => setExpanded(Object.fromEntries(contractors.map(c => [c.key, !allOpen])))}
                    data-testid="pw-labour-detail-toggle-all"
                  >{allOpen ? 'Collapse all' : 'Expand all'}</Button>
                )}
              </div>
              {contractors.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6 border rounded-xl">No work orders or labour reports for this project.</p>
              ) : contractors.map(c => (
                <ContractorCard
                  key={c.key}
                  c={c}
                  scope={scope}
                  open={!!expanded[c.key]}
                  onToggle={() => setExpanded(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
                />
              ))}
            </div>

            {otherRows.length > 0 && (
              <div className="space-y-1.5" data-testid="pw-labour-detail-other">
                <h3 className="text-sm font-semibold text-gray-800">
                  Other labour expense <span className="text-[11px] font-normal text-gray-500">— in the Cashbook but not on an active work order</span>
                </h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs min-w-[560px]">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Description</th>
                        <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Paid To</th>
                        <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-500 uppercase">Mode</th>
                        <th className="px-2.5 py-1.5 text-right text-[10px] font-semibold text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {otherRows.map((r, i) => (
                        <tr key={r.expense_id || i}>
                          <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap">{fmtDay(r.date) || '—'}</td>
                          <td className="px-2.5 py-1.5 text-gray-700">{r.description || r.paid_to || '—'}</td>
                          <td className="px-2.5 py-1.5 text-gray-700">{r.paid_to || '—'}</td>
                          <td className="px-2.5 py-1.5 text-gray-500 capitalize">{(r.payment_method || '—').replace(/_/g, ' ')}</td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-red-700">{fmtFull(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td className="px-2.5 py-1.5" colSpan={4}>Total</td>
                        <td className="px-2.5 py-1.5 text-right text-red-700">{fmtFull(cb.other_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <p className="text-[10px] text-gray-400 leading-relaxed">
              Workers = total of the daily headcounts in the Daily Labour Reports (one person on site for 5 days counts as 5), matching the Labour table.
              Labour Cost = workers × day rate on each report. Paid = stage payments approved by Accounts (plus approved advances). Balance = stage or work order value − paid.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
