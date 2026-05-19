import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Plus, Clock, XCircle, Lock, ThumbsUp, ThumbsDown, RefreshCw, 
  TrendingUp, AlertTriangle, PieChart, ArrowRight, Building2
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'escrow', label: 'Escrow' }
];

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtL = (n) => {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n/10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n/100000).toFixed(2)} L`;
  return fmt(n);
};

export default function IndirectCostManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgetOverview, setBudgetOverview] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [mainTab, setMainTab] = useState('budget');
  const [expenseTab, setExpenseTab] = useState('pending');
  
  const [createDialog, setCreateDialog] = useState(false);
  const [approveDialog, setApproveDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedCost, setSelectedCost] = useState(null);
  const [distributionPreview, setDistributionPreview] = useState(null);
  
  const [createForm, setCreateForm] = useState({
    category: '', description: '', amount: '',
    payment_method: 'bank_transfer', vendor_name: '',
    invoice_number: '', invoice_date: '', remarks: ''
  });
  const [confirmForm, setConfirmForm] = useState({ payment_date: '', reference_number: '', remarks: '' });
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, costsRes, catsRes, budgetRes, allocRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/financial/indirect-costs`),
        axios.get(`${API}/financial/indirect-cost-categories`),
        axios.get(`${API}/financial/project-budget-overview`).catch(() => ({ data: null })),
        axios.get(`${API}/financial/indirect-cost-allocations`).catch(() => ({ data: [] }))
      ]);
      
      if (!['accountant', 'super_admin', 'general_manager'].includes(userRes.data.role)) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);
      setCosts(costsRes.data);
      setCategories(catsRes.data);
      if (budgetRes.data) setBudgetOverview(budgetRes.data);
      setAllocations(allocRes.data || []);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  // Fetch distribution preview when amount changes
  const fetchPreview = async (amount) => {
    if (!amount || parseFloat(amount) <= 0) { setDistributionPreview(null); return; }
    try {
      const res = await axios.get(`${API}/financial/indirect-cost-distribution-preview?amount=${parseFloat(amount)}`);
      setDistributionPreview(res.data);
    } catch { setDistributionPreview(null); }
  };

  const handleAmountChange = (val) => {
    setCreateForm({ ...createForm, amount: val });
    if (val && parseFloat(val) > 0) fetchPreview(val);
    else setDistributionPreview(null);
  };

  const handleCreateCost = async () => {
    if (!createForm.category || !createForm.description || !createForm.amount) {
      toast.error('Category, description, and amount are required');
      return;
    }
    try {
      await axios.post(`${API}/financial/indirect-costs`, {
        ...createForm,
        amount: parseFloat(createForm.amount),
        invoice_date: createForm.invoice_date ? new Date(createForm.invoice_date).toISOString() : null
      });
      toast.success('Indirect cost created. Pending approval.');
      setCreateDialog(false);
      setCreateForm({ category: '', description: '', amount: '', payment_method: 'bank_transfer', vendor_name: '', invoice_number: '', invoice_date: '', remarks: '' });
      setDistributionPreview(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create entry');
    }
  };

  const handleApprove = async (approved) => {
    try {
      await axios.patch(`${API}/financial/indirect-costs/${selectedCost.indirect_cost_id}/approve`, {
        approved, rejection_reason: approved ? null : rejectionReason
      });
      toast.success(approved ? 'Approved' : 'Rejected');
      setApproveDialog(false); setSelectedCost(null); setRejectionReason('');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  const handleConfirmPayment = async () => {
    if (!confirmForm.reference_number || !confirmForm.payment_date) {
      toast.error('Payment date and reference required');
      return;
    }
    try {
      await axios.patch(`${API}/financial/indirect-costs/${selectedCost.indirect_cost_id}/confirm`, {
        payment_date: new Date(confirmForm.payment_date).toISOString(),
        reference_number: confirmForm.reference_number,
        remarks: confirmForm.remarks || null
      });
      toast.success('Payment confirmed! Cost auto-distributed across projects.');
      setConfirmDialog(false); setSelectedCost(null);
      setConfirmForm({ payment_date: '', reference_number: '', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  const getCategoryLabel = (v) => categories.find(c => c.value === v)?.label || v;
  
  const getStatusBadge = (status) => {
    const m = { pending: ['Pending', 'bg-yellow-100 text-yellow-700'], approved: ['Approved', 'bg-amber-50 text-amber-700'], confirmed: ['Confirmed', 'bg-green-100 text-green-700'], rejected: ['Rejected', 'bg-red-100 text-red-700'] };
    const [label, cls] = m[status] || [status, 'bg-gray-100'];
    return <Badge className={cls}>{label}</Badge>;
  };

  const filteredCosts = costs.filter(c => expenseTab === 'all' ? true : c.status === expenseTab);
  const stats = {
    pending: costs.filter(c => c.status === 'pending').length,
    approved: costs.filter(c => c.status === 'approved').length,
    confirmed: costs.filter(c => c.status === 'confirmed').length,
    rejected: costs.filter(c => c.status === 'rejected').length,
    totalConfirmed: costs.filter(c => c.status === 'confirmed').reduce((s, c) => s + (c.amount || 0), 0)
  };

  if (loading && !user) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-6 w-6 animate-spin text-violet-600" /></div>;

  const canCreate = ['accountant', 'super_admin'].includes(user?.role);
  const canApprove = ['super_admin', 'general_manager'].includes(user?.role);
  const canConfirm = ['accountant', 'super_admin'].includes(user?.role);
  const bo = budgetOverview;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="indirect-cost-page">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Indirect Cost Management</h1>
            <p className="text-sm text-gray-500">{100 - (bo?.indirect_cost_percent || 20)}% Direct / {bo?.indirect_cost_percent || 20}% Indirect+Profit per project</p>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateDialog(true)} className="bg-violet-600 hover:bg-violet-700 gap-1.5" data-testid="add-indirect-cost-btn">
              <Plus className="h-4 w-4" /> Add Indirect Cost
            </Button>
          )}
        </div>

        {/* Main Tabs */}
        <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
          <TabsList className="bg-white border">
            <TabsTrigger value="budget" className="gap-1.5" data-testid="budget-tab"><PieChart className="h-3.5 w-3.5" /> Budget Overview</TabsTrigger>
            <TabsTrigger value="expenses" className="gap-1.5" data-testid="expenses-tab"><Clock className="h-3.5 w-3.5" /> Expenses ({costs.length})</TabsTrigger>
            <TabsTrigger value="allocations" className="gap-1.5" data-testid="allocations-tab"><ArrowRight className="h-3.5 w-3.5" /> Allocations ({allocations.length})</TabsTrigger>
          </TabsList>

          {/* ===== BUDGET OVERVIEW TAB ===== */}
          <TabsContent value="budget">
            {bo && (
              <>
                {/* Portfolio Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4 text-center">
                      <Building2 className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                      <p className="text-lg font-bold text-blue-700">{fmtL(bo.portfolio_total)}</p>
                      <p className="text-xs text-blue-600">Portfolio Total ({bo.projects?.length || 0} Projects)</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-orange-50 border-orange-200">
                    <CardContent className="p-4 text-center">
                      <PieChart className="h-5 w-5 mx-auto mb-1 text-orange-600" />
                      <p className="text-lg font-bold text-orange-700">{fmtL(bo.total_indirect_budget)}</p>
                      <p className="text-xs text-orange-600">{bo.indirect_cost_percent || 20}% Indirect Budget</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50 border-red-200">
                    <CardContent className="p-4 text-center">
                      <TrendingUp className="h-5 w-5 mx-auto mb-1 text-red-600" />
                      <p className="text-lg font-bold text-red-700">{fmtL(bo.total_indirect_spent)}</p>
                      <p className="text-xs text-red-600">Indirect Spent</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4 text-center">
                      <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-600" />
                      <p className="text-lg font-bold text-green-700">{fmtL(bo.total_indirect_remaining)}</p>
                      <p className="text-xs text-green-600">Remaining (Profit Pool)</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Per-Project Budget Table */}
                <Card>
                  <CardHeader className="border-b py-3">
                    <CardTitle className="text-sm font-semibold">Project-wise Budget Breakdown ({100 - (bo.indirect_cost_percent || 20)}/{bo.indirect_cost_percent || 20} Rule)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">VALUE</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">SHARE %</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">DIRECT ({100 - (bo.indirect_cost_percent || 20)}%)</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">INDIRECT ({bo.indirect_cost_percent || 20}%)</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">SPENT</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">REMAINING</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(bo.projects || []).map(p => {
                            const usedPct = p.indirect_budget > 0 ? (p.indirect_spent / p.indirect_budget * 100) : 0;
                            return (
                              <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`budget-row-${p.project_id}`}>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-sm">{p.name}</p>
                                  <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-sm">{fmtL(p.total_value)}</td>
                                <td className="px-4 py-3 text-center">
                                  <Badge className="bg-blue-100 text-blue-700">{p.share_pct}%</Badge>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-gray-600">{fmtL(p.direct_budget)}</td>
                                <td className="px-4 py-3 text-right text-sm text-orange-600 font-medium">{fmtL(p.indirect_budget)}</td>
                                <td className="px-4 py-3 text-right text-sm text-red-600 font-medium">{fmtL(p.indirect_spent)}</td>
                                <td className="px-4 py-3 text-right text-sm text-green-600 font-bold">{fmtL(p.indirect_remaining)}</td>
                                <td className="px-4 py-3 text-center">
                                  {p.is_exhausted ? (
                                    <Badge className="bg-red-100 text-red-700 gap-1"><AlertTriangle className="h-3 w-3" /> Exhausted</Badge>
                                  ) : usedPct > 75 ? (
                                    <Badge className="bg-yellow-100 text-yellow-700">{usedPct.toFixed(0)}% Used</Badge>
                                  ) : (
                                    <Badge className="bg-green-100 text-green-700">{usedPct.toFixed(0)}% Used</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {(!bo.projects || bo.projects.length === 0) && (
                            <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No active projects</td></tr>
                          )}
                        </tbody>
                        {bo.projects?.length > 0 && (
                          <tfoot className="bg-gray-100 border-t-2">
                            <tr className="font-bold text-sm">
                              <td className="px-4 py-3">TOTAL</td>
                              <td className="px-4 py-3 text-right">{fmtL(bo.portfolio_total)}</td>
                              <td className="px-4 py-3 text-center">100%</td>
                              <td className="px-4 py-3 text-right">{fmtL(bo.portfolio_total * 0.8)}</td>
                              <td className="px-4 py-3 text-right text-orange-600">{fmtL(bo.total_indirect_budget)}</td>
                              <td className="px-4 py-3 text-right text-red-600">{fmtL(bo.total_indirect_spent)}</td>
                              <td className="px-4 py-3 text-right text-green-600">{fmtL(bo.total_indirect_remaining)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            {!bo && <Card><CardContent className="p-8 text-center text-gray-500">No budget data available</CardContent></Card>}
          </TabsContent>

          {/* ===== EXPENSES TAB ===== */}
          <TabsContent value="expenses">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[
                { key: 'pending', label: 'Pending', count: stats.pending, color: 'yellow', icon: Clock },
                { key: 'approved', label: 'Approved', count: stats.approved, color: 'amber', icon: ThumbsUp },
                { key: 'confirmed', label: 'Confirmed', count: stats.confirmed, color: 'green', icon: Lock },
                { key: 'rejected', label: 'Rejected', count: stats.rejected, color: 'red', icon: XCircle },
                { key: 'all', label: 'Total Confirmed', count: null, color: 'violet', icon: TrendingUp }
              ].map(s => (
                <Card key={s.key} className={`bg-${s.color}-50 border-${s.color}-200 cursor-pointer ${expenseTab === s.key ? 'ring-2 ring-offset-1 ring-violet-400' : ''}`} onClick={() => setExpenseTab(s.key)}>
                  <CardContent className="p-3 text-center">
                    <s.icon className={`h-5 w-5 mx-auto mb-1 text-${s.color}-600`} />
                    <p className={`text-xl font-bold text-${s.color}-700`}>{s.count !== null ? s.count : fmtL(stats.totalConfirmed)}</p>
                    <p className={`text-[10px] text-${s.color}-600`}>{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CATEGORY</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">VENDOR</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredCosts.length === 0 ? (
                        <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No entries</td></tr>
                      ) : filteredCosts.map(cost => (
                        <tr key={cost.indirect_cost_id} className="hover:bg-gray-50" data-testid={`cost-row-${cost.indirect_cost_id}`}>
                          <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{getCategoryLabel(cost.category)}</Badge></td>
                          <td className="px-4 py-3 text-sm">{cost.description}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{cost.vendor_name || '-'}</td>
                          <td className="px-4 py-3 text-right font-bold text-violet-700">{fmt(cost.amount)}</td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(cost.status)}</td>
                          <td className="px-4 py-3 text-center space-x-1">
                            {cost.status === 'pending' && canApprove && (
                              <Button size="sm" onClick={() => { setSelectedCost(cost); setApproveDialog(true); }} data-testid={`review-btn-${cost.indirect_cost_id}`}>Review</Button>
                            )}
                            {cost.status === 'approved' && canConfirm && (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { setSelectedCost(cost); setConfirmDialog(true); }} data-testid={`confirm-btn-${cost.indirect_cost_id}`}>Confirm</Button>
                            )}
                            {cost.status === 'confirmed' && <span className="text-xs text-green-600"><Lock className="h-3 w-3 inline" /> Locked</span>}
                            {cost.status === 'rejected' && <span className="text-xs text-red-500">{cost.rejection_reason || 'Rejected'}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ALLOCATIONS TAB ===== */}
          <TabsContent value="allocations">
            <Card>
              <CardHeader className="border-b py-3">
                <CardTitle className="text-sm font-semibold">Auto-Distribution History (How indirect costs were split across projects)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CATEGORY</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">SHARE %</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DATE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allocations.length === 0 ? (
                        <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No allocations yet. Confirm an indirect cost to see auto-distribution.</td></tr>
                      ) : allocations.map((a, i) => (
                        <tr key={a.allocation_id || i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium">{a.project_name}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{getCategoryLabel(a.category)}</Badge></td>
                          <td className="px-4 py-3 text-sm text-gray-600">{a.description}</td>
                          <td className="px-4 py-3 text-center"><Badge className="bg-blue-100 text-blue-700">{a.share_pct}%</Badge></td>
                          <td className="px-4 py-3 text-right font-bold text-violet-700">{fmt(a.amount)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===== CREATE DIALOG with Distribution Preview ===== */}
      <Dialog open={createDialog} onOpenChange={(open) => { setCreateDialog(open); if (!open) setDistributionPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Indirect Cost (Overhead)</DialogTitle>
            <DialogDescription>This entry requires GM/Super Admin approval. Once confirmed, it will auto-distribute across all active projects.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={createForm.category} onValueChange={(v) => setCreateForm({ ...createForm, category: v })}>
                  <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount *</Label>
                <NumericInput value={createForm.amount} onChange={(e) => handleAmountChange(e.target.value)} placeholder="Enter amount" data-testid="input-amount" />
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Input value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="E.g., Marketing campaign Q1" data-testid="input-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment Method</Label>
                <Select value={createForm.payment_method} onValueChange={(v) => setCreateForm({ ...createForm, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor/Payee</Label>
                <Input value={createForm.vendor_name} onChange={(e) => setCreateForm({ ...createForm, vendor_name: e.target.value })} placeholder="Vendor name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Invoice #</Label><Input value={createForm.invoice_number} onChange={(e) => setCreateForm({ ...createForm, invoice_number: e.target.value })} placeholder="INV-001" /></div>
              <div><Label>Invoice Date</Label><Input type="date" value={createForm.invoice_date} onChange={(e) => setCreateForm({ ...createForm, invoice_date: e.target.value })} /></div>
            </div>
            <div><Label>Remarks</Label><Textarea value={createForm.remarks} onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })} rows={2} /></div>

            {/* Distribution Preview */}
            {distributionPreview && (
              <Card className="bg-violet-50 border-violet-200">
                <CardHeader className="py-2 px-4 border-b border-violet-200">
                  <CardTitle className="text-sm text-violet-700">Auto-Distribution Preview ({fmt(distributionPreview.amount)})</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {distributionPreview.warnings?.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {distributionPreview.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-orange-600 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {w}</p>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {distributionPreview.distributions?.map(d => (
                      <div key={d.project_id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge className={d.is_capped ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} variant="outline">{d.share_pct}%</Badge>
                          <span className="text-gray-700 truncate max-w-[200px]">{d.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-violet-700">{fmt(d.amount)}</span>
                          <span className="text-xs text-gray-400">({fmtL(d.remaining_after)} left)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-violet-600 mt-2 font-medium text-right">Total: {fmt(distributionPreview.total_allocated)}</p>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateCost} className="bg-violet-600 hover:bg-violet-700" data-testid="submit-indirect-cost"><Plus className="h-4 w-4 mr-1" /> Submit for Approval</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Review Indirect Cost</DialogTitle></DialogHeader>
          {selectedCost && (
            <div className="space-y-4">
              <Card className="bg-violet-50 border-violet-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{getCategoryLabel(selectedCost.category)}</p>
                  <p className="text-sm text-gray-600">{selectedCost.description}</p>
                  <p className="text-2xl font-bold text-violet-700 mt-2">{fmt(selectedCost.amount)}</p>
                  {selectedCost.vendor_name && <p className="text-sm text-gray-500">Vendor: {selectedCost.vendor_name}</p>}
                </CardContent>
              </Card>
              <div><Label>Rejection Reason (if rejecting)</Label><Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleApprove(false)} disabled={!rejectionReason} data-testid="reject-btn"><ThumbsDown className="h-4 w-4 mr-1" /> Reject</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleApprove(true)} data-testid="approve-btn"><ThumbsUp className="h-4 w-4 mr-1" /> Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Payment Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>Once confirmed, this cost will be locked and auto-distributed across all active projects based on their value share.</DialogDescription>
          </DialogHeader>
          {selectedCost && (
            <div className="space-y-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedCost.description}</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{fmt(selectedCost.amount)}</p>
                </CardContent>
              </Card>
              <div><Label>Payment Date *</Label><Input type="date" value={confirmForm.payment_date} onChange={(e) => setConfirmForm({ ...confirmForm, payment_date: e.target.value })} data-testid="input-payment-date" /></div>
              <div><Label>Reference / Transaction ID *</Label><Input value={confirmForm.reference_number} onChange={(e) => setConfirmForm({ ...confirmForm, reference_number: e.target.value })} placeholder="TXN-001" data-testid="input-reference" /></div>
              <div><Label>Remarks</Label><Textarea value={confirmForm.remarks} onChange={(e) => setConfirmForm({ ...confirmForm, remarks: e.target.value })} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmPayment} className="bg-green-600 hover:bg-green-700" data-testid="confirm-payment-btn"><Lock className="h-4 w-4 mr-1" /> Confirm & Distribute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
