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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
// Procurement Dashboard sub-tabs embed these two pages so the operator
// doesn't have to leave the Procurement board for project / vendor work.
import Projects from './Projects';
import VendorMasterManagement from './VendorMasterManagement';
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
  ThumbsUp,
  ChevronDown,
  Check,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import MetaDateFilter from '../components/MetaDateFilter';
import { UnitSelect } from '../components/UnitSelect';

const MATERIAL_CATEGORIES = ['cement','sand','steel','bricks','aggregate','tiles','electrical','plumbing','paint','wood','hardware','other'];

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

// Page-level NAV intentionally removed — the three former entries
// (Dashboard / All Projects / Material Vendors) now live as sub-tabs inside
// DashboardTab so the operator only needs to manage one navigation row.
export default function ProcurementBoardSimple() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    axios.get(`${API}/auth/me`).then(r => setUser(r.data)).catch(() => { window.location.href = '/login'; });
  }, []);

  if (!user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20" data-testid="procurement-board-simple">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5">
        <DashboardTab />
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

function RequestsTab({ dateRange, projectFilter }) {
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

  // Apply project + date filter on created_at before bucketing
  const filteredItems = useMemo(() => {
    const fromTs = dateRange?.from ? new Date(dateRange.from + 'T00:00:00').getTime() : null;
    const toTs = dateRange?.to ? new Date(dateRange.to + 'T23:59:59').getTime() : null;
    return allItems.filter(r => {
      if (projectFilter && projectFilter !== 'all' && r.project_id !== projectFilter) return false;
      if (fromTs || toTs) {
        const t = new Date(r.created_at || 0).getTime();
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [allItems, dateRange, projectFilter]);

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
    // High Priority items always float to the top of the current bucket.
    return [...scope].sort((a, b) => {
      const ap = a.is_high_priority ? 1 : 0;
      const bp = b.is_high_priority ? 1 : 0;
      if (ap !== bp) return bp - ap;
      // stable-ish tiebreaker: newest first
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
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
        // If Procurement edited the per-diameter table for a Steel order,
        // forward the corrected breakdown + recomputed totals (kg + value)
        // so Accountant & inventory reflect Procurement's verified numbers.
        const stOv = verifyDialog.steel_overrides || {};
        if (Object.keys(stOv).length > 0 && req.steel_specs?.items?.length) {
          const seByIdx = req.steel_received || [];
          const defaultUnit = parseFloat(verifyDialog.unit_price_override || req.unit_price || 0) || 0;
          const corrected = req.steel_specs.items.map((it, idx) => {
            const seR = seByIdx[idx] || {};
            const ov = stOv[idx] || {};
            const reqRods = parseInt(it.rod_count, 10) || 0;
            const reqKg = Number(it.calculated_weight_kg || it.weight_kg || 0);
            const recvRods = ov.rod_count !== undefined ? (parseInt(ov.rod_count, 10) || 0) : (parseInt(seR.received_rod_count, 10) || reqRods);
            const recvKg = ov.weight_kg !== undefined ? (parseFloat(ov.weight_kg) || 0) : (Number(seR.received_weight_kg) || reqKg);
            const unitPrice = ov.unit_price !== undefined ? (parseFloat(ov.unit_price) || 0) : (Number(it.unit_price) || Number(seR.unit_price) || defaultUnit);
            const rowTotal = +(recvKg * unitPrice).toFixed(2);
            return {
              diameter_mm: it.diameter_mm,
              rod_count: reqRods,
              received_rod_count: recvRods,
              requested_weight_kg: reqKg,
              received_weight_kg: recvKg,
              unit_price: unitPrice,
              row_total: rowTotal,
              diff_kg: Math.round((recvKg - reqKg) * 100) / 100,
            };
          });
          body.steel_received_corrected = corrected;
          const totalKg = corrected.reduce((s, x) => s + (x.received_weight_kg || 0), 0);
          const totalValue = corrected.reduce((s, x) => s + (x.row_total || 0), 0);
          // Snap received_quantity + unit_price so downstream sees consistent values.
          body.received_quantity = totalKg;
          body.unit_price = totalKg > 0 ? +(totalValue / totalKg).toFixed(4) : 0;
          body.total_value = totalValue;
        }
        await axios.post(`${API}/procurement-simple/material-requests/${req.request_id}/verify-approve`, body);
        toast.success('Delivery verified — sent to Accountant');
      }
      setVerifyDialog({ open: false, req: null, invoice_no: '', notes: '', qty_match: true, price_match: true, reject_mode: false, reject_reason: '', received_qty_override: '', unit_price_override: '', steel_overrides: {} });
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
        steel_overrides: {},
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
      <Dialog open={verifyDialog.open} onOpenChange={(o) => !o && setVerifyDialog({ open: false, req: null, invoice_no: '', notes: '', qty_match: true, price_match: true, reject_mode: false, reject_reason: '', received_qty_override: '', unit_price_override: '', steel_overrides: {} })}>
        <DialogContent className="w-[96vw] sm:w-auto sm:max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="proc-verify-dialog">
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
                // For Steel orders, compute the live totals from the per-row
                // table (Received Per Diameter) so the top "Received Qty" +
                // "Total" auto-sync with whatever Procurement enters below.
                let steelTotalKg = 0, steelTotalValue = 0;
                let isSteelWithRows = false;
                if (verifyDialog.req.steel_specs?.items?.length) {
                  isSteelWithRows = true;
                  const stOv = verifyDialog.steel_overrides || {};
                  const seByIdx = verifyDialog.req.steel_received || [];
                  const defaultUnitFallback = baselineUnit || 0;
                  verifyDialog.req.steel_specs.items.forEach((it, idx) => {
                    const seR = seByIdx[idx] || {};
                    const ov = stOv[idx] || {};
                    const reqRods = parseInt(it.rod_count, 10) || 0;
                    const reqKg = Number(it.calculated_weight_kg || it.weight_kg || 0);
                    const recvKg = ov.weight_kg !== undefined
                      ? (parseFloat(ov.weight_kg) || 0)
                      : (Number(seR.received_weight_kg) || reqKg);
                    const rowUnit = ov.unit_price !== undefined
                      ? (parseFloat(ov.unit_price) || 0)
                      : (Number(it.unit_price) || Number(seR.unit_price) || defaultUnitFallback);
                    steelTotalKg += recvKg;
                    steelTotalValue += recvKg * rowUnit;
                    // (reqRods kept for parity with table — currently unused here)
                    void reqRods;
                  });
                }
                const effectiveRecvFinal = isSteelWithRows ? steelTotalKg : effectiveRecv;
                const effectiveUnitFinal = isSteelWithRows
                  ? (steelTotalKg > 0 ? steelTotalValue / steelTotalKg : 0)
                  : effectiveUnit;
                const liveTotalFinal = isSteelWithRows ? steelTotalValue : (effectiveRecv * effectiveUnit);
                return (
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 border rounded p-2 text-xs">
                    <div><span className="text-gray-500">Ordered Qty:</span> <strong>{verifyDialog.req.approved_quantity || verifyDialog.req.quantity} {verifyDialog.req.unit || ''}</strong></div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 whitespace-nowrap">Received Qty:</span>
                      {isSteelWithRows ? (
                        <span className="font-semibold text-emerald-700" data-testid="verify-received-qty-auto">
                          {effectiveRecvFinal.toFixed(2)} {verifyDialog.req.unit || 'kg'}
                          <span className="ml-1 text-[9px] text-amber-600 uppercase">auto</span>
                        </span>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 whitespace-nowrap">Unit Price:</span>
                      {isSteelWithRows ? (
                        <span className="font-semibold text-emerald-700" data-testid="verify-unit-price-auto">
                          ₹ {effectiveUnitFinal.toFixed(2)} <span className="text-gray-400 text-[10px]">/{verifyDialog.req.unit || 'kg'} (weighted avg)</span>
                          <span className="ml-1 text-[9px] text-amber-600 uppercase">auto</span>
                        </span>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                    <div><span className="text-gray-500">Total:</span> <strong className="text-fuchsia-700" data-testid="verify-live-total">{fmt(liveTotalFinal)}</strong></div>
                    <div className="col-span-2"><span className="text-gray-500">Payment Mode:</span> <strong>{verifyDialog.req.payment_mode || '—'}</strong></div>
                  </div>
                );
              })()}

              {/* Per-diameter breakdown table — mirrors the SE Receive Material
                  popup. Only shown when this is a Steel order with the
                  diameter-wise spec AND the SE captured per-rod received qty.
                  Editable so Procurement can correct under/over count from the
                  SE before forwarding. Defaults to what the SE reported. */}
              {verifyDialog.req.steel_specs?.items?.length > 0 && (() => {
                const specItems = verifyDialog.req.steel_specs.items;
                const seReceived = verifyDialog.req.steel_received || [];
                // Key overrides by row INDEX (not diameter) so duplicate Ø rows
                // stay independent.
                const seByIdx = (i) => seReceived[i] || {};
                const overrides = verifyDialog.steel_overrides || {};
                const defaultUnit = parseFloat(verifyDialog.unit_price_override || verifyDialog.req.unit_price || 0) || 0;
                const setOverride = (idx, patch) => {
                  setVerifyDialog((d) => ({
                    ...d,
                    steel_overrides: { ...(d.steel_overrides || {}), [idx]: { ...((d.steel_overrides || {})[idx] || {}), ...patch } },
                  }));
                };
                let totReqRods = 0, totRecvRods = 0, totReqKg = 0, totRecvKg = 0, totRowAmt = 0;
                return (
                  <div className="rounded-md border border-amber-300 bg-amber-50/40 overflow-hidden">
                    <div className="px-3 py-2 bg-amber-100/60 text-[11px] uppercase tracking-wide text-amber-800 font-semibold flex items-center justify-between">
                      <span>Steel — Received Per Diameter</span>
                      <span className="text-[10px] normal-case">{specItems.length} {specItems.length === 1 ? 'row' : 'rows'} · Per-row unit price · Total auto-calculated</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-50 text-amber-800">
                          <tr>
                            <th className="text-left px-2 py-1.5 w-6">#</th>
                            <th className="text-left px-2 py-1.5">Diameter</th>
                            <th className="text-right px-2 py-1.5">Req. Rods</th>
                            <th className="text-right px-2 py-1.5">Recv. Rods</th>
                            <th className="text-right px-2 py-1.5">Requested (kg)</th>
                            <th className="text-right px-2 py-1.5">Received Qty (kg)</th>
                            <th className="text-right px-2 py-1.5">Unit Price (₹/kg)</th>
                            <th className="text-right px-2 py-1.5">Row Total (₹)</th>
                            <th className="text-right px-2 py-1.5">Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {specItems.map((it, idx) => {
                            const reqRods = parseInt(it.rod_count, 10) || 0;
                            const reqKg = Number(it.calculated_weight_kg || it.weight_kg || 0);
                            const seR = seByIdx(idx);
                            const ov = overrides[idx] || {};
                            const recvRods = ov.rod_count !== undefined
                              ? (parseInt(ov.rod_count, 10) || 0)
                              : (parseInt(seR.received_rod_count, 10) || reqRods);
                            const recvKg = ov.weight_kg !== undefined
                              ? (parseFloat(ov.weight_kg) || 0)
                              : (Number(seR.received_weight_kg) || reqKg);
                            const rowUnit = ov.unit_price !== undefined
                              ? (parseFloat(ov.unit_price) || 0)
                              : (Number(it.unit_price) || Number(seR.unit_price) || defaultUnit);
                            const rowAmt = +(recvKg * rowUnit).toFixed(2);
                            const diff = recvKg - reqKg;
                            const diffColor = Math.abs(diff) < 0.01 ? 'text-gray-400' : (diff < 0 ? 'text-rose-700' : 'text-emerald-700');
                            totReqRods += reqRods; totRecvRods += recvRods; totReqKg += reqKg; totRecvKg += recvKg; totRowAmt += rowAmt;
                            return (
                              <tr key={idx} className="border-t border-amber-200">
                                <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                                <td className="px-2 py-1.5 font-semibold text-slate-800">Ø {it.diameter_mm} mm</td>
                                <td className="px-2 py-1.5 text-right text-gray-600">{reqRods}</td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={ov.rod_count !== undefined ? ov.rod_count : recvRods}
                                    onChange={(e) => {
                                      const r = e.target.value;
                                      const parsedR = parseInt(r, 10) || 0;
                                      const D = Number(it.diameter_mm) || 0;
                                      const kg = +((D * D / 162) * 12.192 * parsedR).toFixed(2);
                                      setOverride(idx, { rod_count: r, weight_kg: String(kg) });
                                    }}
                                    className="h-7 text-right text-xs w-16 ml-auto"
                                    data-testid={`verify-steel-rods-${idx}`}
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right text-amber-700">{reqKg.toFixed(2)}</td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={ov.weight_kg !== undefined ? ov.weight_kg : recvKg.toFixed(2)}
                                    onChange={(e) => setOverride(idx, { weight_kg: e.target.value })}
                                    className="h-7 text-right text-xs w-20 ml-auto"
                                    data-testid={`verify-steel-kg-${idx}`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={ov.unit_price !== undefined ? ov.unit_price : String(rowUnit)}
                                    onChange={(e) => setOverride(idx, { unit_price: e.target.value })}
                                    className="h-7 text-right text-xs w-20 ml-auto"
                                    data-testid={`verify-steel-unit-${idx}`}
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">{fmt(rowAmt)}</td>
                                <td className={`px-2 py-1.5 text-right font-semibold ${diffColor}`}>
                                  {Math.abs(diff) < 0.01 ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-amber-100/40 border-t border-amber-300">
                          <tr>
                            <td colSpan={2} className="px-2 py-1.5 text-right font-semibold text-amber-800">Total</td>
                            <td className="px-2 py-1.5 text-right text-amber-700 font-semibold">{totReqRods}</td>
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{totRecvRods}</td>
                            <td className="px-2 py-1.5 text-right text-amber-700 font-semibold">{totReqKg.toFixed(2)} kg</td>
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{totRecvKg.toFixed(2)} kg</td>
                            <td className="px-2 py-1.5 text-right text-amber-600 text-[10px]">avg {totRecvKg > 0 ? (totRowAmt / totRecvKg).toFixed(2) : '0.00'}</td>
                            <td className="px-2 py-1.5 text-right font-bold text-emerald-800">{fmt(totRowAmt)}</td>
                            <td className={`px-2 py-1.5 text-right font-bold ${Math.abs(totRecvKg - totReqKg) < 0.01 ? 'text-gray-500' : (totRecvKg < totReqKg ? 'text-rose-700' : 'text-emerald-700')}`}>
                              {Math.abs(totRecvKg - totReqKg) < 0.01 ? '—' : `${totRecvKg - totReqKg > 0 ? '+' : ''}${(totRecvKg - totReqKg).toFixed(2)}`}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {verifyDialog.req.qty_mismatch_reason && (
                      <div className="px-3 py-2 border-t border-amber-300 bg-rose-50/40 text-xs">
                        <span className="font-semibold text-rose-700">SE Mismatch Reason: </span>
                        <span className="text-rose-900">{verifyDialog.req.qty_mismatch_reason}</span>
                      </div>
                    )}
                    <div className="px-3 py-2 bg-amber-100/40 border-t border-amber-300 text-[11px] text-amber-800 flex items-center justify-between flex-wrap gap-2">
                      <span>Tip: Edit per-row Unit Price — Row Total &amp; Grand Total recalculate automatically. The top Received Qty &amp; Total fields are auto-synced.</span>
                      <span className="font-bold text-amber-900">Grand Total: {fmt(totRowAmt)} · {totRecvKg.toFixed(2)} kg</span>
                    </div>
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
// DASHBOARD WRAPPER — Material Req | Credit Management | All Projects | Material Vendors
// =====================================================================
function DashboardTab() {
  const [subTab, setSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('subtab') || 'material_req';
  });
  const [dateRange, setDateRange] = useState(null); // {from, to, label, preset}
  const [projectFilter, setProjectFilter] = useState('all');
  const [projectOptions, setProjectOptions] = useState([]);

  useEffect(() => {
    // Load real live projects for the filter dropdown (same source as the
    // All Projects tab so the list stays consistent).
    axios.get(`${API}/procurement-simple/projects-summary`)
      .then(r => {
        const opts = (r.data?.projects || []).map(p => ({ id: p.project_id, name: p.name }));
        setProjectOptions(opts);
      })
      .catch(() => setProjectOptions([]));
  }, []);

  const setSub = (v) => {
    setSubTab(v);
    const url = new URL(window.location);
    url.searchParams.set('subtab', v);
    window.history.replaceState({}, '', url);
  };

  return (
    <div className="space-y-3" data-testid="proc-dashboard-tab">
      {/* Sub-tab pill bar + global project + date filter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 flex-wrap" data-testid="proc-subtabs">
          {[
            { key: 'material_req',     label: 'Material Req' },
            { key: 'credit_management', label: 'Credit Management' },
            { key: 'all_projects',     label: 'All Projects' },
            { key: 'material_vendors', label: 'Material Vendors' },
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
        {/* Project + Date filters — only for Material Req / Credit Management.
            All Projects and Material Vendors have their own filter UIs. */}
        {(subTab === 'material_req' || subTab === 'credit_management') && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-8 w-48 text-xs bg-white" data-testid="proc-project-filter">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All Projects</SelectItem>
                {projectOptions.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset={null} />
          </div>
        )}
      </div>

      {subTab === 'material_req' && <RequestsTab dateRange={dateRange} projectFilter={projectFilter} />}
      {subTab === 'credit_management' && <CreditManagementTab dateRange={dateRange} projectFilter={projectFilter} />}
      {subTab === 'all_projects' && <ProcurementAllProjectsTab />}
      {subTab === 'material_vendors' && <MaterialVendorsTab />}
    </div>
  );
}

// =====================================================================
// Procurement-focused All Projects view — columns mandated by the operator:
// Name | Stage | Total Orders | Active Orders | Deliveries | Material Value
// =====================================================================
function ProcurementAllProjectsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    axios.get(`${API}/procurement-simple/projects-summary`)
      .then(r => { if (alive) setRows(r.data?.projects || []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const t = q.toLowerCase();
    return rows.filter(r => (r.name || '').toLowerCase().includes(t));
  }, [rows, q]);

  return (
    <div className="space-y-3" data-testid="proc-all-projects">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">All Projects · Procurement</h2>
        <Input
          placeholder="Search project…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 w-56 text-sm"
          data-testid="proc-all-projects-search"
        />
      </div>
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-amber-50 text-amber-900 uppercase text-[11px]">
              <tr>
                <th className="text-left px-3 py-2 w-12">S.No</th>
                <th className="text-left px-3 py-2">Project Name</th>
                <th className="text-left px-3 py-2">Stage</th>
                <th className="text-right px-3 py-2">Total Orders</th>
                <th className="text-right px-3 py-2">Active Orders</th>
                <th className="text-right px-3 py-2">Deliveries</th>
                <th className="text-right px-3 py-2">Material Purchased</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center px-3 py-8 text-gray-400">Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center px-3 py-8 text-gray-400">No projects found.</td></tr>
              )}
              {!loading && filtered.map((r, idx) => (
                <tr key={r.project_id} className="border-t hover:bg-gray-50" data-testid={`proc-proj-${r.project_id}`}>
                  <td className="px-3 py-2 text-gray-500 text-xs">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] capitalize bg-violet-50 text-violet-700 border-violet-200">
                      {(r.status || '').replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{r.total_orders}</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-700">{r.active_orders}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">{r.delivered_count}</td>
                  <td className="px-3 py-2 text-right font-bold text-blue-700">{fmt(r.material_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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

function CreditManagementTab({ dateRange, projectFilter }) {
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

  // Filter by project before bucketing so counts + rows both honour it.
  const projectFiltered = useMemo(() => {
    if (!projectFilter || projectFilter === 'all') return items;
    return items.filter(it => it.project_id === projectFilter);
  }, [items, projectFilter]);

  const counts = useMemo(() => {
    const c = { all: projectFiltered.length };
    CREDIT_BUCKETS.forEach(b => { if (b.key !== 'all') c[b.key] = 0; });
    projectFiltered.forEach(it => { c[it.status] = (c[it.status] || 0) + 1; });
    return c;
  }, [projectFiltered]);

  const visibleItems = useMemo(() => {
    if (bucket === 'all') return projectFiltered;
    return projectFiltered.filter(it => it.status === bucket);
  }, [projectFiltered, bucket]);

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
  const isNewRequest = ['requested', 'pm_approved'].includes(status);
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [isHighPriority, setIsHighPriority] = useState(!!req.is_high_priority);
  useEffect(() => { setIsHighPriority(!!req.is_high_priority); }, [req.is_high_priority]);
  const togglePriority = async (e) => {
    e.stopPropagation();
    if (priorityBusy) return;
    setPriorityBusy(true);
    const next = !isHighPriority;
    try {
      await axios.patch(`${API}/procurement-simple/material-requests/${req.request_id}/toggle-priority`, { is_high_priority: next });
      setIsHighPriority(next);
      toast.success(next ? 'Marked as High Priority' : 'Priority cleared');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update priority');
    } finally { setPriorityBusy(false); }
  };
  // Compute "deliver in" label
  let deliveryLabel = '—';
  if (req.expected_delivery) {
    deliveryLabel = fmtDate(req.expected_delivery);
  } else if (req.timeline_type === 'days' && req.timeline_value) {
    deliveryLabel = `${req.timeline_value} days`;
  }
  const pmCfg = PAYMENT_MODE_DISPLAY[req.payment_mode];
  const latestVendorChange = Array.isArray(req.vendor_change_history) && req.vendor_change_history.length
    ? req.vendor_change_history[req.vendor_change_history.length - 1]
    : null;
  return (
    <div className="relative">
      {isHighPriority && (
        <div
          className="absolute -top-2 left-3 z-10 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide shadow-md flex items-center gap-1"
          data-testid={`proc-card-priority-ribbon-${req.request_id}`}
        >
          <AlertCircle className="h-3 w-3" /> High Priority
        </div>
      )}
      <Card
        className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 hover:bg-amber-50/30 ${isHighPriority ? 'ring-2 ring-red-400 border-red-300' : ''}`}
        style={{ borderLeftColor: isHighPriority ? '#dc2626' : (cardCfg ? `var(--tw-${cardCfg.key})` : '#f59e0b') }}
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
          <div className="flex items-center gap-2 shrink-0">
            {isNewRequest && (
              <button
                type="button"
                onClick={togglePriority}
                disabled={priorityBusy}
                title={isHighPriority ? 'Clear High Priority' : 'Mark as High Priority'}
                className={`px-2 py-1 rounded-full border text-[10px] font-semibold transition-all ${
                  isHighPriority
                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                    : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                } ${priorityBusy ? 'opacity-60 cursor-wait' : ''}`}
                data-testid={`proc-card-priority-btn-${req.request_id}`}
              >
                {isHighPriority ? '★ Priority ON' : '☆ High Priority'}
              </button>
            )}
            {(req.estimated_price || req.total_amount) ? (
              <span className="text-sm font-semibold text-emerald-700">{fmt(req.estimated_price || req.total_amount)}</span>
            ) : null}
          </div>
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
        {latestVendorChange && (
          <div className="mt-2 rounded border border-orange-300 bg-orange-50 px-2 py-1.5 text-[11px] text-orange-800 flex items-start gap-1.5" data-testid={`proc-card-vendor-change-${req.request_id}`}>
            <RefreshCw className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="flex-1">
              <strong>Vendor changed</strong> · <span className="line-through text-orange-600">{latestVendorChange.from_vendor_name || '—'}</span> → <strong>{latestVendorChange.to_vendor_name}</strong>
              <span className="block italic text-orange-700">"{latestVendorChange.reason}"</span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

// Payment mode lookup table — reused in card + dialog
const PAYMENT_MODE_DISPLAY = {
  pre_paid:      { label: 'Pre-paid',     cls: 'bg-blue-50 text-blue-700 border-blue-200',     desc: 'Accountant pays full amount upfront before delivery' },
  credit:        { label: 'Credit',       cls: 'bg-purple-50 text-purple-700 border-purple-200', desc: 'Post-paid after N days of delivery' },
  advance:       { label: 'Advance',      cls: 'bg-orange-50 text-orange-700 border-orange-200', desc: 'Pay advance now, balance after delivery' },
  post_delivery: { label: 'Post-delivery', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'Pay full amount on delivery' },
};

// Build a chronological timeline for a material request from all the
// timestamped fields the backend writes across its lifecycle (created →
// planning initial → PM → procurement → planning → accountant → transit →
// receive → verify → deliver). Every event carries an actor, tone (color)
// and optional detail line so the Timeline tab reads as an audit trail.
function buildTimeline(r) {
  if (!r) return [];
  const events = [];
  const push = (at, tone, title, actor, detail) => {
    if (!at) return;
    events.push({ at, tone, title, actor: actor || '', detail: detail || '' });
  };
  push(r.created_at, 'sky', 'Request created', r.site_engineer_name || r.requested_by_name, `Qty ${r.quantity} ${r.unit || ''} · ${r.material_name}${r.brand ? ` · ${r.brand}` : ''}`);
  if (r.is_high_priority && r.priority_updated_at) {
    push(r.priority_updated_at, 'red', 'Marked HIGH PRIORITY', r.priority_updated_by_name, '');
  }
  push(r.planning_initial_approved_at, 'emerald', 'Planning initial approved', r.planning_initial_approved_by_name, '');
  push(r.planning_initial_rejected_at, 'red', 'Planning initial rejected', r.planning_initial_rejected_by_name, r.planning_initial_rejection_reason);
  push(r.planning_initial_resubmitted_at, 'amber', 'SE resubmitted after planning rework', r.site_engineer_name, '');
  push(r.pm_approved_at, 'emerald', 'PM approved', r.pm_approved_by_name, '');
  push(r.pm_rejected_at, 'red', 'PM rejected', r.pm_rejected_by_name, r.pm_rejection_reason);
  push(r.procurement_priced_at, 'amber', 'Procurement assigned vendor', r.procurement_priced_by_name, [
    r.vendor_name && `Vendor: ${r.vendor_name}`,
    (r.unit_price || r.unit_rate) && `Unit ₹${Number(r.unit_price || r.unit_rate).toLocaleString('en-IN')}`,
    (r.total_amount || r.estimated_price) && `Total ${fmt(r.total_amount || r.estimated_price)}`,
    r.payment_mode && `Mode: ${r.payment_mode}`,
  ].filter(Boolean).join(' · '));
  push(r.procurement_rejected_at, 'red', 'Procurement rejected', r.procurement_rejected_by_name, r.procurement_rejection_reason);
  // Vendor changes — one event per swap
  (r.vendor_change_history || []).forEach((h) => {
    push(h.changed_at, 'orange', 'Vendor changed', h.changed_by_name, `${h.from_vendor_name || '—'} → ${h.to_vendor_name}${h.reason ? ` · "${h.reason}"` : ''}`);
  });
  push(r.revision_requested_at, 'orange', 'Planning sent back for revision', r.revision_requested_by_name, r.revision_remarks);
  push(r.planning_approved_at, 'emerald', 'Planning approved', r.planning_approved_by_name, '');
  push(r.planning_rejected_at, 'red', 'Planning rejected', r.planning_rejected_by_name, r.planning_rejection_reason);
  push(r.planning_edited_at, 'blue', 'Planning edited price / qty', r.planning_edited_by_name, '');
  push(r.accountant_approved_at || r.accounts_at, 'cyan', 'Accountant approved payment', r.accountant_approved_by_name || r.accounts_by, '');
  push(r.payment_requested_at, 'cyan', 'Payment requested to Accountant', r.payment_requested_by, '');
  push(r.paid_at, 'emerald', 'Payment released', r.paid_by, '');
  push(r.last_payment_at, 'emerald', 'Follow-up payment released', r.last_payment_by, '');
  push(r.po_generated_at, 'blue', 'Purchase Order generated', r.generated_by, r.po_id ? `PO: ${r.po_id}` : '');
  push(r.dispatched_at, 'sky', 'Vendor dispatched material', '', '');
  push(r.received_at, 'sky', 'SE received material', r.received_by_name, [
    r.received_quantity && `Qty ${r.received_quantity} ${r.unit || ''}`,
    r.lorry_image_id && '📷 Lorry img',
    r.material_image_id && '📷 Material img',
  ].filter(Boolean).join(' · '));
  push(r.procurement_verified_at, 'fuchsia', 'Procurement verified delivery', r.procurement_verified_by_name, '');
  push(r.delivered_at, 'emerald', 'Delivered / closed', '', '');
  push(r.credit_settled_at, 'emerald', 'Credit ledger settled', '', '');
  // Sort ascending; drop any un-parseable timestamps.
  return events
    .map(e => ({ ...e, ts: new Date(e.at).getTime() }))
    .filter(e => !isNaN(e.ts))
    .sort((a, b) => a.ts - b.ts);
}

const TIMELINE_TONE = {
  sky:      { dot: 'bg-sky-500',     text: 'text-sky-800',     bg: 'bg-sky-50 border-sky-200' },
  amber:    { dot: 'bg-amber-500',   text: 'text-amber-800',   bg: 'bg-amber-50 border-amber-200' },
  emerald:  { dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200' },
  red:      { dot: 'bg-red-500',     text: 'text-red-800',     bg: 'bg-red-50 border-red-200' },
  orange:   { dot: 'bg-orange-500',  text: 'text-orange-800',  bg: 'bg-orange-50 border-orange-200' },
  blue:     { dot: 'bg-blue-500',    text: 'text-blue-800',    bg: 'bg-blue-50 border-blue-200' },
  cyan:     { dot: 'bg-cyan-500',    text: 'text-cyan-800',    bg: 'bg-cyan-50 border-cyan-200' },
  fuchsia:  { dot: 'bg-fuchsia-500', text: 'text-fuchsia-800', bg: 'bg-fuchsia-50 border-fuchsia-200' },
};

function TimelineView({ item }) {
  const events = useMemo(() => buildTimeline(item), [item]);
  if (!events.length) {
    return <p className="text-center text-xs text-gray-400 py-10">No lifecycle activity yet.</p>;
  }
  const fmtDT = (s) => {
    try {
      return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return s || '—'; }
  };
  return (
    <div className="relative pl-4" data-testid="proc-timeline-view">
      {/* Vertical rail */}
      <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gray-200" aria-hidden />
      <ol className="space-y-3">
        {events.map((e, idx) => {
          const tone = TIMELINE_TONE[e.tone] || TIMELINE_TONE.sky;
          return (
            <li key={idx} className="relative" data-testid={`proc-timeline-event-${idx}`}>
              <span className={`absolute -left-2.5 top-1.5 h-3 w-3 rounded-full ring-2 ring-white ${tone.dot}`} />
              <div className={`ml-3 rounded border p-2 ${tone.bg}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className={`text-xs font-semibold ${tone.text}`}>{e.title}</p>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{fmtDT(e.at)}</span>
                </div>
                {(e.actor || e.detail) && (
                  <p className="text-[11px] text-gray-700 mt-0.5">
                    {e.actor && <span>by <strong>{e.actor}</strong></span>}
                    {e.actor && e.detail && <span> · </span>}
                    {e.detail && <span className="italic">{e.detail}</span>}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// =====================================================================
// Vendor Assign Dialog
// =====================================================================
// Reusable searchable vendor combobox — inline collapsed trigger that
// expands on click into a search + scrollable list, then collapses back
// once a vendor is picked (matches the "Search Approved Material" pattern).
function VendorCombobox({ value, onChange, vendors, disabled, excludeId, placeholder = 'Select a material vendor…', testId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter(v => (excludeId ? v.vendor_id !== excludeId : true))
      .filter(v => {
        if (!q) return true;
        const hay = `${v.name || v.vendor_name || ''} ${v.contact_person || ''} ${v.phone || ''}`.toLowerCase();
        return hay.includes(q);
      });
  }, [vendors, search, excludeId]);
  const selected = vendors.find(v => v.vendor_id === value);

  // Collapsed view — shows only the picked vendor (or placeholder) with a
  // chevron. Clicking anywhere on the row re-opens the search list.
  if (!open) {
    return (
      <div className="mt-1" data-testid={testId}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setOpen(true); setSearch(''); }}
          className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-left transition-colors hover:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60 disabled:cursor-not-allowed ${!selected ? 'text-gray-500' : 'text-gray-800'}`}
          data-testid={testId ? `${testId}-trigger` : undefined}
        >
          <span className="truncate flex items-center gap-2">
            {selected ? (
              <>
                <Check className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                <span>
                  <strong>{selected.name || selected.vendor_name}</strong>
                  {selected.phone && <span className="text-gray-500 ml-1">· {selected.phone}</span>}
                </span>
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span>{placeholder}</span>
              </>
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </div>
    );
  }

  // Expanded view — search input + scrollable list.
  return (
    <div className="mt-1 border border-amber-300 rounded-md overflow-hidden bg-white shadow-sm" data-testid={testId}>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50/60">
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name / contact / phone…"
          disabled={disabled}
          autoFocus
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400 disabled:cursor-not-allowed"
          data-testid={testId ? `${testId}-search` : undefined}
        />
        <button
          type="button"
          onClick={() => { setOpen(false); setSearch(''); }}
          className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50"
          data-testid={testId ? `${testId}-close` : undefined}
        >
          Close
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100" data-testid={testId ? `${testId}-list` : undefined}>
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-4">No vendors match</p>
        ) : filtered.map(v => (
          <button
            key={v.vendor_id}
            type="button"
            disabled={disabled}
            onClick={() => { onChange(v.vendor_id); setOpen(false); setSearch(''); }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center gap-2 ${value === v.vendor_id ? 'bg-amber-100' : ''}`}
            data-testid={testId ? `${testId}-option-${v.vendor_id}` : undefined}
          >
            <Check className={`h-3.5 w-3.5 shrink-0 ${value === v.vendor_id ? 'text-amber-700' : 'invisible'}`} />
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-gray-800 truncate">{v.name || v.vendor_name}</span>
              <span className="block text-[10px] text-gray-500 truncate">
                {[v.contact_person, v.phone].filter(Boolean).join(' · ') || '—'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AssignVendorDialog({ item, readOnly, onClose, onDone, onReject }) {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [approvedQty, setApprovedQty] = useState('');
  const [transport, setTransport] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Details / Timeline switcher inside the dialog
  const [dialogTab, setDialogTab] = useState('details');
  // Change-Vendor sub-flow (available on Transit-stage items)
  const [changeVendorOpen, setChangeVendorOpen] = useState(false);
  const [newVendorId, setNewVendorId] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
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
  // Feb 12 2026 — steel-specific per-diameter pricing. When the request carries
  // `steel_specs.items[]` (e.g., Ø8 / Ø10 / Ø12 …) we replace the single
  // Unit Price field with a per-diameter table so Procurement can quote each
  // rod gauge individually. unit_rate sent to backend becomes the weighted
  // average (₹/kg) so legacy queries continue to work, while the per-row
  // breakdown is preserved under `steel_pricing`.
  const [steelPrices, setSteelPrices] = useState([]);

  useEffect(() => {
    if (!item) return;
    setDialogTab('details');
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
    // Initialise the per-diameter steel price array (Feb 2026) — one entry
    // per steel_specs.items row, prefilled from any previously-saved price.
    const items = item.steel_specs?.items;
    if (Array.isArray(items) && items.length > 0) {
      const saved = Array.isArray(item.steel_pricing) ? item.steel_pricing : [];
      setSteelPrices(items.map((it, idx) => {
        const match = saved.find(s => s.diameter_mm === it.diameter_mm) || saved[idx] || {};
        return String(match.unit_price || '');
      }));
    } else {
      setSteelPrices([]);
    }
    // Load material vendors only
    axios.get(`${API}/vendor-master?category=material`).then(r => setVendors(r.data?.vendors || r.data || [])).catch(() => setVendors([]));
  }, [item]);

  const qty = parseFloat(approvedQty) || 0;
  const price = parseFloat(unitPrice) || 0;
  const tCost = parseFloat(transport) || 0;
  const disc = parseFloat(discount) || 0;
  // Feb 12 2026 — when this request has steel_specs.items, total is the SUM
  // of per-diameter (weight × unit_price) rows, not the single qty × price.
  const steelItems = item?.steel_specs?.items || [];
  const isSteelBreakdown = steelItems.length > 0;
  const steelLineTotals = steelItems.map((it, idx) => {
    const w = parseFloat(it.calculated_weight_kg || it.weight_kg) || 0;
    const p = parseFloat(steelPrices[idx]) || 0;
    return { weight: w, unit_price: p, line_total: w * p };
  });
  const steelSubtotal = steelLineTotals.reduce((s, r) => s + r.line_total, 0);
  const steelWeightTotal = steelLineTotals.reduce((s, r) => s + r.weight, 0);
  const weightedAvgUnitPrice = steelWeightTotal > 0 ? steelSubtotal / steelWeightTotal : 0;
  const total = isSteelBreakdown
    ? Math.max(0, steelSubtotal + tCost - disc)
    : Math.max(0, qty * price + tCost - disc);
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
    // Validation differs for steel breakdown vs single unit price.
    if (isSteelBreakdown) {
      const blanks = steelPrices.findIndex(p => !p || parseFloat(p) <= 0);
      if (blanks !== -1) {
        toast.error(`Enter a unit price for diameter Ø${steelItems[blanks].diameter_mm} mm`);
        return;
      }
    } else {
      if (!price || price <= 0) { toast.error('Enter a valid unit price'); return; }
      if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    }
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
      // For steel, the effective unit_price becomes the weighted average so the
      // existing backend (which stores a single unit_rate) keeps working.
      // Per-diameter detail is sent as `steel_pricing` for the future.
      const effectiveUnitPrice = isSteelBreakdown ? weightedAvgUnitPrice : price;
      const effectiveQty = isSteelBreakdown ? (steelWeightTotal || qty) : qty;
      const payload = {
        vendor_id: vendorId,
        vendor_name: selectedVendor?.name || selectedVendor?.vendor_name || '',
        unit_price: effectiveUnitPrice,
        approved_quantity: effectiveQty,
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
      };
      if (isSteelBreakdown) {
        payload.steel_pricing = steelItems.map((it, idx) => ({
          diameter_mm: it.diameter_mm,
          rod_count: it.rod_count,
          weight_kg: parseFloat(it.calculated_weight_kg || it.weight_kg) || 0,
          unit_price: parseFloat(steelPrices[idx]) || 0,
          line_total: steelLineTotals[idx]?.line_total || 0,
        }));
      }
      await axios.patch(`${API}/procurement-simple/material-requests/${item.request_id}/assign-vendor`, payload);
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

        {/* Details / Timeline tabs */}
        <div className="flex items-center gap-1.5 border-b -mx-6 px-6" data-testid="proc-dialog-tabs">
          <button
            type="button"
            onClick={() => setDialogTab('details')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              dialogTab === 'details'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            data-testid="proc-dialog-tab-details"
          >
            <Package className="h-3 w-3 inline mr-1" /> Details
          </button>
          <button
            type="button"
            onClick={() => setDialogTab('timeline')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              dialogTab === 'timeline'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            data-testid="proc-dialog-tab-timeline"
          >
            <FileClock className="h-3 w-3 inline mr-1" /> Timeline
          </button>
        </div>

        {dialogTab === 'timeline' ? (
          <div className="py-2">
            <TimelineView item={item} />
          </div>
        ) : (
        <>
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

        {/* Vendor change history — visible at every downstream stage */}
        {Array.isArray(item.vendor_change_history) && item.vendor_change_history.length > 0 && (
          <div className="bg-orange-50 border border-orange-300 rounded p-3 space-y-1.5" data-testid="proc-vendor-change-history">
            <p className="text-orange-800 text-[10px] uppercase font-bold flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Vendor Change History ({item.vendor_change_history.length})
            </p>
            <div className="space-y-1.5">
              {item.vendor_change_history.map((h, i) => (
                <div key={i} className="text-xs text-orange-900 border-l-2 border-orange-400 pl-2">
                  <p><span className="line-through text-orange-600">{h.from_vendor_name || '—'}</span> → <strong>{h.to_vendor_name}</strong></p>
                  <p className="italic">"{h.reason}"</p>
                  <p className="text-[10px] text-orange-700">
                    {h.changed_by_name ? `by ${h.changed_by_name}` : ''}
                    {h.changed_at ? ` · ${fmtDate(h.changed_at)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

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
            <VendorCombobox
              value={vendorId}
              onChange={setVendorId}
              vendors={vendors}
              disabled={readOnly}
              placeholder="Select a material vendor…"
              testId="proc-assign-vendor-select"
            />
            {selectedVendor && (
              <p className="text-[10px] text-gray-500 mt-1">{selectedVendor.phone || ''} {selectedVendor.address ? `· ${selectedVendor.address}` : ''}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {!isSteelBreakdown && (
              <>
                <div>
                  <Label className="text-xs">Unit Price (₹) *</Label>
                  <Input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={readOnly} className="mt-1" data-testid="proc-assign-unit-price" />
                </div>
                <div>
                  <Label className="text-xs">Approved Qty</Label>
                  <Input type="number" min="0" value={approvedQty} onChange={(e) => setApprovedQty(e.target.value)} disabled={readOnly} className="mt-1" data-testid="proc-assign-qty" />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Transport (₹)</Label>
              <Input type="number" min="0" value={transport} onChange={(e) => setTransport(e.target.value)} disabled={readOnly} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Discount (₹)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                disabled={readOnly}
                className="mt-1"
                data-testid="proc-assign-discount"
              />
            </div>
          </div>

          {/* Per-diameter steel pricing table — only when steel_specs.items[] present (Feb 2026) */}
          {isSteelBreakdown && (
            <div className="rounded-md border border-amber-300 bg-amber-50/40 overflow-hidden">
              <div className="px-3 py-2 bg-amber-100/60 text-[11px] uppercase tracking-wide text-amber-800 font-semibold flex items-center justify-between">
                <span>⚙ Steel — Per Diameter Pricing</span>
                <span className="text-[10px]">{steelItems.length} diameter{steelItems.length === 1 ? '' : 's'} · {steelWeightTotal.toFixed(2)} kg total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-amber-50 text-amber-800">
                    <tr>
                      <th className="text-left px-2 py-1.5 w-6">#</th>
                      <th className="text-left px-2 py-1.5">Diameter</th>
                      <th className="text-right px-2 py-1.5">Rods</th>
                      <th className="text-right px-2 py-1.5">Weight (kg)</th>
                      <th className="text-right px-2 py-1.5">Unit Price (₹/kg)</th>
                      <th className="text-right px-2 py-1.5">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steelItems.map((it, idx) => (
                      <tr key={idx} className="border-t border-amber-200" data-testid={`proc-steel-row-${idx}`}>
                        <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1.5 font-semibold text-slate-800">Ø {it.diameter_mm} mm</td>
                        <td className="px-2 py-1.5 text-right">{it.rod_count}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-amber-700">{Number(it.calculated_weight_kg || it.weight_kg || 0).toFixed(2)}</td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number" min="0" step="0.01"
                            value={steelPrices[idx] || ''}
                            onChange={(e) => {
                              const next = [...steelPrices];
                              next[idx] = e.target.value;
                              setSteelPrices(next);
                            }}
                            disabled={readOnly}
                            className="h-7 text-right"
                            data-testid={`proc-steel-price-${it.diameter_mm}`}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-emerald-700">
                          ₹{(steelLineTotals[idx]?.line_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-amber-100/40 border-t border-amber-300">
                    <tr>
                      <td colSpan={5} className="px-2 py-1.5 text-right font-semibold text-amber-800">Steel Subtotal</td>
                      <td className="px-2 py-1.5 text-right font-bold text-emerald-700" data-testid="proc-steel-subtotal">
                        ₹{steelSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

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
        </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Close</Button>
          {dialogTab === 'details' && readOnly && ['procurement_priced', 'in_transit', 'received_partial'].includes((item.status || '').toLowerCase()) && (
            <Button
              variant="outline"
              size="sm"
              className="text-orange-700 border-orange-300 hover:bg-orange-50"
              onClick={() => {
                setNewVendorId('');
                setChangeReason('');
                setChangeVendorOpen(true);
              }}
              data-testid="proc-assign-change-vendor"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Change Vendor
            </Button>
          )}
          {dialogTab === 'details' && !readOnly && (
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

      {/* Change Vendor sub-dialog — Transit-stage items only */}
      <Dialog open={changeVendorOpen} onOpenChange={(o) => !o && setChangeVendorOpen(false)}>
        <DialogContent className="max-w-md" data-testid="proc-change-vendor-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <RefreshCw className="h-5 w-5" /> Change Vendor
            </DialogTitle>
            <DialogDescription className="text-xs">
              {item.material_name} · Currently: <strong>{item.vendor_name || '—'}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">New Vendor *</Label>
              <VendorCombobox
                value={newVendorId}
                onChange={setNewVendorId}
                vendors={vendors}
                excludeId={item.vendor_id}
                placeholder="Select a different vendor…"
                testId="proc-change-vendor-select"
              />
            </div>
            <div>
              <Label className="text-xs">Reason for vendor change *</Label>
              <Textarea
                rows={3}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="e.g. Original vendor out of stock, better price / delivery timeline…"
                className="mt-1 text-sm"
                data-testid="proc-change-vendor-reason"
              />
              <p className="text-[10px] text-gray-500 mt-1">This reason is recorded in the request history and visible to Planning, Accountant & SE.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setChangeVendorOpen(false)} disabled={changeBusy}>Cancel</Button>
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={changeBusy}
              onClick={async () => {
                if (!newVendorId) { toast.error('Select the new vendor'); return; }
                if (!changeReason.trim()) { toast.error('Reason is required'); return; }
                const chosen = vendors.find(v => v.vendor_id === newVendorId);
                setChangeBusy(true);
                try {
                  await axios.patch(`${API}/procurement-simple/material-requests/${item.request_id}/change-vendor`, {
                    vendor_id: newVendorId,
                    vendor_name: chosen?.name || chosen?.vendor_name || '',
                    reason: changeReason.trim(),
                  });
                  toast.success('Vendor updated');
                  setChangeVendorOpen(false);
                  onDone();
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to change vendor');
                } finally { setChangeBusy(false); }
              }}
              data-testid="proc-change-vendor-submit"
            >
              {changeBusy ? 'Saving…' : 'Save Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);  // vendor or material being edited
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      axios.get(`${API}/vendor-master?category=material&active_only=false`).catch(() => ({ data: [] })),
      axios.get(`${API}/materials?active_only=false`).catch(() => ({ data: [] })),
    ]).then(([v, m]) => {
      setVendors(v.data?.vendors || v.data || []);
      setMaterials(m.data || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const inDate = (item) => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const t = new Date(item.created_at || 0).getTime();
    const fromTs = new Date(dateRange.from + 'T00:00:00').getTime();
    const toTs = new Date(dateRange.to + 'T23:59:59').getTime();
    return t >= fromTs && t <= toTs;
  };
  // Search supports: free text on name/contact/phone AND magic tokens
  // "active" / "inactive" to filter by status.
  const matchesSearch = (item, isVendor) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    if (q === 'active') return item.is_active !== false;
    if (q === 'inactive') return item.is_active === false;
    const haystack = [
      item.name, item.vendor_name, item.contact_person, item.phone, item.gst_number, item.address,
      isVendor ? '' : item.category, isVendor ? '' : item.unit,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  };
  const filteredVendors = useMemo(() =>
    vendors.filter(v => matchesSearch(v, true) && inDate(v)),
  [vendors, search, dateRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredMaterials = useMemo(() =>
    materials.filter(m => matchesSearch(m, false) && inDate(m)),
  [materials, search, dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddVendor = () => { setEditing(null); setForm({ name: '', contact_person: '', phone: '', email: '', gst_number: '', address: '', category: 'material', payment_terms: 'full', bank_name: '', account_number: '', ifsc_code: '', upi_id: '', materials_supplied: [], is_active: true }); setAddOpen(true); };
  const openEditVendor = (v) => { setEditing({ ...v, _kind: 'vendor' }); setForm({ ...v }); setAddOpen(true); };
  const openAddMaterial = () => { setEditing({ _kind: 'material_new' }); setForm({ name: '', category: 'cement', unit: 'bag', description: '', hsn_code: '', standard_rate: '', is_active: true }); setAddOpen(true); };
  const openEditMaterial = (m) => { setEditing({ ...m, _kind: 'material' }); setForm({ ...m }); setAddOpen(true); };

  const toggleVendorActive = async (v) => {
    try {
      await axios.patch(`${API}/vendor-master/${v.vendor_id}`, { is_active: !(v.is_active !== false) });
      toast.success(`Vendor ${v.is_active === false ? 'activated' : 'deactivated'}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Toggle failed');
    }
  };
  const toggleMaterialActive = async (m) => {
    try {
      await axios.patch(`${API}/materials/${m.material_id}`, { is_active: !(m.is_active !== false) });
      toast.success(`Material ${m.is_active === false ? 'activated' : 'deactivated'}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Toggle failed');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const isMaterial = editing?._kind === 'material' || editing?._kind === 'material_new' || view === 'materials';
      if (isMaterial) {
        const payload = { ...form };
        if (payload.standard_rate !== '' && payload.standard_rate != null) payload.standard_rate = parseFloat(payload.standard_rate);
        if (editing?.material_id) {
          await axios.patch(`${API}/materials/${editing.material_id}`, payload);
        } else {
          await axios.post(`${API}/materials`, payload);
        }
        toast.success('Material saved');
      } else {
        const payload = { ...form, category: form.category || 'material' };
        if (editing?.vendor_id) {
          await axios.patch(`${API}/vendor-master/${editing.vendor_id}`, payload);
        } else {
          await axios.post(`${API}/vendor-master`, payload);
        }
        toast.success('Vendor saved');
      }
      setAddOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="proc-vendors-tab">
      <div className="flex gap-1 border-b bg-white rounded-t-lg px-2 pt-1">
        <button onClick={() => setView('vendors')} className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${view === 'vendors' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`} data-testid="proc-vendor-view-vendors">
          Material Vendor <Badge variant="outline" className="ml-1 text-[10px]">{filteredVendors.length}</Badge>
        </button>
        <button onClick={() => setView('materials')} className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${view === 'materials' ? 'border-amber-600 text-amber-700 bg-amber-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`} data-testid="proc-vendor-view-materials">
          Materials <Badge variant="outline" className="ml-1 text-[10px]">{filteredMaterials.length}</Badge>
        </button>
      </div>
      {view === 'vendors' ? (
        <VendorMasterManagement embedded />
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Materials</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <MetaDateFilter value={dateRange} onChange={setDateRange} defaultPreset="last_month" />
              <Input placeholder='Search… (try "active" or "inactive")' value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-full sm:w-72 text-sm" data-testid="proc-vendors-search" />
              <Button size="sm" className="h-8 bg-amber-600 hover:bg-amber-700 text-xs" onClick={openAddMaterial} data-testid="proc-vendors-add-btn">
                + Add Material
              </Button>
            </div>
          </div>
      <Card>
        <CardContent className="p-0">
          {loading ? <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
          : (
            filteredMaterials.length === 0 ? <p className="text-center text-xs text-gray-400 py-10">No materials</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-y">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Material</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Category</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-600">Unit</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">Std Rate</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-600">Status</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredMaterials.map(m => {
                      const isActive = m.is_active !== false;
                      return (
                      <tr key={m.material_id} className="hover:bg-gray-50" data-testid={`proc-material-${m.material_id}`}>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 text-gray-700">{m.category || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{m.unit || '—'}</td>
                        <td className="px-3 py-2 text-right">{m.standard_rate ? fmt(m.standard_rate) : '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggleMaterialActive(m)} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`} data-testid={`proc-material-toggle-${m.material_id}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => openEditMaterial(m)} className="text-amber-700 hover:underline text-xs" data-testid={`proc-material-edit-${m.material_id}`}>Edit</button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>
        </>
      )}

      {/* Add / Edit Vendor or Material dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="proc-vendor-form-dialog">
          <DialogHeader>
            <DialogTitle>
              {(editing?._kind === 'material' || editing?._kind === 'material_new' || (view === 'materials' && !editing)) ? (editing?.material_id ? 'Edit Material' : 'Add Material') : (editing?.vendor_id ? 'Edit Material Vendor' : 'Add Material Vendor')}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              {(editing?._kind === 'material' || editing?._kind === 'material_new' || (view === 'materials' && !editing))
                ? 'Define a material item with category, unit and standard rate.'
                : 'Capture vendor info, banking details, and the materials they sell.'}
            </DialogDescription>
          </DialogHeader>
          {(editing?._kind === 'material' || editing?._kind === 'material_new' || (view === 'materials' && !editing)) ? (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2" data-testid="material-dialog-tabs">
                <TabsTrigger value="details" data-testid="material-tab-details">Details</TabsTrigger>
                <TabsTrigger value="vendors" data-testid="material-tab-vendors" disabled={!editing?.material_id}>
                  Vendors {editing?.material_id ? `(${vendors.filter(v => (v.materials_supplied || []).includes(editing.material_id)).length})` : ''}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 text-sm mt-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Material name" className="mt-1" data-testid="vendor-form-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category || ''} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1" data-testid="material-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_CATEGORIES.map(c => (
                        <SelectItem key={c} value={c}>{c.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit</Label>
                  <UnitSelect value={form.unit || ''} onChange={(v) => setForm({ ...form, unit: v })} className="mt-1" data-testid="material-unit-select" />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>HSN Code</Label>
                  <Input value={form.hsn_code || ''} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} placeholder="e.g. 2523" className="mt-1" />
                </div>
                <div>
                  <Label>Standard Rate (₹)</Label>
                  <Input type="number" min="0" step="any" value={form.standard_rate ?? ''} onChange={(e) => setForm({ ...form, standard_rate: e.target.value })} placeholder="Optional" className="mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
              </label>
              </TabsContent>
              <TabsContent value="vendors" className="mt-4">
                {(() => {
                  const linked = editing?.material_id ? vendors.filter(v => (v.materials_supplied || []).includes(editing.material_id)) : [];
                  if (!editing?.material_id) return <p className="text-xs text-gray-400 text-center py-8">Save the material first to see linked vendors.</p>;
                  if (linked.length === 0) return <p className="text-xs text-gray-400 text-center py-8">No vendors have tagged this material yet. Open a vendor and tick this material under "Materials they sell".</p>;
                  return (
                    <div className="overflow-x-auto border rounded-md" data-testid="material-vendors-list">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Vendor</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Contact</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">Phone</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-600">GST</th>
                            <th className="text-center px-3 py-2 font-semibold text-gray-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linked.map(v => (
                            <tr key={v.vendor_id} className="hover:bg-gray-50" data-testid={`material-vendor-${v.vendor_id}`}>
                              <td className="px-3 py-2 font-medium">{v.name || v.vendor_name}</td>
                              <td className="px-3 py-2 text-gray-700">{v.contact_person || '—'}</td>
                              <td className="px-3 py-2 text-gray-700">{v.phone || '—'}</td>
                              <td className="px-3 py-2 text-gray-700">{v.gst_number || '—'}</td>
                              <td className="px-3 py-2 text-center">
                                <Badge variant="outline" className={`text-[10px] ${v.is_active !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500'}`}>
                                  {v.is_active !== false ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          ) : (
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3" data-testid="vendor-dialog-tabs">
                <TabsTrigger value="basic" data-testid="vendor-tab-basic">Basic</TabsTrigger>
                <TabsTrigger value="bank" data-testid="vendor-tab-bank">Bank</TabsTrigger>
                <TabsTrigger value="materials" data-testid="vendor-tab-materials">Materials they sell</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Company Name <span className="text-red-500">*</span></Label><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" data-testid="vendor-name-input" /></div>
                  <div><Label>Contact Person</Label><Input value={form.contact_person || ''} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Phone</Label><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
                  <div><Label>Email</Label><Input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
                </div>
                <div><Label>Address</Label><Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>GST Number</Label><Input value={form.gst_number || ''} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label>Payment Terms</Label>
                    <Select value={form.payment_terms || 'full'} onValueChange={(v) => setForm({ ...form, payment_terms: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full</SelectItem>
                        <SelectItem value="advance">Advance</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.payment_terms === 'credit' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Credit Limit</Label><Input type="number" min="0" step="any" value={form.credit_limit || ''} onChange={(e) => setForm({ ...form, credit_limit: parseFloat(e.target.value) || 0 })} className="mt-1" /></div>
                    <div><Label>Credit Days</Label><Input type="number" min="0" value={form.credit_days || ''} onChange={(e) => setForm({ ...form, credit_days: parseInt(e.target.value) || 0 })} className="mt-1" /></div>
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
                </label>
              </TabsContent>

              <TabsContent value="bank" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Bank Name</Label><Input value={form.bank_name || ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="mt-1" placeholder="e.g., HDFC Bank" data-testid="vendor-bank-input" /></div>
                  <div><Label>Account Number</Label><Input value={form.account_number || ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="mt-1" data-testid="vendor-account-input" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>IFSC Code</Label><Input value={form.ifsc_code || ''} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })} className="mt-1 uppercase" placeholder="e.g., HDFC0001234" data-testid="vendor-ifsc-input" /></div>
                  <div><Label>UPI ID</Label><Input value={form.upi_id || ''} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} className="mt-1" placeholder="vendor@hdfcbank" /></div>
                </div>
                <p className="text-[11px] text-gray-500 italic">Bank details are used when generating payouts and reconciling cheques.</p>
              </TabsContent>

              <TabsContent value="materials" className="space-y-3 mt-4">
                <Label>Materials they sell</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal h-9" data-testid="vendor-materials-select">
                      <span className="truncate text-left">
                        {form.materials_supplied && form.materials_supplied.length > 0
                          ? form.materials_supplied.map(id => (materials.find(m => m.material_id === id) || {}).name || id).join(', ')
                          : <span className="text-gray-400">Select material(s)</span>}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="max-h-72 overflow-y-auto py-1">
                      {materials.filter(m => m.is_active !== false).length === 0 && (
                        <p className="text-[11px] text-gray-400 italic px-3 py-2">
                          Tip: Add materials under the "Materials" sub-tab.
                        </p>
                      )}
                      {materials.filter(m => m.is_active !== false).map(m => {
                        const checked = (form.materials_supplied || []).includes(m.material_id);
                        return (
                          <label key={m.material_id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm" data-testid={`vendor-material-option-${m.material_id}`}>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const cur = form.materials_supplied || [];
                                setForm({ ...form, materials_supplied: v ? [...cur, m.material_id] : cur.filter(id => id !== m.material_id) });
                              }}
                            />
                            <span className="flex-1">{m.name}</span>
                            {m.unit && <span className="text-[10px] text-gray-400">{m.unit}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                {form.materials_supplied && form.materials_supplied.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {form.materials_supplied.map(id => {
                      const m = materials.find(x => x.material_id === id);
                      return (
                        <Badge key={id} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          {m?.name || id}
                          <button
                            type="button"
                            onClick={() => setForm({ ...form, materials_supplied: form.materials_supplied.filter(x => x !== id) })}
                            className="ml-1 text-amber-600 hover:text-amber-800"
                          >×</button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={save} disabled={saving || !form.name} data-testid="vendor-form-save-btn">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
