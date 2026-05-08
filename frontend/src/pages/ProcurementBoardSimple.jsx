import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Package, ClipboardList, Building2, Truck, Eye, Send, ThumbsDown, RefreshCw,
  CheckCircle2, AlertCircle, Wallet, IndianRupee, ShoppingCart, Hourglass,
  CalendarClock, FileClock, Banknote, ListChecks, CheckCheck, PackageCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

const NAV = [
  { label: 'Dashboard', value: 'requests', icon: 'ClipboardList' },
  { label: 'All Projects', value: 'projects', icon: 'Building2' },
  { label: 'Material Vendors', value: 'vendors', icon: 'Truck' },
];

export default function ProcurementBoardSimple() {
  const [user, setUser] = useState(null);
  const [activeNav, setActiveNav] = useState('requests');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    // Legacy `?tab=dashboard` URLs land on requests now (they're the same page).
    if (t === 'dashboard') {
      setActiveNav('requests');
    } else if (t && NAV.some(n => n.value === t)) {
      setActiveNav(t);
    }
    axios.get(`${API}/auth/me`).then(r => setUser(r.data)).catch(() => { window.location.href = '/login'; });
  }, []);

  const setNav = (v) => {
    setActiveNav(v);
    const url = new URL(window.location);
    url.searchParams.set('tab', v);
    window.history.replaceState({}, '', url);
  };

  if (!user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20" data-testid="procurement-board-simple">
      <AppHeader user={user} customNav={NAV} activeCustomNav={activeNav} onCustomNavChange={setNav} />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
        {activeNav === 'requests' && <RequestsTab />}
        {activeNav === 'projects' && <AllProjectsTab />}
        {activeNav === 'vendors' && <MaterialVendorsTab />}
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}


