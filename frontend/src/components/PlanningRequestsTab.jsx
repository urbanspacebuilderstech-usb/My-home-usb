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
import { Package, Users, Wallet, ThumbsUp, ThumbsDown, Loader2, CheckCircle2, AlertCircle, FileText, Calendar, User as UserIcon, Briefcase, CreditCard } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

// Tab metadata. Note: `labour_stages` was previously called just "labour" — we
// renamed the *display* but keep the underlying API endpoint (`/labour-expenses`)
// because that's what currently feeds Work-Order stage approval requests.
// `labour_payments` is a new bucket for direct labour payment requests
// (currently empty placeholder until backing API ships).
const TAB_META = {
  material:        { label: 'Material',        Icon: Package,    color: 'blue',    pillActive: 'bg-blue-50 text-blue-700 border-blue-300',       badgeBg: 'bg-blue-100 text-blue-700' },
  labour_stages:   { label: 'Labour Stages',   Icon: Users,      color: 'amber',   pillActive: 'bg-amber-50 text-amber-700 border-amber-300',    badgeBg: 'bg-amber-100 text-amber-700' },
  labour_payments: { label: 'Labour Payments', Icon: CreditCard, color: 'cyan',    pillActive: 'bg-cyan-50 text-cyan-700 border-cyan-300',       badgeBg: 'bg-cyan-100 text-cyan-700' },
  petty:           { label: 'Petty Cash',      Icon: Wallet,     color: 'emerald', pillActive: 'bg-emerald-50 text-emerald-700 border-emerald-300', badgeBg: 'bg-emerald-100 text-emerald-700' },
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

export default function PlanningRequestsTab({ projects = [] }) {
  const [activeType, setActiveType] = useState('material');
  const [materials, setMaterials] = useState([]);
  const [labourStages, setLabourStages] = useState([]);
  const [labourPayments, setLabourPayments] = useState([]);
  const [petty, setPetty] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters (Meta-style date + project)
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd);
  const [projectFilter, setProjectFilter] = useState('');

  // Action dialogs
  const [approveDialog, setApproveDialog] = useState({ open: false, req: null, type: '' });
  const [rejectDialog, setRejectDialog] = useState({ open: false, req: null, type: '', reason: '' });
  const [processing, setProcessing] = useState(null);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [m, l, p] = await Promise.allSettled([
        axios.get(`${API}/material-requests?status=requested`),
        axios.get(`${API}/labour-expenses?status=requested`),
        axios.get(`${API}/planning/petty-cash-requests`).catch(() => ({ data: [] })),
      ]);
      setMaterials(m.status === 'fulfilled' ? (m.value.data || []) : []);
      setLabourStages(l.status === 'fulfilled' ? (l.value.data || []) : []);
      // Labour Payments — placeholder until a dedicated `/labour-payments` endpoint
      // exists. Keeping the state hook so wiring it in later is a one-line change.
      setLabourPayments([]);
      // Only show requests still pending Planning's action
      const pettyAll = p.status === 'fulfilled' ? (p.value.data || []) : [];
      setPetty(pettyAll.filter(r => r.status === 'requested'));
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

  const fMaterials = useMemo(() => applyFilters(materials), [materials, dateFrom, dateTo, projectFilter]);
  const fLabourStages = useMemo(() => applyFilters(labourStages), [labourStages, dateFrom, dateTo, projectFilter]);
  const fLabourPayments = useMemo(() => applyFilters(labourPayments), [labourPayments, dateFrom, dateTo, projectFilter]);
  const fPetty = useMemo(() => applyFilters(petty), [petty, dateFrom, dateTo, projectFilter]);

  const counts = { material: fMaterials.length, labour_stages: fLabourStages.length, labour_payments: fLabourPayments.length, petty: fPetty.length };
  const totalRequests = counts.material + counts.labour_stages + counts.labour_payments + counts.petty;
  const activeList = activeType === 'material' ? fMaterials
    : activeType === 'labour_stages' ? fLabourStages
    : activeType === 'labour_payments' ? fLabourPayments
    : fPetty;

  const submitApprove = async (extra = {}) => {
    const { req, type } = approveDialog;
    if (!req) return;
    const id = getId(req, type);
    setProcessing(id);
    try {
      if (type === 'material') {
        const params = new URLSearchParams({ action: 'approve' });
        if (extra.approved_qty != null) params.append('approved_qty', extra.approved_qty);
        await axios.patch(`${API}/material-requests/${id}/planning-action?${params}`);
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
        const params = new URLSearchParams({ action: 'reject', reason });
        await axios.patch(`${API}/material-requests/${id}/planning-action?${params}`);
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
          <CashbookDateFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            testIdPrefix="planning-req"
            accent="indigo"
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

      {/* Request Rows */}
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

      {/* Approve Review Dialog */}
      <ApproveReviewDialog
        state={approveDialog}
        onCancel={() => setApproveDialog({ open: false, req: null, type: '' })}
        onSubmit={submitApprove}
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
function ApproveReviewDialog({ state, onCancel, onSubmit, processing }) {
  const { open, req, type } = state;
  const [approvedQty, setApprovedQty] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (open && req) {
      setApprovedQty(type === 'material' ? String(req.quantity || '') : '');
      setRemarks('');
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
          {type === 'material' && (
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={processing}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={handle} disabled={processing} data-testid="approve-confirm-btn">
            {processing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Approving…</> : <><ThumbsUp className="h-4 w-4 mr-1" /> Approve</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
