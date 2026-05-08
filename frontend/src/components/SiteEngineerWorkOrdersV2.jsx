import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ChevronRight, ArrowLeft, ClipboardList, Banknote, Send,
  CheckCircle, Clock, XCircle, Eye, Calendar, Users, Plus, IndianRupee,
  Lock, Unlock, FileClock, ShieldCheck, Wallet, CheckCheck,
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
    pm_approved: { label: 'Awaiting Planning', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
    planning_approved: { label: 'Awaiting Accountant', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
    approved: { label: 'Paid', cls: 'bg-green-100 text-green-800 border-green-300' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800 border-red-300' },
    requested: { label: 'Submitted', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  };
  return map[status] || { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-300' };
}

// Stage-level status (for top-level row)
function stageStatusBadge(stage) {
  const prs = stage.payment_requests || [];
  const pending = prs.find(pr => ['requested', 'pm_approved', 'planning_approved'].includes(pr.status));
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
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="payments" data-testid="wov2-tab-payments">Payment Schedule Stages</TabsTrigger>
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
      </Tabs>

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
// Bucket a stage into one of the 6 lifecycle filter cards.
// Priority order matters: a single stage can match many predicates, so we pick
// the most "actionable" bucket (e.g. an Open stage with a pending Planning
// request shows under "Planning Payment Approve", not "Open").
const STAGE_BUCKETS = [
  { key: 'open',     label: 'Open Stage',         Icon: Unlock,      color: 'green',   ring: 'ring-green-500',   pillBg: 'bg-green-50 border-green-200 text-green-700',     activeBg: 'bg-green-600 text-white border-green-600' },
  { key: 'locked',   label: 'Locked Stages',      Icon: Lock,        color: 'gray',    ring: 'ring-gray-400',    pillBg: 'bg-gray-50 border-gray-200 text-gray-700',        activeBg: 'bg-gray-700 text-white border-gray-700' },
  { key: 'request',  label: 'Request Stage',      Icon: FileClock,   color: 'amber',   ring: 'ring-amber-500',   pillBg: 'bg-amber-50 border-amber-200 text-amber-700',     activeBg: 'bg-amber-600 text-white border-amber-600' },
  { key: 'planning', label: 'Planning Approve',   Icon: ShieldCheck, color: 'orange',  ring: 'ring-orange-500',  pillBg: 'bg-orange-50 border-orange-200 text-orange-700',  activeBg: 'bg-orange-600 text-white border-orange-600' },
  { key: 'accountant', label: 'Accountant Approve', Icon: Wallet,    color: 'indigo',  ring: 'ring-indigo-500',  pillBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',  activeBg: 'bg-indigo-600 text-white border-indigo-600' },
  { key: 'finished', label: 'Finished Stages',    Icon: CheckCheck,  color: 'emerald', ring: 'ring-emerald-500', pillBg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-600 text-white border-emerald-600' },
];

function bucketForStage(stage) {
  const prs = stage.payment_requests || [];
  const released = prs.filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
  const carryover = stage.carryover_deduction || 0;
  const stageAmount = stage.amount || 0;
  const fullyPaid = stageAmount > 0 && released >= stageAmount;
  // Finished if SE marked it finished or fully paid out
  if (stage.stage_status === 'finished' || stage.finished_at || fullyPaid) return 'finished';
  // Pending payment request determines accountant/planning bucket
  const pending = prs.find(p => ['requested', 'pm_approved', 'planning_approved'].includes(p.status));
  if (pending) {
    if (pending.status === 'planning_approved') return 'accountant';
    return 'planning'; // pm_approved or legacy 'requested'
  }
  // No pending request: open / request / locked
  if (!stage.is_open) {
    if (stage.open_requested) return 'request';
    return 'locked';
  }
  // Open with no pending request — actionable
  void carryover;
  return 'open';
}

function PaymentScheduleTab({ wo, suspenseBalance, onClickStage }) {
  const stages = wo.stages || [];
  const [filterKey, setFilterKey] = useState(null); // null = show all
  const paidStages = stages.filter(s => {
    const released = (s.payment_requests || []).filter(p => p.status === 'approved').reduce((acc, p) => acc + (p.approved_amount || 0), 0);
    return released >= (s.amount || 0) && (s.amount || 0) > 0;
  }).length;

  // Pre-bucket every stage once so cards + list filter share the same logic
  const stageBuckets = useMemo(() => stages.map(s => bucketForStage(s)), [stages]);
  const counts = useMemo(() => {
    const c = { open: 0, locked: 0, request: 0, planning: 0, accountant: 0, finished: 0 };
    stageBuckets.forEach(k => { c[k] = (c[k] || 0) + 1; });
    return c;
  }, [stageBuckets]);
  const visibleStages = filterKey
    ? stages.filter((_, i) => stageBuckets[i] === filterKey)
    : stages;

  return (
    <Card>
      <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4 text-violet-600" /> Stages</CardTitle>
          <CardDescription className="text-[11px] mt-0.5">Approval flow: You → Planning → Accountant</CardDescription>
        </div>
        <Badge variant="outline" className="text-[10px]">{paidStages}/{stages.length} paid</Badge>
      </CardHeader>

      {/* Lifecycle filter cards — click to filter the list, click active to clear */}
      <div className="px-3 pb-2" data-testid="wov2-stage-filter-cards">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {STAGE_BUCKETS.map(b => {
            const Icon = b.Icon;
            const active = filterKey === b.key;
            const count = counts[b.key] || 0;
            return (
              <button
                key={b.key}
                onClick={() => setFilterKey(active ? null : b.key)}
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
        {filterKey && (
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-gray-500">Filtered: <span className="font-medium">{STAGE_BUCKETS.find(b => b.key === filterKey)?.label}</span></span>
            <button onClick={() => setFilterKey(null)} className="text-[10px] text-gray-500 hover:text-gray-700 underline" data-testid="wov2-bucket-clear">Clear filter</button>
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
              const pending = (stage.payment_requests || []).filter(p => ['requested', 'pm_approved', 'planning_approved'].includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0);
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
                      <Badge variant="outline" className={`text-[10px] ${sb.cls}`}>{sb.label}</Badge>
                      {stage.is_open && balance > 0 && (
                        <Badge className="text-[10px] bg-green-100 text-green-800 border-green-300">Open</Badge>
                      )}
                      {!stage.is_open && stage.open_requested && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 animate-pulse">Open Requested</Badge>
                      )}
                      {carryover > 0 && (
                        <Badge variant="outline" className="text-[9px] bg-orange-50 text-orange-700 border-orange-200">−{fmt(carryover)} carryover</Badge>
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
// Request-Open section (shown inside Stage popup when stage is locked)
// =====================================================================
function RequestOpenSection({ stage, wo, projectId, onSent }) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const alreadyRequested = !!stage.open_requested;

  const sendRequest = async () => {
    setSubmitting(true);
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/request-open`, { notes });
      toast.success('Open request sent to Planning');
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send open request');
    } finally { setSubmitting(false); }
  };

  if (alreadyRequested) {
    return (
      <div className="text-xs bg-amber-50 border border-amber-200 rounded p-3 space-y-1.5" data-testid="wov2-open-req-pending">
        <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
          <Clock className="h-3.5 w-3.5" /> Open Request Pending
        </div>
        <p className="text-amber-800">Planning has been notified. You'll be alerted when this stage is opened.</p>
        {stage.open_requested_at && (
          <p className="text-[10px] text-amber-700">Requested {fmtDate(stage.open_requested_at)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="wov2-open-req-form">
      <div className="text-xs bg-gray-50 border rounded p-3 text-gray-700">
        <Clock className="h-3.5 w-3.5 inline mr-1" /> This stage is locked by Planning. Send an open request below.
      </div>
      <div>
        <Label className="text-xs">Reason (optional)</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why does this stage need to be opened? (e.g. work nearing completion, materials ready)"
          className="text-sm mt-1"
          data-testid="wov2-open-req-notes"
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 gap-1"
          disabled={submitting}
          onClick={sendRequest}
          data-testid="wov2-open-req-submit"
        >
          <Send className="h-3 w-3" /> {submitting ? 'Sending...' : 'Request Open'}
        </Button>
      </div>
    </div>
  );
}
function StageRequestDialog({ stage, wo, projectId, suspenseBalance, onClose, onSaved }) {
  const [subTab, setSubTab] = useState('request');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (stage) { setAmount(''); setNotes(''); setSubTab('request'); }
  }, [stage]);

  if (!stage) return null;

  const released = (stage.payment_requests || []).filter(p => p.status === 'approved').reduce((s, p) => s + (p.approved_amount || 0), 0);
  const pending = (stage.payment_requests || []).filter(p => ['requested', 'pm_approved', 'planning_approved'].includes(p.status)).reduce((s, p) => s + (p.amount || 0), 0);
  const carryover = stage.carryover_deduction || 0;
  const balance = Math.max(0, (stage.amount || 0) - released - pending - carryover);
  const allRequests = stage.payment_requests || [];

  const submit = async () => {
    const amt = parseFloat(amount || 0);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (!stage.is_open) { toast.error('Stage is not yet opened by Planning'); return; }
    setSubmitting(true);
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/request-payment`, {
        amount: amt,
        notes,
      });
      const exceedsBalance = amt > balance + 0.01;
      toast.success(exceedsBalance
        ? `Request sent (₹${(amt - balance).toLocaleString('en-IN')} over balance — Planning will review).`
        : 'Payment request sent to Planning');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to request payment');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!stage} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="wov2-stage-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">{stage.name}</DialogTitle>
          <DialogDescription className="text-xs">{wo.contractor_name} ({wo.contractor_type || '—'})</DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
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

        {/* Sub-tabs */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setSubTab('request')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${subTab === 'request' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500'}`}
            data-testid="wov2-subtab-request"
          >
            Request Payment
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${subTab === 'history' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500'}`}
            data-testid="wov2-subtab-history"
          >
            Payment Summary {allRequests.length > 0 && <span className="ml-1 text-[10px] opacity-70">({allRequests.length})</span>}
          </button>
        </div>

        {subTab === 'request' && (
          <div>
            {!stage.is_open ? (
              <RequestOpenSection stage={stage} wo={wo} projectId={projectId} onSent={onSaved} />
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    placeholder={`Suggested ${fmt(balance)}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-sm mt-1"
                    data-testid="wov2-pr-amount"
                  />
                  {parseFloat(amount || 0) > balance + 0.01 && (
                    <p className="text-[11px] text-orange-700 mt-1">
                      ⚠ Exceeds current balance by {fmt(parseFloat(amount) - balance)}. Planning may approve, and the overflow will be deducted from the next stage.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Remarks (optional)</Label>
                  <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note about this payment request" className="text-sm mt-1" data-testid="wov2-pr-notes" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1" disabled={submitting} onClick={submit} data-testid="wov2-pr-submit">
                    <Send className="h-3 w-3" /> {submitting ? 'Sending...' : 'Submit Request'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {subTab === 'history' && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {allRequests.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-6">No payment requests yet for this stage</p>
            ) : (
              allRequests.slice().reverse().map((pr, i) => {
                const sb = prStatusBadge(pr.status);
                return (
                  <div key={pr.request_id || i} className="border rounded p-2 text-xs" data-testid={`wov2-history-${pr.request_id || i}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-bold">{fmt(pr.approved_amount || pr.amount)}
                          {pr.original_amount && pr.original_amount !== pr.amount && (
                            <span className="text-[10px] text-gray-500 ml-1.5">(req {fmt(pr.original_amount)})</span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-500">{fmtDate(pr.requested_at)}</p>
                      </div>
                      <Badge variant="outline" className={`text-[9px] ${sb.cls}`}>{sb.label}</Badge>
                    </div>
                    {pr.notes && <p className="text-[11px] text-gray-600 mt-1">📝 {pr.notes}</p>}
                    {pr.planning_change_reason && (
                      <p className="text-[11px] text-amber-700 mt-1">Planning: {pr.planning_change_reason}</p>
                    )}
                    {pr.overflow_to_next_stage > 0 && (
                      <p className="text-[10px] text-orange-700 mt-1">Overflow {fmt(pr.overflow_to_next_stage)} → "{pr.overflow_target_stage_name}"</p>
                    )}
                    {pr.rejection_reason && (
                      <p className="text-[11px] text-red-600 mt-1">Rejected: {pr.rejection_reason}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().split('T')[0]);
      setRows(initRows());
      setNotes('');
    }
    /* eslint-disable-next-line */
  }, [open, workOrder?.work_order_id]);

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
    const missing = valid.filter(r => !Number(r.rate_per_day));
    if (missing.length) {
      toast.error(`Rate not set for: ${missing.map(r => r.label).join(', ')}. Update Work Order rates.`); return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/projects/${projectId}/work-orders/${workOrder.work_order_id}/dlr`, {
        date,
        entries: valid.map(r => ({
          type: r.type, count: Number(r.count),
          day_value: Number(r.day_value), rate_per_day: Number(r.rate_per_day),
        })),
        notes,
      });
      toast.success('DLR recorded');
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
