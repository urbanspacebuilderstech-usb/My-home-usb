import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { CashbookDateFilter, filterByDateRange } from './CashbookDateFilter';
import ProjectSearchSelect from './ProjectSearchSelect';
import RequestStatusFilter, { mapToReqStatus } from './RequestStatusFilter';
import { Package, Users, Wallet, ThumbsUp, ThumbsDown, Loader2, CheckCircle2, AlertCircle, FileText, Calendar, User as UserIcon, Briefcase, CreditCard, ListChecks, Send, Truck, PackageCheck, FileClock, ClipboardCheck, Banknote } from 'lucide-react';
import MetaDateFilter, { rangeForPreset } from './MetaDateFilter';
import PlanningLabourStageRequests from './PlanningLabourStageRequests';
import RABApprovalQueue from './RABApprovalQueue';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

// Material lifecycle filter cards — Planning view.
// Order: SE → Procurement → Planning → Revision → Accountant → Transit → Delivered.
// Credit-mode delivered items roll into Delivered — vendor settlement lives in Procurement → Credit Management.
const MAT_LIFECYCLE_BUCKETS = [
  { key: 'all',                label: 'All',                 Icon: ListChecks,     cls: 'bg-violet-50 border-violet-200 text-violet-700',  active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'initial_review',     label: 'Initial Review (SE)', Icon: ClipboardCheck, cls: 'bg-yellow-50 border-yellow-200 text-yellow-700',  active: 'bg-yellow-600 text-white border-yellow-600' },
  { key: 'awaiting_procurement', label: 'Awaiting Procurement', Icon: Send,       cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'planning_awaiting',  label: 'Planning (Pricing)',  Icon: ClipboardCheck, cls: 'bg-lime-50 border-lime-200 text-lime-700',        active: 'bg-lime-600 text-white border-lime-600' },
  { key: 'revision',           label: 'Revision',            Icon: FileClock,      cls: 'bg-orange-50 border-orange-200 text-orange-700',  active: 'bg-orange-600 text-white border-orange-600' },
  { key: 'awaiting_accountant',label: 'Awaiting Accountant', Icon: Wallet,         cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white border-cyan-600' },
  { key: 'transit',            label: 'Transit',             Icon: Truck,          cls: 'bg-sky-50 border-sky-200 text-sky-700',           active: 'bg-sky-600 text-white border-sky-600' },
  { key: 'delivered',          label: 'Delivered',           Icon: PackageCheck,   cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
];

// Smart bucketer — credit-mode delivered items now roll into "delivered"
// (vendor settlement is tracked separately in Procurement → Credit Management).
function bucketForMaterial(req) {
  const status = (req.status || '').toLowerCase();
  if (status === 'planning_initial_pending') return 'initial_review';
  if (status === 'planning_initial_rejected') return 'revision';
  if (status === 'requested' || status === 'pm_approved') return 'awaiting_procurement';
  if (status === 'procurement_priced') return 'planning_awaiting';
  if (status === 'procurement_revision') return 'revision';
  if (['pending_accounts_approval', 'pending_balance_payment', 'accounts_approved', 'payment_approved'].includes(status)) return 'awaiting_accountant';
  if (status === 'in_transit') return 'transit';
  if (['delivered', 'completed', 'closed'].includes(status)) return 'delivered';
  if (['rejected', 'procurement_rejected'].includes(status)) return 'all'; // hidden in lifecycle, accessible via "All"
  return 'all';
}

const PAYMENT_MODE_DISPLAY = {
  pre_paid:      { label: 'Pre-paid',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  credit:        { label: 'Credit',        cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  advance:       { label: 'Advance',       cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  post_delivery: { label: 'Post-delivery', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

// Tab metadata. Note: `labour_stages` was previously called just "labour" — we
// renamed the *display* but keep the underlying API endpoint (`/labour-expenses`)
// because that's what currently feeds Work-Order stage approval requests.
// `labour_payments` is a new bucket for direct labour payment requests
// (currently empty placeholder until backing API ships).
const TAB_META = {
  material:        { label: 'Material',        Icon: Package,    color: 'blue',    pillActive: 'bg-blue-50 text-blue-700 border-blue-300',       badgeBg: 'bg-blue-100 text-blue-700' },
  credit:          { label: 'Credit Settlement', Icon: Banknote, color: 'purple',  pillActive: 'bg-purple-50 text-purple-700 border-purple-300', badgeBg: 'bg-purple-100 text-purple-700' },
  labour_stages:   { label: 'Labour Stages',   Icon: Users,      color: 'amber',   pillActive: 'bg-amber-50 text-amber-700 border-amber-300',    badgeBg: 'bg-amber-100 text-amber-700' },
  labour_payments: { label: 'Labour Payments', Icon: CreditCard, color: 'cyan',    pillActive: 'bg-cyan-50 text-cyan-700 border-cyan-300',       badgeBg: 'bg-cyan-100 text-cyan-700' },
};

// ---- Field accessors per type ----
const getId = (req, type) => type === 'material' ? req.request_id : type === 'labour_stages' ? (req.labour_expense_id || req.expense_id || req.request_id) : type === 'labour_payments' ? req.labour_payment_id : req.petty_cash_id;
const getAmount = (req, type) => {
  if (type === 'material') return req.estimated_price || req.estimated_cost || req.final_price || 0;
  if (type === 'labour_stages' || type === 'labour_payments') return req.total_amount || req.amount || 0;
  return req.amount_requested || req.amount || 0;
};
const getTitle = (req, type) => {
  if (type === 'material') return req.material_name || `${req.items?.length || 0} items`;
  if (type === 'labour_stages') return req.labour_type || req.contractor_name || req.description || 'Labour Stage';
  if (type === 'labour_payments') return req.contractor_name || req.description || 'Labour Payment';
  return req.purpose || req.description || 'Petty Cash';
};
const getRequester = (req) => req.requested_by_name || req.site_engineer_name || '-';

export default function PlanningRequestsTab({ projects = [], onCountChange }) {
  const [activeType, setActiveType] = useState('material');
  // 'all' | 'new' | 'in_progress' | 'awaiting' | 'approved' | 'rejected'
  const [statusFilter, setStatusFilter] = useState('all');
  // Materials use a procurement-style lifecycle bucket filter.
  // Default = 'initial_review' (the brand-new SE requests Planning needs to action first).
  const [materialBucket, setMaterialBucket] = useState('initial_review');
  const [materials, setMaterials] = useState([]);
  const [labourStages, setLabourStages] = useState([]);  // Stage-open requests (mode="stages")
  const [labourPayments, setLabourPayments] = useState([]);  // SE stage payment requests (mode="payments")
  const [petty, setPetty] = useState([]);
  const [creditEntries, setCreditEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters (Meta-style date + project)
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd);
  const [dateRange, setDateRange] = useState({
    from: monthStart,
    to: monthEnd,
    label: rangeForPreset('this_month')?.label || 'This month',
    preset: 'this_month',
  });
  const [projectFilter, setProjectFilter] = useState('');

  // Action dialogs
  const [approveDialog, setApproveDialog] = useState({ open: false, req: null, type: '' });
  const [rejectDialog, setRejectDialog] = useState({ open: false, req: null, type: '', reason: '' });
  const [processing, setProcessing] = useState(null);

  const loadAll = async () => {
    try {
      setLoading(true);
      // Load ALL statuses so the Req Handling status cards (New/In Progress/
      // Awaiting/Approved/Rejected) can show meaningful counts. Filter is
      // applied client-side via `statusFilter` + mapToReqStatus().
      // Labour Stages pill = pending Stage-Open requests from SE
      // Labour Payments pill = pending SE Work-Order stage payment requests
      const [m, lsOpen, lpNew, p, credit] = await Promise.allSettled([
        axios.get(`${API}/material-requests`),
        axios.get(`${API}/planning/stage-open-requests`).catch(() => ({ data: { requests: [] } })),
        axios.get(`${API}/planning/labour-stage-requests?status=new`).catch(() => ({ data: { requests: [] } })),
        axios.get(`${API}/planning/petty-cash-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/procurement-simple/credit-ledger?status=all`).catch(() => ({ data: { entries: [] } })),
      ]);
      setMaterials(m.status === 'fulfilled' ? (m.value.data || []) : []);
      setLabourStages(lsOpen.status === 'fulfilled' ? (lsOpen.value.data?.requests || []) : []);
      setLabourPayments(lpNew.status === 'fulfilled' ? (lpNew.value.data?.requests || []) : []);
      setPetty(p.status === 'fulfilled' ? (p.value.data || []) : []);
      setCreditEntries(credit.status === 'fulfilled' ? (credit.value.data?.entries || []) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Apply date + project filters per type
  const applyFilters = (items) => {
    let res = filterByDateRange(items, dateFrom, dateTo, (r) => r.created_at);
    if (projectFilter) res = res.filter(r => r.project_id === projectFilter);
    return res;
  };

  // Labour stage/payment items use `requested_at` (not `created_at`); apply
  // project filter only — the inner PlanningLabourStageRequests component
  // handles its own list rendering and has independent filtering.
  const applyLabourFilters = (items) => projectFilter
    ? items.filter(r => r.project_id === projectFilter)
    : items;

  const fMaterials = useMemo(() => {
    // Show all material lifecycle stages so the Planning lifecycle cards
    // (Planning Approval / Approved / Awaiting Payment / In Transit / Delivered /
    // Revision / Rejected / All) can filter accurately. The default selected
    // bucket is "Planning Approval" (status: procurement_priced).
    return applyFilters(materials || []);
  }, [materials, dateFrom, dateTo, projectFilter]);
  const fLabourStages = useMemo(() => applyLabourFilters(labourStages), [labourStages, projectFilter]);
  const fLabourPayments = useMemo(() => applyLabourFilters(labourPayments), [labourPayments, projectFilter]);
  const fPetty = useMemo(() => applyFilters(petty), [petty, dateFrom, dateTo, projectFilter]);

  // For Petty Cash, show only items already approved by Project Manager (i.e. forwarded to Planning).
  const fPettyPMApproved = useMemo(
    () => fPetty.filter(p => ['pm_approved', 'planning_approved', 'approved'].includes((p.status || '').toLowerCase())),
    [fPetty]
  );

  // The top tab pill count for Materials = items needing Planning's action only.
  const planningPendingMaterials = useMemo(
    () => fMaterials.filter(m => {
      const s = (m.status || '').toLowerCase();
      return s === 'procurement_priced' || s === 'planning_initial_pending';
    }).length,
    [fMaterials]
  );
  // Credit settlement entries pending Planning approval
  const fCreditPending = useMemo(
    () => (creditEntries || []).filter(e => e.status === 'pending_planning_approval'),
    [creditEntries]
  );

  const counts = { material: planningPendingMaterials, credit: fCreditPending.length, labour_stages: fLabourStages.length, labour_payments: fLabourPayments.length };
  const totalRequests = counts.material + counts.credit + counts.labour_stages + counts.labour_payments;
  // Bubble the count up to PlanningBoard so the "Requests" tab badge stays in sync
  useEffect(() => {
    if (typeof onCountChange === 'function') onCountChange(totalRequests);
  }, [totalRequests, onCountChange]);
  const baseList = activeType === 'material' ? fMaterials
    : activeType === 'labour_stages' ? fLabourStages
    : activeType === 'labour_payments' ? fLabourPayments
    : fPettyPMApproved;

  // Status pipeline counts for the currently-active category (post date+project filters).
  const statusCounts = useMemo(() => {
    const acc = { new: 0, in_progress: 0, awaiting: 0, approved: 0, rejected: 0 };
    baseList.forEach(r => { acc[mapToReqStatus(r.status)] = (acc[mapToReqStatus(r.status)] || 0) + 1; });
    return acc;
  }, [baseList]);

  const activeList = statusFilter === 'all'
    ? baseList
    : baseList.filter(r => mapToReqStatus(r.status) === statusFilter);

  const submitApprove = async (extra = {}) => {
    const { req, type } = approveDialog;
    if (!req) return;
    const id = getId(req, type);
    setProcessing(id);
    try {
      if (type === 'material') {
        const reqStatus = (req.status || '').toLowerCase();
        // Initial Planning approval (before Procurement) uses a different endpoint.
        const endpoint = reqStatus === 'planning_initial_pending'
          ? 'planning-initial-approve'
          : 'planning-approve';
        await axios.patch(`${API}/procurement-simple/material-requests/${id}/${endpoint}`, {
          notes: extra.notes || '',
        });
      } else if (type === 'labour_stages') {
        await axios.patch(`${API}/labour-expenses/${id}/planning-action?action=approve`);
      } else if (type === 'labour_payments') {
        toast.error('Labour Payments backend not configured yet');
        setProcessing(null);
        return;
      } else {
        await axios.patch(`${API}/planning/petty-cash/${id}/approve`, { remarks: extra.remarks || '' });
      }
      toast.success(`${TAB_META[type].label} approved`);
      setApproveDialog({ open: false, req: null, type: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Approval failed');
    } finally {
      setProcessing(null);
    }
  };

  const submitReject = async () => {
    const { req, type, reason } = rejectDialog;
    if (!req) return;
    if (!reason.trim()) { toast.error('Please provide a reason'); return; }
    const id = getId(req, type);
    setProcessing(id);
    try {
      if (type === 'material') {
        const reqStatus = (req.status || '').toLowerCase();
        const endpoint = reqStatus === 'planning_initial_pending'
          ? 'planning-initial-reject'
          : 'planning-reject';
        await axios.patch(`${API}/procurement-simple/material-requests/${id}/${endpoint}`, { reason });
      } else if (type === 'labour_stages') {
        const params = new URLSearchParams({ action: 'reject', reason });
        await axios.patch(`${API}/labour-expenses/${id}/planning-action?${params}`);
      } else if (type === 'labour_payments') {
        toast.error('Labour Payments backend not configured yet');
        setProcessing(null);
        return;
      } else {
        await axios.patch(`${API}/planning/petty-cash/${id}/reject`, { reason });
      }
      toast.success(`${TAB_META[type].label} rejected`);
      setRejectDialog({ open: false, req: null, type: '', reason: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Rejection failed');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="planning-requests-tab">
      {/* Header — Total Requests + 4 colourful pills with red round badges */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs font-semibold text-gray-700">
          Total Requests:
          <Badge className="ml-2 bg-red-500 hover:bg-red-500 text-white text-[11px] h-5 px-2 min-w-[24px] justify-center font-bold rounded-full" data-testid="planning-req-total">
            {totalRequests}
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="planning-req-pills">
        {Object.entries(TAB_META).map(([k, meta]) => {
          const Icon = meta.Icon;
          const active = activeType === k;
          const count = counts[k] || 0;
          return (
            <button
              key={k}
              onClick={() => setActiveType(k)}
              className={`group relative flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${active ? meta.pillActive + ' shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
              data-testid={`planning-pill-${k}`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{meta.label}</span>
              {/* Red round badge — instantly draws the eye to pending counts */}
              <Badge
                className={`text-[11px] h-5 px-1.5 min-w-[20px] justify-center font-bold rounded-full ${
                  count > 0 ? 'bg-red-500 hover:bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
                data-testid={`planning-pill-${k}-count`}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <MetaDateFilter
            value={dateRange}
            onChange={(r) => {
              setDateRange(r);
              setDateFrom(r?.from || '');
              setDateTo(r?.to || '');
            }}
            defaultPreset="this_month"
          />
          <ProjectSearchSelect
            projects={projects}
            value={projectFilter}
            onChange={setProjectFilter}
            placeholder="All Projects"
            testId="planning-req-project"
            accent="indigo"
          />
        </CardContent>
      </Card>

      {/* Req Handling status pipeline — for Petty Cash only.
          Materials use the lifecycle cards below. Labour uses its own component. */}
      {activeType === 'petty' && (
        <RequestStatusFilter
          counts={statusCounts}
          value={statusFilter}
          onChange={setStatusFilter}
          dataTestId="planning-req-status-filter"
        />
      )}

      {/* Labour Stages → Stage Open Requests only */}
      {activeType === 'labour_stages' && <PlanningLabourStageRequests mode="stages" />}
      {/* Labour Payments → RAB approval queue (new 4-tier chain: SE→PM→QC→Planning→Accountant) */}
      {activeType === 'labour_payments' && <RABApprovalQueue role="planning" title="Planning Review — Labour RAB" />}

      {/* MATERIAL — procurement-style card layout with lifecycle filter cards. */}
      {activeType === 'material' && (
        <MaterialLifecycleView
          items={fMaterials}
          loading={loading}
          bucket={materialBucket}
          setBucket={setMaterialBucket}
          onApprove={(req) => setApproveDialog({ open: true, req, type: 'material' })}
          processing={processing}
        />
      )}

      {/* CREDIT SETTLEMENT — Planning approves Procurement's "Collect Payment" requests */}
      {activeType === 'credit' && (
        <CreditSettlementApprovalList
          entries={fCreditPending}
          loading={loading}
          onAction={loadAll}
        />
      )}

      {/* PETTY CASH — keep legacy row layout */}
      {activeType === 'petty' && (
      <>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : activeList.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-300" />
              No pending {TAB_META[activeType].label.toLowerCase()} requests in this range
            </div>
          ) : (
            <div className="divide-y" data-testid={`planning-req-list-${activeType}`}>
              {activeList.map(req => {
                const id = getId(req, activeType);
                const amount = getAmount(req, activeType);
                return (
                  <div key={id} className="p-3 flex items-center justify-between gap-3 hover:bg-gray-50" data-testid={`planning-req-row-${activeType}-${id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{req.project_name || 'Unknown Project'}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {getTitle(req, activeType)}
                        {' | '}
                        Requested by: {getRequester(req)}
                        {amount > 0 && <> {' | '} <span className="font-semibold text-gray-700">{fmt(amount)}</span></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-green-600 hover:bg-green-700 gap-1 px-3"
                        disabled={processing === id}
                        onClick={() => setApproveDialog({ open: true, req, type: activeType })}
                        data-testid={`approve-${activeType}-btn-${id}`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600 border-red-200 gap-1 px-3"
                        disabled={processing === id}
                        onClick={() => setRejectDialog({ open: true, req, type: activeType, reason: '' })}
                        data-testid={`reject-${activeType}-btn-${id}`}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {/* Approve Review Dialog */}
      <ApproveReviewDialog
        state={approveDialog}
        onCancel={() => setApproveDialog({ open: false, req: null, type: '' })}
        onSubmit={submitApprove}
        onRevision={async (revRemarks) => {
          const { req } = approveDialog;
          if (!req) return;
          const id = getId(req, 'material');
          setProcessing(id);
          try {
            await axios.patch(`${API}/procurement-simple/material-requests/${id}/planning-revision`, {
              revision_remarks: revRemarks,
            });
            toast.success('Sent back to Procurement for revision');
            setApproveDialog({ open: false, req: null, type: '' });
            loadAll();
          } catch (e) {
            toast.error(e?.response?.data?.detail || 'Failed to send for revision');
          } finally { setProcessing(null); }
        }}
        onReject={async (reason) => {
          const { req } = approveDialog;
          if (!req) return;
          const id = getId(req, 'material');
          setProcessing(id);
          try {
            const reqStatus = (req.status || '').toLowerCase();
            const endpoint = reqStatus === 'planning_initial_pending'
              ? 'planning-initial-reject'
              : 'planning-reject';
            await axios.patch(`${API}/procurement-simple/material-requests/${id}/${endpoint}`, { reason });
            toast.success('Rejected');
            setApproveDialog({ open: false, req: null, type: '' });
            loadAll();
          } catch (e) {
            toast.error(e?.response?.data?.detail || 'Failed to reject');
          } finally { setProcessing(null); }
        }}
        processing={!!processing}
      />

      {/* Reject Remarks Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => !o && setRejectDialog({ open: false, req: null, type: '', reason: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ThumbsDown className="h-5 w-5" /> Reject {rejectDialog.type ? TAB_META[rejectDialog.type].label : ''} Request
            </DialogTitle>
          </DialogHeader>
          {rejectDialog.req && (
            <div className="space-y-3">
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs space-y-0.5">
                <p className="font-medium text-red-800">{rejectDialog.req.project_name || 'Unknown Project'}</p>
                <p className="text-red-600">{getTitle(rejectDialog.req, rejectDialog.type)} · {fmt(getAmount(rejectDialog.req, rejectDialog.type))}</p>
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1 block">Reason for rejection *</Label>
                <Textarea
                  rows={3}
                  placeholder="Explain why this request is being rejected..."
                  value={rejectDialog.reason}
                  onChange={e => setRejectDialog({ ...rejectDialog, reason: e.target.value })}
                  data-testid="reject-reason-textarea"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, req: null, type: '', reason: '' })} disabled={!!processing}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitReject} disabled={!!processing} data-testid="reject-confirm-btn">
              {processing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rejecting…</> : <><ThumbsDown className="h-4 w-4 mr-1" /> Confirm Reject</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Approve Review Dialog (review then approve) ----
function ApproveReviewDialog({ state, onCancel, onSubmit, onRevision, onReject, processing }) {
  const { open, req, type } = state;
  const [approvedQty, setApprovedQty] = useState('');
  const [remarks, setRemarks] = useState('');
  // Inline revision/reject prompts so Planning can act without leaving the dialog.
  const [mode, setMode] = useState('review'); // 'review' | 'revision' | 'reject'
  const [revisionRemarks, setRevisionRemarks] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (open && req) {
      setApprovedQty(type === 'material' ? String(req.quantity || '') : '');
      setRemarks('');
      setMode('review');
      setRevisionRemarks('');
      setRejectReason('');
    }
  }, [open, req, type]);

  if (!req) return null;
  const meta = TAB_META[type];
  const Icon = meta?.Icon || FileText;

  const handle = () => {
    const extra = {};
    if (type === 'material' && approvedQty) extra.approved_qty = parseFloat(approvedQty);
    if (type === 'petty') extra.remarks = remarks;
    onSubmit(extra);
  };
  const handleRevision = () => {
    if (!revisionRemarks.trim()) return;
    onRevision?.(revisionRemarks);
  };
  const handleReject = () => {
    if (!rejectReason.trim()) return;
    onReject?.(rejectReason);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <Icon className="h-5 w-5" /> Review &amp; Approve — {meta?.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Header */}
          <Card className={`border-l-4 ${type === 'material' ? 'border-l-blue-500 bg-blue-50' : (type === 'labour_stages' || type === 'labour_payments') ? 'border-l-amber-500 bg-amber-50' : 'border-l-emerald-500 bg-emerald-50'}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase text-gray-500 font-semibold">Project</p>
                  <p className="font-bold text-sm flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {req.project_name || 'Unknown'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase text-gray-500 font-semibold">Amount</p>
                  <p className="font-bold text-base">{fmt(getAmount(req, type))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-500 text-[10px] uppercase">Description</p>
              <p className="font-medium">{getTitle(req, type)}</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-500 text-[10px] uppercase flex items-center gap-1"><UserIcon className="h-3 w-3" /> Requested by</p>
              <p className="font-medium">{getRequester(req)}</p>
            </div>
            {type === 'material' && (
              <>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 text-[10px] uppercase">Quantity</p>
                  <p className="font-medium">{req.quantity} {req.unit || ''}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 text-[10px] uppercase">Brand</p>
                  <p className="font-medium">{req.brand || '-'}</p>
                </div>
                {/* Procurement-priced fields */}
                {req.vendor_name && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 col-span-2">
                    <p className="text-amber-700 text-[10px] uppercase font-semibold">Procurement Vendor</p>
                    <p className="font-bold text-sm">{req.vendor_name}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Unit: {fmt(req.unit_rate || req.unit_price || 0)} · Total: {fmt(req.estimated_price || req.total_amount || 0)}
                      {req.transport_cost > 0 && <> · Transport: {fmt(req.transport_cost)}</>}
                      {req.discount > 0 && <> · Discount: {fmt(req.discount)}</>}
                    </p>
                  </div>
                )}
                {req.payment_mode && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-2">
                    <p className="text-blue-700 text-[10px] uppercase font-semibold">Payment Mode</p>
                    <p className="font-bold text-sm capitalize">{(req.payment_mode || '').replace(/_/g, ' ')}</p>
                    {req.payment_mode === 'credit' && req.credit_days && (
                      <p className="text-[10px] text-gray-600">Pay {req.credit_days} days after delivery</p>
                    )}
                    {req.payment_mode === 'advance' && (req.advance_amount || req.advance_percent) && (
                      <p className="text-[10px] text-gray-600">
                        Advance: {fmt(req.advance_amount || 0)}{req.advance_percent ? ` (${req.advance_percent}%)` : ''}
                        {req.balance_amount > 0 && <> · Balance: {fmt(req.balance_amount)}</>}
                      </p>
                    )}
                  </div>
                )}
                {(req.expected_delivery || req.timeline_value) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
                    <p className="text-emerald-700 text-[10px] uppercase font-semibold">Procurement Delivery</p>
                    <p className="font-bold text-sm">
                      {req.expected_delivery
                        ? new Date(req.expected_delivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : `${req.timeline_value} days`}
                    </p>
                  </div>
                )}
                {req.se_requested_hours && (
                  <div className={`rounded p-2 border ${req.delivery_delta_hours > 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                    <p className={`text-[10px] uppercase font-semibold ${req.delivery_delta_hours > 0 ? 'text-red-700' : 'text-blue-700'}`}>SE Expected</p>
                    <p className="font-bold text-sm">{req.se_delivery_choice === '24h' ? '24 hours' : req.se_delivery_choice === '48h' ? '48 hours' : (req.se_expected_delivery ? new Date(req.se_expected_delivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : `${req.se_requested_hours}h`)}</p>
                    {req.delivery_delta_hours > 0 && (
                      <p className="text-[10px] text-red-700 italic mt-0.5">⚠ +{req.delivery_delta_hours}h late vs SE</p>
                    )}
                  </div>
                )}
                {req.late_delivery_reason && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 col-span-2">
                    <p className="text-red-700 text-[10px] uppercase font-semibold">Late Delivery Reason (Procurement)</p>
                    <p className="italic text-red-700">"{req.late_delivery_reason}"</p>
                  </div>
                )}
                {req.se_emergency_reason && (
                  <div className="bg-orange-50 border border-orange-200 rounded p-2 col-span-2">
                    <p className="text-orange-700 text-[10px] uppercase font-semibold">⚡ SE Emergency Reason</p>
                    <p className="italic text-orange-700">"{req.se_emergency_reason}"</p>
                  </div>
                )}
                {req.procurement_remarks && (
                  <div className="bg-gray-100 rounded p-2 col-span-2">
                    <p className="text-gray-600 text-[10px] uppercase font-semibold">Procurement Note</p>
                    <p className="italic text-gray-700">"{req.procurement_remarks}"</p>
                  </div>
                )}
              </>
            )}
            {(type === 'labour_stages' || type === 'labour_payments') && (
              <>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 text-[10px] uppercase">Contractor</p>
                  <p className="font-medium">{req.contractor_name || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 text-[10px] uppercase">Workers · Days</p>
                  <p className="font-medium">{req.num_workers || '-'} × {req.num_days || '-'}d</p>
                </div>
              </>
            )}
            {type === 'petty' && (
              <>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 text-[10px] uppercase">Purpose</p>
                  <p className="font-medium">{req.purpose || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gray-500 text-[10px] uppercase flex items-center gap-1"><Calendar className="h-3 w-3" /> Requested</p>
                  <p className="font-medium">{req.created_at ? new Date(req.created_at).toLocaleDateString('en-IN') : '-'}</p>
                </div>
              </>
            )}
          </div>

          {/* Type-specific inputs */}
          {type === 'material' && !req.vendor_name && (
            <div>
              <Label className="text-xs font-semibold mb-1 block">Approved Quantity</Label>
              <Input
                type="number"
                min="0"
                value={approvedQty}
                onChange={e => setApprovedQty(e.target.value)}
                placeholder={`Original: ${req.quantity || 0}`}
                data-testid="approve-qty-input"
              />
              <p className="text-[10px] text-gray-400 mt-1">Leave blank to approve full quantity</p>
            </div>
          )}
          {type === 'petty' && (
            <div>
              <Label className="text-xs font-semibold mb-1 block">Approval Remarks (optional)</Label>
              <Textarea
                rows={2}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Any notes for the accountant..."
                data-testid="approve-remarks-input"
              />
            </div>
          )}

          {req.remarks && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
              <p className="text-amber-700 font-semibold flex items-center gap-1 mb-0.5"><AlertCircle className="h-3 w-3" /> Requester's note</p>
              <p className="text-gray-700 italic">"{req.remarks}"</p>
            </div>
          )}

          {/* Inline revision-request box — appears when Planning clicks "Send for Revision" */}
          {mode === 'revision' && (
            <div className="bg-orange-50 border border-orange-200 rounded p-3 space-y-2" data-testid="planning-revision-box">
              <Label className="text-xs font-semibold text-orange-800">Revision remarks for Procurement *</Label>
              <Textarea
                rows={3}
                value={revisionRemarks}
                onChange={(e) => setRevisionRemarks(e.target.value)}
                placeholder="What needs to be corrected? (e.g. wrong vendor, price too high, change brand…)"
                className="text-sm"
                data-testid="planning-revision-remarks"
                autoFocus
              />
            </div>
          )}

          {/* Inline reject box */}
          {mode === 'reject' && (
            <div className="bg-red-50 border border-red-200 rounded p-3 space-y-2" data-testid="planning-reject-box">
              <Label className="text-xs font-semibold text-red-800">Rejection reason *</Label>
              <Textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this rejected entirely?"
                className="text-sm"
                data-testid="planning-reject-remarks"
                autoFocus
              />
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} disabled={processing}>Cancel</Button>
          {mode === 'review' && (
            <>
              {/* Show Send-for-Revision + Reject only for material requests (Procurement-priced flow). */}
              {type === 'material' && (
                <>
                  {(req.status || '').toLowerCase() !== 'planning_initial_pending' && (
                    <Button
                      variant="outline"
                      className="text-orange-700 border-orange-300 hover:bg-orange-50"
                      onClick={() => setMode('revision')}
                      disabled={processing}
                      data-testid="planning-revision-btn"
                    >
                      <FileText className="h-4 w-4 mr-1" /> Send for Revision
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="text-red-700 border-red-300 hover:bg-red-50"
                    onClick={() => setMode('reject')}
                    disabled={processing}
                    data-testid="planning-reject-btn-inline"
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </>
              )}
              <Button className="bg-green-600 hover:bg-green-700" onClick={handle} disabled={processing} data-testid="approve-confirm-btn">
                {processing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Approving…</> : <><ThumbsUp className="h-4 w-4 mr-1" /> Approve</>}
              </Button>
            </>
          )}
          {mode === 'revision' && (
            <>
              <Button variant="outline" onClick={() => setMode('review')} disabled={processing}>Back</Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={handleRevision}
                disabled={processing || !revisionRemarks.trim()}
                data-testid="planning-revision-confirm"
              >
                {processing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…</> : <>Send to Procurement</>}
              </Button>
            </>
          )}
          {mode === 'reject' && (
            <>
              <Button variant="outline" onClick={() => setMode('review')} disabled={processing}>Back</Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={handleReject}
                disabled={processing || !rejectReason.trim()}
                data-testid="planning-reject-confirm-inline"
              >
                {processing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rejecting…</> : <><ThumbsDown className="h-4 w-4 mr-1" /> Confirm Reject</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// =====================================================================
// Material Lifecycle View — procurement-style cards, Planning's perspective
// =====================================================================
function MaterialLifecycleView({ items, loading, bucket, setBucket, onApprove, processing }) {
  const counts = useMemo(() => {
    const c = { all: items.length };
    MAT_LIFECYCLE_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    items.forEach(r => {
      const b = bucketForMaterial(r);
      if (b !== 'all') c[b] = (c[b] || 0) + 1;
    });
    return c;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (bucket === 'all') return items;
    return items.filter(r => bucketForMaterial(r) === bucket);
  }, [items, bucket]);

  return (
    <div className="space-y-3">
      {/* Lifecycle filter cards — "Planning Approval" first */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" data-testid="planning-mat-lifecycle-cards">
        {MAT_LIFECYCLE_BUCKETS.map(b => {
          const Icon = b.Icon;
          const active = bucket === b.key;
          const count = counts[b.key] || 0;
          return (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={`flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${
                active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'
              }`}
              data-testid={`planning-mat-bucket-${b.key}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-xs font-bold ${active ? 'text-white' : ''}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Card list */}
      {loading ? (
        <p className="text-center text-xs text-gray-400 py-10"><Loader2 className="h-5 w-5 animate-spin inline mr-1" /> Loading…</p>
      ) : visibleItems.length === 0 ? (
        <Card><CardContent className="p-10"><p className="text-center text-xs text-gray-400">
          {bucket === 'planning_awaiting' ? 'No requests awaiting your approval' : 'No requests in this bucket'}
        </p></CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="planning-mat-card-list">
          {visibleItems.map(req => (
            <PlanningMaterialCard key={req.request_id} req={req} onClick={() => onApprove(req)} processing={processing} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanningMaterialCard({ req, onClick, processing }) {
  const status = (req.status || '').toLowerCase();
  const bucket = bucketForMaterial(req);
  const cardCfg = MAT_LIFECYCLE_BUCKETS.find(b => b.key === bucket);
  const isActionable = status === 'procurement_priced' || status === 'planning_initial_pending';
  const isInitialReview = status === 'planning_initial_pending';
  const id = req.request_id;
  const isProcessing = processing === id;
  let deliveryLabel = '—';
  if (req.expected_delivery) {
    deliveryLabel = fmtDate(req.expected_delivery);
  } else if (req.timeline_type === 'days' && req.timeline_value) {
    deliveryLabel = `${req.timeline_value} days`;
  }
  const pmCfg = PAYMENT_MODE_DISPLAY[req.payment_mode];
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer border-l-4"
      style={{ borderLeftColor: '#d97706' }}
      onClick={onClick}
      data-testid={`planning-mat-card-${id}`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${cardCfg?.cls || ''}`}>
              {cardCfg?.label || status}
            </Badge>
            {pmCfg && (
              <Badge variant="outline" className={`text-[10px] ${pmCfg.cls}`}>{pmCfg.label}</Badge>
            )}
            {req.order_id && <span className="text-[10px] text-gray-400 font-mono">#{req.order_id}</span>}
          </div>
          {(req.estimated_price || req.total_amount) ? (
            <span className="text-sm font-semibold text-emerald-700 shrink-0">{fmt(req.estimated_price || req.total_amount)}</span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400">Date</p>
            <p className="font-medium">{fmtDate(req.created_at)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[10px] uppercase font-semibold text-gray-400">Material</p>
            <p className="font-medium truncate">{req.material_name}</p>
            {req.brand && <p className="text-[10px] text-gray-500">Brand: {req.brand}</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400">Qty</p>
            <p className="font-medium">{req.quantity} {req.unit || ''}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400 flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> Delivery</p>
            <p className="font-medium">{deliveryLabel}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400">Project</p>
            <p className="font-medium truncate">{req.project_name}</p>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <p className="text-[10px] uppercase font-semibold text-gray-400">Vendor (Procurement)</p>
            <p className="font-medium truncate">{req.vendor_name || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400">SE</p>
            <p className="font-medium truncate">{req.site_engineer_name || '—'}</p>
          </div>
          <div className="sm:col-span-1">
            {isActionable ? (
              <Button
                size="sm"
                className={`h-8 w-full text-xs gap-1 mt-3 sm:mt-0 ${isInitialReview ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`}
                disabled={isProcessing}
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                data-testid={`planning-mat-card-approve-${id}`}
              >
                <ThumbsUp className="h-3 w-3" /> {isInitialReview ? 'Review' : 'Approve'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full text-xs gap-1 mt-3 sm:mt-0"
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                data-testid={`planning-mat-card-view-${id}`}
              >
                <FileText className="h-3 w-3" /> View
              </Button>
            )}
          </div>
        </div>

        {req.procurement_remarks && (
          <div className="mt-2 pt-2 border-t text-[11px] italic text-gray-500 truncate">
            <span className="text-gray-400 font-medium not-italic">Procurement:</span> "{req.procurement_remarks}"
          </div>
        )}
        {status === 'procurement_revision' && req.revision_remarks && (
          <div className="mt-2 pt-2 border-t border-orange-200 text-[11px] text-orange-700 truncate">
            <span className="font-semibold">Revision sent:</span> "{req.revision_remarks}"
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ---- Credit Settlement Approval List (Planning queue) ----
function CreditSettlementApprovalList({ entries, loading, onAction }) {
  const [processing, setProcessing] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, entry: null, reason: '' });

  const approve = async (e) => {
    setProcessing(e.ledger_id);
    try {
      await axios.post(`${API}/planning/credit-ledger/${e.ledger_id}/approve`, { notes: '' });
      toast.success('Approved — sent to Accountant');
      onAction?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Approval failed');
    } finally { setProcessing(null); }
  };

  const submitReject = async () => {
    if (!rejectDialog.reason.trim()) { toast.error('Reason required'); return; }
    setProcessing(rejectDialog.entry.ledger_id);
    try {
      await axios.post(`${API}/planning/credit-ledger/${rejectDialog.entry.ledger_id}/reject`, { reason: rejectDialog.reason });
      toast.success('Rejected — returned to Procurement');
      setRejectDialog({ open: false, entry: null, reason: '' });
      onAction?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Reject failed');
    } finally { setProcessing(null); }
  };

  if (loading) return <Card><CardContent className="py-12 text-center text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</CardContent></Card>;
  if (!entries.length) return <Card><CardContent className="p-10"><p className="text-center text-xs text-gray-400">No credit settlement requests awaiting Planning approval</p></CardContent></Card>;

  return (
    <div className="space-y-2" data-testid="credit-approval-list">
      {entries.map(e => {
        const due = e.due_date ? new Date(e.due_date) : null;
        const daysLeft = due ? Math.round((due.getTime() - Date.now()) / 86400000) : null;
        const overdue = daysLeft !== null && daysLeft < 0;
        const dueLabel =
          daysLeft === null ? '—'
          : daysLeft < 0    ? `Overdue by ${Math.abs(daysLeft)}d`
          : daysLeft === 0  ? 'Due today'
          : `Due in ${daysLeft}d`;
        return (
          <Card key={e.ledger_id} className="hover:shadow-md transition-shadow" data-testid={`credit-approval-card-${e.ledger_id}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">Credit Settlement</Badge>
                  <Badge variant="outline" className={`text-[10px] ${overdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{dueLabel}</Badge>
                  <span className="text-[10px] text-gray-400 font-mono">#{e.ledger_id}</span>
                </div>
                <span className="text-sm font-semibold text-emerald-700 shrink-0">{fmt(e.amount)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase font-semibold text-gray-400">Material</p>
                  <p className="font-medium truncate">{e.material_name}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-400">Vendor</p>
                  <p className="font-medium truncate">{e.vendor_name}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-400">Delivered</p>
                  <p className="font-medium">{fmtDate(e.delivered_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-400">Deadline</p>
                  <p className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{fmtDate(e.due_date)}</p>
                </div>
              </div>
              {e.settlement_requested_by_name && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Requested by <strong>{e.settlement_requested_by_name}</strong>
                  {e.settlement_remarks && <> · "{e.settlement_remarks}"</>}
                </p>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => setRejectDialog({ open: true, entry: e, reason: '' })}
                  disabled={processing === e.ledger_id}
                  data-testid={`credit-reject-btn-${e.ledger_id}`}
                >
                  <ThumbsDown className="h-3 w-3" /> Reject
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => approve(e)}
                  disabled={processing === e.ledger_id}
                  data-testid={`credit-approve-btn-${e.ledger_id}`}
                >
                  {processing === e.ledger_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />} Approve & Send to Accountant
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={rejectDialog.open} onOpenChange={(o) => !o && setRejectDialog({ open: false, entry: null, reason: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><ThumbsDown className="h-5 w-5" /> Reject Credit Settlement</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Reason for rejection *</Label>
            <Textarea rows={3} value={rejectDialog.reason} onChange={(ev) => setRejectDialog({ ...rejectDialog, reason: ev.target.value })} placeholder="Why is this rejected?" className="mt-1 text-sm" data-testid="credit-reject-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectDialog({ open: false, entry: null, reason: '' })} disabled={!!processing}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={submitReject} disabled={!!processing} data-testid="credit-reject-confirm">
              {processing ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
