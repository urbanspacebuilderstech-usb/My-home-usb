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
} from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s || '—'; } };

const NAV = [
  { label: 'Dashboard', value: 'dashboard', icon: 'Building2' },
  { label: 'Requests', value: 'requests', icon: 'ClipboardList' },
  { label: 'All Projects', value: 'projects', icon: 'Building2' },
  { label: 'Material Vendors', value: 'vendors', icon: 'Truck' },
];

export default function ProcurementBoardSimple() {
  const [user, setUser] = useState(null);
  const [activeNav, setActiveNav] = useState('dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && NAV.some(n => n.value === t)) setActiveNav(t);
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
        {activeNav === 'dashboard' && <DashboardTab onJump={setNav} />}
        {activeNav === 'requests' && <RequestsTab />}
        {activeNav === 'projects' && <AllProjectsTab />}
        {activeNav === 'vendors' && <MaterialVendorsTab />}
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}

// =====================================================================
// DASHBOARD
// =====================================================================
function DashboardTab({ onJump }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/procurement-simple/dashboard`);
        if (!cancel) setStats(res.data || {});
      } catch {
        if (!cancel) setStats({});
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (loading) return <div className="py-12 text-center text-gray-400"><RefreshCw className="h-6 w-6 mx-auto animate-spin" /></div>;
  const tiles = [
    { key: 'pending_assignment', label: 'Pending Vendor Assignment', icon: Hourglass, color: 'amber', cls: 'bg-amber-50 border-amber-200 text-amber-700', onClick: () => onJump('requests') },
    { key: 'forwarded_to_planning', label: 'Forwarded to Planning', icon: Send, color: 'blue', cls: 'bg-blue-50 border-blue-200 text-blue-700', onClick: () => onJump('requests') },
    { key: 'planning_approved', label: 'Planning Approved', icon: CheckCircle2, color: 'indigo', cls: 'bg-indigo-50 border-indigo-200 text-indigo-700', onClick: () => onJump('requests') },
    { key: 'accounts_approved', label: 'Accountant Cleared', icon: Wallet, color: 'emerald', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', onClick: () => onJump('requests') },
    { key: 'rejected', label: 'Rejected', icon: ThumbsDown, color: 'red', cls: 'bg-red-50 border-red-200 text-red-700', onClick: () => onJump('requests') },
    { key: 'monthly_spend', label: 'This Month Spend', icon: IndianRupee, color: 'violet', cls: 'bg-violet-50 border-violet-200 text-violet-700', isCurrency: true },
  ];

  return (
    <div className="space-y-4" data-testid="proc-dashboard">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Procurement Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">SE → <span className="font-medium text-amber-700">Procurement</span> → Planning → Accountant</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map(t => {
          const Icon = t.icon;
          const value = t.isCurrency ? fmt(stats?.[t.key] || 0) : (stats?.[t.key] ?? 0);
          return (
            <button
              key={t.key}
              onClick={t.onClick}
              disabled={!t.onClick}
              className={`group text-left p-3 rounded-lg border transition-all ${t.cls} ${t.onClick ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
              data-testid={`proc-tile-${t.key}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="h-4 w-4" />
                <span className="text-[10px] uppercase font-semibold tracking-wide opacity-80">{t.label}</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold">{value}</p>
            </button>
          );
        })}
      </div>
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-amber-600" /> Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 flex flex-wrap gap-2">
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1" onClick={() => onJump('requests')} data-testid="proc-quick-requests">
            <ClipboardList className="h-3.5 w-3.5" /> Review Material Requests
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => onJump('vendors')} data-testid="proc-quick-vendors">
            <Truck className="h-3.5 w-3.5" /> Manage Vendors
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => onJump('projects')} data-testid="proc-quick-projects">
            <Building2 className="h-3.5 w-3.5" /> View All Projects
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// REQUESTS — Material approvals queue
// =====================================================================
const QUEUE_TABS = [
  { key: 'pending', label: 'Pending Assignment', icon: Hourglass, cls: 'border-amber-600 text-amber-700 bg-amber-50/50' },
  { key: 'forwarded', label: 'Forwarded to Planning', icon: Send, cls: 'border-blue-600 text-blue-700 bg-blue-50/50' },
  { key: 'rejected', label: 'Rejected', icon: ThumbsDown, cls: 'border-red-600 text-red-700 bg-red-50/50' },
];

function RequestsTab() {
  const [queue, setQueue] = useState('pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ pending: 0, forwarded: 0, rejected: 0 });
  const [open, setOpen] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, req: null, reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const [q, all] = await Promise.all([
        axios.get(`${API}/procurement-simple/queue?queue=${queue}`),
        axios.get(`${API}/procurement-simple/dashboard`).catch(() => ({ data: {} })),
      ]);
      setItems(q.data?.requests || []);
      setCounts({
        pending: all.data?.pending_assignment || 0,
        forwarded: all.data?.forwarded_to_planning || 0,
        rejected: all.data?.rejected || 0,
      });
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [queue]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const submitReject = async () => {
    if (!rejectDialog.reason.trim()) { toast.error('Reason is required'); return; }
    setSubmitting(true);
    try {
      await axios.patch(`${API}/procurement-simple/material-requests/${rejectDialog.req.request_id}/reject`, { reason: rejectDialog.reason });
      toast.success('Request rejected');
      setRejectDialog({ open: false, req: null, reason: '' });
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reject');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3" data-testid="proc-requests-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Material Requests</h1>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={fetchQueue} data-testid="proc-refresh">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      {/* Queue tabs */}
      <div className="flex gap-1 border-b bg-white rounded-t-lg px-2 pt-1">
        {QUEUE_TABS.map(t => {
          const active = queue === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setQueue(t.key)}
              className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                active ? t.cls : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid={`proc-queue-${t.key}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              <Badge variant="outline" className={`ml-0.5 text-[10px] h-5 ${counts[t.key] > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                {counts[t.key] || 0}
              </Badge>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center text-xs text-gray-400 py-10">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-10">
              {queue === 'pending' ? 'No material requests awaiting your action' :
               queue === 'forwarded' ? 'Nothing forwarded yet' : 'No rejected requests'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-y">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Order</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Project</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Material</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Qty</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">SE</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600">Vendor / Price</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-600 w-32">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((r) => (
                    <tr key={r.request_id} className="hover:bg-amber-50/40" data-testid={`proc-row-${r.request_id}`}>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{r.order_id || r.request_id?.slice(-6)}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.project_name}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.material_name}</p>
                        {r.brand && <p className="text-[10px] text-gray-500">Brand: {r.brand}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">{r.quantity} {r.unit || ''}</td>
                      <td className="px-3 py-2 text-gray-700">{r.site_engineer_name}</td>
                      <td className="px-3 py-2 text-right">
                        {r.vendor_name ? (
                          <>
                            <p className="font-medium">{r.vendor_name}</p>
                            <p className="text-[10px] text-gray-500">{fmt(r.estimated_price || r.total_amount || 0)}</p>
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {queue === 'pending' ? (
                          <Button size="sm" className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700" onClick={() => setOpen(r)} data-testid={`proc-assign-${r.request_id}`}>
                            <Eye className="h-3 w-3" /> Assign
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setOpen(r)} data-testid={`proc-view-${r.request_id}`}>
                            <Eye className="h-3 w-3" /> View
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AssignVendorDialog
        item={open}
        readOnly={queue !== 'pending'}
        onClose={() => setOpen(null)}
        onDone={() => { setOpen(null); fetchQueue(); }}
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

  useEffect(() => {
    if (!item) return;
    setVendorId(item.vendor_id || '');
    setUnitPrice(String(item.unit_rate || item.unit_price || ''));
    setApprovedQty(String(item.approved_quantity ?? item.quantity ?? ''));
    setTransport(String(item.transport_cost || 0));
    setDiscount(String(item.discount || 0));
    setRemarks(item.procurement_remarks || '');
    // Load material vendors only
    axios.get(`${API}/vendor-master?category=material`).then(r => setVendors(r.data?.vendors || r.data || [])).catch(() => setVendors([]));
  }, [item]);

  if (!item) return null;
  const qty = parseFloat(approvedQty) || 0;
  const price = parseFloat(unitPrice) || 0;
  const tCost = parseFloat(transport) || 0;
  const disc = parseFloat(discount) || 0;
  const total = Math.max(0, qty * price + tCost - disc);
  const selectedVendor = vendors.find(v => v.vendor_id === vendorId);

  const submit = async () => {
    if (!vendorId) { toast.error('Select a vendor'); return; }
    if (!price || price <= 0) { toast.error('Enter a valid unit price'); return; }
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
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
            <Package className="h-5 w-5" /> {readOnly ? 'View' : 'Assign'} Vendor & Pricing
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

        {/* Vendor + pricing form */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Vendor *</Label>
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

          <div>
            <Label className="text-xs">Remarks (optional)</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={readOnly} className="mt-1 text-sm" placeholder="Any notes for Planning…" data-testid="proc-assign-remarks" />
          </div>

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
                <Send className="h-3.5 w-3.5 mr-1" /> {submitting ? 'Forwarding…' : 'Forward to Planning'}
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