// =====================================================================
// REQUESTS — Material approvals queue
// =====================================================================
// Lifecycle filter cards spanning the full Procurement → Delivery pipeline.
// Each card maps to one or more material_request statuses.
const LIFECYCLE_BUCKETS = [
  { key: 'all',      label: 'All',              Icon: ListChecks,  cls: 'bg-violet-50 border-violet-200 text-violet-700',  active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'new',      label: 'New (SE)',         Icon: ClipboardList, cls: 'bg-amber-50 border-amber-200 text-amber-700',  active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'revision', label: 'Revision',         Icon: FileClock,   cls: 'bg-orange-50 border-orange-200 text-orange-700', active: 'bg-orange-600 text-white border-orange-600' },
  { key: 'forwarded', label: 'Vendor Assigned', Icon: Send,        cls: 'bg-blue-50 border-blue-200 text-blue-700',       active: 'bg-blue-600 text-white border-blue-600' },
  { key: 'planning_approved', label: 'Planning Approved', Icon: CheckCircle2, cls: 'bg-indigo-50 border-indigo-200 text-indigo-700', active: 'bg-indigo-600 text-white border-indigo-600' },
  { key: 'awaiting_payment', label: 'Accountant Approval', Icon: Wallet,    cls: 'bg-orange-50 border-orange-200 text-orange-700', active: 'bg-orange-600 text-white border-orange-600' },
  { key: 'transit',  label: 'In Transit',       Icon: Truck,       cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white border-cyan-600' },
  { key: 'delivered', label: 'Delivered',       Icon: PackageCheck, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'rejected', label: 'Rejected',         Icon: ThumbsDown,  cls: 'bg-red-50 border-red-200 text-red-700',           active: 'bg-red-600 text-white border-red-600' },
];

const STATUS_TO_BUCKET = {
  requested: 'new',
  pm_approved: 'new',
  procurement_revision: 'revision',
  procurement_priced: 'forwarded',
  planning_approved: 'planning_approved',
  pending_accounts_approval: 'awaiting_payment',
  accounts_approved: 'awaiting_payment',
  payment_approved: 'awaiting_payment',
  in_transit: 'transit',
  delivered: 'delivered',
  completed: 'delivered',
  closed: 'delivered',
  procurement_rejected: 'rejected',
  rejected: 'rejected',
};

function RequestsTab() {
  const [bucket, setBucket] = useState('new');
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, req: null, reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // The "all" queue returns the procurement-relevant slice; for the post-procurement
      // statuses (planning_approved/transit/delivered) we union with the global list.
      const [procRes, globalRes] = await Promise.all([
        axios.get(`${API}/procurement-simple/queue?queue=all`),
        axios.get(`${API}/material-requests`).catch(() => ({ data: [] })),
      ]);
      const procList = procRes.data?.requests || [];
      const procIds = new Set(procList.map(r => r.request_id));
      const extras = (globalRes.data || []).filter(r => !procIds.has(r.request_id));
      setAllItems([...procList, ...extras]);
    } catch {
      setAllItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const counts = useMemo(() => {
    const c = { all: allItems.length };
    LIFECYCLE_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    allItems.forEach(r => {
      const b = STATUS_TO_BUCKET[(r.status || '').toLowerCase()] || 'new';
      c[b] = (c[b] || 0) + 1;
    });
    return c;
  }, [allItems]);

  const visibleItems = useMemo(() => {
    if (bucket === 'all') return allItems;
    return allItems.filter(r => (STATUS_TO_BUCKET[(r.status || '').toLowerCase()] || 'new') === bucket);
  }, [allItems, bucket]);

  const submitReject = async () => {
    if (!rejectDialog.reason.trim()) { toast.error('Reason is required'); return; }
    setSubmitting(true);
    try {
      await axios.patch(`${API}/procurement-simple/material-requests/${rejectDialog.req.request_id}/reject`, { reason: rejectDialog.reason });
      toast.success('Request rejected');
      setRejectDialog({ open: false, req: null, reason: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reject');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3" data-testid="proc-requests-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Material Requests</h1>
          <p className="text-[11px] text-gray-500">SE → Procurement → Planning → Accountant → Transit → Delivery</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={fetchAll} data-testid="proc-refresh">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Lifecycle filter cards */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5" data-testid="proc-lifecycle-cards">
        {LIFECYCLE_BUCKETS.map(b => {
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
              data-testid={`proc-bucket-${b.key}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-xs font-bold ${active ? 'text-white' : ''}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Card-style request list */}
      {loading ? (
        <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
      ) : visibleItems.length === 0 ? (
        <Card><CardContent className="p-10"><p className="text-center text-xs text-gray-400">No requests in this bucket</p></CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="proc-card-list">
          {visibleItems.map(r => (
            <RequestCard key={r.request_id} req={r} onClick={() => setOpen(r)} />
          ))}
        </div>
      )}

      <AssignVendorDialog
        item={open}
        readOnly={open ? !['requested', 'pm_approved', 'procurement_revision'].includes((open.status || '').toLowerCase()) : false}
        onClose={() => setOpen(null)}
        onDone={() => { setOpen(null); fetchAll(); }}
        onReject={(req) => { setOpen(null); setRejectDialog({ open: true, req, reason: '' }); }}
      />

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => !o && setRejectDialog({ open: false, req: null, reason: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><ThumbsDown className="h-5 w-5" /> Reject Material Request</DialogTitle>
            <DialogDescription className="text-xs">{rejectDialog.req?.material_name} · {rejectDialog.req?.project_name}</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Reason for rejection *</Label>
            <Textarea rows={3} value={rejectDialog.reason} onChange={(e) => setRejectDialog({ ...rejectDialog, reason: e.target.value })} placeholder="Why is this rejected?" className="mt-1 text-sm" data-testid="proc-reject-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectDialog({ open: false, req: null, reason: '' })} disabled={submitting}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={submitReject} disabled={submitting} data-testid="proc-reject-confirm">
              {submitting ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Single material request card (clickable)
function RequestCard({ req, onClick }) {
  const status = (req.status || '').toLowerCase();
  const bucket = STATUS_TO_BUCKET[status] || 'new';
  const cardCfg = LIFECYCLE_BUCKETS.find(b => b.key === bucket);
  const isActionable = ['requested', 'pm_approved', 'procurement_revision'].includes(status);
  // Compute "deliver in" label
  let deliveryLabel = '—';
  if (req.expected_delivery) {
    deliveryLabel = fmtDate(req.expected_delivery);
  } else if (req.timeline_type === 'days' && req.timeline_value) {
    deliveryLabel = `${req.timeline_value} days`;
  }
  const pmCfg = PAYMENT_MODE_DISPLAY[req.payment_mode];
  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer border-l-4 hover:bg-amber-50/30"
      style={{ borderLeftColor: cardCfg ? `var(--tw-${cardCfg.key})` : '#f59e0b' }}
      onClick={onClick}
      data-testid={`proc-card-${req.request_id}`}
    >
      <CardContent className="p-3 sm:p-4">
        {/* Top row: status + amount */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${cardCfg?.cls || ''}`}>
              {cardCfg?.label || status}
            </Badge>
            {pmCfg && (
              <Badge variant="outline" className={`text-[10px] ${pmCfg.cls}`} title={pmCfg.desc}>
                {pmCfg.label}
              </Badge>
            )}
            {req.order_id && (
              <span className="text-[10px] text-gray-400 font-mono">#{req.order_id}</span>
            )}
          </div>
          {(req.estimated_price || req.total_amount) ? (
            <span className="text-sm font-semibold text-emerald-700 shrink-0">{fmt(req.estimated_price || req.total_amount)}</span>
          ) : null}
        </div>

        {/* Main grid */}
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
            <p className="text-[10px] uppercase font-semibold text-gray-400">Category</p>
            <p className="font-medium capitalize">{req.material_category || req.category || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400">Qty</p>
            <p className="font-medium">{req.quantity} {req.unit || ''}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-semibold text-gray-400 flex items-center gap-1"><CalendarClock className="h-2.5 w-2.5" /> Delivery</p>
            <p className="font-medium">{deliveryLabel}</p>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <p className="text-[10px] uppercase font-semibold text-gray-400">Project</p>
            <p className="font-medium truncate">{req.project_name}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[10px] uppercase font-semibold text-gray-400">SE</p>
            <p className="font-medium truncate">{req.site_engineer_name || '—'}</p>
          </div>
          <div>
            {isActionable ? (
              <Button
                size="sm"
                className={`h-8 w-full text-xs gap-1 mt-3 sm:mt-0 ${status === 'procurement_revision' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                data-testid={`proc-card-approve-${req.request_id}`}
              >
                <Eye className="h-3 w-3" /> {status === 'procurement_revision' ? 'Revise' : 'Approve'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full text-xs gap-1 mt-3 sm:mt-0"
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                data-testid={`proc-card-view-${req.request_id}`}
              >
                <Eye className="h-3 w-3" /> View
              </Button>
            )}
          </div>
        </div>

        {/* Vendor + remarks tail */}
        {(req.vendor_name || req.procurement_remarks) && (
          <div className="mt-2 pt-2 border-t flex items-start justify-between gap-2 text-[11px]">
            {req.vendor_name && (
              <span className="text-gray-700"><span className="text-gray-400 mr-1">Vendor:</span><strong>{req.vendor_name}</strong></span>
            )}
            {req.procurement_remarks && (
              <span className="italic text-gray-500 truncate">"{req.procurement_remarks}"</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Payment mode lookup table — reused in card + dialog
const PAYMENT_MODE_DISPLAY = {
  pre_paid:      { label: 'Pre-paid',     cls: 'bg-blue-50 text-blue-700 border-blue-200',     desc: 'Accountant pays full amount upfront before delivery' },
  credit:        { label: 'Credit',       cls: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'Post-paid after N days of delivery' },
  advance:       { label: 'Advance',      cls: 'bg-orange-50 text-orange-700 border-orange-200', desc: 'Pay advance now, balance after delivery' },
  post_delivery: { label: 'Post-delivery', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'Pay full amount on delivery' },
};

// =====================================================================
// Vendor Assign Dialog
// =====================================================================
function AssignVendorDialog({ item, readOnly, onClose, onDone, onReject }) {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [approvedQty, setApprovedQty] = useState('');
  const [transport, setTransport] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Phase-1 new fields
  const [timelineType, setTimelineType] = useState('date'); // 'date' | 'days'
  const [timelineDate, setTimelineDate] = useState('');
  const [timelineDays, setTimelineDays] = useState('');
  const [paymentMode, setPaymentMode] = useState('pre_paid');
  const [creditDays, setCreditDays] = useState('30');
  const [advanceMode, setAdvanceMode] = useState('percent'); // 'percent' | 'amount'
  const [advancePercent, setAdvancePercent] = useState('30');
  const [advanceAmount, setAdvanceAmount] = useState('');

  useEffect(() => {
    if (!item) return;
    setVendorId(item.vendor_id || '');
    setUnitPrice(String(item.unit_rate || item.unit_price || ''));
    setApprovedQty(String(item.approved_quantity ?? item.quantity ?? ''));
    setTransport(String(item.transport_cost || 0));
    setDiscount(String(item.discount || 0));
    setRemarks(item.procurement_remarks || '');
    setTimelineType(item.timeline_type || 'date');
    if (item.timeline_type === 'days') {
      setTimelineDays(String(item.timeline_value || ''));
      setTimelineDate('');
    } else {
      setTimelineDate(item.expected_delivery ? String(item.expected_delivery).slice(0, 10) : (item.timeline_value || ''));
      setTimelineDays('');
    }
    setPaymentMode(item.payment_mode || 'pre_paid');
    setCreditDays(String(item.credit_days || 30));
    setAdvancePercent(String(item.advance_percent || 30));
    setAdvanceAmount(String(item.advance_amount || ''));
    setAdvanceMode(item.advance_percent ? 'percent' : 'amount');
    // Load material vendors only
    axios.get(`${API}/vendor-master?category=material`).then(r => setVendors(r.data?.vendors || r.data || [])).catch(() => setVendors([]));
  }, [item]);

  const qty = parseFloat(approvedQty) || 0;
  const price = parseFloat(unitPrice) || 0;
  const tCost = parseFloat(transport) || 0;
  const disc = parseFloat(discount) || 0;
  const total = Math.max(0, qty * price + tCost - disc);
  const computedAdvance = useMemo(() => {
    if (paymentMode !== 'advance') return 0;
    if (advanceMode === 'percent') {
      const p = parseFloat(advancePercent) || 0;
      return Math.round(total * p / 100);
    }
    return parseFloat(advanceAmount) || 0;
  }, [paymentMode, advanceMode, advancePercent, advanceAmount, total]);
  const balance = paymentMode === 'advance' ? Math.max(0, total - computedAdvance) : 0;

  if (!item) return null;
  const selectedVendor = vendors.find(v => v.vendor_id === vendorId);

  const submit = async () => {
    if (!vendorId) { toast.error('Select a vendor'); return; }
    if (!price || price <= 0) { toast.error('Enter a valid unit price'); return; }
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    // Timeline validation
    if (timelineType === 'date' && !timelineDate) { toast.error('Select expected delivery date'); return; }
    if (timelineType === 'days' && (!timelineDays || parseInt(timelineDays) <= 0)) { toast.error('Enter delivery days'); return; }
    // Payment mode validation
    if (paymentMode === 'credit' && (!creditDays || parseInt(creditDays) <= 0)) { toast.error('Enter credit days'); return; }
    if (paymentMode === 'advance') {
      if (advanceMode === 'percent' && (!advancePercent || parseFloat(advancePercent) <= 0 || parseFloat(advancePercent) > 100)) {
        toast.error('Enter advance % between 0-100'); return;
      }
      if (advanceMode === 'amount' && (!advanceAmount || parseFloat(advanceAmount) <= 0 || parseFloat(advanceAmount) > total)) {
        toast.error('Advance amount must be > 0 and ≤ total'); return;
      }
    }

    setSubmitting(true);
    try {
      await axios.patch(`${API}/procurement-simple/material-requests/${item.request_id}/assign-vendor`, {
        vendor_id: vendorId,
        vendor_name: selectedVendor?.name || selectedVendor?.vendor_name || '',
        unit_price: price,
        approved_quantity: qty,
        transport_cost: tCost,
        discount: disc,
        remarks,
        timeline_type: timelineType,
        timeline_value: timelineType === 'date' ? timelineDate : timelineDays,
        payment_mode: paymentMode,
        credit_days: paymentMode === 'credit' ? parseInt(creditDays) : 0,
        advance_input_mode: paymentMode === 'advance' ? advanceMode : null,
        advance_percent: paymentMode === 'advance' && advanceMode === 'percent' ? parseFloat(advancePercent) : null,
        advance_amount: paymentMode === 'advance' && advanceMode === 'amount' ? parseFloat(advanceAmount) : null,
      });
      toast.success('Vendor assigned & forwarded to Planning');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to assign vendor');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="proc-assign-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <Package className="h-5 w-5" /> {readOnly ? 'View' : 'Approve'} Material Request
          </DialogTitle>
          <DialogDescription className="text-xs">
            {item.material_name} · Qty {item.quantity} {item.unit} · {item.project_name}
          </DialogDescription>
        </DialogHeader>

        {/* Request summary */}
        <div className="bg-amber-50 border border-amber-200 rounded p-3 grid grid-cols-2 gap-2 text-xs">
          <div><p className="text-amber-700 text-[10px] uppercase font-semibold">Project</p><p className="font-medium">{item.project_name}</p></div>
          <div><p className="text-amber-700 text-[10px] uppercase font-semibold">Site Engineer</p><p className="font-medium">{item.site_engineer_name || '—'}</p></div>
          <div><p className="text-amber-700 text-[10px] uppercase font-semibold">Material</p><p className="font-medium">{item.material_name}</p></div>
          <div><p className="text-amber-700 text-[10px] uppercase font-semibold">Brand</p><p className="font-medium">{item.brand || '—'}</p></div>
          <div><p className="text-amber-700 text-[10px] uppercase font-semibold">Quantity</p><p className="font-medium">{item.quantity} {item.unit}</p></div>
          <div><p className="text-amber-700 text-[10px] uppercase font-semibold">Order</p><p className="font-mono text-[10px]">{item.order_id || item.request_id}</p></div>
          {item.remarks && (
            <div className="col-span-2">
              <p className="text-amber-700 text-[10px] uppercase font-semibold">SE Remarks</p>
              <p className="italic text-gray-700">"{item.remarks}"</p>
            </div>
          )}
        </div>

        {/* Planning revision feedback — surfaces when Planning sent it back */}
        {item.status === 'procurement_revision' && item.revision_remarks && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded p-3 space-y-1" data-testid="proc-revision-banner">
            <p className="text-orange-800 text-[10px] uppercase font-bold flex items-center gap-1">
              <FileClock className="h-3 w-3" /> Planning sent back for revision
            </p>
            <p className="text-sm font-medium text-gray-800 italic">"{item.revision_remarks}"</p>
            <p className="text-[10px] text-orange-700">
              {item.revision_requested_by_name ? `by ${item.revision_requested_by_name}` : ''}
              {item.revision_requested_at ? ` · ${fmtDate(item.revision_requested_at)}` : ''}
            </p>
          </div>
        )}

        {/* Vendor + pricing form */}
        <div className="space-y-3">
          {/* Section header — Vendor & Pricing */}
          <div className="border-b pb-1.5 flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-amber-600" /><h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Vendor & Pricing</h4></div>

          <div>
            <Label className="text-xs">Material Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId} disabled={readOnly}>
              <SelectTrigger className="mt-1" data-testid="proc-assign-vendor-select">
                <SelectValue placeholder="Select a material vendor…" />
              </SelectTrigger>
              <SelectContent>
                {vendors.length === 0 ? (
                  <SelectItem value="__none" disabled>No material vendors found</SelectItem>
                ) : vendors.map(v => (
                  <SelectItem key={v.vendor_id} value={v.vendor_id}>
                    {v.name || v.vendor_name} {v.contact_person ? `· ${v.contact_person}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVendor && (
              <p className="text-[10px] text-gray-500 mt-1">{selectedVendor.phone || ''} {selectedVendor.address ? `· ${selectedVendor.address}` : ''}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Unit Price (₹) *</Label>
              <Input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={readOnly} className="mt-1" data-testid="proc-assign-unit-price" />
            </div>
            <div>
              <Label className="text-xs">Approved Qty</Label>
              <Input type="number" min="0" value={approvedQty} onChange={(e) => setApprovedQty(e.target.value)} disabled={readOnly} className="mt-1" data-testid="proc-assign-qty" />
            </div>
            <div>
              <Label className="text-xs">Transport (₹)</Label>
              <Input type="number" min="0" value={transport} onChange={(e) => setTransport(e.target.value)} disabled={readOnly} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Discount (₹)</Label>
              <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={readOnly} className="mt-1" />
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center justify-between">
            <span className="text-xs text-emerald-700 font-semibold">Estimated Total</span>
            <span className="text-xl font-bold text-emerald-700">{fmt(total)}</span>
          </div>

          {/* Section — Delivery Timeline */}
          <div className="border-b pb-1.5 mt-3 flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-amber-600" /><h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Delivery Timeline</h4></div>

          <div>
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={() => !readOnly && setTimelineType('date')}
                disabled={readOnly}
                className={`flex-1 px-3 py-1.5 text-xs rounded border ${timelineType === 'date' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-gray-200 text-gray-600'}`}
                data-testid="proc-timeline-mode-date"
              >Specific Date</button>
              <button
                type="button"
                onClick={() => !readOnly && setTimelineType('days')}
                disabled={readOnly}
                className={`flex-1 px-3 py-1.5 text-xs rounded border ${timelineType === 'days' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-gray-200 text-gray-600'}`}
                data-testid="proc-timeline-mode-days"
              >Number of Days</button>
            </div>
            {timelineType === 'date' ? (
              <Input
                type="date"
                value={timelineDate}
                onChange={(e) => setTimelineDate(e.target.value)}
                disabled={readOnly}
                min={new Date().toISOString().slice(0, 10)}
                data-testid="proc-timeline-date"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={timelineDays}
                  onChange={(e) => setTimelineDays(e.target.value)}
                  disabled={readOnly}
                  placeholder="e.g. 7"
                  className="flex-1"
                  data-testid="proc-timeline-days"
                />
                <span className="text-xs text-gray-500 whitespace-nowrap">days from today</span>
              </div>
            )}
          </div>

          {/* Section — Payment Mode */}
          <div className="border-b pb-1.5 mt-3 flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-amber-600" /><h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Payment Mode</h4></div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(PAYMENT_MODE_DISPLAY).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                disabled={readOnly}
                onClick={() => setPaymentMode(key)}
                className={`flex flex-col items-center justify-center px-2 py-2 rounded border text-xs transition-all min-h-[60px] ${
                  paymentMode === key ? 'bg-amber-600 text-white border-amber-600 shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-amber-300'
                } ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                data-testid={`proc-payment-${key}`}
              >
                <span className="font-semibold leading-tight text-center">{cfg.label}</span>
              </button>
            ))}
          </div>
          {/* Mode description */}
          <p className="text-[11px] text-gray-500 italic px-1">{PAYMENT_MODE_DISPLAY[paymentMode]?.desc}</p>

          {/* Conditional payment fields */}
          {paymentMode === 'credit' && (
            <div>
              <Label className="text-xs">Credit Period (days) *</Label>
              <Input
                type="number"
                min="1"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                disabled={readOnly}
                placeholder="e.g. 30"
                className="mt-1"
                data-testid="proc-credit-days"
              />
              <p className="text-[10px] text-gray-500 mt-1">Payment due {creditDays || '0'} days after delivery</p>
            </div>
          )}
          {paymentMode === 'advance' && (
            <div className="space-y-2 bg-orange-50/50 border border-orange-200 rounded p-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setAdvanceMode('percent')}
                  className={`flex-1 px-2 py-1 text-[11px] rounded border ${advanceMode === 'percent' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-gray-200 text-gray-600'}`}
                  data-testid="proc-advance-mode-percent"
                >By Percent</button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setAdvanceMode('amount')}
                  className={`flex-1 px-2 py-1 text-[11px] rounded border ${advanceMode === 'amount' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-gray-200 text-gray-600'}`}
                  data-testid="proc-advance-mode-amount"
                >By Amount</button>
              </div>
              {advanceMode === 'percent' ? (
                <div>
                  <Label className="text-xs">Advance % *</Label>
                  <Input type="number" min="1" max="100" value={advancePercent} onChange={(e) => setAdvancePercent(e.target.value)} disabled={readOnly} className="mt-1" data-testid="proc-advance-percent" />
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Advance Amount (₹) *</Label>
                  <Input type="number" min="1" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} disabled={readOnly} className="mt-1" data-testid="proc-advance-amount" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-orange-200 text-xs">
                <div className="text-orange-700"><p className="text-[10px] font-semibold uppercase">Advance Now</p><p className="font-bold">{fmt(computedAdvance)}</p></div>
                <div className="text-orange-700 text-right"><p className="text-[10px] font-semibold uppercase">Balance on Delivery</p><p className="font-bold">{fmt(balance)}</p></div>
              </div>
            </div>
          )}

          {/* Section — Remarks */}
          <div className="border-b pb-1.5 mt-3 flex items-center gap-1.5"><FileClock className="h-3.5 w-3.5 text-amber-600" /><h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Notes for Planning</h4></div>
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={readOnly} className="text-sm" placeholder="Any notes for Planning…" data-testid="proc-assign-remarks" />

          {/* If forwarded already, show what Planning sees */}
          {readOnly && item.status === 'procurement_priced' && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs flex items-center gap-2">
              <Send className="h-3.5 w-3.5 text-blue-700" />
              <span>Forwarded to Planning on {fmtDate(item.procurement_priced_at)} by {item.procurement_priced_by_name || 'Procurement'}</span>
            </div>
          )}
          {readOnly && item.status === 'procurement_rejected' && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs space-y-0.5">
              <p className="font-semibold text-red-800 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Rejected</p>
              <p className="text-red-700 italic">"{item.procurement_rejection_reason}"</p>
              <p className="text-[10px] text-red-600">on {fmtDate(item.procurement_rejected_at)} by {item.procurement_rejected_by_name || 'Procurement'}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Close</Button>
          {!readOnly && (
            <>
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onReject(item)} disabled={submitting} data-testid="proc-assign-reject">
                <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={submit} disabled={submitting} data-testid="proc-assign-submit">
                <Send className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Forwarding…' : (item.status === 'procurement_revision' ? 'Resubmit to Planning' : 'Forward to Planning')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ALL PROJECTS — read-only project list
// =====================================================================
function AllProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get(`${API}/projects`).then(r => setProjects(r.data || [])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    projects.filter(p => !search || (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.client_name || '').toLowerCase().includes(search.toLowerCase())),
  [projects, search]);

  return (
    <div className="space-y-3" data-testid="proc-projects-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">All Projects</h1>
        <Input placeholder="Search project or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full sm:w-64 text-sm" data-testid="proc-projects-search" />
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-10">No projects found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Project</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Client</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Stage</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Value</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-24">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(p => (
                    <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`proc-project-${p.project_id}`}>
                      <td className="px-3 py-2"><p className="font-medium">{p.name}</p><p className="text-[10px] text-gray-400">{p.location || '—'}</p></td>
                      <td className="px-3 py-2 text-gray-700">{p.client_name || '—'}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] capitalize">{(p.current_stage || '—').replace(/_/g, ' ')}</Badge></td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(p.total_value || 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => window.location.href = `/projects/${p.project_id}`}>
                          <Eye className="h-3 w-3" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// MATERIAL VENDORS — reuse the existing vendor-master endpoint
// =====================================================================
function MaterialVendorsTab() {
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('vendors');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/vendor-master?category=material`).catch(() => ({ data: [] })),
      axios.get(`${API}/materials?active_only=false`).catch(() => ({ data: [] })),
    ]).then(([v, m]) => {
      setVendors(v.data?.vendors || v.data || []);
      setMaterials(m.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const filteredVendors = useMemo(() =>
    vendors.filter(v => !search || (v.name || v.vendor_name || '').toLowerCase().includes(search.toLowerCase())),
  [vendors, search]);
  const filteredMaterials = useMemo(() =>
    materials.filter(m => !search || (m.name || '').toLowerCase().includes(search.toLowerCase())),
  [materials, search]);

  return (
    <div className="space-y-3" data-testid="proc-vendors-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Material Vendors</h1>
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full sm:w-64 text-sm" data-testid="proc-vendors-search" />
      </div>
      <div className="flex gap-1 border-b bg-white rounded-t-lg px-2 pt-1">
        <button onClick={() => setView('vendors')} className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${view === 'vendors' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`} data-testid="proc-vendor-view-vendors">
          Vendors <Badge variant="outline" className="ml-1 text-[10px]">{filteredVendors.length}</Badge>
        </button>
        <button onClick={() => setView('materials')} className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${view === 'materials' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`} data-testid="proc-vendor-view-materials">
          Materials <Badge variant="outline" className="ml-1 text-[10px]">{filteredMaterials.length}</Badge>
        </button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
          : view === 'vendors' ? (
            filteredVendors.length === 0 ? <p className="text-center text-xs text-gray-400 py-10">No vendors</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-y">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Vendor</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Contact</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Phone</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">GST</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredVendors.map(v => (
                      <tr key={v.vendor_id} className="hover:bg-gray-50" data-testid={`proc-vendor-${v.vendor_id}`}>
                        <td className="px-3 py-2 font-medium">{v.name || v.vendor_name}</td>
                        <td className="px-3 py-2 text-gray-700">{v.contact_person || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{v.phone || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{v.gst_number || '—'}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{v.address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredMaterials.length === 0 ? <p className="text-center text-xs text-gray-400 py-10">No materials</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-y">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Material</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Category</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Unit</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">Std Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredMaterials.map(m => (
                      <tr key={m.material_id} className="hover:bg-gray-50" data-testid={`proc-material-${m.material_id}`}>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 text-gray-700">{m.category || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{m.unit || '—'}</td>
                        <td className="px-3 py-2 text-right">{m.standard_rate ? fmt(m.standard_rate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
