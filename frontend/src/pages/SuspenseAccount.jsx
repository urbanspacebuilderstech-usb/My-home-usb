import { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import { Wallet, Users, Package, Banknote, Plus, CheckCircle, ArrowRight, AlertTriangle, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { NumericInput } from '../components/NumericInput';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => {
  if (!n && n !== 0) return '₹0';
  const num = Number(n);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export default function SuspenseAccountPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('petty_cash');
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [payForm, setPayForm] = useState({
    payment_type: 'labour', vendor_or_contractor: '', requested_amount: '',
    cheque_amount: '', payment_method: 'cheque', remarks: '',
    allocations: [{ project_id: '', amount: '' }]
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, susRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/suspense/overview`).catch(() => ({ data: null })),
        axios.get(`${API}/notifications`).catch(() => ({ data: [] })),
      ]);
      setUser(userRes.data);
      setData(susRes.data);
      setUnreadNotifs((notifsRes.data || []).filter(n => !n.read).length);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePettyCash = async (pcId) => {
    try {
      await axios.post(`${API}/suspense/petty-cash/${pcId}/settle`);
      toast.success('Petty cash settled');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to settle');
    }
  };

  // Super Admin only — fully removes a suspense entry from its source collection.
  // Used to clean up legacy/stale rows that "Process Payment" can't resolve
  // (e.g. duplicate ledger writes). Aggregated balances recompute on next load.
  const canDelete = user?.role === 'super_admin';
  const [expandedSuspense, setExpandedSuspense] = useState({}); // key → bool
  const toggleExpanded = (key) => setExpandedSuspense(s => ({ ...s, [key]: !s[key] }));

  const deletePettyCash = async (pc) => {
    if (!window.confirm(`Delete petty cash request "${pc.purpose}" of ${fmt(pc.amount_issued)}?\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/suspense/petty-cash/${pc.petty_cash_id}`);
      toast.success('Petty cash request deleted');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  const deleteMaterialEntry = async (entry) => {
    if (!entry.ledger_id) { toast.error('Missing ledger id'); return; }
    if (!window.confirm(`Delete material suspense entry of ${fmt(entry.balance)}?\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/suspense/material-entry/${entry.ledger_id}`);
      toast.success('Material suspense entry deleted');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  const deleteLabourEntry = async (entry) => {
    if (!entry.labour_expense_id) { toast.error('Missing labour expense id'); return; }
    if (!window.confirm(`Delete labour suspense entry of ${fmt(entry.balance)}?\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/suspense/labour-entry/${entry.labour_expense_id}`);
      toast.success('Labour suspense entry deleted');
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      const projects = data?.projects || [];
      const allocations = payForm.allocations.filter(a => a.project_id && a.amount).map(a => ({
        project_id: a.project_id,
        project_name: projects.find(p => p.project_id === a.project_id)?.name || '',
        amount: Number(a.amount)
      }));
      
      await axios.post(`${API}/suspense/payment`, {
        payment_type: payForm.payment_type,
        vendor_or_contractor: payForm.vendor_or_contractor,
        requested_amount: Number(payForm.requested_amount),
        cheque_amount: Number(payForm.cheque_amount),
        payment_method: payForm.payment_method,
        site_allocations: allocations,
        remarks: payForm.remarks,
      });
      toast.success('Payment processed with suspense tracking');
      setPaymentDialog(false);
      setPayForm({ payment_type: 'labour', vendor_or_contractor: '', requested_amount: '', cheque_amount: '', payment_method: 'cheque', remarks: '', allocations: [{ project_id: '', amount: '' }] });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  const addAllocation = () => setPayForm({ ...payForm, allocations: [...payForm.allocations, { project_id: '', amount: '' }] });
  const updateAllocation = (idx, field, val) => {
    const allocs = [...payForm.allocations];
    allocs[idx] = { ...allocs[idx], [field]: val };
    setPayForm({ ...payForm, allocations: allocs });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return null;

  const petty = data?.petty_cash || {};
  const matSus = data?.material_suspense || {};
  const labSus = data?.labour_suspense || {};
  const projects = data?.projects || [];

  return (
    <div className="min-h-screen bg-gray-50" data-testid="suspense-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="suspense-title">Suspense Account</h2>
          <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 bg-secondary hover:bg-secondary/90" data-testid="process-payment-btn">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">Process Payment</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Process Payment with Suspense</DialogTitle></DialogHeader>
              <form onSubmit={handlePayment} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Payment Type</Label>
                    <Select value={payForm.payment_type} onValueChange={(v) => setPayForm({...payForm, payment_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="material">Material</SelectItem>
                        <SelectItem value="labour">Labour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Payment Method</Label>
                    <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({...payForm, payment_method: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="savings_account">Savings A/c</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="escrow">Escrow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Vendor / Contractor Name</Label><Input data-testid="pay-vendor-input" value={payForm.vendor_or_contractor} onChange={(e) => setPayForm({...payForm, vendor_or_contractor: e.target.value})} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Requested Amount (₹)</Label><NumericInput data-testid="pay-requested-input" value={payForm.requested_amount} onChange={(e) => setPayForm({...payForm, requested_amount: e.target.value})} required /></div>
                  <div><Label>Cheque/Payment Amount (₹)</Label><NumericInput data-testid="pay-cheque-input" value={payForm.cheque_amount} onChange={(e) => setPayForm({...payForm, cheque_amount: e.target.value})} required /></div>
                </div>
                
                {payForm.requested_amount && payForm.cheque_amount && Number(payForm.cheque_amount) > Number(payForm.requested_amount) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 inline mr-1" />
                    <strong>Excess: {fmt(Number(payForm.cheque_amount) - Number(payForm.requested_amount))}</strong> will go to suspense account for {payForm.vendor_or_contractor || 'this vendor'}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Site Allocation</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addAllocation} className="text-xs">+ Add Site</Button>
                  </div>
                  {payForm.allocations.map((alloc, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-2 mb-2">
                      <Select value={alloc.project_id} onValueChange={(v) => updateAllocation(idx, 'project_id', v)}>
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>{projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <NumericInput placeholder="Amount (₹)" value={alloc.amount} onChange={(e) => updateAllocation(idx, 'amount', e.target.value)} />
                    </div>
                  ))}
                </div>
                <div><Label>Remarks</Label><Input value={payForm.remarks} onChange={(e) => setPayForm({...payForm, remarks: e.target.value})} /></div>
                <Button type="submit" className="w-full" data-testid="submit-payment-btn">Process Payment</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Total Suspense (sum of all 3) */}
        <Card className="mb-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 border-orange-200 border-2" data-testid="total-suspense-card">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-orange-700" />
                  <span className="text-sm font-semibold text-orange-800 uppercase tracking-wide">Total Suspense Balance</span>
                </div>
                <p className="text-4xl font-extrabold text-orange-700 mt-1" data-testid="total-suspense-amount">
                  {fmt((petty.balance || 0) + (matSus.total || 0) + (labSus.total || 0))}
                </p>
                <p className="text-xs text-orange-600 mt-1">Petty Cash + Material + Labour</p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
                <div className="bg-white/60 rounded-md px-3 py-2 border border-amber-200">
                  <p className="text-[10px] uppercase font-semibold text-amber-700">Petty</p>
                  <p className="text-base font-bold text-amber-800">{fmt(petty.balance)}</p>
                </div>
                <div className="bg-white/60 rounded-md px-3 py-2 border border-blue-200">
                  <p className="text-[10px] uppercase font-semibold text-blue-700">Material</p>
                  <p className="text-base font-bold text-blue-800">{fmt(matSus.total)}</p>
                </div>
                <div className="bg-white/60 rounded-md px-3 py-2 border border-purple-200">
                  <p className="text-[10px] uppercase font-semibold text-purple-700">Labour</p>
                  <p className="text-base font-bold text-purple-800">{fmt(labSus.total)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <Card data-testid="petty-summary" className="border-l-4 border-l-amber-500 cursor-pointer" onClick={() => setActiveTab('petty_cash')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Banknote className="h-4 w-4 text-amber-500" /><span className="text-sm font-bold text-gray-700">Petty Cash</span></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-gray-400">Issued</p><p className="text-sm font-bold text-amber-600">{fmt(petty.total_issued)}</p></div>
                <div><p className="text-[10px] text-gray-400">Spent</p><p className="text-sm font-bold text-red-600">{fmt(petty.total_spent)}</p></div>
                <div><p className="text-[10px] text-gray-400">Balance</p><p className="text-sm font-bold text-green-600">{fmt(petty.balance)}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="material-summary" className="border-l-4 border-l-blue-500 cursor-pointer" onClick={() => setActiveTab('materials')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Package className="h-4 w-4 text-blue-500" /><span className="text-sm font-bold text-gray-700">Material Suspense</span></div>
              <p className="text-2xl font-extrabold text-blue-700">{fmt(matSus.total)}</p>
              <p className="text-xs text-gray-400">{(matSus.balances || []).length} vendors with balance</p>
            </CardContent>
          </Card>
          <Card data-testid="labour-summary" className="border-l-4 border-l-purple-500 cursor-pointer" onClick={() => setActiveTab('labour')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-purple-500" /><span className="text-sm font-bold text-gray-700">Labour Suspense</span></div>
              <p className="text-2xl font-extrabold text-purple-700">{fmt(labSus.total)}</p>
              <p className="text-xs text-gray-400">{(labSus.balances || []).length} contractors with balance</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="suspense-tabs">
            <TabsTrigger value="petty_cash">Petty Cash ({(petty.all_requests || []).length})</TabsTrigger>
            <TabsTrigger value="materials">Materials ({(matSus.balances || []).length})</TabsTrigger>
            <TabsTrigger value="labour">Labour ({(labSus.balances || []).length})</TabsTrigger>
          </TabsList>

          <TabsContent value="petty_cash" className="mt-4 space-y-3">
            {(petty.all_requests || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-gray-400 text-sm">No petty cash requests</CardContent></Card>
            ) : (petty.all_requests || []).map((pc) => (
              <Card key={pc.petty_cash_id} data-testid={`petty-${pc.petty_cash_id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{pc.purpose || 'Petty Cash'}</p>
                        <Badge className={pc.status === 'settled' ? 'bg-green-100 text-green-800' : pc.status === 'issued' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'} data-testid={`petty-status-${pc.petty_cash_id}`}>{pc.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{pc.project_name || 'General'} | By: {pc.requested_by_name}</p>
                      <div className="flex gap-4 mt-1 text-xs">
                        <span>Requested: <strong>{fmt(pc.amount_requested)}</strong></span>
                        <span>Issued: <strong className="text-amber-600">{fmt(pc.amount_issued)}</strong></span>
                        <span>Spent: <strong className="text-red-600">{fmt(pc.amount_spent)}</strong></span>
                      </div>
                      {pc.expenses && pc.expenses.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {pc.expenses.map((exp, i) => (
                            <div key={i} className="text-xs text-gray-500 flex justify-between bg-gray-50 px-2 py-1 rounded">
                              <span>{exp.description}</span><span className="font-medium">{fmt(exp.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(pc.status === 'submitted' || pc.status === 'partially_settled') && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleSettlePettyCash(pc.petty_cash_id)} data-testid={`settle-${pc.petty_cash_id}`}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />Settle
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => deletePettyCash(pc)} data-testid={`delete-petty-${pc.petty_cash_id}`}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="materials" className="mt-4">
            {(matSus.balances || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-gray-400 text-sm">No material suspense balances</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Suspense Balance</th>
                      <th className="px-4 py-2.5 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(matSus.balances || []).map((b) => {
                      const k = `mat-${b.name}`;
                      const open = !!expandedSuspense[k];
                      const entries = b.entries || [];
                      return (
                        <Fragment key={k}>
                          <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggleExpanded(k)} data-testid={`mat-balance-${b.name}`}>
                            <td className="px-4 py-3 text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                                <span>{b.name}</span>
                                <span className="text-[10px] text-gray-400">({entries.length} {entries.length === 1 ? 'entry' : 'entries'})</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">{fmt(b.balance)}</td>
                            <td className="px-4 py-3 text-right"></td>
                          </tr>
                          {open && entries.length > 0 && (
                            <tr key={`${k}-detail`} className="bg-blue-50/30">
                              <td colSpan={3} className="px-4 py-2">
                                <div className="space-y-1">
                                  {entries.map((e, i) => (
                                    <div key={e.ledger_id || i} className="flex items-center justify-between gap-2 bg-white rounded px-3 py-2 border border-blue-100" data-testid={`mat-entry-${e.ledger_id || i}`}>
                                      <div className="text-xs">
                                        <div className="font-medium text-gray-800">{e.material || 'Unspecified material'}</div>
                                        <div className="text-[10px] text-gray-500">{e.status || '—'} · {e.due_date ? new Date(e.due_date).toLocaleDateString('en-IN') : 'No due date'}</div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-blue-700">{fmt(e.balance)}</span>
                                        {canDelete && (
                                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={(ev) => { ev.stopPropagation(); deleteMaterialEntry(e); }} data-testid={`delete-mat-${e.ledger_id || i}`}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="labour" className="mt-4">
            {(labSus.balances || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-gray-400 text-sm">No labour suspense balances</CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Contractor</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Suspense Balance</th>
                      <th className="px-4 py-2.5 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(labSus.balances || []).map((b) => {
                      const k = `lab-${b.name}`;
                      const open = !!expandedSuspense[k];
                      const entries = b.entries || [];
                      return (
                        <Fragment key={k}>
                          <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggleExpanded(k)} data-testid={`lab-balance-${b.name}`}>
                            <td className="px-4 py-3 text-sm font-medium">
                              <div className="flex items-center gap-2">
                                {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                                <span>{b.name}</span>
                                <span className="text-[10px] text-gray-400">({entries.length} {entries.length === 1 ? 'entry' : 'entries'})</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">{fmt(b.balance)}</td>
                            <td className="px-4 py-3 text-right"></td>
                          </tr>
                          {open && entries.length > 0 && (
                            <tr key={`${k}-detail`} className="bg-purple-50/30">
                              <td colSpan={3} className="px-4 py-2">
                                <div className="space-y-1">
                                  {entries.map((e, i) => (
                                    <div key={e.labour_expense_id || i} className="flex items-center justify-between gap-2 bg-white rounded px-3 py-2 border border-purple-100" data-testid={`lab-entry-${e.labour_expense_id || i}`}>
                                      <div className="text-xs">
                                        <div className="font-medium text-gray-800">{e.description || 'Labour entry'}</div>
                                        <div className="text-[10px] text-gray-500">{e.status || '—'}</div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-purple-700">{fmt(e.balance)}</span>
                                        {canDelete && (
                                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={(ev) => { ev.stopPropagation(); deleteLabourEntry(e); }} data-testid={`delete-lab-${e.labour_expense_id || i}`}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
