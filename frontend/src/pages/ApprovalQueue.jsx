import { useState, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle, XCircle, DollarSign, Package, Users, Truck, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (n) => {
  if (!n && n !== 0) return '₹0';
  const num = Number(n);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const statusColor = (s) => {
  if (s === 'requested') return 'bg-yellow-100 text-yellow-800';
  if (s === 'planning_approved') return 'bg-blue-100 text-blue-800';
  if (s === 'procurement_priced') return 'bg-purple-100 text-purple-800';
  if (s === 'accounts_approved') return 'bg-green-100 text-green-800';
  if (s?.includes('rejected')) return 'bg-red-100 text-red-800';
  if (s === 'pending_approval') return 'bg-amber-100 text-amber-800';
  if (s === 'approved') return 'bg-green-100 text-green-800';
  return 'bg-gray-100 text-gray-700';
};

export default function ApprovalQueue() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('income');
  const [data, setData] = useState({ income: [], materials: [], labour: [], vendor: [], summary: {} });
  const [rejectDialog, setRejectDialog] = useState({ open: false, type: '', id: '', reason: '' });
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, approvalsRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/approvals/unified`).catch(() => ({ data: { income: [], materials: [], labour: [], vendor: [], summary: {} } })),
        axios.get(`${API}/notifications`).catch(() => ({ data: [] })),
      ]);
      setUser(userRes.data);
      setData(approvalsRes.data);
      setUnreadNotifs((notifsRes.data || []).filter(n => !n.read).length);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const handleApproveIncome = async (incomeId) => {
    try {
      await axios.post(`${API}/approvals/income/${incomeId}/approve`);
      toast.success('Income approved');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve');
    }
  };

  const handleApproveExpense = async (type, id, action) => {
    try {
      const endpoint = `${API}/expenses/${type}/${id}/${action}`;
      await axios.patch(endpoint, { action: 'approved' });
      toast.success(`${type} expense approved`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    const { type, id, reason } = rejectDialog;
    try {
      if (type === 'income') {
        await axios.post(`${API}/approvals/income/${id}/reject?reason=${encodeURIComponent(reason)}`);
      } else {
        const actionMap = { material: 'accounts-approval', labour: 'accounts-approval', 'vendor-service': 'accounts-approval' };
        await axios.patch(`${API}/expenses/${type}/${id}/${actionMap[type]}`, { action: 'rejected', reason });
      }
      toast.success('Rejected');
      setRejectDialog({ open: false, type: '', id: '', reason: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return null;

  const s = data.summary || {};

  return (
    <div className="min-h-screen bg-gray-50" data-testid="approvals-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />

      <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4" data-testid="approvals-title">Approvals</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('income')} data-testid="summary-income">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-xs font-semibold text-gray-500">Income</span>
              </div>
              <p className="text-lg font-bold text-gray-800">{s.income_count || 0}</p>
              <p className="text-xs text-green-600 font-medium">{fmt(s.income_total)}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('materials')} data-testid="summary-materials">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-gray-500">Materials</span>
              </div>
              <p className="text-lg font-bold text-gray-800">{s.material_count || 0}</p>
              <p className="text-xs text-amber-600 font-medium">{fmt(s.material_total)}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('labour')} data-testid="summary-labour">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-gray-500">Labour</span>
              </div>
              <p className="text-lg font-bold text-gray-800">{s.labour_count || 0}</p>
              <p className="text-xs text-blue-600 font-medium">{fmt(s.labour_total)}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('vendor')} data-testid="summary-vendor">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="h-4 w-4 text-purple-500" />
                <span className="text-xs font-semibold text-gray-500">Suppliers</span>
              </div>
              <p className="text-lg font-bold text-gray-800">{s.vendor_count || 0}</p>
              <p className="text-xs text-purple-600 font-medium">{fmt(s.vendor_total)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full" data-testid="approval-tabs">
            <TabsTrigger value="income">Income ({s.income_count || 0})</TabsTrigger>
            <TabsTrigger value="materials">Materials ({s.material_count || 0})</TabsTrigger>
            <TabsTrigger value="labour">Labour ({s.labour_count || 0})</TabsTrigger>
            <TabsTrigger value="vendor">Suppliers ({s.vendor_count || 0})</TabsTrigger>
          </TabsList>

          {/* Income Approvals */}
          <TabsContent value="income" className="mt-4">
            {data.income.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-gray-400"><CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No pending income approvals</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {data.income.map((inc) => (
                  <Card key={inc.income_id} data-testid={`income-${inc.income_id}`} className="hover:shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sm">{inc.project_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {inc.payment_mode} {inc.reference_number ? `• Ref: ${inc.reference_number}` : ''} {inc.remarks ? `• ${inc.remarks}` : ''}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(inc.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-green-600">{fmt(inc.amount)}</span>
                          <Badge className={statusColor(inc.status)}>{inc.status}</Badge>
                          <div className="flex gap-1.5">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => handleApproveIncome(inc.income_id)} data-testid={`approve-income-${inc.income_id}`}>
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-500 border-red-200 h-8" onClick={() => setRejectDialog({ open: true, type: 'income', id: inc.income_id, reason: '' })} data-testid={`reject-income-${inc.income_id}`}>
                              <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Materials Approvals */}
          <TabsContent value="materials" className="mt-4">
            <ExpenseList items={data.materials} type="material" idField="expense_id"
              amountField="estimated_cost" altAmountField="final_amount" descField="material_name"
              onApprove={handleApproveExpense} onReject={(id) => setRejectDialog({ open: true, type: 'material', id, reason: '' })} />
          </TabsContent>

          {/* Labour Approvals */}
          <TabsContent value="labour" className="mt-4">
            <ExpenseList items={data.labour} type="labour" idField="labour_expense_id"
              amountField="total_amount" descField="contractor_name"
              onApprove={handleApproveExpense} onReject={(id) => setRejectDialog({ open: true, type: 'labour', id, reason: '' })} />
          </TabsContent>

          {/* Vendor/Supplier Approvals */}
          <TabsContent value="vendor" className="mt-4">
            <ExpenseList items={data.vendor} type="vendor-service" idField="expense_id"
              amountField="amount" descField="vendor_name"
              onApprove={handleApproveExpense} onReject={(id) => setRejectDialog({ open: true, type: 'vendor-service', id, reason: '' })} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => { if (!open) setRejectDialog({ open: false, type: '', id: '', reason: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectDialog.type === 'income' ? 'Income' : 'Expense'}</DialogTitle>
            <DialogDescription>Provide a reason for rejection</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason</Label>
              <Input data-testid="reject-reason-input" value={rejectDialog.reason} onChange={(e) => setRejectDialog({ ...rejectDialog, reason: e.target.value })} placeholder="Enter rejection reason..." />
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleReject} data-testid="confirm-reject-btn" disabled={!rejectDialog.reason}>
              Confirm Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}

// Reusable expense list component
function ExpenseList({ items, type, idField, amountField, altAmountField, descField, onApprove, onReject }) {
  if (!items || items.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-gray-400"><CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No pending {type} approvals</CardContent></Card>
    );
  }

  const getApprovalAction = (status) => {
    if (status === 'requested') return 'planning-approval';
    if (status === 'planning_approved') return type === 'material' ? 'procurement-pricing' : 'accounts-approval';
    if (status === 'procurement_priced') return 'accounts-approval';
    return null;
  };

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const id = item[idField] || item.expense_id;
        const amount = item[amountField] || (altAmountField ? item[altAmountField] : 0) || 0;
        const desc = item[descField] || item.description || 'Unknown';
        const action = getApprovalAction(item.status);

        return (
          <Card key={id} data-testid={`${type}-${id}`} className="hover:shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{desc}</p>
                    <Badge className={statusColor(item.status)} data-testid={`status-${id}`}>{item.status?.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.project_name} {item.quantity ? `• Qty: ${item.quantity}` : ''} {item.site_name ? `• Site: ${item.site_name}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-bold text-amber-600">{fmt(amount)}</span>
                  {action && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => onApprove(type, id, action)} data-testid={`approve-${type}-${id}`}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-500 border-red-200 h-8" onClick={() => onReject(id)} data-testid={`reject-${type}-${id}`}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
