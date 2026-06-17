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
  // Global DLR shortcut state — picker dialog open, plus the contractor for
  // which the Record-DLR popup is currently open. We open the DLR dialog
  // inline (no navigation) so the SE never leaves the Work Order list.
  const [globalDlrOpen, setGlobalDlrOpen] = useState(false);
  const [dlrFor, setDlrFor] = useState(null); // { work_order_id, contractor_name, ... }

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
      {/* Global DLR shortcut — opens a contractor picker; clicking any
          contractor jumps straight into that WO's detail view scrolled to
          the DLR Report tab so the SE can record today's labour without
          drilling through the list. */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => setGlobalDlrOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
          data-testid="se-wov2-global-dlr-btn"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Global DLR Report
        </Button>
      </div>
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

      {/* Global DLR — single popup with contractor dropdown as the first
          field. Selecting a contractor reveals labour/stage/work-summary
          fields driven by that contractor's rates and open stages. */}
      <DLRRecordDialog
        open={globalDlrOpen}
        onOpenChange={setGlobalDlrOpen}
        projectId={projectId}
        workOrders={workOrders}
        onSaved={() => { setGlobalDlrOpen(false); fetchWOs(); }}
      />

      {/* Record DLR popup — mounted at the list-view level so picking a
          contractor opens this directly without navigating. The popup
          reuses the same component the detail-view DLR tab uses. */}
      <DLRRecordDialog
        open={!!dlrFor}
        onOpenChange={(v) => { if (!v) setDlrFor(null); }}
        projectId={projectId}
        workOrder={dlrFor || {}}
        onSaved={() => { setDlrFor(null); fetchWOs(); }}
      />
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
  // When SE clicks the Edit pencil on a pending RAB in the RAB tab, we
  // surface the SAME StageRequestDialog instead of an inline mini-form so
  // the SE gets every detail (KPIs, multi-stage allocation, dates, notes).
  const [editingRabCtx, setEditingRabCtx] = useState(null); // { rab, stage }
  const openEditRab = (rab) => {
    const targetStage = (wo?.stages || []).find(s => s.stage_id === rab.stage_id);
    if (!targetStage) {
      toast.error('Stage not found for this RAB');
      return;
    }
    setEditingRabCtx({ rab, stage: targetStage });
    setStageDialog(targetStage);
  };
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
            {/* "+ DLR" button removed — DLR recording is now driven from
                the Global DLR Report button on the WO list. */}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-6">
          <TabsTrigger value="payments" data-testid="wov2-tab-payments">Payment Schedule Stages</TabsTrigger>
          <TabsTrigger value="rab" data-testid="wov2-tab-rab" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">{"Total RAB's"}</TabsTrigger>
          <TabsTrigger value="additional" data-testid="wov2-tab-additional">Additional</TabsTrigger>
          <TabsTrigger value="additional_rab" data-testid="wov2-tab-additional-rab" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">Additional RAB</TabsTrigger>
          <TabsTrigger value="scope" data-testid="wov2-tab-scope">Scope of Work</TabsTrigger>
          <TabsTrigger value="dlr" data-testid="wov2-tab-dlr">DLR Report</TabsTrigger>
        </TabsList>

        {/* ADDITIONAL TAB — mirrors the Payment Schedule UI exactly, scoped to
            is_addition stages. 3 sub-tabs (Claimable / Non-Claimable / Rework)
            each render the same 4 status pills + stage list + RAB Request popup
            as the regular Payment Schedule. Locked sections become locked stages
            automatically — Planning unlocks them from the Project board. */}
        <TabsContent value="additional" className="mt-3">
          <Tabs defaultValue="claimable" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="claimable" data-testid="se-add-tab-claimable">Claimable From Client</TabsTrigger>
              <TabsTrigger value="non_claimable" data-testid="se-add-tab-nonclaimable">Non-Claimable From Client</TabsTrigger>
              <TabsTrigger value="rework" data-testid="se-add-tab-rework">Rework</TabsTrigger>
            </TabsList>
            {[
              { key: 'claimable', label: 'Claimable' },
              { key: 'non_claimable', label: 'Non-Claimable' },
              { key: 'rework', label: 'Rework' },
            ].map(({ key, label }) => (
              <TabsContent key={key} value={key} className="mt-3">
                <PaymentScheduleTab
                  wo={wo}
                  suspenseBalance={suspenseBalance}
                  onClickStage={(stage) => setStageDialog(stage)}
                  stageFilter={(s) => s.is_addition === true && (s.claim_type || 'claimable') === key}
                  title={`${label} Stages`}
                  description="Approval flow: You → PM → QC → Planning → Accountant"
                  emptyText={`No ${label} additional stages yet. Planning will unlock items here when work is approved to proceed.`}
                />
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        {/* ADDITIONAL RAB TAB — same RAB ladder as Total RAB's, but scoped
            to the is_addition stages so SE has a dedicated bucket for the
            extras they raised against Additional Work. */}
        <TabsContent value="additional_rab" className="mt-3">
          <WORABTab
            projectId={projectId}
            workOrder={wo}
            onOpenRabView={(requestId) => setRabView({ open: true, requestId })}
            onEditRab={openEditRab}
            stageIdFilter={(sid) => {
              const s = (wo.stages || []).find(x => x.stage_id === sid);
              return !!(s && s.is_addition);
            }}
          />
        </TabsContent>

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
            onEditRab={openEditRab}
            stageIdFilter={(sid) => {
              const s = (wo.stages || []).find(x => x.stage_id === sid);
              // Stages without a wo.stages entry (legacy/unknown) default to
              // the Total RAB's bucket — only confirmed Additional stages are
              // routed exclusively to the Additional RAB tab.
              return !(s && s.is_addition);
            }}
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
        editingRequest={editingRabCtx?.rab}
        onClose={() => { setStageDialog(null); setEditingRabCtx(null); }}
        onSaved={() => { setStageDialog(null); setEditingRabCtx(null); onChange(); }}
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
  { key: 'simple_open',      label: 'Open Stage',         Icon: Unlock,        color: 'green',   pillBg: 'bg-green-50 border-green-200 text-green-700',     activeBg: 'bg-green-600 text-white border-green-600' },
  { key: 'simple_completed', label: 'Completed',          Icon: CheckCheck,    color: 'emerald', pillBg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'simple_locked',    label: 'Locked Stages',      Icon: Lock,          color: 'gray',    pillBg: 'bg-gray-50 border-gray-200 text-gray-700',        activeBg: 'bg-gray-700 text-white border-gray-700' },
  { key: 'open',     label: 'Open Stage',         Icon: Unlock,        color: 'green',   pillBg: 'bg-green-50 border-green-200 text-green-700',     activeBg: 'bg-green-600 text-white border-green-600' },
  { key: 'locked',   label: 'Locked Stages',      Icon: Lock,          color: 'gray',    pillBg: 'bg-gray-50 border-gray-200 text-gray-700',        activeBg: 'bg-gray-700 text-white border-gray-700' },
  { key: 'all',      label: 'All Stages',         Icon: ClipboardList, color: 'violet',  pillBg: 'bg-violet-50 border-violet-200 text-violet-700',   activeBg: 'bg-violet-600 text-white border-violet-600' },
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

  // ---- Simple-mode (planning_open flow) buckets ----
  // These are computed for EVERY stage so the SE / Planning simple view
  // can group stages by their high-level state without caring about the
  // RAB approval sub-states. A stage with an Awaiting-Accountant RAB
  // still belongs in "Open Stage" because Planning has unlocked it for
  // work — it's just the payment that is in flight.
  if (fullyPaid) {
    set.add('simple_completed');
  } else if (stage.is_open === true) {
    set.add('simple_open');
  } else {
    set.add('simple_locked');
  }

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

function PaymentScheduleTab({ wo, suspenseBalance, onClickStage, stageFilter, title, description, emptyText }) {
  // Pre-filter stages (used by the Additional tab to scope to claim_type buckets).
  // For the main Payment Schedule tab, also exclude is_addition stages so they
  // only ever appear under the Additional tab.
  const allStages = wo.stages || [];
  const stages = stageFilter
    ? allStages.filter(stageFilter)
    : allStages.filter(s => !s.is_addition);
  const [filterKey, setFilterKey] = useState('all'); // 'all' shows all stages
  // Workflow mode toggle (set via Super Architect's Workflow Master Setup).
  //   planning_open → only 3 simple buckets (Open / Locked / All)
  //   se_request    → full 9-bucket SE-driven lifecycle dashboard
  const [woStageFlow, setWoStageFlow] = useState('planning_open');
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/settings/workflow`);
        if (r.data?.wo_stage_flow) setWoStageFlow(r.data.wo_stage_flow);
      } catch {/* fall back to default */}
    })();
  }, []);
  // Trim the bucket set when the SE-request flow is OFF — only the 3 core
  // simple filters stay visible (Open / Completed / Locked + All) without
  // the in-flight RAB sub-states.
  const visibleBuckets = woStageFlow === 'se_request'
    ? STAGE_BUCKETS.filter(b => !b.key.startsWith('simple_'))
    : STAGE_BUCKETS.filter(b => ['simple_open', 'simple_completed', 'simple_locked', 'all'].includes(b.key));
  // If the active filter no longer exists in the trimmed set, snap back to 'all'.
  useEffect(() => {
    if (!visibleBuckets.some(b => b.key === filterKey)) setFilterKey('all');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woStageFlow]);
  const paidStages = stages.filter(s => {
    const released = (s.payment_requests || []).filter(p => p.status === 'approved').reduce((acc, p) => acc + (p.approved_amount || 0), 0);
    return released >= (s.amount || 0) && (s.amount || 0) > 0;
  }).length;

  // Pre-bucket every stage once so cards + list filter share the same logic
  const stageBuckets = useMemo(() => stages.map(s => bucketsForStage(s)), [stages]);
  const counts = useMemo(() => {
    const c = { all: 0, open: 0, locked: 0, request: 0, planning: 0, accountant: 0, finished: 0, simple_open: 0, simple_completed: 0, simple_locked: 0 };
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
          <CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4 text-violet-600" /> {title || 'Stages'}</CardTitle>
          <CardDescription className="text-[11px] mt-0.5">{description || 'Approval flow: You → PM → QC → Planning → Accountant'}</CardDescription>
        </div>
        <Badge variant="outline" className="text-[10px]">{paidStages}/{stages.length} paid</Badge>
      </CardHeader>

      {/* Lifecycle filter cards — bucket set depends on the workflow mode:
            • planning_open → 3 buckets (Open / Locked / All)
            • se_request    → full 9-bucket SE-driven lifecycle */}
      <div className="px-3 pb-2" data-testid="wov2-stage-filter-cards">
        <div className={`grid gap-1.5 ${visibleBuckets.length === 3 ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-9'}`}>
          {visibleBuckets.map(b => {
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
          <p className="text-center text-xs text-gray-400 py-8">{emptyText || 'No stages defined'}</p>
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
                      <span className="text-sm font-semibold text-gray-900">{i + 1}. {stage.name || stage.stage_name}</span>
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
            <p className="font-semibold">{stage.name || stage.stage_name}</p>
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
function StageRequestDialog({ stage, wo, projectId, suspenseBalance, onClose, onSaved, editingRequest }) {
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
  // Multi-stage allocation — SE can split the Amount across multiple OPEN
  // stages of the same work order (rule #1 from product). Key: stage_id,
  // value: string amount. Empty/unselected stages are omitted from this map.
  // Defaults to a single entry pointing at the originating `stage`.
  const [allocations, setAllocations] = useState({});
  // RAB detail popup — opens when SE clicks "View" on a Payment Summary row.
  const [rabView, setRabView] = useState({ open: false, requestId: null });

  // ── helpers ─────────────────────────────────────────────────────────────
  const stageBalanceOf = (s) => {
    if (!s) return 0;
    const rel = (s.payment_requests || []).filter(p => p.status === 'approved').reduce((a, p) => a + (p.approved_amount || 0), 0);
    const pen = (s.payment_requests || []).filter(p => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(p.status)).reduce((a, p) => a + (p.amount || 0), 0);
    return Math.max(0, (s.amount || 0) - rel - pen - (s.carryover_deduction || 0));
  };
  // Auto-distribute the Amount across the given checked stage_ids (in stage
  // order), capping each at its remaining balance. Used whenever the top
  // Amount changes or a stage is checked / unchecked — SE no longer has to
  // punch per-stage numbers by hand.
  const autoDistribute = (totalAmtStr, checkedSids) => {
    let remaining = parseFloat(totalAmtStr) || 0;
    const next = {};
    // Walk in stage order (the order from `openStagesAll`) so the first
    // open stage gets filled first, then overflow rolls into the next.
    const sortedSids = (wo?.stages || [])
      .map(s => s.stage_id)
      .filter(sid => checkedSids.includes(sid));
    for (const sid of sortedSids) {
      const s = (wo?.stages || []).find(x => x.stage_id === sid);
      if (!s) continue;
      let cap = stageBalanceOf(s);
      if (reworkPR && sid === stage.stage_id) cap += (reworkPR.amount || 0);
      // In edit mode, the editing request's current amount must be added back
      // to the source stage's balance — otherwise the SE can't even keep the
      // same value when re-saving.
      if (editingRequest && sid === editingRequest.stage_id) cap += (editingRequest.amount || 0);
      const fill = Math.min(Math.max(0, remaining), cap);
      next[sid] = String(+fill.toFixed(2));
      remaining -= fill;
    }
    return next;
  };

  // Rule #2: only OPEN stages (locked + completed/zero-balance excluded).
  // In edit mode, always keep the editing RAB's source stage available
  // so SE can keep it as a target even if its current balance is 0.
  // Also scope to the SAME stage "group" so a Non-Claimable additional RAB
  // can only be moved to other Non-Claimable additional stages (not regular
  // contract stages, not Claimable, not Rework). Same idea for Claimable,
  // Rework, and Regular — they each stay in their own bucket.
  const stageGroupKey = (s) => {
    if (!s) return 'regular';
    if (s.is_addition) return `addition:${s.claim_type || 'claimable'}`;
    return 'regular';
  };
  const currentGroupKey = stageGroupKey(stage);
  const openStagesAll = (wo?.stages || []).filter(s => s.is_open && (
    stageBalanceOf(s) > 0.01 ||
    (editingRequest && s.stage_id === editingRequest.stage_id)
  ) && stageGroupKey(s) === currentGroupKey);

  // Delete a single payment_request row from the stage's history. Backend
  // enforces permission (PM/Planning/Accountant/Super Admin) and refuses to
  // delete rows that have already been Accountant-released (those need to
  // be reversed via the cashbook).
  const deletePR = async (pr) => {
    const amt = (pr.approved_amount || pr.amount || 0).toLocaleString('en-IN');
    if (!window.confirm(`Delete this ${pr.rab_number || 'payment request'} entry of ₹${amt}?\n\nThis will also purge any linked expense and cashbook rows. This cannot be undone.`)) return;
    setDeletingId(pr.request_id);
    try {
      const r = await axios.delete(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${stage.stage_id}/payment-requests/${pr.request_id}`);
      // Surface the cascade purge counts so the SE/PM can see what got
      // cleaned up alongside the RAB row.
      const p = r.data?.purged || {};
      const cleaned = [
        p.recorded_expenses ? `${p.recorded_expenses} expense` : null,
        p.labour_expenses ? `${p.labour_expenses} labour-exp` : null,
        p.cashbook_entries ? `${p.cashbook_entries} cashbook` : null,
      ].filter(Boolean).join(' · ');
      toast.success(cleaned ? `${pr.rab_number || 'RAB'} deleted · cleaned ${cleaned}` : `${pr.rab_number || 'RAB'} deleted`);
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
      // Treat `editingRequest` (passed in from the RAB list edit pencil) like
      // a rework — same pre-fill path so the SE sees their original entries
      // and can adjust. Submit branches to PATCH instead of POST.
      const editing = editingRequest;
      const preFill = editing || rework;
      setAmount(preFill ? String(preFill.amount || '') : '');
      setNotes(preFill ? (preFill.notes || '') : '');
      // Default sub-tab priority: Request RAB (if stage is open, has remaining
      // balance and no rejections to clear first), else Total RAB's history.
      // In edit mode we ALWAYS land on Request RAB so SE can see + change the
      // Amount field and Select Stages to Bill panel.
      const hasReleased = (stage.payment_requests || []).some(p => p.status === 'approved');
      const stageReleased = (stage.payment_requests || []).filter(p => p.status === 'approved').reduce((a, p) => a + (p.approved_amount || 0), 0);
      const stagePending = (stage.payment_requests || []).filter(p => ['requested', 'pm_approved', 'qc_approved', 'planning_approved'].includes(p.status)).reduce((a, p) => a + (p.amount || 0), 0);
      const stageBalance = Math.max(0, (stage.amount || 0) - stageReleased - stagePending);
      if (editing) {
        setSubTab('request');
      } else if (stage.is_open && !hasReleased && stageBalance > 0) {
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
      if (rework || editing) {
        const src = editing || rework;
        setFromDate(toISODate(src.from_date) || toISODate(stage.opened_at));
        setToDate(toISODate(src.to_date));
        setExcessReason(src.excess_dlr_reason || '');
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
      // Reset multi-stage allocation to the originating stage with the full amount.
      const preAmt = (editing || rework) ? String((editing || rework).amount || '') : '';
      setAllocations({ [stage.stage_id]: preAmt });
    }
  }, [stage, editingRequest]);

  // Whenever the SE retypes the top Amount, auto-distribute it across every
  // currently-checked stage (in stage order, capped at each balance). SE can
  // still tweak per-stage values afterwards if needed — the next Amount edit
  // (or check/uncheck) will recompute and overwrite their manual edits.
  useEffect(() => {
    setAllocations(prev => {
      const keys = Object.keys(prev);
      const checked = keys.length > 0 ? keys : (stage?.stage_id ? [stage.stage_id] : []);
      if (checked.length === 0) return prev;
      return autoDistribute(amount, checked);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

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
    const totalAmt = parseFloat(amount || 0);
    if (!totalAmt || totalAmt <= 0) { toast.error('Enter a valid amount'); return; }
    if (fromDate && toDate && fromDate > toDate) { toast.error('From Date must be before To Date'); return; }

    // Pull the active per-stage allocation map (skip empty/zero rows).
    const entries = Object.entries(allocations)
      .map(([sid, v]) => [sid, parseFloat(v || 0)])
      .filter(([, v]) => v > 0);
    if (entries.length === 0) {
      toast.error('Select at least one stage and enter an amount');
      return;
    }
    const sumAlloc = entries.reduce((s, [, v]) => s + v, 0);
    if (Math.abs(sumAlloc - totalAmt) > 0.5) {
      toast.error(`Per-stage allocations (${fmt(sumAlloc)}) must equal Amount (${fmt(totalAmt)})`);
      return;
    }

    // Validate every targeted stage independently — open + balance check.
    for (const [sid, v] of entries) {
      const s = (wo?.stages || []).find(x => x.stage_id === sid);
      if (!s) { toast.error('Selected stage not found'); return; }
      if (!s.is_open) { toast.error(`${s.name} is not yet opened by Planning`); return; }
      const sBal = stageBalanceOf(s);
      let cap = sBal;
      if (reworkPR && sid === stage.stage_id) cap += (reworkPR.amount || 0);
      if (editingRequest && sid === editingRequest.stage_id) cap += (editingRequest.amount || 0);
      if (v > cap + 0.01) {
        toast.error(`${s.name}: ₹${v} exceeds stage balance ${fmt(cap)}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Single-stage path keeps the original endpoint (preserves the
      // rework / resubmit behaviour). Multi-stage loops the per-stage
      // endpoint — each call creates an independent RAB with its own
      // project-wide RAB-XX number.
      if (entries.length === 1) {
        const [sid, v] = entries[0];
        const payload = {
          amount: v,
          notes,
          from_date: fromDate || null,
          to_date: toDate || null,
          excess_dlr_reason: excessReason || null,
        };
        if (editingRequest) {
          // Edit mode — PATCH the existing payment_request. Backend handles
          // stage moves via `target_stage_id`.
          await axios.patch(
            `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${editingRequest.stage_id}/payment-requests/${editingRequest.request_id}`,
            { amount: v, notes, target_stage_id: sid !== editingRequest.stage_id ? sid : undefined },
          );
          toast.success(`${editingRequest.rab_number || 'RAB'} updated`);
        } else if (reworkPR && sid === stage.stage_id) {
          await axios.post(
            `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${sid}/payment-requests/${reworkPR.request_id}/se-resubmit`,
            payload,
          );
          toast.success(`${reworkPR.rab_number || 'RAB'} resubmitted — awaiting PM review`);
        } else {
          const res = await axios.patch(
            `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${sid}/request-payment`,
            payload,
          );
          toast.success(`${res.data?.rab_number || 'RAB'} submitted — awaiting PM review`);
        }
      } else {
        // Multi-stage RAB — single endpoint that bundles every allocation
        // under ONE rab_number + rab_group_id (one bill from the
        // contractor's perspective). PM/QC/Planning approvals cascade
        // automatically across sibling stages.
        const res = await axios.post(
          `${API}/projects/${projectId}/work-orders/${wo.work_order_id}/multi-stage-request-payment`,
          {
            allocations: entries.map(([sid, v]) => ({ stage_id: sid, amount: v })),
            notes,
            from_date: fromDate || null,
            to_date: toDate || null,
            excess_dlr_reason: excessReason || null,
          },
        );
        toast.success(`${res.data?.rab_number || 'RAB'} submitted (${res.data?.stages || entries.length} stages) — awaiting PM review`);
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
          <DialogTitle className="text-base">{editingRequest ? `Edit ${editingRequest.rab_number || 'RAB'} · ${stage.name || stage.stage_name}` : (stage.name || stage.stage_name)}</DialogTitle>
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
          {/* Hide the Request RAB sub-tab once the stage is fully funded —
              balance==0 means every paise has been released or queued, so
              raising a new RAB would just bounce off the hard cap. The
              Resubmit case is exempted because the rework row is already
              counted in `pending` and replaces itself on submit. */}
          {stage.is_open && (balance > 0 || reworkPR) && (
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 25000"
                disabled={submitting}
                className="mt-1"
                data-testid="wov2-rab-amount"
              />
              {(() => {
                const sumAlloc = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                const amt = parseFloat(amount || 0);
                const totalBalAcrossSelected = Object.keys(allocations).reduce((s, sid) => {
                  const st = (wo?.stages || []).find(x => x.stage_id === sid);
                  if (!st) return s;
                  const cap = (reworkPR && sid === stage.stage_id) ? stageBalanceOf(st) + (reworkPR.amount || 0) : stageBalanceOf(st);
                  return s + cap;
                }, 0);
                const mismatch = amt > 0 && Math.abs(sumAlloc - amt) > 0.5;
                return (
                  <>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Allocated: <span className={mismatch ? 'text-red-600 font-bold' : 'text-emerald-700 font-semibold'}>{fmt(sumAlloc)}</span> / Amount: <span className="font-semibold">{fmt(amt)}</span> · Available across selected stages: {fmt(totalBalAcrossSelected)}
                    </p>
                    {mismatch && (
                      <p className="text-[10px] text-red-600 mt-0.5 font-medium" data-testid="wov2-cap-warn">
                        ⚠ Per-stage allocations must add up to the total Amount.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Multi-stage allocation — only OPEN stages with balance > 0
                are listed. Current stage starts checked + carrying the full
                amount. SE can tick more stages and split the Amount manually.
                Each checked stage gets its own per-project sequential RAB-XX
                number on submit. */}
            {openStagesAll.length > 0 && (
              <div className="border rounded-lg p-2 bg-amber-50/40 border-amber-200" data-testid="wov2-multi-stage">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
                    Select Stages to Bill {openStagesAll.length > 1 ? `· ${openStagesAll.length} open` : ''}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {openStagesAll.map((s) => {
                    const checked = Object.prototype.hasOwnProperty.call(allocations, s.stage_id);
                    const cap = (reworkPR && s.stage_id === stage.stage_id) ? stageBalanceOf(s) + (reworkPR.amount || 0) : stageBalanceOf(s);
                    const val = allocations[s.stage_id] ?? '';
                    const over = parseFloat(val || 0) > cap + 0.01;
                    return (
                      <div key={s.stage_id} className={`flex items-center gap-2 px-2 py-1.5 rounded border ${checked ? 'border-amber-300 bg-white' : 'border-gray-200 bg-gray-50'}`} data-testid={`wov2-stage-row-${s.stage_id}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={submitting || (reworkPR && s.stage_id === stage.stage_id) }
                          onChange={(e) => {
                            setAllocations(prev => {
                              // Build the next set of checked stage IDs and
                              // re-run auto-distribute so allocations always
                              // reflect the current selection without manual
                              // typing.
                              const next = { ...prev };
                              if (e.target.checked) {
                                next[s.stage_id] = '0';
                              } else {
                                delete next[s.stage_id];
                              }
                              const checkedSids = Object.keys(next);
                              return checkedSids.length === 0 ? {} : autoDistribute(amount, checkedSids);
                            });
                          }}
                          className="h-3.5 w-3.5 accent-amber-600"
                          data-testid={`wov2-stage-check-${s.stage_id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" title={s.name}>
                            {s.name}
                            {s.stage_id === stage.stage_id && <span className="ml-1 text-[9px] text-amber-700 font-semibold uppercase">current</span>}
                          </p>
                          <p className="text-[10px] text-gray-500">Balance: <span className={over ? 'text-red-600 font-bold' : 'font-semibold text-gray-700'}>{fmt(cap)}</span></p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max={cap}
                          step="any"
                          value={val}
                          disabled={!checked || submitting}
                          onChange={(e) => setAllocations(prev => ({ ...prev, [s.stage_id]: e.target.value }))}
                          placeholder="0"
                          className="h-7 text-xs w-24 text-right"
                          data-testid={`wov2-stage-amt-${s.stage_id}`}
                        />
                      </div>
                    );
                  })}
                </div>
                {openStagesAll.length === 1 && (
                  <p className="text-[10px] text-gray-500 mt-1.5 italic">Only this stage is open right now — once Planning opens more, you can split across them here.</p>
                )}
              </div>
            )}

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
// DLR Report Tab — rich summary view (stats · date range · stage filter)
// Lives inside Site Engineer > Project > Work Order > DLR Report tab.
// The Global DLR popup is intentionally minimal; the full history surface
// is here so the SE can drill into trends without leaving the WO context.
// =====================================================================
function DLRReportTab({ projectId, workOrderId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stageId, setStageId] = useState('all');
  const [openStages, setOpenStages] = useState([]);
  const [popup, setPopup] = useState(null);

  const fetchDLR = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set('date_from', dateFrom);
      if (dateTo) qs.set('date_to', dateTo);
      const params = qs.toString() ? `?${qs.toString()}` : '';
      const res = await axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}/dlr${params}`);
      setEntries(res.data || []);
    } catch { setEntries([]); }
    setLoading(false);
  };

  useEffect(() => { fetchDLR(); /* eslint-disable-next-line */ }, [projectId, workOrderId, dateFrom, dateTo]);

  // Pull this WO's currently-open stages so the SE can filter the history
  // by stage. Matches the same "strictly open" rule the record dialog uses.
  useEffect(() => {
    (async () => {
      try {
        const wr = await axios.get(`${API}/projects/${projectId}/work-orders/${workOrderId}`);
        const PENDING_RAB = new Set(['requested', 'pm_approved', 'qc_approved', 'planning_approved']);
        const strictlyOpen = (s) => s.is_open === true && !(s.payment_requests || []).some(p => PENDING_RAB.has(p.status));
        const stages = (wr.data?.stages || []).filter(strictlyOpen).map((s, idx) => ({
          stage_id: s.stage_id,
          stage_name: s.name || s.stage_name || `Stage ${idx + 1}`,
          sl_no: s.sl_no || `S${idx + 1}`,
        }));
        setOpenStages(stages);
      } catch { setOpenStages([]); }
    })();
  }, [projectId, workOrderId]);

  // Client-side stage filter on top of the server's date-range filter.
  const filtered = useMemo(() => {
    if (stageId === 'all') return entries;
    return entries.filter(d => d.stage_id === stageId);
  }, [entries, stageId]);

  const countByType = (dlr, type) => {
    const e = (dlr.entries || []).find(x => x.type === type);
    return e ? Number(e.count) || 0 : 0;
  };

  const totalDays = filtered.length;
  const totalWorkers = filtered.reduce((s, d) => s + (d.total_workers || 0), 0);
  const totalCost = filtered.reduce((s, d) => s + (d.total_cost || 0), 0);

  return (
    <Card>
      <CardHeader className="p-3 pb-2 bg-gradient-to-r from-teal-50 to-teal-100 border-b">
        <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-700" /> Daily Labour Report</CardTitle>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="bg-white border border-teal-200 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase">Days</p>
            <p className="text-sm font-bold text-teal-900" data-testid="wov2-dlr-stat-days">{totalDays}</p>
          </div>
          <div className="bg-white border border-teal-200 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase">Workers</p>
            <p className="text-sm font-bold text-blue-900" data-testid="wov2-dlr-stat-workers">{totalWorkers}</p>
          </div>
          <div className="bg-white border border-teal-200 rounded p-2">
            <p className="text-[10px] text-gray-500 uppercase">Total Cost</p>
            <p className="text-sm font-bold text-teal-700" data-testid="wov2-dlr-stat-cost">{fmt(totalCost)}</p>
          </div>
        </div>
      </CardHeader>

      {/* Filters row */}
      <div className="px-3 py-2 border-b bg-white flex items-end gap-2 flex-wrap">
        <div>
          <Label className="text-[10px] uppercase text-gray-500">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-[140px]" data-testid="wov2-dlr-from" />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-gray-500">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-[140px]" data-testid="wov2-dlr-to" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <Label className="text-[10px] uppercase text-gray-500">Stage (Open)</Label>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger className="h-8 text-xs" data-testid="wov2-dlr-stage">
              <SelectValue placeholder="All open stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All open stages</SelectItem>
              {openStages.map(s => (
                <SelectItem key={s.stage_id} value={s.stage_id}>{s.sl_no} {s.stage_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(dateFrom || dateTo || stageId !== 'all') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); setStageId('all'); }} data-testid="wov2-dlr-clear">
            Clear
          </Button>
        )}
      </div>

      <CardContent className="p-0">
        {loading ? (
          <p className="text-center text-xs text-gray-400 py-6">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-8">
            No DLR records{(dateFrom || dateTo || stageId !== 'all') ? ' for the selected filters' : ''}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Stage</th>
                  <th className="text-center px-2 py-2 font-semibold text-blue-700 w-14">Skl</th>
                  <th className="text-center px-2 py-2 font-semibold text-amber-700 w-14">Semi</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-700 w-14">Unsk</th>
                  <th className="text-center px-2 py-2 font-semibold text-gray-600 w-16">Total</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600 w-24">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((d) => (
                  <tr
                    key={d.dlr_id}
                    className="hover:bg-teal-50/40 cursor-pointer"
                    onClick={() => setPopup(d)}
                    data-testid={`wov2-dlr-row-${d.dlr_id}`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{fmtDate(d.date)}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[180px]">{d.stage_name || '—'}</td>
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
                  <td className="px-3 py-2 font-bold text-teal-900" colSpan={5}>Total</td>
                  <td className="px-2 py-2 text-center font-bold text-teal-900">{totalWorkers}</td>
                  <td className="px-3 py-2 text-right font-bold text-teal-900">{fmt(totalCost)}</td>
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
              {popup.date_remark && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2" data-testid="wov2-dlr-day-popup-remark">
                  <span className="font-semibold">Back-dated DLR Remark:</span> {popup.date_remark}
                </p>
              )}
              <p className="text-[10px] text-gray-400">By {popup.created_by_name || '—'} at {popup.created_at ? new Date(popup.created_at).toLocaleString() : '—'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// =====================================================================
// DLR Record Dialog: opened from "DLR" button at the top corner.
// Modes:
//   • Per-WO mode — caller passes `workOrder` (locked, no picker shown).
//   • Global mode — caller passes `workOrders` (list of assigned
//     contractors on this site); the first field becomes a contractor
//     dropdown. Selecting a contractor refreshes rates and open stages.
// =====================================================================
function DLRRecordDialog({ open, onOpenChange, projectId, workOrder, workOrders, onSaved }) {
  // Single source of truth for the active contractor — comes from the
  // explicit `workOrder` prop (per-WO mode) or from the in-dialog dropdown
  // (Global mode).
  const isGlobalMode = !workOrder && Array.isArray(workOrders) && workOrders.length > 0;
  const [selectedWoId, setSelectedWoId] = useState('');
  const effectiveWO = workOrder || (workOrders || []).find(w => w.work_order_id === selectedWoId) || null;

  const rates = effectiveWO?.labour_rates || {};
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
  const [dlrDateMode, setDlrDateMode] = useState('ontime'); // global Super Admin setting
  const [dateRemark, setDateRemark] = useState('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setStageId('');
      setWorkSummary('');
      setDateRemark('');
      // Global mode opens with NO contractor pre-selected so the user is
      // forced to pick one consciously; per-WO mode is implicit.
      if (isGlobalMode) setSelectedWoId('');
      // Fetch the global DLR Date Module setting on every open so the SE
      // sees the latest policy even if Super Admin flipped it minutes ago.
      axios.get(`${API}/settings/dlr-date-mode`).then(r => {
        const m = r.data?.mode === 'custom' ? 'custom' : 'ontime';
        setDlrDateMode(m);
      }).catch(() => setDlrDateMode('ontime'));
    }
    /* eslint-disable-next-line */
  }, [open, workOrder?.work_order_id]);

  // Recompute the labour rate rows whenever the active contractor changes
  // (covers both initial open AND in-dialog contractor switches).
  useEffect(() => {
    setRows(initRows());
    setStageId('');
    /* eslint-disable-next-line */
  }, [effectiveWO?.work_order_id]);

  // Fetch the WO's payment-schedule stages and filter to ONLY currently-open
  // stages — keeps the dropdown scoped to this contractor's actionable work.
  // Falls back to project-level stages only if the WO endpoint can't supply
  // any open stage so the picker is never silently empty.
  useEffect(() => {
    if (!open || !projectId) return;
    (async () => {
      try {
        if (effectiveWO?.work_order_id) {
          const wr = await axios.get(`${API}/projects/${projectId}/work-orders/${effectiveWO.work_order_id}`);
          // Only "purely Open" stages — is_open=true AND no RAB in flight.
          // A stage with an Awaiting-PM RAB is locked from the SE's perspective
          // until that workflow clears (or gets rejected), so it must be hidden.
          const PENDING_RAB = new Set(['requested', 'pm_approved', 'qc_approved', 'planning_approved']);
          const isStrictlyOpen = (s) => s.is_open === true && !(s.payment_requests || []).some(p => PENDING_RAB.has(p.status));
          const stages = (wr.data?.stages || []).filter(isStrictlyOpen).map((s, idx) => ({
            stage_id: s.stage_id,
            stage_name: s.name || s.stage_name || `Stage ${idx + 1}`,
            sl_no: s.sl_no || `S${idx + 1}`,
            is_section_header: false,
          }));
          if (stages.length > 0) { setProjectStages(stages); return; }
          setProjectStages([]);
          return;
        }
        // Global mode with no contractor chosen yet — show no stages.
        setProjectStages([]);
      } catch { setProjectStages([]); }
    })();
  }, [open, projectId, effectiveWO?.work_order_id]);

  const calcRow = (r) => (Number(r.count) || 0) * (Number(r.day_value) || 1) * (Number(r.rate_per_day) || 0);
  const totalWorkers = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const totalCost = rows.reduce((s, r) => s + calcRow(r), 0);

  const updateRow = (i, field, val) => {
    const nr = [...rows]; nr[i] = { ...nr[i], [field]: val }; setRows(nr);
  };

  const submit = async () => {
    if (!effectiveWO?.work_order_id) { toast.error('Select a contractor'); return; }
    const valid = rows.filter(r => Number(r.count) > 0);
    if (!valid.length) { toast.error('Enter worker count for at least one type'); return; }
    if (!date) { toast.error('Select a date'); return; }
    if (!stageId) { toast.error('Select Current Project Stage'); return; }
    if (!workSummary.trim()) { toast.error('Work Summary is required'); return; }
    // Client-side DLR Date Module enforcement (backend re-validates).
    if (dlrDateMode === 'ontime' && date !== today) {
      toast.error('DLR can only be recorded for today\'s date.'); return;
    }
    if (dlrDateMode === 'custom' && date !== today && !dateRemark.trim()) {
      toast.error('Date Remark is required for back-dated DLR.'); return;
    }
    const missing = valid.filter(r => !Number(r.rate_per_day));
    if (missing.length) {
      toast.error(`Rate not set for: ${missing.map(r => r.label).join(', ')}. Update Work Order rates.`); return;
    }
    const selectedStage = projectStages.find(s => s.stage_id === stageId);
    setSubmitting(true);
    try {
      await axios.post(`${API}/projects/${projectId}/work-orders/${effectiveWO.work_order_id}/dlr`, {
        date,
        entries: valid.map(r => ({
          type: r.type, count: Number(r.count),
          day_value: Number(r.day_value), rate_per_day: Number(r.rate_per_day),
        })),
        notes,
        stage_id: stageId,
        stage_name: selectedStage?.stage_name || '',
        work_summary: workSummary.trim(),
        date_remark: (dlrDateMode === 'custom' && date !== today) ? dateRemark.trim() : '',
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
          <DialogDescription className="text-xs">
            {effectiveWO?.contractor_name || (isGlobalMode ? 'Pick a contractor assigned to this site to begin.' : '')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Contractor dropdown — only in Global mode (per-WO mode locks
              the contractor implicitly via the `workOrder` prop). */}
          {isGlobalMode && (
            <div>
              <Label className="text-xs">Contractor *</Label>
              <Select value={selectedWoId} onValueChange={setSelectedWoId}>
                <SelectTrigger className="text-sm mt-1" data-testid="wov2-dlr-form-contractor">
                  <SelectValue placeholder="Select a contractor assigned to this site..." />
                </SelectTrigger>
                <SelectContent>
                  {workOrders.map(w => (
                    <SelectItem key={w.work_order_id} value={w.work_order_id} data-testid={`wov2-dlr-form-contractor-${w.work_order_id}`}>
                      {w.contractor_name} <span className="text-gray-400 ml-1">· {w.contractor_type || '—'} · {w.work_order_number || w.work_order_id}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Date row — visible once a contractor is locked (always in
              per-WO mode; once selected in Global mode). */}
          {effectiveWO && (
          <div>
            <Label className="text-xs">
              Date {dlrDateMode === 'ontime' && <span className="text-[10px] text-amber-700 font-normal ml-1">(locked to today by Super Admin)</span>}
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={today}
              disabled={dlrDateMode === 'ontime'}
              className={`text-sm mt-1 ${dlrDateMode === 'ontime' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              data-testid="wov2-dlr-form-date"
            />
          </div>
          )}
          {/* The full form (labour table, notes, DPR, submit) is gated on a
              selected contractor. Per-WO mode shows it immediately; Global
              mode reveals it after the user picks from the dropdown. */}
          {effectiveWO && (<>
          {dlrDateMode === 'custom' && date !== today && (
            <div data-testid="wov2-dlr-date-remark-wrap">
              <Label className="text-xs">
                Date Remark <span className="text-red-500">*</span>
                <span className="text-[10px] font-normal text-gray-500 ml-1">
                  (required when recording for a date other than today)
                </span>
              </Label>
              <Textarea
                rows={2}
                value={dateRemark}
                onChange={(e) => setDateRemark(e.target.value)}
                placeholder="Reason for back-dated DLR (e.g. was on leave yesterday, network outage at site...)"
                className="text-sm mt-1"
                data-testid="wov2-dlr-form-date-remark"
              />
            </div>
          )}
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
              <Label className="text-xs">Current Project Stage <span className="text-red-500">*</span><span className="text-[10px] font-normal text-gray-500 ml-1">(open stages only)</span></Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="mt-1 h-9 text-xs" data-testid="wov2-dlr-form-stage">
                  <SelectValue placeholder={projectStages.length ? "Select an open stage..." : "No open stages for this contractor — ask Planning to unlock one"} />
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
          </>)}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={submitting || !effectiveWO} onClick={submit} data-testid="wov2-dlr-submit">
            {submitting ? 'Saving...' : 'Save DLR'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// (GlobalDLRDialog and ContractorDLRCard removed — the Global DLR
// experience now lives inside DLRRecordDialog itself via the optional
// `workOrders` prop, which shows a contractor dropdown as the first field.)

