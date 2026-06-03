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
  Package,
  ClipboardList,
  Building2,
  Truck,
  Eye,
  Send,
  ThumbsDown,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Wallet,
  IndianRupee,
  ShoppingCart,
  Hourglass,
  CalendarClock,
  FileClock,
  Banknote,
  ListChecks,
  CheckCheck,
  PackageCheck,
  ThumbsUp
} from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import MetaDateFilter from '../components/MetaDateFilter';

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
        {activeNav === 'requests' && <DashboardTab />}
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
// Material lifecycle filter cards — Procurement view.
// Order: SE → Procurement → Planning → Revision → Accountant → Transit → Delivered.
// Credit-mode delivered items roll into Delivered — vendor settlement lives in the Credit Management sub-tab.
const LIFECYCLE_BUCKETS = [
  { key: 'all',                 label: 'All',                 Icon: ListChecks,    cls: 'bg-violet-50 border-violet-200 text-violet-700',  active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'new_request',         label: 'New Request (SE)',    Icon: ClipboardList, cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'revision',            label: 'Revision (Planning)', Icon: FileClock,     cls: 'bg-orange-50 border-orange-200 text-orange-700',  active: 'bg-orange-600 text-white border-orange-600' },
  { key: 'transit',             label: 'Transit',             Icon: Truck,         cls: 'bg-sky-50 border-sky-200 text-sky-700',           active: 'bg-sky-600 text-white border-sky-600' },
  { key: 'verifying',           label: 'Verify Delivery',     Icon: ClipboardList, cls: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700', active: 'bg-fuchsia-600 text-white border-fuchsia-600' },
  { key: 'awaiting_accountant', label: 'Awaiting Accountant', Icon: Wallet,        cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',        active: 'bg-cyan-600 text-white border-cyan-600' },
  { key: 'delivered',           label: 'Delivered',           Icon: PackageCheck,  cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
];

function bucketForMaterial(req) {
  const status = (req.status || '').toLowerCase();
  if (status === 'planning_initial_pending') return null; // hidden from Procurement view
  if (status === 'requested' || status === 'pm_approved') return 'new_request';
  if (status === 'procurement_priced') return 'transit';
  if (status === 'procurement_revision') return 'revision';
  if (status === 'procurement_verifying') return 'verifying';
  if (status === 'procurement_verify_rejected') return 'revision';
  if (['pending_accounts_approval', 'pending_advance_payment', 'pending_balance_payment', 'accounts_approved', 'payment_approved'].includes(status)) return 'awaiting_accountant';
  if (status === 'in_transit') return 'transit';
  if (['delivered', 'completed', 'closed'].includes(status)) return 'delivered';
  if (['rejected', 'procurement_rejected', 'planning_initial_rejected'].includes(status)) return 'all';
  return 'all';
}

function RequestsTab({ dateRange }) {
  const [bucket, setBucket] = useState('new_request');
  // Sub-filter for "Awaiting Accountant" bucket — split Full Amount vs Advance
  // so Procurement can see what's stuck with the Accountant for advance approval
  // vs full pre-paid bills, separately.
  const [awaitingSubTab, setAwaitingSubTab] = useState('all');  // 'all' | 'full' | 'advance'
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, req: null, reason: '' });
  const [verifyDialog, setVerifyDialog] = useState({ open: false, req: null, invoice_no: '', notes: '', qty_match: true, price_match: true, reject_mode: false, reject_reason: '', received_qty_override: '', unit_price_override: '' });
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

  // Apply date filter on created_at before bucketing
  const filteredItems = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return allItems;
    const fromTs = new Date(dateRange.from + 'T00:00:00').getTime();
    const toTs = new Date(dateRange.to + 'T23:59:59').getTime();
    return allItems.filter(r => {
      const t = new Date(r.created_at || 0).getTime();
      return t >= fromTs && t <= toTs;
    });
  }, [allItems, dateRange]);

  // Filter out items hidden from Procurement (e.g. planning_initial_pending)
  const procurementVisible = useMemo(
    () => filteredItems.filter(r => bucketForMaterial(r) !== null),
    [filteredItems]
  );

  const counts = useMemo(() => {
    const c = { all: procurementVisible.length };
    LIFECYCLE_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    procurementVisible.forEach(r => {
      const b = bucketForMaterial(r);
      if (b) c[b] = (c[b] || 0) + 1;
    });
    return c;
  }, [procurementVisible]);

  const visibleItems = useMemo(() => {
    let scope;
    if (bucket === 'all') scope = procurementVisible;
    else scope = procurementVisible.filter(r => bucketForMaterial(r) === bucket);
    // Sub-filter the Awaiting Accountant bucket by payment phase. The status
    // `pending_advance_payment` is unambiguously the advance phase. A request
    // marked `pending_balance_payment` is the balance leg of an advance flow.
    // Everything else (pending_accounts_approval on a pre_paid request, or
    // payment_mode==='pre_paid') is a Full Amount bill.
    if (bucket === 'awaiting_accountant' && awaitingSubTab !== 'all') {
      scope = scope.filter(r => {
        const s = (r.status || '').toLowerCase();
        const isAdvanceLeg = s === 'pending_advance_payment' || s === 'pending_balance_payment';
        return awaitingSubTab === 'advance' ? isAdvanceLeg : !isAdvanceLeg;
      });
    }
    return scope;
  }, [procurementVisible, bucket, awaitingSubTab]);

  // Counts for the Awaiting Accountant sub-tabs.
  const awaitingCounts = useMemo(() => {
    const scope = procurementVisible.filter(r => bucketForMaterial(r) === 'awaiting_accountant');
    let adv = 0;
    let full = 0;
    scope.forEach(r => {
      const s = (r.status || '').toLowerCase();
      if (s === 'pending_advance_payment' || s === 'pending_balance_payment') adv += 1;
      else full += 1;
    });
    return { all: scope.length, full, advance: adv };
  }, [procurementVisible]);

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

  const submitVerify = async () => {
    const req = verifyDialog.req;
    if (!req) return;
    setSubmitting(true);
    try {
      if (verifyDialog.reject_mode) {
        if (!verifyDialog.reject_reason.trim()) { toast.error('Reason is required'); setSubmitting(false); return; }
        await axios.post(`${API}/procurement-simple/material-requests/${req.request_id}/verify-reject`, { reason: verifyDialog.reject_reason });
        toast.success('Delivery rejected');
      } else {
        const body = {
          invoice_no: verifyDialog.invoice_no,
          qty_match: verifyDialog.qty_match,
          price_match: verifyDialog.price_match,
          notes: verifyDialog.notes,
        };
        // Procurement may correct the SE-reported Received Qty / Unit Price
        // before forwarding to Accountant. Only push the override if it's an
        // actual change vs the current request — avoids logging a "correction"
        // when the user just confirmed the defaults.
        const overrideRecv = parseFloat(verifyDialog.received_qty_override);
        const overrideUnit = parseFloat(verifyDialog.unit_price_override);
        const reqRecv = Number(req.received_quantity || 0);
        const reqUnit = Number(req.unit_price || req.unit_rate || 0);
        if (!isNaN(overrideRecv) && overrideRecv !== reqRecv) {
          body.received_quantity = overrideRecv;
        }
        if (!isNaN(overrideUnit) && overrideUnit !== reqUnit) {
          body.unit_price = overrideUnit;
        }
        await axios.post(`${API}/procurement-simple/material-requests/${req.request_id}/verify-approve`, body);
        toast.success('Delivery verified — sent to Accountant');
      }
      setVerifyDialog({ open: false, req: null, invoice_no: '', notes: '', qty_match: true, price_match: true, reject_mode: false, reject_reason: '', received_qty_override: '', unit_price_override: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed');
    } finally { setSubmitting(false); }
  };

  // Card click handler — open the right dialog based on status
  const openCard = (r) => {
    if ((r.status || '').toLowerCase() === 'procurement_verifying') {
      // Compute fallback defaults so the inputs ALWAYS start with a value the
      // user can simply confirm — no more empty Received Qty / Unit Price.
      const orderedQty = Number(r.approved_quantity || r.quantity || 0);
      const totalFromReq = Number(r.total_amount || r.estimated_price || r.estimated_cost || 0);
      const derivedUnit = orderedQty > 0 ? (totalFromReq / orderedQty) : 0;
      let dfltUnit = Number(r.unit_price || r.unit_rate || 0);
      if (!dfltUnit && derivedUnit) dfltUnit = derivedUnit;
      const seReported = Number(r.received_quantity || 0);
      const dfltRecv = seReported > 0 ? seReported : orderedQty;
      setVerifyDialog({
        open: true,
        req: r,
        invoice_no: r.procurement_verify_invoice_no || '',
        notes: '',
        qty_match: true,
        price_match: true,
        reject_mode: false,
        reject_reason: '',
        received_qty_override: dfltRecv ? String(dfltRecv) : '',
        unit_price_override: dfltUnit ? String(Number(dfltUnit.toFixed(2))) : '',
      });
    } else {
      setOpen(r);
    }
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
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" data-testid="proc-lifecycle-cards">
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

      {/* Awaiting Accountant sub-tab — Full Amount vs Advance */}
      {bucket === 'awaiting_accountant' && (
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="proc-awaiting-subtabs">
          {[
            { key: 'all', label: 'All', count: awaitingCounts.all },
            { key: 'full', label: 'Full Amount', count: awaitingCounts.full },
            { key: 'advance', label: 'Advance', count: awaitingCounts.advance },
          ].map(t => {
            const active = awaitingSubTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setAwaitingSubTab(t.key)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition ${
                  active
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                    : 'bg-white text-cyan-700 border-cyan-200 hover:bg-cyan-50'
                }`}
                data-testid={`proc-awaiting-subtab-${t.key}`}
              >
                {t.label} <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-cyan-100 text-cyan-700'}`}>{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Card-style request list */}
      {loading ? (
        <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
      ) : visibleItems.length === 0 ? (
        <Card><CardContent className="p-10"><p className="text-center text-xs text-gray-400">No requests in this bucket</p></CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="proc-card-list">
          {visibleItems.map(r => (
            <RequestCard key={r.request_id} req={r} onClick={() => openCard(r)} />
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

      {/* Verify-Delivery Dialog */}
      <Dialog open={verifyDialog.open} onOpenChange={(o) => !o && setVerifyDialog({ open: false, req: null, invoice_no: '', notes: '', qty_match: true, price_match: true, reject_mode: false, reject_reason: '', received_qty_override: '', unit_price_override: '' })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="proc-verify-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fuchsia-700">
              <PackageCheck className="h-5 w-5" /> Verify Delivery
            </DialogTitle>
            <DialogDescription className="text-xs">
              {verifyDialog.req?.material_name} · {verifyDialog.req?.vendor_name} · {verifyDialog.req?.project_name}
            </DialogDescription>
          </DialogHeader>

          {verifyDialog.req && (
            <div className="space-y-3 text-sm">
              {/* Quick summary — Received Qty AND Unit Price are editable so
                  Procurement can correct either before forwarding to Accountant.
                  Total auto-updates from received_qty × unit_price. */}
              {(() => {
                const orderedQty = Number(verifyDialog.req.approved_quantity || verifyDialog.req.quantity || 0);
                const totalFromReq = Number(verifyDialog.req.total_amount || verifyDialog.req.estimated_price || verifyDialog.req.estimated_cost || 0);
                // Robust unit-price derivation: explicit field → derived from
                // total/qty (handles legacy rows where total_amount was over-
                // written with advance value but unit_price was lost).
                const derivedUnit = orderedQty > 0 ? (totalFromReq / orderedQty) : 0;
                let baselineUnit = Number(verifyDialog.req.unit_price || verifyDialog.req.unit_rate || 0);
                if (!baselineUnit && derivedUnit) baselineUnit = derivedUnit;
                const effectiveUnit = verifyDialog.unit_price_override !== '' && !isNaN(parseFloat(verifyDialog.unit_price_override))
                  ? parseFloat(verifyDialog.unit_price_override)
                  : baselineUnit;
                // Received qty: SE-reported (only when truthy, NOT when 0) →
                // falls back to Ordered Qty so Procurement always sees a value
                // to confirm or override.
                const seReported = Number(verifyDialog.req.received_quantity || 0);
                const baselineRecv = seReported > 0 ? seReported : orderedQty;
                const effectiveRecv = verifyDialog.received_qty_override !== '' && !isNaN(parseFloat(verifyDialog.received_qty_override))
                  ? parseFloat(verifyDialog.received_qty_override)
                  : baselineRecv;
                const liveTotal = effectiveRecv * effectiveUnit;
                // Always populate the inputs with the best non-zero value —
                // no more empty placeholder when the underlying record has
                // missing/zeroed fields.
                const recvValue = verifyDialog.received_qty_override !== ''
                  ? verifyDialog.received_qty_override
                  : (baselineRecv ? baselineRecv : '');
                const unitValue = verifyDialog.unit_price_override !== ''
                  ? verifyDialog.unit_price_override
                  : (baselineUnit ? Number(baselineUnit.toFixed(2)) : '');
                return (
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 border rounded p-2 text-xs">
                    <div><span className="text-gray-500">Ordered Qty:</span> <strong>{verifyDialog.req.approved_quantity || verifyDialog.req.quantity} {verifyDialog.req.unit || ''}</strong></div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 whitespace-nowrap">Received Qty:</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={recvValue}
                        onChange={(e) => setVerifyDialog({ ...verifyDialog, received_qty_override: e.target.value })}
                        className="h-6 text-xs px-1 py-0 w-20"
                        data-testid="verify-received-qty-input"
                      />
                      <span className="text-gray-700">{verifyDialog.req.unit || ''}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 whitespace-nowrap">Unit Price:</span>
                      <span className="text-gray-700">₹</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={unitValue}
                        onChange={(e) => setVerifyDialog({ ...verifyDialog, unit_price_override: e.target.value })}
                        className="h-6 text-xs px-1 py-0 w-24"
                        data-testid="verify-unit-price-input"
                      />
                    </div>
                    <div><span className="text-gray-500">Total:</span> <strong className="text-fuchsia-700" data-testid="verify-live-total">{fmt(liveTotal)}</strong></div>
                    <div className="col-span-2"><span className="text-gray-500">Payment Mode:</span> <strong>{verifyDialog.req.payment_mode || '—'}</strong></div>
                  </div>
                );
              })()}

              {/* Photos preview */}
              {(verifyDialog.req.lorry_image_id || verifyDialog.req.material_image_id) && (
                <div className="grid grid-cols-2 gap-2">
                  {verifyDialog.req.lorry_image_id && (
                    <a href={`${API}/files/${verifyDialog.req.lorry_image_id}/download`} target="_blank" rel="noopener noreferrer" className="block border rounded overflow-hidden hover:border-fuchsia-400">
                      <img src={`${API}/files/${verifyDialog.req.lorry_image_id}/download`} alt="Lorry" className="w-full h-28 object-cover" />
                      <p className="text-[10px] uppercase font-semibold text-fuchsia-700 bg-fuchsia-50 py-0.5 px-2">Lorry</p>
                    </a>
                  )}
                  {verifyDialog.req.material_image_id && (
                    <a href={`${API}/files/${verifyDialog.req.material_image_id}/download`} target="_blank" rel="noopener noreferrer" className="block border rounded overflow-hidden hover:border-fuchsia-400">
                      <img src={`${API}/files/${verifyDialog.req.material_image_id}/download`} alt="Material" className="w-full h-28 object-cover" />
                      <p className="text-[10px] uppercase font-semibold text-fuchsia-700 bg-fuchsia-50 py-0.5 px-2">Material</p>
                    </a>
                  )}
                </div>
              )}

              {!verifyDialog.reject_mode ? (
                <>
                  {/* Approve form */}
                  <div className="space-y-2">
                    <Label className="text-xs">Invoice / Bill No.</Label>
                    <Input
                      value={verifyDialog.invoice_no}
                      onChange={(e) => setVerifyDialog({ ...verifyDialog, invoice_no: e.target.value })}
                      placeholder="e.g. INV-2024-001"
                      className="text-sm"
                      data-testid="verify-invoice-no"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifyDialog.qty_match}
                        onChange={(e) => setVerifyDialog({ ...verifyDialog, qty_match: e.target.checked })}
                        data-testid="verify-qty-match"
                      />
                      Qty matches ordered
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifyDialog.price_match}
                        onChange={(e) => setVerifyDialog({ ...verifyDialog, price_match: e.target.checked })}
                        data-testid="verify-price-match"
                      />
                      Price matches invoice
                    </label>
                  </div>
                  <div>
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea
                      rows={2}
                      value={verifyDialog.notes}
                      onChange={(e) => setVerifyDialog({ ...verifyDialog, notes: e.target.value })}
                      placeholder="Anything Accountant should know…"
                      className="mt-1 text-sm"
                      data-testid="verify-notes"
                    />
                  </div>
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1.5">
                  <Label className="text-xs font-semibold text-red-800">Reason for rejection *</Label>
                  <Textarea
                    rows={3}
                    value={verifyDialog.reject_reason}
                    onChange={(e) => setVerifyDialog({ ...verifyDialog, reject_reason: e.target.value })}
                    placeholder="e.g. qty short by 5 bags / invoice missing / price mismatch"
                    className="text-sm"
                    data-testid="verify-reject-reason"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setVerifyDialog({ open: false, req: null, invoice_no: '', notes: '', qty_match: true, price_match: true, reject_mode: false, reject_reason: '' })} disabled={submitting}>Close</Button>
            {!verifyDialog.reject_mode ? (
              <>
                <Button variant="outline" size="sm" className="text-red-700 border-red-300 hover:bg-red-50" onClick={() => setVerifyDialog({ ...verifyDialog, reject_mode: true })} disabled={submitting} data-testid="verify-reject-btn">
                  <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button size="sm" className="bg-fuchsia-600 hover:bg-fuchsia-700" onClick={submitVerify} disabled={submitting} data-testid="verify-approve-btn">
                  <ThumbsUp className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Verifying…' : 'Approve & Send to Accountant'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setVerifyDialog({ ...verifyDialog, reject_mode: false })} disabled={submitting}>Back</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={submitVerify} disabled={submitting} data-testid="verify-reject-confirm">
                  {submitting ? 'Rejecting…' : 'Confirm Reject'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// DASHBOARD WRAPPER — Material Req | Credit Management sub-tabs
// =====================================================================
function DashboardTab() {
  const [subTab, setSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('subtab') || 'material_req';
  });
  const [dateRange, setDateRange] = useState(null); // {from, to, label, preset}

  const setSub = (v) => {
    setSubTab(v);
    const url = new URL(window.location);
    url.searchParams.set('subtab', v);
    window.history.replaceState({}, '', url);
  };

  return (
    <div className="space-y-3" data-testid="proc-dashboard-tab">
      {/* Sub-tab pill bar + global date filter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5" data-testid="proc-subtabs">
          {[
            { key: 'material_req',     label: 'Material Req' },
            { key: 'credit_management', label: 'Credit Management' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setSub(t.key)}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-all ${
                subTab === t.key
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              data-testid={`proc-subtab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset="last_month" />
      </div>

      {subTab === 'material_req' && <RequestsTab dateRange={dateRange} />}
      {subTab === 'credit_management' && <CreditManagementTab dateRange={dateRange} />}
    </div>
  );
}

// =====================================================================
// CREDIT MANAGEMENT — Vendor credit ledger settlement chain
// Procurement clicks "Collect Payment" → Planning → Accountant
// =====================================================================
const CREDIT_BUCKETS = [
  { key: 'pending',                     label: 'Pending',          cls: 'bg-amber-50 border-amber-200 text-amber-700',     active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'pending_planning_approval',   label: 'Planning Awaiting', cls: 'bg-yellow-50 border-yellow-200 text-yellow-700',  active: 'bg-yellow-600 text-white border-yellow-600' },
  { key: 'pending_accountant_approval', label: 'Accountant Awaiting', cls: 'bg-cyan-50 border-cyan-200 text-cyan-700',     active: 'bg-cyan-600 text-white border-cyan-600' },
  { key: 'paid',                        label: 'Paid',             cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'all',                         label: 'All',              cls: 'bg-violet-50 border-violet-200 text-violet-700',   active: 'bg-violet-600 text-white border-violet-600' },
];

function daysBetween(fromIso, toIso) {
  try {
    const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
    return Math.round(ms / 86400000);
  } catch { return null; }
}

function CreditManagementTab({ dateRange }) {
  const [bucket, setBucket] = useState('pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collectDialog, setCollectDialog] = useState({ open: false, entry: null, remarks: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'all' });
      if (dateRange?.from) params.set('from_date', dateRange.from);
      if (dateRange?.to) params.set('to_date', dateRange.to);
      const res = await axios.get(`${API}/procurement-simple/credit-ledger?${params}`);
      setItems(res.data?.entries || []);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [dateRange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const counts = useMemo(() => {
    const c = { all: items.length };
    CREDIT_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    items.forEach(it => { c[it.status] = (c[it.status] || 0) + 1; });
    return c;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (bucket === 'all') return items;
    return items.filter(it => it.status === bucket);
  }, [items, bucket]);

  const submitCollect = async () => {
    if (!collectDialog.entry) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/procurement-simple/credit-ledger/${collectDialog.entry.ledger_id}/request-settlement`, { remarks: collectDialog.remarks });
      toast.success('Payment request sent to Planning for approval');
      setCollectDialog({ open: false, entry: null, remarks: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3" data-testid="credit-management-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Credit Management</h1>
          <p className="text-[11px] text-gray-500">Procurement → Planning approval → Accountant payment release</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={fetchAll} data-testid="credit-refresh">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Status filter cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5" data-testid="credit-buckets">
        {CREDIT_BUCKETS.map(b => {
          const active = bucket === b.key;
          const count = counts[b.key] || 0;
          return (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${
                active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'
              }`}
              data-testid={`credit-bucket-${b.key}`}
            >
              <span className="leading-tight text-center">{b.label}</span>
              <span className={`text-base font-bold ${active ? 'text-white' : ''}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
      ) : visibleItems.length === 0 ? (
        <Card><CardContent className="p-10"><p className="text-center text-xs text-gray-400">No credit ledger entries in this bucket</p></CardContent></Card>
      ) : (
        <div className="space-y-2" data-testid="credit-list">
          {visibleItems.map(it => {
            const daysLeft = daysBetween(new Date().toISOString(), it.due_date);
            const overdue = daysLeft !== null && daysLeft < 0 && it.status !== 'paid';
            const dueLabel =
              it.status === 'paid'
                ? 'Settled'
                : daysLeft === null
                  ? '—'
                  : daysLeft < 0
                    ? `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}`
                    : daysLeft === 0
                      ? 'Due today'
                      : `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
            const cardCfg = CREDIT_BUCKETS.find(b => b.key === it.status);
            return (
              <Card key={it.ledger_id} className="hover:shadow-md transition-shadow" data-testid={`credit-card-${it.ledger_id}`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cardCfg && (
                        <Badge variant="outline" className={`text-[10px] ${cardCfg.cls}`}>{cardCfg.label}</Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${overdue ? 'bg-red-50 text-red-700 border-red-200' : (daysLeft !== null && daysLeft <= 7 && it.status !== 'paid' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-gray-50 text-gray-600 border-gray-200')}`} data-testid={`credit-deadline-${it.ledger_id}`}>
                        {dueLabel}
                      </Badge>
                      <span className="text-[10px] text-gray-400 font-mono">#{it.ledger_id}</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 shrink-0">{fmt(it.amount)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="sm:col-span-2">
                      <p className="text-[10px] uppercase font-semibold text-gray-400">Material</p>
                      <p className="font-medium truncate">{it.material_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-gray-400">Vendor</p>
                      <p className="font-medium truncate">{it.vendor_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-gray-400">Delivered</p>
                      <p className="font-medium">{fmtDate(it.delivered_at)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-gray-400">Deadline</p>
                      <p className={`font-medium ${overdue ? 'text-red-600' : ''}`}>{fmtDate(it.due_date)}</p>
                    </div>
                  </div>
                  {/* Action row */}
                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-[11px] text-gray-500">
                      {it.status === 'pending_planning_approval' && it.settlement_requested_by_name && (
                        <span>Requested by <strong>{it.settlement_requested_by_name}</strong> · awaiting Planning</span>
                      )}
                      {it.status === 'pending_accountant_approval' && it.planning_approved_by_name && (
                        <span>Approved by Planning ({it.planning_approved_by_name}) · awaiting Accountant</span>
                      )}
                      {it.status === 'paid' && it.paid_at && (
                        <span>Paid on {fmtDate(it.paid_at)} · expense {it.expense_id}</span>
                      )}
                    </div>
                    {it.status === 'pending' && (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1 bg-amber-600 hover:bg-amber-700"
                        onClick={() => setCollectDialog({ open: true, entry: it, remarks: '' })}
                        data-testid={`collect-payment-btn-${it.ledger_id}`}
                      >
                        <Banknote className="h-3 w-3" /> Collect Payment
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Collect Payment dialog — Procurement → Planning */}
      <Dialog open={collectDialog.open} onOpenChange={(o) => !o && setCollectDialog({ open: false, entry: null, remarks: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700"><Banknote className="h-5 w-5" /> Request Credit Payment</DialogTitle>
            <DialogDescription className="text-xs">
              {collectDialog.entry?.material_name} · {collectDialog.entry?.vendor_name} · {fmt(collectDialog.entry?.amount || 0)}
              <br />This will be sent to Planning for approval before Accountant releases the payment.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Remarks (optional)</Label>
            <Textarea
              rows={3}
              value={collectDialog.remarks}
              onChange={(e) => setCollectDialog({ ...collectDialog, remarks: e.target.value })}
              placeholder="Any context for Planning..."
              className="mt-1 text-sm"
              data-testid="collect-remarks"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCollectDialog({ open: false, entry: null, remarks: '' })} disabled={submitting}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={submitCollect} disabled={submitting} data-testid="collect-confirm">
              {submitting ? 'Sending…' : 'Send to Planning'}
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
  const bucket = bucketForMaterial(req);
  const cardCfg = LIFECYCLE_BUCKETS.find(b => b.key === bucket);
  const isActionable = ['requested', 'pm_approved', 'procurement_revision'].includes(status);
  const isVerifying = status === 'procurement_verifying';
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
            ) : isVerifying ? (
              <Button
                size="sm"
                className="h-8 w-full text-xs gap-1 mt-3 sm:mt-0 bg-fuchsia-600 hover:bg-fuchsia-700"
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                data-testid={`proc-card-verify-${req.request_id}`}
              >
                <PackageCheck className="h-3 w-3" /> Verify
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
  // Late delivery justification — required when Procurement quotes longer than SE asked
  const [lateReason, setLateReason] = useState('');

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
    setLateReason(item.late_delivery_reason || '');
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

  // Compute Procurement's chosen delivery in HOURS from now, then compare vs SE's asked hours.
  // Late delivery (procurement_hours > se_hours) must be justified before submit.
  const procHours = useMemo(() => {
    if (!item) return null;
    if (timelineType === 'date' && timelineDate) {
      const ms = new Date(timelineDate).getTime() - Date.now();
      return Math.max(1, Math.round(ms / 36e5));
    }
    if (timelineType === 'days' && timelineDays) {
      return Math.max(1, parseInt(timelineDays) * 24);
    }
    return null;
  }, [timelineType, timelineDate, timelineDays, item]);
  const seHours = item?.se_requested_hours ?? 48;
  const deliveryDelta = procHours !== null ? (procHours - seHours) : null;
  const isLate = deliveryDelta !== null && deliveryDelta > 0;
  const isEarly = deliveryDelta !== null && deliveryDelta < 0;
  const deliveryStatusLabel = procHours === null
    ? null
    : (isLate ? `+${deliveryDelta}h late vs SE` : (isEarly ? `${deliveryDelta}h earlier than SE` : 'On time'));

  if (!item) return null;
  const selectedVendor = vendors.find(v => v.vendor_id === vendorId);

  const submit = async () => {
    if (!vendorId) { toast.error('Select a vendor'); return; }
    if (!price || price <= 0) { toast.error('Enter a valid unit price'); return; }
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    // Timeline validation
    if (timelineType === 'date' && !timelineDate) { toast.error('Select expected delivery date'); return; }
    if (timelineType === 'days' && (!timelineDays || parseInt(timelineDays) <= 0)) { toast.error('Enter delivery days'); return; }
    // Late delivery justification
    if (isLate && !lateReason.trim()) {
      toast.error(`SE asked for ${seHours}h delivery but you're quoting ${procHours}h. Please provide a late-delivery reason.`);
      return;
    }
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
        procurement_hours: procHours,
        delivery_delta_hours: deliveryDelta,
        late_delivery_reason: isLate ? lateReason.trim() : '',
      });
      toast.success('Sent to Site Engineer for collection');
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

          {/* SE expectation banner */}
          <div className={`rounded p-2 border text-xs flex items-center justify-between gap-2 ${item.se_emergency_reason ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`} data-testid="proc-se-expected-banner">
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarClock className={`h-3.5 w-3.5 ${item.se_emergency_reason ? 'text-red-700' : 'text-blue-700'}`} />
              <span className={`font-semibold ${item.se_emergency_reason ? 'text-red-700' : 'text-blue-700'}`}>SE asked for delivery in:</span>
              <Badge variant="outline" className={`text-[10px] ${item.se_emergency_reason ? 'bg-red-100 text-red-800 border-red-300' : 'bg-blue-100 text-blue-800 border-blue-300'}`}>
                {item.se_delivery_choice === '24h' ? '24 hours' : item.se_delivery_choice === '48h' ? '48 hours' : (item.se_expected_delivery ? fmtDate(item.se_expected_delivery) : `${seHours}h`)}
              </Badge>
            </div>
            {item.se_emergency_reason && (
              <span className="text-[10px] text-red-700 italic flex-1 text-right">⚠ Emergency: "{item.se_emergency_reason}"</span>
            )}
          </div>

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
                type="datetime-local"
                value={timelineDate}
                onChange={(e) => setTimelineDate(e.target.value)}
                disabled={readOnly}
                min={new Date().toISOString().slice(0, 16)}
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
            {/* Live delta vs SE expectation */}
            {deliveryStatusLabel && (
              <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded ${
                isLate ? 'bg-red-100 text-red-700' : (isEarly ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')
              }`} data-testid="proc-delivery-delta">
                {isLate ? '⚠' : isEarly ? '⚡' : '✓'} {deliveryStatusLabel} ({procHours}h vs {seHours}h)
              </div>
            )}
          </div>

          {/* Late delivery reason — required when Procurement quote > SE asked */}
          {isLate && !readOnly && (
            <div className="bg-red-50 border border-red-200 rounded p-2.5 space-y-1.5" data-testid="proc-late-reason-box">
              <Label className="text-xs font-semibold text-red-800">Late delivery reason *</Label>
              <p className="text-[10px] text-red-700">SE asked for {seHours}h but you're quoting {procHours}h. Please justify the delay.</p>
              <Textarea
                rows={2}
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="e.g. Vendor stock shortage, transit constraint…"
                className="text-sm"
                data-testid="proc-late-reason"
              />
            </div>
          )}
          {item.late_delivery_reason && readOnly && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs">
              <p className="font-semibold text-red-800">Late delivery reason:</p>
              <p className="italic text-red-700">"{item.late_delivery_reason}"</p>
            </div>
          )}

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
                <Send className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Sending…' : (paymentMode === 'advance' ? 'Send for Accountant Approval' : 'Send to Site Engineer')}
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
  const [dateRange, setDateRange] = useState(null);

  useEffect(() => {
    axios.get(`${API}/projects`).then(r => setProjects(r.data || [])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = projects.filter(p => !search || (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.client_name || '').toLowerCase().includes(search.toLowerCase()));
    if (dateRange?.from && dateRange?.to) {
      const fromTs = new Date(dateRange.from + 'T00:00:00').getTime();
      const toTs = new Date(dateRange.to + 'T23:59:59').getTime();
      list = list.filter(p => {
        const t = new Date(p.created_at || 0).getTime();
        return t >= fromTs && t <= toTs;
      });
    }
    return list;
  }, [projects, search, dateRange]);

  return (
    <div className="space-y-3" data-testid="proc-projects-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">All Projects</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset="last_month" />
          <Input placeholder="Search project or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full sm:w-64 text-sm" data-testid="proc-projects-search" />
        </div>
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
  const [dateRange, setDateRange] = useState(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/vendor-master?category=material`).catch(() => ({ data: [] })),
      axios.get(`${API}/materials?active_only=false`).catch(() => ({ data: [] })),
    ]).then(([v, m]) => {
      setVendors(v.data?.vendors || v.data || []);
      setMaterials(m.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const inDate = (item) => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const t = new Date(item.created_at || 0).getTime();
    const fromTs = new Date(dateRange.from + 'T00:00:00').getTime();
    const toTs = new Date(dateRange.to + 'T23:59:59').getTime();
    return t >= fromTs && t <= toTs;
  };
  const filteredVendors = useMemo(() =>
    vendors.filter(v => (!search || (v.name || v.vendor_name || '').toLowerCase().includes(search.toLowerCase())) && inDate(v)),
  [vendors, search, dateRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredMaterials = useMemo(() =>
    materials.filter(m => (!search || (m.name || '').toLowerCase().includes(search.toLowerCase())) && inDate(m)),
  [materials, search, dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3" data-testid="proc-vendors-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Material Vendors</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset="last_month" />
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full sm:w-64 text-sm" data-testid="proc-vendors-search" />
        </div>
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
