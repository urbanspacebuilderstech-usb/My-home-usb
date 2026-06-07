import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ChevronRight,
  ArrowLeft,
  ClipboardList,
  Banknote,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Calendar,
  Users,
  Plus,
  IndianRupee,
  Lock,
  Unlock,
  FileClock,
  ShieldCheck,
  Wallet,
  CheckCheck,
  Hourglass,
  Trash2,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RABDetailDialog } from './RABDetailDialog';
import WORABTab from './WORABTab';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

const DAY_OPTIONS = [
  { value: '0.5', label: '½ Day' },
  { value: '1', label: 'Full' },
  { value: '1.5', label: '1½ (OT)' },
];

const FIXED_LABOUR_ROWS = [
  { type: 'skilled', label: 'Skilled' },
  { type: 'semi_skilled', label: 'Semi-Skilled' },
  { type: 'unskilled', label: 'Unskilled' },
];

// Stage payment-request status badges
function prStatusBadge(status) {
  const map = {
    requested: { label: 'Awaiting PM', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
    pm_approved: { label: 'Awaiting QC', cls: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
    qc_approved: { label: 'Awaiting Planning', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
    planning_approved: { label: 'Awaiting Accountant', cls: 'bg-violet-100 text-violet-800 border-violet-300' },
    se_rework: { label: 'Returned — Re-work', cls: 'bg-red-100 text-red-800 border-red-300' },
    approved: { label: 'Paid', cls: 'bg-green-100 text-green-800 border-green-300' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800 border-red-300' },
  };
  return map[status] || { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-300' };
}

// Stage-level status (for top-level row)
function stageStatusBadge(stage) {
  const prs = stage.payment_requests || [];
  const rework = prs.find(pr => pr.status === 'se_rework');
  if (rework) return { label: 'Returned — Re-work', cls: 'bg-red-100 text-red-800 border-red-300' };
  const pending = prs.find(pr => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(pr.status));
  if (pending) return prStatusBadge(pending.status);
  const approved = prs.filter(pr => pr.status === 'approved');
  if (approved.length && (stage.amount_released || 0) >= (stage.amount || 0)) return { label: 'Paid', cls: 'bg-green-100 text-green-800 border-green-300' };
  if (approved.length) return { label: 'Partially Paid', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  if (!stage.is_open) return { label: 'Locked', cls: 'bg-gray-100 text-gray-600 border-gray-300' };
  return { label: 'Active', cls: 'bg-blue-100 text-blue-800 border-blue-300' };
}

export default function SiteEngineerWorkOrdersV2({ projectId }) {
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // selected work order

  const fetchWOs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/projects/${projectId}/work-orders`);
      setWorkOrders(res.data || []);
      // refresh selected reference if open
      if (selected) {
        const fresh = (res.data || []).find(w => w.work_order_id === selected.work_order_id);
        if (fresh) setSelected(fresh);
      }
    } catch {
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWOs(); /* eslint-disable-next-line */ }, [projectId]);

  // Poll for "Stage Opened" notifications and surface as toast
  useEffect(() => {
    let lastSeen = new Set();
    let alive = true;
    const tick = async () => {
      try {
        const res = await axios.get(`${API}/notifications?unread=true`);
        const list = res.data?.notifications || res.data || [];
        for (const n of list) {
          if (n.title === 'Stage Opened' && n.notification_id && !lastSeen.has(n.notification_id)) {
            lastSeen.add(n.notification_id);
            toast.success(n.message, { duration: 7000 });
            // refresh WO list so the newly opened stage shows immediately
            fetchWOs();
          }
        }
      } catch { /* silent */ }
    };
    tick();
    const id = setInterval(() => { if (alive) tick(); }, 20000);
    return () => { alive = false; clearInterval(id); };
    /* eslint-disable-next-line */
  }, [projectId]);

  // Group work orders by contractor type
  const grouped = useMemo(() => {
    const g = {};
    for (const wo of workOrders) {
      const type = wo.contractor_type || 'General';
      if (!g[type]) g[type] = [];
      g[type].push(wo);
    }
    return g;
  }, [workOrders]);

  if (loading && workOrders.length === 0) {
    return (
      <Card><CardContent className="p-10 text-center text-gray-400">
        <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" /><p className="text-sm">Loading work orders...</p>
      </CardContent></Card>
    );
  }

  if (workOrders.length === 0) {
    return (
      <Card><CardContent className="p-10 text-center text-gray-400">
        <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No work orders assigned to this project yet</p>
      </CardContent></Card>
    );
  }

  // ==== DETAIL VIEW ====
  if (selected) {
    return <WorkOrderDetail wo={selected} projectId={projectId} onBack={() => setSelected(null)} onChange={fetchWOs} />;
  }

  // ==== LIST VIEW: grouped by contractor type ====
  return (
    <div className="space-y-4" data-testid="se-wov2-list">
      {Object.entries(grouped).map(([type, list]) => (
        <Card key={type} className="overflow-hidden">
          <div className="bg-gradient-to-r from-amber-100 to-amber-50 border-b border-amber-200 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide" data-testid={`type-header-${type}`}>{type}</h3>
              <Badge variant="outline" className="bg-white text-amber-700 border-amber-300 text-[10px]">
                {list.length} {list.length === 1 ? 'contractor' : 'contractors'}
              </Badge>
            </div>
          </div>
          <div className="divide-y">
            {list.map(wo => {
                return (
                <div
                  key={wo.work_order_id}
                  className="px-4 py-3 hover:bg-amber-50/50 cursor-pointer flex items-center gap-3 transition-colors"
                  onClick={() => setSelected(wo)}
                  data-testid={`wov2-row-${wo.work_order_id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{wo.contractor_name}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-100" data-testid={`wov2-view-${wo.work_order_id}`}>
                    <Eye className="h-3 w-3" /> View
                  </Button>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// =====================================================================
// Detail view: header + DLR button + tabs (Scope / Payment Schedule / DLR Report)
// =====================================================================
function WorkOrderDetail({ wo, projectId, onBack, onChange }) {
  const [tab, setTab] = useState('payments');
  const [dlrPopupOpen, setDlrPopupOpen] = useState(false);
  const [stageDialog, setStageDialog] = useState(null); // selected stage for detail dialog
  const [suspenseBalance, setSuspenseBalance] = useState(0);
  // RAB Bill Detail popup launched from the new "Total RAB's" tab.
  const [rabView, setRabView] = useState({ open: false, requestId: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!wo?.contractor_id) return;
      try {
        const res = await axios.get(`${API}/contractors/${wo.contractor_id}/suspense`);
        if (alive) setSuspenseBalance(res.data?.balance || 0);
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, [wo?.contractor_id, wo?.paid_amount]);

  return (
    <div className="space-y-3" data-testid="wov2-detail">
      {/* Header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-white border-b border-amber-200 p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} data-testid="wov2-back-btn">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">{wo.contractor_name}</h2>
                <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[10px]">{wo.contractor_type || 'General'}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{wo.description || 'Work Order'}</p>
            </div>
            <Button
              className="bg-teal-600 hover:bg-teal-700 h-8 text-xs gap-1 shrink-0"
              onClick={() => setDlrPopupOpen(true)}
              data-testid="wov2-dlr-record-btn"
            >
              <Plus className="h-3 w-3" /> DLR
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="payments" data-testid="wov2-tab-payments">Payment Schedule Stages</TabsTrigger>
          <TabsTrigger value="rab" data-testid="wov2-tab-rab" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">{"Total RAB's"}</TabsTrigger>
          <TabsTrigger value="scope" data-testid="wov2-tab-scope">Scope of Work</TabsTrigger>
          <TabsTrigger value="dlr" data-testid="wov2-tab-dlr">DLR Report</TabsTrigger>
        </TabsList>

        {/* SCOPE TAB */}
        <TabsContent value="scope" className="mt-3">
          <Card>
            <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">Scope of Work</CardTitle></CardHeader>
            <CardContent className="p-0">
              {(!wo.scope_items || wo.scope_items.length === 0) ? (
                <p className="text-center text-xs text-gray-400 py-8">No scope items</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-t">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600">Item</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-600 w-20">Qty</th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600 w-24">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {wo.scope_items.map((s, i) => (
                        <tr key={i} className="hover:bg-gray-50" data-testid={`wov2-scope-row-${i}`}>
                          <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                          <td className="px-3 py-2 text-right">{s.quantity}</td>
                          <td className="px-3 py-2 text-gray-600">{s.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Additional Work, if any */}
              {(wo.additional_work && wo.additional_work.length > 0) && (
                <div className="border-t mt-2">
                  <div className="px-3 py-2 bg-blue-50 border-b">
                    <h4 className="text-xs font-semibold text-blue-900">Additional Work</h4>
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y">
                      {wo.additional_work.map((a, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">{a.description}</td>
                          <td className="px-3 py-1.5 text-right w-20">{a.quantity}</td>
                          <td className="px-3 py-1.5 text-gray-600 w-24">{a.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENT SCHEDULE TAB */}
        <TabsContent value="payments" className="mt-3">
          <PaymentScheduleTab wo={wo} suspenseBalance={suspenseBalance} onClickStage={(stage) => setStageDialog(stage)} />
        </TabsContent>

        {/* DLR REPORT TAB */}
        <TabsContent value="dlr" className="mt-3">
          <DLRReportTab projectId={projectId} workOrderId={wo.work_order_id} />
        </TabsContent>

        {/* TOTAL RAB'S TAB — same component the Super Admin sees in
            ProjectDetail. Shows All / Released / Requested sub-tabs with the
            full RAB ladder. Clicking the Eye opens the RAB Bill Detail popup
            (downloadable PDF, DLR Report tab, Total RAB's drill-down). */}
        <TabsContent value="rab" className="mt-3">
          <WORABTab
            projectId={projectId}
            workOrder={wo}
            onOpenRabView={(requestId) => setRabView({ open: true, requestId })}
          />
        </TabsContent>
      </Tabs>

      {/* RAB Bill Detail popup (shared with the SE stage popup). */}
      <RABDetailDialog
        open={rabView.open}
        onOpenChange={(v) => setRabView({ open: v, requestId: v ? rabView.requestId : null })}
        projectId={projectId}
        workOrderId={wo.work_order_id}
        highlightRequestId={rabView.requestId}
      />

      {/* DLR Record Popup */}
      <DLRRecordDialog
        open={dlrPopupOpen}
        onOpenChange={setDlrPopupOpen}
        projectId={projectId}
        workOrder={wo}
        onSaved={() => { setDlrPopupOpen(false); onChange(); }}
      />

      {/* Stage Detail / Request Payment Dialog */}
      <StageRequestDialog
        stage={stageDialog}
        wo={wo}
        projectId={projectId}
        suspenseBalance={suspenseBalance}
        onClose={() => setStageDialog(null)}
        onSaved={() => { setStageDialog(null); onChange(); }}
      />
    </div>
  );
}

// =====================================================================
// Payment Schedule Tab: compact list — title + status + View button
// =====================================================================
// Lifecycle filter cards. A single stage may legitimately match multiple
// buckets — e.g. Week 01 can have a ₹50K pm_approved request (Planning queue)
// AND a ₹1L planning_approved request (Accountant queue) simultaneously. So
// `bucketsForStage` returns an ARRAY of bucket keys, and counts/filtering use
// any-match semantics.
const STAGE_BUCKETS = [
  { key: 'all',      label: 'All Stages',         Icon: ClipboardList, color: 'violet',  pillBg: 'bg-violet-50 border-violet-200 text-violet-700',   activeBg: 'bg-violet-600 text-white border-violet-600' },
  { key: 'open',     label: 'Open Stage',         Icon: Unlock,        color: 'green',   pillBg: 'bg-green-50 border-green-200 text-green-700',     activeBg: 'bg-green-600 text-white border-green-600' },
  { key: 'locked',   label: 'Locked Stages',      Icon: Lock,          color: 'gray',    pillBg: 'bg-gray-50 border-gray-200 text-gray-700',        activeBg: 'bg-gray-700 text-white border-gray-700' },
  { key: 'request',  label: 'Request Stage',      Icon: FileClock,     color: 'amber',   pillBg: 'bg-amber-50 border-amber-200 text-amber-700',     activeBg: 'bg-amber-600 text-white border-amber-600' },
  { key: 'planning', label: 'Planning Approve',   Icon: ShieldCheck,   color: 'orange',  pillBg: 'bg-orange-50 border-orange-200 text-orange-700',  activeBg: 'bg-orange-600 text-white border-orange-600' },
  { key: 'accountant', label: 'Accountant Approve', Icon: Wallet,      color: 'indigo',  pillBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',  activeBg: 'bg-indigo-600 text-white border-indigo-600' },
  { key: 'paid_pending_work', label: 'Paid · Work Pending', Icon: Hourglass, color: 'sky',  pillBg: 'bg-sky-50 border-sky-200 text-sky-700',          activeBg: 'bg-sky-600 text-white border-sky-600' },
  { key: 'work_pending_payment', label: 'Work Done · Pay Pending', Icon: Hourglass, color: 'fuchsia', pillBg: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700', activeBg: 'bg-fuchsia-600 text-white border-fuchsia-600' },
  { key: 'finished', label: 'Finished Stages',    Icon: CheckCheck,    color: 'emerald', pillBg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-600 text-white border-emerald-600' },
];

function bucketsForStage(stage) {
  const prs = stage.payment_requests || [];
  const released = prs.filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
  const stageAmount = stage.amount || 0;
  const fullyPaid = stageAmount > 0 && released >= stageAmount;
  const workComplete = !!stage.work_complete;
  const set = new Set();
  set.add('all');
  // Truly finished requires BOTH payment done AND work complete.
  if ((stage.stage_status === 'finished' || stage.finished_at) && workComplete) {
    set.add('finished');
    return set;
  }
  if (fullyPaid && workComplete) {
    set.add('finished');
    return set;
  }
  // Two intermediate "stuck" buckets
  if (fullyPaid && !workComplete) {
    set.add('paid_pending_work');
    // Don't add other lifecycle buckets — payment is closed; only thing left is work-complete.
    return set;
  }
  if (workComplete && !fullyPaid) {
    set.add('work_pending_payment');
    // Still allow accountant/planning lifecycle as relevant
  }
  // Pending payment request buckets — a stage can be in BOTH planning AND
  // accountant simultaneously when it has multiple in-flight requests.
  const hasPlanning = prs.some(p => ['requested', 'pm_approved', 'qc_approved'].includes(p.status));
  const hasAccountant = prs.some(p => p.status === 'planning_approved');
  if (hasPlanning) set.add('planning');
  if (hasAccountant) set.add('accountant');
  // Non-pending lifecycle: open / request / locked
  if (!stage.is_open) {
    if (stage.open_requested) set.add('request');
    else set.add('locked');
  } else if (!hasPlanning && !hasAccountant && !workComplete) {
    set.add('open');
  }
  return set;
}

function PaymentScheduleTab({ wo, suspenseBalance, onClickStage }) {
  const stages = wo.stages || [];
  const [filterKey, setFilterKey] = useState('all'); // 'all' shows all stages
  const paidStages = stages.filter(s => {
    const released = (s.payment_requests || []).filter(p => p.status === 'approved').reduce((acc, p) => acc + (p.approved_amount || 0), 0);
    return released >= (s.amount || 0) && (s.amount || 0) > 0;
  }).length;

  // Pre-bucket every stage once so cards + list filter share the same logic
  const stageBuckets = useMemo(() => stages.map(s => bucketsForStage(s)), [stages]);
  const counts = useMemo(() => {
    const c = { all: 0, open: 0, locked: 0, request: 0, planning: 0, accountant: 0, finished: 0 };
    stageBuckets.forEach(set => set.forEach(k => { c[k] = (c[k] || 0) + 1; }));
    return c;
  }, [stageBuckets]);
  const visibleStages = useMemo(() => {
    const base = filterKey === 'all'
      ? stages
      : stages.filter((_, i) => stageBuckets[i].has(filterKey));
    // In "All Stages" view, surface OPEN stages first so SE has them at the top.
    // Also keep original order within each group (stable sort).
    if (filterKey === 'all') {
      const indexed = base.map((s, i) => ({ s, i }));
      indexed.sort((a, b) => {
        const ao = a.s.is_open ? 0 : 1;
        const bo = b.s.is_open ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.i - b.i;
      });
      return indexed.map(x => x.s);
    }
    return base;
  }, [filterKey, stages, stageBuckets]);

  return (
    <Card>
      <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4 text-violet-600" /> Stages</CardTitle>
          <CardDescription className="text-[11px] mt-0.5">Approval flow: You → PM → QC → Planning → Accountant</CardDescription>
        </div>
        <Badge variant="outline" className="text-[10px]">{paidStages}/{stages.length} paid</Badge>
      </CardHeader>

      {/* Lifecycle filter cards — click to filter the list. "All Stages" shows everything. */}
      <div className="px-3 pb-2" data-testid="wov2-stage-filter-cards">
        <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
          {STAGE_BUCKETS.map(b => {
            const Icon = b.Icon;
            const active = filterKey === b.key;
            const count = counts[b.key] || 0;
            return (
              <button
                key={b.key}
                onClick={() => setFilterKey(b.key)}
                className={`flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${
                  active ? b.activeBg + ' shadow-sm' : b.pillBg + ' hover:shadow-sm'
                }`}
                data-testid={`wov2-bucket-${b.key}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="leading-tight text-center">{b.label}</span>
                <span className={`text-xs font-bold ${active ? 'text-white' : ''}`}>{count}</span>
              </button>
            );
          })}
        </div>
        {filterKey !== 'all' && (
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-gray-500">Filtered: <span className="font-medium">{STAGE_BUCKETS.find(b => b.key === filterKey)?.label}</span></span>
            <button onClick={() => setFilterKey('all')} className="text-[10px] text-gray-500 hover:text-gray-700 underline" data-testid="wov2-bucket-clear">Clear filter</button>
          </div>
        )}
      </div>

      <CardContent className="p-0">
        {stages.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">No stages defined</p>
        ) : visibleStages.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">No stages match this filter</p>
        ) : (
          <div className="divide-y">
            {visibleStages.map((stage) => {
              const i = stages.indexOf(stage);
              const sb = stageStatusBadge(stage);
              const released = (stage.payment_requests || []).filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
              const pending = (stage.payment_requests || []).filter(p => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0);
              const carryover = stage.carryover_deduction || 0;
              const balance = Math.max(0, (stage.amount || 0) - released - pending - carryover);
              return (
                <div
                  key={stage.stage_id || i}
                  className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-amber-50/40 cursor-pointer"
                  onClick={() => onClickStage(stage)}
                  data-testid={`wov2-stage-row-${stage.stage_id || i}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{i + 1}. {stage.name}</span>
                      {/* Locked stages: title only. SE has no need for status/amount/badge until Planning unlocks. */}
                      {stage.is_open && (
                        <>
                          <Badge variant="outline" className={`text-[10px] ${sb.cls}`}>{sb.label}</Badge>
                          {balance > 0 && (
                            <Badge className="text-[10px] bg-green-100 text-green-800 border-green-300">Open</Badge>
                          )}
                          {carryover > 0 && (
                            <Badge variant="outline" className="text-[9px] bg-orange-50 text-orange-700 border-orange-200">−{fmt(carryover)} carryover</Badge>
                          )}
                        </>
                      )}
                      {!stage.is_open && stage.open_requested && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 animate-pulse">Open Requested</Badge>
                      )}
                      {!stage.is_open && !stage.open_requested && (
                        <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-500 border-gray-300">Locked</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); onClickStage(stage); }}
                    data-testid={`wov2-stage-view-${stage.stage_id || i}`}
                  >
                    <Eye className="h-3 w-3" /> View
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Work-Complete Section — SE marks the work itself complete (separate from payment)
// =====================================================================
// A stage is truly "Finished" only when payment is fully released AND SE has
// explicitly marked the work complete. This component renders the right state
// based on those two flags.
function WorkCompleteSection({ stage, wo, projectId, fullyPaid, onSaved }) {
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const workComplete = !!stage.work_complete;
  const isFinished = fullyPaid && workComplete;

  const submit = async () => {
    if (!remarks.trim()) { toast.error('Please add work-complete remarks'); return; }
    setSubmitting(true);
    try {
      await axios.patch(
        `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/finish`,
        { remarks: remarks.trim() },
      );
      toast.success(fullyPaid ? 'Stage finished' : 'Work marked complete (payment still pending)');
      setOpen(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to mark complete');
    } finally { setSubmitting(false); }
  };

  if (isFinished) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-xs space-y-0.5" data-testid="wov2-stage-finished">
        <p className="font-semibold text-emerald-800 flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5" /> Stage Finished</p>
        {stage.work_complete_remarks && <p className="italic text-emerald-700">"{stage.work_complete_remarks}"</p>}
        {stage.work_complete_at && <p className="text-[10px] text-emerald-700">{fmtDate(stage.work_complete_at)} · by {stage.work_complete_by_name || 'SE'}</p>}
      </div>
    );
  }

  return (
    <>
      <div className={`rounded p-2.5 border text-xs space-y-1.5 ${
        workComplete ? 'bg-fuchsia-50 border-fuchsia-200' : (fullyPaid ? 'bg-sky-50 border-sky-200' : 'bg-gray-50 border-gray-200')
      }`} data-testid="wov2-work-complete-section">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Hourglass className={`h-3.5 w-3.5 ${workComplete ? 'text-fuchsia-700' : (fullyPaid ? 'text-sky-700' : 'text-gray-600')}`} />
            <span className={`font-semibold ${workComplete ? 'text-fuchsia-800' : (fullyPaid ? 'text-sky-800' : 'text-gray-700')}`}>
              {workComplete && !fullyPaid ? 'Work Done · Payment Pending' :
               fullyPaid && !workComplete ? 'Paid in Full · Work Pending' : 'Work in progress'}
            </span>
          </div>
          {!workComplete && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setOpen(true)}
              data-testid="wov2-mark-work-complete"
            >
              <CheckCheck className="h-3 w-3" /> Mark Work Complete
            </Button>
          )}
        </div>
        {workComplete && stage.work_complete_remarks && (
          <p className="italic text-fuchsia-700 text-[11px]">"{stage.work_complete_remarks}"</p>
        )}
        {fullyPaid && !workComplete && (
          <p className="text-[10px] text-sky-700">Payment is fully released. Click "Mark Work Complete" with remarks to move this stage to Finished.</p>
        )}
        {workComplete && !fullyPaid && (
          <p className="text-[10px] text-fuchsia-700">Work is done. Stage will move to Finished automatically once the balance payment is released.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCheck className="h-5 w-5" /> Mark Stage Work Complete
            </DialogTitle>
          </DialogHeader>
          <div className="bg-gray-50 border rounded p-2 text-xs">
            <p className="text-gray-500 text-[10px] uppercase">Stage</p>
            <p className="font-semibold">{stage.name}</p>
          </div>
          <div>
            <Label className="text-xs font-semibold">Work-Complete Remarks *</Label>
            <Textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Describe the completed work (e.g. centering removed, slab cured, ready for next stage)"
              className="text-sm mt-1"
              data-testid="wov2-work-complete-remarks"
            />
          </div>
          {!fullyPaid && (
            <div className="bg-fuchsia-50 border border-fuchsia-200 rounded p-2 text-[11px] text-fuchsia-700">
              ⚠ Payment is not yet fully released. After marking complete, this stage will move to <span className="font-semibold">"Work Done · Pay Pending"</span>. It will become Finished once the balance is released.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting} data-testid="wov2-work-complete-confirm">
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Saving…' : 'Confirm Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// (Request-Open section removed — Site Engineers no longer raise open
// requests from this UI; Planning owns the stage-open workflow entirely.)
// =====================================================================
function StageRequestDialog({ stage, wo, projectId, suspenseBalance, onClose, onSaved }) {
  const [subTab, setSubTab] = useState('totalrab');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // Billing window for the RAB — From auto-fills (stage open date for RAB-01,
  // last RAB's to_date + 1 for subsequent), To is always manual.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dlrPreview, setDlrPreview] = useState(null); // { rows, totals, ... }
  const [dlrLoading, setDlrLoading] = useState(false);
  // Optional commentary when the RAB amount differs from the summed DLR cost.
  // Reference-only — never validated, never required.
  const [excessReason, setExcessReason] = useState('');
  // RAB detail popup — opens when SE clicks "View" on a Payment Summary row.
  const [rabView, setRabView] = useState({ open: false, requestId: null });

  // Delete a single payment_request row from the stage's history. Backend
  // enforces permission (PM/Planning/Accountant/Super Admin) and refuses to
  // delete rows that have already been Accountant-released (those need to
  // be reversed via the cashbook).
  const deletePR = async (pr) => {
    if (!window.confirm(`Delete this ${pr.rab_number || 'payment request'} entry of ₹${(pr.approved_amount || pr.amount || 0).toLocaleString('en-IN')}? This cannot be undone.`)) return;
    setDeletingId(pr.request_id);
    try {
      await axios.delete(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/payment-requests/${pr.request_id}`);
      toast.success('Payment request deleted');
      onSaved && onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (stage) {
      const rework = (stage.payment_requests || []).find(p => p.status === 'se_rework');
      setAmount(rework ? String(rework.amount || '') : '');
      setNotes(rework ? (rework.notes || '') : '');
      // Default sub-tab priority: Request RAB (if stage is open & no rejections
      // to clear first), else Total RAB's history.
      const hasReleased = (stage.payment_requests || []).some(p => p.status === 'approved');
      if (stage.is_open && !hasReleased) {
        setSubTab('request');
      } else {
        setSubTab('totalrab');
      }
      // Auto-fill the From Date for the new/resubmit RAB:
      //   • RAB-01 (no prior requests on this stage)  → stage.opened_at
      //   • RAB-02+                                    → max(to_date) of prior + 1 day
      //   • Resubmit                                   → keep the RAB's existing dates
      const toISODate = (v) => {
        if (!v) return '';
        try { return new Date(v).toISOString().slice(0, 10); } catch { return ''; }
      };
      const addDays = (yyyy_mm_dd, n) => {
        if (!yyyy_mm_dd) return '';
        const d = new Date(yyyy_mm_dd + 'T00:00:00');
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      if (rework) {
        setFromDate(toISODate(rework.from_date) || toISODate(stage.opened_at));
        setToDate(toISODate(rework.to_date));
        setExcessReason(rework.excess_dlr_reason || '');
      } else {
        const priorWithTo = (stage.payment_requests || [])
          .filter(p => p.to_date)
          .sort((a, b) => (b.to_date || '').localeCompare(a.to_date || ''));
        if (priorWithTo.length > 0) {
          setFromDate(addDays(toISODate(priorWithTo[0].to_date), 1));
        } else {
          setFromDate(toISODate(stage.opened_at));
        }
        setToDate('');
        setExcessReason('');
      }
      setDlrPreview(null);
    }
  }, [stage]);

  // Re-fetch DLR preview whenever both dates are valid and in the right order.
  useEffect(() => {
    if (!stage || !fromDate || !toDate) { setDlrPreview(null); return; }
    if (fromDate > toDate) { setDlrPreview(null); return; }
    let cancelled = false;
    (async () => {
      setDlrLoading(true);
      try {
        const r = await axios.get(
          `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/dlrs-for-rab`,
          { params: { from_date: fromDate, to_date: toDate } }
        );
        if (!cancelled) setDlrPreview(r.data);
      } catch {
        if (!cancelled) setDlrPreview(null);
      } finally {
        if (!cancelled) setDlrLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromDate, toDate, stage, projectId, wo]);

  if (!stage) return null;

  const released = (stage.payment_requests || []).filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
  const pending = (stage.payment_requests || []).filter(p => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0);
  const carryover = stage.carryover_deduction || 0;
  const balance = Math.max(0, (stage.amount || 0) - released - pending - carryover);
  const allRequests = stage.payment_requests || [];
  const reworkPR = allRequests.find(p => p.status === 'se_rework');

  const submit = async () => {
    const amt = parseFloat(amount || 0);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!stage.is_open) { toast.error('Stage is not yet opened by Planning'); return; }
    if (fromDate && toDate && fromDate > toDate) { toast.error('From Date must be before To Date'); return; }
    // Hard cap: SE may raise multiple RABs but the total across them can
    // never exceed the stage amount. The cap excludes the current rework
    // row from the pending tally so resubmits are still allowed up to cap.
    const capCeiling = reworkPR ? (balance + (reworkPR.amount || 0)) : balance;
    if (amt > capCeiling + 0.01) {
      toast.error(`Amount ${fmt(amt)} exceeds remaining stage balance ${fmt(capCeiling)} (Total ${fmt(stage.amount || 0)})`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        amount: amt,
        notes,
        from_date: fromDate || null,
        to_date: toDate || null,
        excess_dlr_reason: excessReason || null,
      };
      if (reworkPR) {
        // Resubmit the existing rejected RAB rather than create a new one
        await axios.post(
          `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/payment-requests/${reworkPR.request_id}/se-resubmit`,
          payload,
        );
        toast.success(`${reworkPR.rab_number || 'RAB'} resubmitted — awaiting PM review`);
      } else {
        const res = await axios.patch(
          `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/request-payment`,
          payload,
        );
        toast.success(`${res.data?.rab_number || 'RAB'} submitted — awaiting PM review`);
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit RAB');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!stage} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="wov2-stage-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">{stage.name}</DialogTitle>
          <DialogDescription className="text-xs">{wo.contractor_name} ({wo.contractor_type || '—'})</DialogDescription>
        </DialogHeader>

        {/* Summary cards — only shown for open stages. Locked stages keep amounts hidden;
            SE only sees the "Request Open" form below. */}
        {stage.is_open && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <div className="bg-gray-50 border rounded px-2 py-1.5">
                <p className="text-[9px] text-gray-500 uppercase">Total</p>
                <p className="text-xs font-bold text-gray-900">{fmt(stage.amount || 0)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                <p className="text-[9px] text-blue-600 uppercase">Balance</p>
                <p className="text-xs font-bold text-blue-800">{fmt(balance)}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5">
                <p className="text-[9px] text-green-600 uppercase">Released</p>
                <p className="text-xs font-bold text-green-800">{fmt(released)}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <p className="text-[9px] text-amber-600 uppercase">Extra</p>
                <p className="text-xs font-bold text-amber-800">{fmt(suspenseBalance || 0)}</p>
              </div>
            </div>
            {(carryover > 0 || pending > 0) && (
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {pending > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <p className="text-[9px] text-amber-600 uppercase">In Pipeline</p>
                    <p className="text-xs font-bold text-amber-800">{fmt(pending)}</p>
                  </div>
                )}
                {carryover > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded px-2 py-1">
                    <p className="text-[9px] text-orange-600 uppercase">Carryover Deduction</p>
                    <p className="text-xs font-bold text-orange-800">−{fmt(carryover)}</p>
                  </div>
                )}
              </div>
            )}
            {/* Work-complete status indicator + Mark-Complete trigger */}
            <WorkCompleteSection
              stage={stage}
              wo={wo}
              projectId={projectId}
              fullyPaid={(stage.amount || 0) > 0 && released >= (stage.amount || 0)}
              onSaved={onSaved}
            />
          </>
        )}

        {/* Sub-tabs — Request RAB first (primary action), then the comprehensive
            Total RAB's history (released bills with full RAB-card UI), then any
            Pending RAB chips that are still in-flight. */}
        <div className="flex gap-1 border-b">
          {stage.is_open && (
            <button
              onClick={() => setSubTab('request')}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${subTab === 'request' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-amber-700'}`}
              data-testid="wov2-subtab-request"
            >
              {reworkPR ? `Resubmit ${reworkPR.rab_number || 'RAB'}` : 'Request RAB'}
            </button>
          )}
          <button
            onClick={() => setSubTab('totalrab')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${subTab === 'totalrab' ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-violet-700'}`}
            data-testid="wov2-subtab-totalrab"
          >
            {"Total RAB's"} {allRequests.length > 0 && <span className="ml-1 text-[10px] opacity-70">({allRequests.length})</span>}
          </button>
          {/* Pending RAB — every request that's not yet released (in-flight)
              and not rejected. Lets SE see what's awaiting PM/QC/Planning/
              Accountant in one glance, with the would-be RAB-XX number. */}
          {(() => {
            const pending = allRequests.filter(p => !['approved', 'rejected', 'accountant_rejected'].includes(p.status));
            if (pending.length === 0) return null;
            return (
              <button
                onClick={() => setSubTab('pending')}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${subTab === 'pending' ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-500 hover:text-orange-700'}`}
                data-testid="wov2-subtab-pending"
              >
                Pending RAB <span className="ml-1 text-[10px] opacity-70">({pending.length})</span>
              </button>
            );
          })()}
        </div>

        {/* Pending RAB sub-tab — same row UI as Payment Summary but only
            in-flight items (status not approved/rejected). Numbers still
            follow the global "skip rejected" sequence so SE knows what
            number this RAB will get once Accountant releases. */}
        {subTab === 'pending' && (() => {
          // Build the same skip-rejected display number sequence used by the
          // backend (POSITION-among-non-rejected, oldest→newest). Then keep
          // only the still-in-flight rows.
          const REJECTED = new Set(['rejected', 'accountant_rejected', 'se_rework_rejected']);
          const sorted = allRequests.slice().sort((a, b) =>
            String(a.requested_at || '').localeCompare(String(b.requested_at || ''))
          );
          let nextNo = 0;
          const labeled = sorted.map(p => {
            if (REJECTED.has(p.status)) return { ...p, displayRab: '—' };
            nextNo += 1;
            return { ...p, displayRab: `RAB-${String(nextNo).padStart(2, '0')}` };
          });
          const pending = labeled.filter(p => !['approved', 'rejected', 'accountant_rejected'].includes(p.status));
          if (pending.length === 0) {
            return (
              <div className="py-6 text-center text-xs text-gray-400" data-testid="wov2-pending-empty">
                No pending RABs — everything is either released or returned.
              </div>
            );
          }
          return (
            <div className="space-y-2 pt-2" data-testid="wov2-pending-list">
              {pending.map(pr => {
                const sb = prStatusBadge(pr.status);
                return (
                  <div key={pr.request_id} className="border border-orange-200 bg-orange-50/30 rounded p-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge className="bg-violet-600 text-white border-violet-700 font-bold text-[10px] px-2 py-0.5 shrink-0">
                          {pr.displayRab}
                        </Badge>
                        <div className="min-w-0">
                          <p className="font-bold">{fmt(pr.amount)}
                            {pr.original_amount && pr.original_amount !== pr.amount && (
                              <span className="text-[10px] text-gray-500 ml-1.5">(req {fmt(pr.original_amount)})</span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-500">{fmtDate(pr.requested_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[9px] ${sb.cls}`}>{sb.label}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] text-violet-700 border-violet-200 hover:bg-violet-50"
                          onClick={() => setRabView({ open: true, requestId: pr.request_id })}
                          data-testid={`wov2-pending-view-${pr.request_id}`}
                        >
                          <Eye className="h-3 w-3 mr-0.5" /> View
                        </Button>
                      </div>
                    </div>
                    {pr.notes && (
                      <p className="mt-1 text-[10px] italic text-gray-600 line-clamp-2">"{pr.notes}"</p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {subTab === 'request' && (
          <div className="space-y-2.5 pt-1" data-testid="wov2-request-form">
            {reworkPR && (
              <div className="bg-red-50 border border-red-200 rounded p-2.5 text-xs space-y-1" data-testid="wov2-rework-banner">
                <p className="font-semibold text-red-800 flex items-center gap-1">
                  <Send className="h-3 w-3" /> {reworkPR.rab_number || 'RAB'} returned for re-work
                </p>
                {reworkPR.rejection_reason && (
                  <p className="text-red-700">PM Note: <span className="italic">"{reworkPR.rejection_reason}"</span></p>
                )}
                {reworkPR.rejected_by_name && (
                  <p className="text-[10px] text-red-700">By {reworkPR.rejected_by_name} · {fmtDate(reworkPR.rejected_at)}</p>
                )}
                <p className="text-[10px] text-red-700 mt-1">Update the amount/notes below and resubmit. It will go back to PM → QC → Planning → Accountant.</p>
              </div>
            )}
            <div>
              <Label className="text-xs font-semibold">Amount (₹) *</Label>
              <Input
                type="number"
                min="1"
                max={reworkPR ? (balance + (reworkPR.amount || 0)) : balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 25000"
                disabled={submitting}
                className="mt-1"
                data-testid="wov2-rab-amount"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                Stage balance: <span className={parseFloat(amount || 0) > (reworkPR ? balance + (reworkPR.amount || 0) : balance) + 0.01 ? 'text-red-600 font-bold' : 'text-gray-700 font-semibold'}>{fmt(reworkPR ? balance + (reworkPR.amount || 0) : balance)}</span> · Total: {fmt(stage.amount || 0)}
              </p>
              {parseFloat(amount || 0) > (reworkPR ? balance + (reworkPR.amount || 0) : balance) + 0.01 && (
                <p className="text-[10px] text-red-600 mt-0.5 font-medium" data-testid="wov2-cap-warn">
                  ⚠ Cannot exceed remaining stage balance. Sum of all RABs must stay within stage total.
                </p>
              )}
            </div>

            {/* Billing window — From auto-fills (stage opened / next-day after
                last RAB), To is always SE-picked. Once both dates are valid we
                fetch the DLR roll-up below as a billing reference for PM. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> From Date
                  <span className="text-[9px] font-normal text-gray-400 ml-1">(auto-filled)</span>
                </Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  disabled={submitting}
                  className="mt-1 h-9 text-xs"
                  data-testid="wov2-rab-from-date"
                />
                <p className="text-[9px] text-gray-500 mt-0.5">
                  {allRequests.filter(p => p.to_date).length > 0
                    ? "Auto: day after last RAB's To Date"
                    : "Auto: stage open date"}
                </p>
              </div>
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> To Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  disabled={submitting}
                  className="mt-1 h-9 text-xs"
                  data-testid="wov2-rab-to-date"
                />
                <p className="text-[9px] text-gray-500 mt-0.5">Manual selection</p>
              </div>
            </div>

            {/* DLR Report — loaded once both dates are set. Shows every DLR in
                the window with skilled / semi-skilled / unskilled headcounts
                and an Eye affordance to inspect the full report. */}
            {fromDate && toDate && fromDate <= toDate && (
              <div className="border rounded-lg p-2 bg-indigo-50/30 border-indigo-200" data-testid="wov2-dlr-preview">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
                    <ClipboardList className="h-3 w-3" /> DLR Report for this Billing Window
                  </Label>
                  {dlrPreview && (
                    <span className="text-[9px] text-indigo-700 font-medium">
                      {dlrPreview.days_with_dlr} / {dlrPreview.total_days_in_range} days
                    </span>
                  )}
                </div>
                {dlrLoading ? (
                  <p className="text-[11px] text-gray-500 text-center py-2">Loading DLRs…</p>
                ) : (!dlrPreview || dlrPreview.rows.length === 0) ? (
                  <p className="text-[11px] text-gray-500 text-center py-3" data-testid="wov2-dlr-empty">
                    No DLR records in this window.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded border border-indigo-200 bg-white">
                      <table className="w-full text-[10px]">
                        <thead className="bg-indigo-100 text-indigo-900">
                          <tr>
                            <th className="px-1.5 py-1 text-left">Date</th>
                            <th className="px-1 py-1 text-left">Day</th>
                            <th className="px-1 py-1 text-center" title="Skilled">Skilled</th>
                            <th className="px-1 py-1 text-center" title="Semi-Skilled">Semi-Skilled</th>
                            <th className="px-1 py-1 text-center" title="Unskilled">Unskilled</th>
                            <th className="px-1 py-1 text-center font-bold">Workers</th>
                            <th className="px-1 py-1 text-right font-bold">Day Total</th>
                            <th className="px-1 py-1 text-center">View</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dlrPreview.rows.map((r) => {
                            // Cell renderer for one skill bucket — shows
                            // "count × ₹rate = ₹amount" stacked for fast read.
                            const cell = (count, rate, amount, colour) => (
                              count > 0 ? (
                                <div className="leading-tight">
                                  <p className={`font-bold ${colour}`}>{count} × {fmt(rate)}</p>
                                  <p className="text-emerald-700 font-semibold text-[9px]">= {fmt(amount)}</p>
                                </div>
                              ) : <span className="text-gray-300">—</span>
                            );
                            return (
                            <tr key={r.report_id} className="border-t border-indigo-100" data-testid={`wov2-dlr-row-${r.report_id}`}>
                              <td className="px-1.5 py-1 font-medium text-gray-800">
                                {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="px-1 py-1 text-gray-600">
                                {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                              </td>
                              <td className="px-1 py-1 text-center">{cell(r.skilled, r.skilled_rate, r.skilled_cost, 'text-indigo-700')}</td>
                              <td className="px-1 py-1 text-center">{cell(r.semi_skilled, r.semi_skilled_rate, r.semi_skilled_cost, 'text-blue-700')}</td>
                              <td className="px-1 py-1 text-center">{cell(r.unskilled, r.unskilled_rate, r.unskilled_cost, 'text-amber-700')}</td>
                              <td className="px-1 py-1 text-center font-bold text-gray-900">{r.total_workers}</td>
                              <td className="px-1 py-1 text-right font-bold text-emerald-700">{fmt(r.total_cost)}</td>
                              <td className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  className="text-violet-600 hover:text-violet-800"
                                  title={`View DLR for ${r.date}`}
                                  data-testid={`wov2-dlr-view-${r.report_id}`}
                                  onClick={() => {
                                    const lines = (r.entries || []).map(e => `• ${e.type}: ${e.count} × ₹${e.rate || 0}/day = ₹${(e.count * (e.rate || 0)).toLocaleString('en-IN')}`).join('\n');
                                    window.alert(`DLR ${r.date}\nReported by: ${r.reported_by_name || '—'}\n\n${r.notes ? r.notes + '\n\n' : ''}${lines}\n\nTotal: ${r.total_workers} workers · ${fmt(r.total_cost)}`);
                                  }}
                                >
                                  <Eye className="h-3 w-3 inline" />
                                </button>
                              </td>
                            </tr>
                            );
                          })}
                          {/* Grand Total — counts, totals per bucket and the
                              overall sum across the picked billing window. */}
                          <tr className="bg-indigo-50 border-t-2 border-indigo-300 font-bold">
                            <td className="px-1.5 py-1 text-indigo-900" colSpan={2}>
                              Total · {dlrPreview.days_with_dlr}/{dlrPreview.total_days_in_range} day{dlrPreview.total_days_in_range === 1 ? '' : 's'}
                            </td>
                            <td className="px-1 py-1 text-center">
                              <div className="leading-tight">
                                <p className="text-indigo-800">{dlrPreview.totals.skilled}</p>
                                <p className="text-emerald-700 font-semibold text-[9px]">{fmt(dlrPreview.totals.skilled_cost)}</p>
                              </div>
                            </td>
                            <td className="px-1 py-1 text-center">
                              <div className="leading-tight">
                                <p className="text-blue-800">{dlrPreview.totals.semi_skilled}</p>
                                <p className="text-emerald-700 font-semibold text-[9px]">{fmt(dlrPreview.totals.semi_skilled_cost)}</p>
                              </div>
                            </td>
                            <td className="px-1 py-1 text-center">
                              <div className="leading-tight">
                                <p className="text-amber-800">{dlrPreview.totals.unskilled}</p>
                                <p className="text-emerald-700 font-semibold text-[9px]">{fmt(dlrPreview.totals.unskilled_cost)}</p>
                              </div>
                            </td>
                            <td className="px-1 py-1 text-center text-gray-900">{dlrPreview.totals.total_workers}</td>
                            <td className="px-1 py-1 text-right text-emerald-800 text-[11px]">{fmt(dlrPreview.totals.total_cost)}</td>
                            <td />
                          </tr>
                          {/* Dedicated Grand Total banner row — single big
                              figure so PM can verify the billing window. */}
                          <tr className="bg-emerald-50 border-t border-emerald-200">
                            <td colSpan={6} className="px-1.5 py-1.5 text-right font-bold text-emerald-900 uppercase tracking-wider text-[10px]">
                              Grand Total
                            </td>
                            <td className="px-1 py-1.5 text-right font-extrabold text-emerald-800 text-[12px]">{fmt(dlrPreview.totals.total_cost)}</td>
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[9px] text-gray-500">Each cell: workers × per-day rate = amount</span>
                      <button
                        type="button"
                        className="text-[10px] text-indigo-700 hover:underline font-semibold"
                        onClick={() => setAmount(String(Math.round(dlrPreview.totals.total_cost || 0)))}
                        data-testid="wov2-dlr-apply-cost"
                        disabled={!dlrPreview.totals.total_cost}
                      >
                        Use DLR cost as RAB amount ({fmt(dlrPreview.totals.total_cost)})
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* DLR variance banner — purely informational. Shown when the
                RAB amount drifts from the DLR roll-up in the same window.
                Surfaces an optional "reason" textarea so the SE can leave a
                quick note for PM (e.g. "weekend overtime", "material
                advance", etc.) but never blocks submit. */}
            {dlrPreview && parseFloat(amount || 0) > 0 && Math.round((dlrPreview.totals.total_cost || 0)) !== Math.round(parseFloat(amount || 0)) && (() => {
              const dlrCost = Math.round(dlrPreview.totals.total_cost || 0);
              const reqAmt = Math.round(parseFloat(amount || 0));
              const diff = reqAmt - dlrCost;
              const isExcess = diff > 0;
              // Static class strings so Tailwind's JIT keeps them in the build.
              const palette = isExcess
                ? { wrap: 'bg-amber-50/60 border-amber-200', title: 'text-amber-800', sub: 'text-amber-700' }
                : { wrap: 'bg-sky-50/60 border-sky-200', title: 'text-sky-800', sub: 'text-sky-700' };
              return (
                <div className={`rounded-lg border p-2 ${palette.wrap}`} data-testid="wov2-dlr-variance">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-[11px] font-bold ${palette.title} flex items-center gap-1`}>
                        {isExcess ? '↑' : '↓'} {isExcess ? 'Excess DLR' : 'Short of DLR'}: {fmt(Math.abs(diff))}
                      </p>
                      <p className={`text-[10px] ${palette.sub} mt-0.5`}>
                        Request {fmt(reqAmt)} {isExcess ? '>' : '<'} DLR roll-up {fmt(dlrCost)}
                      </p>
                    </div>
                  </div>
                  <Label className="text-[10px] font-semibold text-gray-600 mt-1.5 block">
                    Reason <span className="font-normal text-gray-400">(optional · reference only)</span>
                  </Label>
                  <Textarea
                    rows={2}
                    value={excessReason}
                    onChange={(e) => setExcessReason(e.target.value)}
                    placeholder={isExcess ? 'e.g. Sunday overtime, material advance' : 'e.g. Workers absent · partial day'}
                    disabled={submitting}
                    className="text-xs mt-1"
                    data-testid="wov2-excess-reason"
                  />
                </div>
              );
            })()}

            <div>
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="DLR summary, work completed, etc."
                disabled={submitting}
                className="text-sm mt-1"
                data-testid="wov2-rab-notes"
              />
            </div>
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={submit}
              disabled={submitting}
              data-testid="wov2-rab-submit"
            >
              <Send className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Submitting…' : (reworkPR ? 'Resubmit to PM' : 'Submit to PM')}
            </Button>
          </div>
        )}

        {subTab === 'totalrab' && (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1" data-testid="wov2-totalrab-list">
            {allRequests.length === 0 ? (
              <div className="text-center py-8" data-testid="wov2-totalrab-empty">
                <FileText className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">No RABs requested yet for this stage</p>
                {stage.is_open && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs"
                    onClick={() => setSubTab('request')}
                    data-testid="wov2-totalrab-cta-request"
                  >
                    <Send className="h-3 w-3 mr-1" /> Request your first RAB
                  </Button>
                )}
              </div>
            ) : (
              allRequests.slice().reverse().map((pr, i) => {
                const sb = prStatusBadge(pr.status);
                const isReleased = pr.status === 'approved';
                const isRejected = ['rejected', 'accountant_rejected', 'se_rework'].includes(pr.status);
                const rabNum = `RAB-${String((allRequests.length - i)).padStart(2, '0')}`;
                // Step indicators — visual breadcrumb of the approval ladder
                // so the SE can see at a glance where a RAB is stuck.
                const steps = [
                  { key: 'PM',         at: pr.pm_approved_at,        name: pr.pm_approved_by_name },
                  { key: 'QC',         at: pr.qc_approved_at,        name: pr.qc_approved_by_name },
                  { key: 'Planning',   at: pr.planning_approved_at,  name: pr.planning_approved_by_name },
                  { key: 'Accountant', at: pr.released_at,           name: pr.released_by_name },
                ];
                return (
                  <div
                    key={pr.request_id || i}
                    className={`rounded-lg border p-2.5 text-xs ${isReleased ? 'border-emerald-200 bg-emerald-50/30' : isRejected ? 'border-red-200 bg-red-50/30' : 'border-violet-200 bg-violet-50/30'}`}
                    data-testid={`wov2-totalrab-card-${pr.request_id || i}`}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-2 pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge className="bg-violet-600 text-white border-violet-700 font-bold text-[10px] px-2 py-0.5 shrink-0">{rabNum}</Badge>
                        <Badge variant="outline" className={`text-[9px] ${sb.cls}`}>{sb.label}</Badge>
                      </div>
                      <div className="text-right text-[10px] leading-tight">
                        <p className="text-gray-500 uppercase tracking-wider">Requested</p>
                        <p className="text-gray-900 font-semibold">{fmtDate(pr.requested_at)}</p>
                        {pr.released_at && (
                          <>
                            <p className="text-emerald-600 uppercase tracking-wider mt-1">Released</p>
                            <p className="text-emerald-700 font-bold">{fmtDate(pr.released_at)}</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Headline: amount + closing balance hint */}
                    <div className="rounded-md border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-2 mb-2">
                      <p className="text-[9px] uppercase tracking-wider text-orange-700 font-semibold">{isReleased ? 'Released Amount' : 'Requested Amount'}</p>
                      <p className="text-lg sm:text-xl font-extrabold text-orange-700">
                        {fmt(isReleased ? (pr.approved_amount || pr.amount) : pr.amount)}
                      </p>
                      {pr.original_amount && pr.original_amount !== pr.amount && (
                        <p className="text-[10px] text-amber-700 mt-0.5">Planning adjusted from {fmt(pr.original_amount)}</p>
                      )}
                    </div>

                    {/* Mini stats grid */}
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="rounded border border-gray-200 bg-white p-1.5">
                        <p className="text-[8px] text-gray-500 uppercase tracking-wide font-medium">Stage Amount</p>
                        <p className="text-[11px] font-bold text-gray-900">{fmt(stage.amount || 0)}</p>
                      </div>
                      <div className="rounded border border-gray-200 bg-white p-1.5">
                        <p className="text-[8px] text-gray-500 uppercase tracking-wide font-medium">Requested</p>
                        <p className="text-[11px] font-bold text-gray-900">{fmt(pr.amount)}</p>
                      </div>
                      <div className="rounded border border-gray-200 bg-white p-1.5">
                        <p className="text-[8px] text-gray-500 uppercase tracking-wide font-medium">Released</p>
                        <p className={`text-[11px] font-bold ${isReleased ? 'text-emerald-700' : 'text-gray-400'}`}>
                          {isReleased ? fmt(pr.approved_amount || pr.amount) : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Approval ladder chips */}
                    <div className="flex items-center gap-1 flex-wrap mb-2">
                      {steps.map((s) => {
                        const done = !!s.at;
                        return (
                          <span
                            key={s.key}
                            className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ${done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                            title={done ? `${s.key}${s.name ? ` · ${s.name}` : ''} · ${fmtDate(s.at)}` : `Awaiting ${s.key}`}
                          >
                            {done ? <CheckCheck className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                            {s.key}
                          </span>
                        );
                      })}
                    </div>

                    {/* Notes / extras */}
                    {pr.notes && <p className="text-[11px] text-gray-700 mt-1 italic line-clamp-2 border-l-2 border-violet-200 pl-2">{pr.notes}</p>}
                    {pr.planning_change_reason && (
                      <p className="text-[10px] text-amber-700 mt-1">Planning note: {pr.planning_change_reason}</p>
                    )}
                    {pr.overflow_to_next_stage > 0 && (
                      <p className="text-[10px] text-orange-700 mt-1">Overflow {fmt(pr.overflow_to_next_stage)} → {pr.overflow_target_stage_name}</p>
                    )}
                    {pr.rejection_reason && (
                      <p className="text-[10px] text-red-600 mt-1">Rejected: {pr.rejection_reason}</p>
                    )}

                    {/* Footer actions */}
                    <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] text-violet-700 border-violet-200 hover:bg-violet-50"
                        onClick={() => setRabView({ open: true, requestId: pr.request_id })}
                        data-testid={`wov2-pr-view-${pr.request_id || i}`}
                        title={isReleased ? 'View RAB bill (downloadable from popup)' : 'View RAB approval chain'}
                      >
                        <Eye className="h-3 w-3 mr-0.5" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                        onClick={() => deletePR(pr)}
                        disabled={deletingId === pr.request_id}
                        data-testid={`wov2-pr-delete-${pr.request_id || i}`}
                        title="Delete this entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
      {/* RAB ladder popup — opens from "View" on each Payment Summary row. */}
      <RABDetailDialog
        open={rabView.open}
        onOpenChange={(o) => setRabView(v => ({ ...v, open: o }))}
        projectId={projectId}
        workOrderId={wo?.work_order_id}
        highlightRequestId={rabView.requestId}
      />
    </Dialog>
  );
}

// =====================================================================
// DLR Report Tab: accordion list per date
// =====================================================================
function DLRReportTab({ projectId, workOrderId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [popup, setPopup] = useState(null);

  const fetchDLR = async () => {
    setLoading(true);
    try {
      const params = filterDate ? `?date=${filterDate}` : '';
      const res = await axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr${params}`);
      setEntries(res.data || []);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchDLR(); /* eslint-disable-next-line */ }, [projectId, workOrderId, filterDate]);

  // Helper to extract count by labour type
  const countByType = (dlr, type) => {
    const e = (dlr.entries || []).find(x => x.type === type);
    return e ? Number(e.count) || 0 : 0;
  };

  return (
    <Card>
      <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-600" /> Daily Labour Report ({entries.length})</CardTitle>
        <div className="flex items-center gap-1">
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="h-7 text-xs w-[130px]" data-testid="wov2-dlr-filter" />
          {filterDate && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterDate('')}>Clear</Button>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-6">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">No DLR records{filterDate ? ` for ${filterDate}` : ''}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b border-t">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Date</th>
                  <th className="text-center px-2 py-2 font-semibold text-blue-700 w-14">Skilled</th>
                  <th className="text-center px-2 py-2 font-semibold text-amber-700 w-14">Semi</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-700 w-14">Unskilled</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-600 w-16">Total</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600 w-24">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((d) => (
                  <tr
                    key={d.dlr_id}
                    className="hover:bg-teal-50/40 cursor-pointer"
                    onClick={() => setPopup(d)}
                    data-testid={`wov2-dlr-row-${d.dlr_id}`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{fmtDate(d.date)}</td>
                    <td className="px-2 py-2 text-center text-blue-700 font-medium">{countByType(d, 'skilled')}</td>
                    <td className="px-2 py-2 text-center text-amber-700 font-medium">{countByType(d, 'semi_skilled')}</td>
                    <td className="px-2 py-2 text-center text-gray-700 font-medium">{countByType(d, 'unskilled')}</td>
                    <td className="px-2 py-2 text-center font-bold">{d.total_workers || 0}</td>
                    <td className="px-3 py-2 text-right font-semibold text-teal-700">{fmt(d.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-teal-50 border-t-2 border-teal-200">
                <tr>
                  <td className="px-3 py-2 font-bold text-teal-900" colSpan={4}>Total</td>
                  <td className="px-2 py-2 text-center font-bold text-teal-900">{entries.reduce((s, d) => s + (d.total_workers || 0), 0)}</td>
                  <td className="px-3 py-2 text-right font-bold text-teal-900">{fmt(entries.reduce((s, d) => s + (d.total_cost || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      {/* DLR Day Detail popup */}
      <Dialog open={!!popup} onOpenChange={(v) => { if (!v) setPopup(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg" data-testid="wov2-dlr-day-popup">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-600" /> {popup ? fmtDate(popup.date) : ''}
            </DialogTitle>
            <DialogDescription className="text-xs">Detailed Daily Labour Report</DialogDescription>
          </DialogHeader>
          {popup && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-blue-50 border border-blue-200 rounded p-2">
                  <p className="text-blue-700">Workers</p>
                  <p className="font-bold text-blue-900">{popup.total_workers || 0}</p>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded p-2">
                  <p className="text-teal-700">Day Units</p>
                  <p className="font-bold text-teal-900">{popup.total_day_units || 0}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <p className="text-amber-700">Total Cost</p>
                  <p className="font-bold text-amber-900">{fmt(popup.total_cost)}</p>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600">Type</th>
                      <th className="text-center px-3 py-1.5 font-medium text-gray-600">Workers</th>
                      <th className="text-center px-3 py-1.5 font-medium text-gray-600">Day</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600">Rate</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(popup.entries || []).map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 capitalize">{(e.type || '').replace('_', '-')}</td>
                        <td className="px-3 py-1.5 text-center">{e.count}</td>
                        <td className="px-3 py-1.5 text-center">{e.day_value === 0.5 ? '½' : e.day_value === 1.5 ? '1½' : '1'}</td>
                        <td className="px-3 py-1.5 text-right">{fmt(e.rate_per_day)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{fmt(e.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {popup.notes && <p className="text-[11px] text-gray-500 bg-gray-50 border rounded p-2">Note: {popup.notes}</p>}
              <p className="text-[10px] text-gray-400">By {popup.created_by_name || '—'} at {popup.created_at ? new Date(popup.created_at).toLocaleString() : '—'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// =====================================================================
// DLR Record Dialog: opened from "DLR" button at the top corner
// =====================================================================
function DLRRecordDialog({ open, onOpenChange, projectId, workOrder, onSaved }) {
  const rates = workOrder?.labour_rates || {};
  const initRows = () => FIXED_LABOUR_ROWS.map(r => ({
    type: r.type, label: r.label, count: '', day_value: '1',
    rate_per_day: rates[r.type] || 0,
  }));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState(initRows());
  const [notes, setNotes] = useState('');
  const [stageId, setStageId] = useState('');
  const [workSummary, setWorkSummary] = useState('');
  const [projectStages, setProjectStages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().split('T')[0]);
      setRows(initRows());
      setNotes('');
      setStageId('');
      setWorkSummary('');
    }
    /* eslint-disable-next-line */
  }, [open, workOrder?.work_order_id]);

  // Fetch project stages whenever dialog opens
  useEffect(() => {
    if (!open || !projectId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/projects/${projectId}/project-stages`);
        setProjectStages(Array.isArray(res.data) ? res.data : []);
      } catch { setProjectStages([]); }
    })();
  }, [open, projectId]);

  const calcRow = (r) => (Number(r.count) || 0) * (Number(r.day_value) || 1) * (Number(r.rate_per_day) || 0);
  const totalWorkers = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const totalCost = rows.reduce((s, r) => s + calcRow(r), 0);

  const updateRow = (i, field, val) => {
    const nr = [...rows]; nr[i] = { ...nr[i], [field]: val }; setRows(nr);
  };

  const submit = async () => {
    const valid = rows.filter(r => Number(r.count) > 0);
    if (!valid.length) { toast.error('Enter worker count for at least one type'); return; }
    if (!date) { toast.error('Select a date'); return; }
    if (!stageId) { toast.error('Select Current Project Stage'); return; }
    if (!workSummary.trim()) { toast.error('Work Summary is required'); return; }
    const missing = valid.filter(r => !Number(r.rate_per_day));
    if (missing.length) {
      toast.error(`Rate not set for: ${missing.map(r => r.label).join(', ')}. Update Work Order rates.`); return;
    }
    const selectedStage = projectStages.find(s => s.stage_id === stageId);
    setSubmitting(true);
    try {
      await axios.post(`${API}/projects/${projectId}/work-orders/${workOrder.work_order_id}/dlr`, {
        date,
        entries: valid.map(r => ({
          type: r.type, count: Number(r.count),
          day_value: Number(r.day_value), rate_per_day: Number(r.rate_per_day),
        })),
        notes,
        stage_id: stageId,
        stage_name: selectedStage?.stage_name || '',
        work_summary: workSummary.trim(),
      });
      toast.success('DLR & DPR recorded');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save DLR');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="wov2-dlr-popup">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-teal-600" /> Record Daily Labour Report
          </DialogTitle>
          <DialogDescription className="text-xs">{workOrder?.contractor_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm mt-1" data-testid="wov2-dlr-form-date" />
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600 w-[120px]">Type</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-600 w-[90px]">Workers</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-600 w-[110px]">Day</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[100px]">Rate</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600 w-[100px]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.type}>
                    <td className="px-3 py-2 font-medium">{r.label}</td>
                    <td className="px-3 py-2">
                      <Input type="number" min="0" value={r.count} onChange={(e) => updateRow(i, 'count', e.target.value)} className="h-8 text-center text-xs" data-testid={`wov2-dlr-count-${r.type}`} />
                    </td>
                    <td className="px-3 py-2">
                      <Select value={String(r.day_value)} onValueChange={(v) => updateRow(i, 'day_value', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAY_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(r.rate_per_day) > 0 ? <span className="text-xs">{fmt(r.rate_per_day)}</span> : <span className="text-[10px] text-red-500">Not set</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-teal-700">{calcRow(r) > 0 ? fmt(calcRow(r)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-teal-50 border-t">
                <tr>
                  <td className="px-3 py-2 font-bold">Total</td>
                  <td className="px-3 py-2 text-center font-bold">{totalWorkers}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-bold text-teal-700">{fmt(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm mt-1" />
          </div>

          {/* === Daily Progress Report (DPR) fields — unified into DLR === */}
          <div className="border-t pt-3 mt-1 space-y-3 bg-teal-50/30 -mx-6 px-6 py-3">
            <p className="text-[11px] font-semibold text-teal-700 uppercase tracking-wide">Daily Progress Report (DPR)</p>
            <div>
              <Label className="text-xs">Current Project Stage <span className="text-red-500">*</span></Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="mt-1 h-9 text-xs" data-testid="wov2-dlr-form-stage">
                  <SelectValue placeholder={projectStages.length ? "Select current stage..." : "No stages configured for this project"} />
                </SelectTrigger>
                <SelectContent>
                  {projectStages
                    .filter(s => !s.is_section_header)
                    .map((s, idx) => {
                      const code = s.sl_no || `PO${idx + 1}`;
                      return (
                        <SelectItem key={s.stage_id} value={s.stage_id}>
                          {code} {s.stage_name}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Work Summary <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
                placeholder="Describe work done today (e.g. Slab shuttering completed on 2nd floor, brick work continued at level 1...)"
                className="text-sm mt-1"
                data-testid="wov2-dlr-form-work-summary"
              />
            </div>
          </div>

          {(!rates.skilled && !rates.semi_skilled && !rates.unskilled) && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Labour day rates are not set on this Work Order. Ask Planning to update rates so totals auto-fill.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={submitting} onClick={submit} data-testid="wov2-dlr-submit">
            {submitting ? 'Saving...' : 'Save DLR'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
