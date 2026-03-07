import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Wallet, LogOut, Package, Users, Truck, DollarSign, 
  CreditCard, CheckCircle, Clock, Eye, Building2, AlertCircle, X, FileText
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AccountsBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [pendingPayments, setPendingPayments] = useState([]);
  const [advancePayments, setAdvancePayments] = useState([]);
  const [activeTab, setActiveTab] = useState('advance');
  
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedAdvance, setSelectedAdvance] = useState(null);
  
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'full',
    amount: '',
    remarks: ''
  });
  
  const [verifyForm, setVerifyForm] = useState({
    transaction_id: '',
    bank_name: '',
    remarks: ''
  });
  
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, paymentsRes, advanceRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accounts/dashboard`),
        axios.get(`${API}/accounts/pending-payments`),
        axios.get(`${API}/accounts/pending-advance-payments`)
      ]);
      
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only Accounts can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setPendingPayments(paymentsRes.data);
      setAdvancePayments(advanceRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === 'advance') {
      const res = await axios.get(`${API}/accounts/pending-advance-payments`);
      setAdvancePayments(res.data);
    } else if (tab === 'all') {
      const res = await axios.get(`${API}/accounts/pending-payments`);
      setPendingPayments(res.data);
    } else {
      const res = await axios.get(`${API}/accounts/pending-payments?payment_type=${tab}`);
      setPendingPayments(res.data);
    }
  };

  const openPaymentDialog = (item) => {
    setSelectedItem(item);
    setPaymentForm({ payment_type: 'full', amount: '', remarks: '' });
    setPaymentDialog(true);
  };

  const openVerifyDialog = (project) => {
    setSelectedAdvance(project);
    setVerifyForm({ transaction_id: '', bank_name: '', remarks: '' });
    setVerifyDialog(true);
  };

  const openRejectDialog = (project) => {
    setSelectedAdvance(project);
    setRejectReason('');
    setRejectDialog(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedItem) return;

    try {
      if (selectedItem.payment_type === 'stage') {
        await axios.patch(
          `${API}/work-orders/${selectedItem.work_order_id}/stages/${selectedItem.stage_id}/process-payment`
        );
        toast.success('Stage payment processed');
      } else {
        const itemId = selectedItem.pricing_id || selectedItem.expense_id || selectedItem.request_id;
        
        await axios.patch(`${API}/accounts/process-payment/${selectedItem.payment_type}/${itemId}`, {
          payment_type: paymentForm.payment_type,
          amount: paymentForm.payment_type === 'partial' ? parseFloat(paymentForm.amount) : null,
          remarks: paymentForm.remarks
        });
        
        toast.success(`Payment processed as ${paymentForm.payment_type}`);
      }
      
      setPaymentDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process payment');
    }
  };

  const handleVerifyAdvancePayment = async () => {
    if (!selectedAdvance || !verifyForm.transaction_id) {
      toast.error('Transaction ID is required');
      return;
    }

    try {
      await axios.patch(`${API}/accounts/verify-advance-payment/${selectedAdvance.project_id}`, verifyForm);
      toast.success('Advance payment verified successfully');
      setVerifyDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to verify payment');
    }
  };

  const handleRejectAdvancePayment = async () => {
    if (!selectedAdvance || !rejectReason) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await axios.patch(`${API}/accounts/reject-advance-payment/${selectedAdvance.project_id}`, { reason: rejectReason });
      toast.success('Payment rejected');
      setRejectDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject payment');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (error) {
      console.error('Logout error:', error);
    }
    window.location.href = '/login';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'material': return <Package className="h-4 w-4" />;
      case 'labour': return <Users className="h-4 w-4" />;
      case 'procurement': return <Truck className="h-4 w-4" />;
      case 'stage': return <CheckCircle className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type) => {
    const config = {
      material: { label: 'Material', color: 'bg-blue-100 text-blue-700' },
      labour: { label: 'Labour', color: 'bg-green-100 text-green-700' },
      procurement: { label: 'Procurement', color: 'bg-purple-100 text-purple-700' },
      stage: { label: 'Stage Payment', color: 'bg-orange-100 text-orange-700' }
    };
    const c = config[type] || { label: type, color: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${c.color}`}>{c.label}</span>;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold">Accounts Board</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Payment Processing & Financial Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/income'}>
              Income
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500 uppercase">ACCOUNTS</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4 mb-6">
          {/* New: Advance Payments Card - Highlighted */}
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 cursor-pointer ring-2 ring-amber-400" onClick={() => handleTabChange('advance')} data-testid="advance-payments-card">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-amber-600 mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm font-semibold">New Requests</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-700">{dashboard.pending_advance_payments || 0}</p>
              <p className="text-xs text-amber-600">{formatCurrency(dashboard.advance_payments_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer" onClick={() => handleTabChange('material')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Package className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Material</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{dashboard.pending_material || 0}</p>
              <p className="text-xs text-blue-600">{formatCurrency(dashboard.material_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 cursor-pointer" onClick={() => handleTabChange('labour')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Labour</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700">{dashboard.pending_labour || 0}</p>
              <p className="text-xs text-green-600">{formatCurrency(dashboard.labour_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 cursor-pointer" onClick={() => handleTabChange('procurement')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <Truck className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Procurement</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-purple-700">{dashboard.pending_procurement || 0}</p>
              <p className="text-xs text-purple-600">{formatCurrency(dashboard.procurement_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 cursor-pointer" onClick={() => handleTabChange('stage')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-orange-600 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Stage</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-orange-700">{dashboard.pending_stage_payments || 0}</p>
              <p className="text-xs text-orange-600">{formatCurrency(dashboard.stage_payments_total)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-red-50 to-red-100">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Total</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-red-700">
                {(dashboard.pending_advance_payments || 0) + (dashboard.pending_material || 0) + (dashboard.pending_labour || 0) + (dashboard.pending_procurement || 0) + (dashboard.pending_stage_payments || 0)}
              </p>
              <p className="text-xs text-red-600">{formatCurrency(dashboard.total_pending)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Payments / Advance Payments */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                <CardTitle className="text-lg">Payment Requests</CardTitle>
                <TabsList className="bg-transparent p-0 flex-wrap">
                  <TabsTrigger value="advance" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none text-xs sm:text-sm" data-testid="tab-advance">
                    New Requests
                  </TabsTrigger>
                  <TabsTrigger value="all" className="data-[state=active]:border-b-2 data-[state=active]:border-gray-600 rounded-none text-xs sm:text-sm">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="material" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none text-xs sm:text-sm">
                    Material
                  </TabsTrigger>
                  <TabsTrigger value="labour" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none text-xs sm:text-sm">
                    Labour
                  </TabsTrigger>
                  <TabsTrigger value="procurement" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none text-xs sm:text-sm">
                    Procurement
                  </TabsTrigger>
                  <TabsTrigger value="stage" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none text-xs sm:text-sm">
                    Stage
                  </TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Advance Payments Tab Content */}
              {activeTab === 'advance' ? (
                <div>
                  {advancePayments.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No pending advance payment verifications</div>
                  ) : (
                    <div className="divide-y">
                      {advancePayments.map((project) => (
                        <div key={project.project_id} className="p-4 hover:bg-gray-50" data-testid={`advance-card-${project.project_id}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Building2 className="h-4 w-4 text-amber-600" />
                                <span className="font-semibold">{project.name}</span>
                                <Badge variant="outline" className="text-xs">{project.project_code}</Badge>
                              </div>
                              <p className="text-sm text-gray-600">Client: {project.client_name}</p>
                              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-2">
                                <span>Package: {project.package_name}</span>
                                <span>Location: {project.location || 'N/A'}</span>
                                <span>Payment Mode: {project.advance_payment_mode || 'N/A'}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <p className="text-2xl font-bold text-green-600">{formatCurrency(project.advance_amount)}</p>
                              <p className="text-xs text-gray-500">Advance Received: {project.advance_date || 'N/A'}</p>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                  onClick={() => openRejectDialog(project)}
                                  data-testid={`reject-btn-${project.project_id}`}
                                >
                                  <X className="h-3 w-3 mr-1" /> Reject
                                </Button>
                                <Button 
                                  size="sm" 
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => openVerifyDialog(project)}
                                  data-testid={`verify-btn-${project.project_id}`}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" /> Verify & Confirm
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile Card View for Other Payments */}
                  <div className="block sm:hidden divide-y">
                    {pendingPayments.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">No pending payments</div>
                    ) : (
                      pendingPayments.map((item, index) => (
                        <div key={index} className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.payment_type)}
                              <span className="font-semibold">
                                {item.payment_type === 'stage' 
                                  ? `${item.work_order_number} - ${item.stage_name}`
                                  : (item.material_name || item.labour_type || 'Order')}
                              </span>
                            </div>
                            {getTypeBadge(item.payment_type)}
                          </div>
                          <div className="text-sm text-gray-500 mb-2">
                            <p>Project: {item.project_name}</p>
                            {item.vendor_name && <p>Vendor: {item.vendor_name}</p>}
                            {item.selected_vendor_name && <p>Vendor: {item.selected_vendor_name}</p>}
                            {item.contractor_name && <p>Contractor: {item.contractor_name}</p>}
                            {item.work_type && <p>Work: {item.work_type}</p>}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-lg font-bold text-green-600">
                              {formatCurrency(item.amount || item.final_amount || item.total_amount || item.estimated_cost)}
                            </span>
                            <Button size="sm" onClick={() => openPaymentDialog(item)}>
                              <DollarSign className="h-3 w-3 mr-1" /> Process
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Desktop Table View for Other Payments */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">TYPE</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">VENDOR/CONTRACTOR</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pendingPayments.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="px-4 py-8 text-center text-gray-500">No pending payments</td>
                          </tr>
                        ) : (
                          pendingPayments.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {getTypeIcon(item.payment_type)}
                                  {getTypeBadge(item.payment_type)}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {item.payment_type === 'stage' ? (
                                  <>
                                    <p className="font-medium">{item.work_order_number}</p>
                                    <p className="text-sm text-gray-600">Stage: {item.stage_name}</p>
                                    <p className="text-xs text-gray-500">{item.work_type}</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-medium">{item.material_name || item.labour_type || 'Procurement Order'}</p>
                                    {item.quantity && <p className="text-xs text-gray-500">Qty: {item.quantity} {item.unit}</p>}
                                  </>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">{item.project_name}</td>
                              <td className="px-4 py-3 text-sm">
                                {item.contractor_name || item.vendor_name || item.selected_vendor_name || '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-green-600">
                                {formatCurrency(item.amount || item.final_amount || item.total_amount || item.estimated_cost)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button size="sm" onClick={() => openPaymentDialog(item)}>
                                  <DollarSign className="h-3 w-3 mr-1" /> Process
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Verify Advance Payment Dialog */}
      <Dialog open={verifyDialog} onOpenChange={setVerifyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Verify Advance Payment
            </DialogTitle>
          </DialogHeader>

          {selectedAdvance && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedAdvance.name}</p>
                  <p className="text-sm text-gray-600">Client: {selectedAdvance.client_name}</p>
                  <p className="text-sm text-gray-600">Package: {selectedAdvance.package_name}</p>
                  <p className="text-xl font-bold text-green-600 mt-2">
                    {formatCurrency(selectedAdvance.advance_amount)}
                  </p>
                  <p className="text-xs text-gray-500">Payment Mode: {selectedAdvance.advance_payment_mode || 'N/A'}</p>
                </CardContent>
              </Card>

              <div>
                <Label>Transaction ID / Reference Number *</Label>
                <Input 
                  value={verifyForm.transaction_id}
                  onChange={(e) => setVerifyForm({ ...verifyForm, transaction_id: e.target.value })}
                  placeholder="Enter transaction ID"
                  data-testid="input-transaction-id"
                />
              </div>

              <div>
                <Label>Bank Name</Label>
                <Input 
                  value={verifyForm.bank_name}
                  onChange={(e) => setVerifyForm({ ...verifyForm, bank_name: e.target.value })}
                  placeholder="Enter bank name"
                  data-testid="input-bank-name"
                />
              </div>

              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={verifyForm.remarks}
                  onChange={(e) => setVerifyForm({ ...verifyForm, remarks: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={2}
                  data-testid="input-verify-remarks"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleVerifyAdvancePayment} 
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!verifyForm.transaction_id}
              data-testid="btn-confirm-verify"
            >
              <CheckCircle className="h-4 w-4 mr-2" /> Verify & Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Advance Payment Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Reject Payment
            </DialogTitle>
          </DialogHeader>

          {selectedAdvance && (
            <div className="space-y-4">
              <Card className="bg-red-50 border-red-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedAdvance.name}</p>
                  <p className="text-sm text-gray-600">Client: {selectedAdvance.client_name}</p>
                  <p className="text-lg font-bold text-red-600 mt-2">
                    {formatCurrency(selectedAdvance.advance_amount)}
                  </p>
                </CardContent>
              </Card>

              <div>
                <Label>Rejection Reason *</Label>
                <Textarea 
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this payment being rejected?"
                  rows={3}
                  data-testid="input-reject-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={handleRejectAdvancePayment}
              disabled={!rejectReason}
              data-testid="btn-confirm-reject"
            >
              <X className="h-4 w-4 mr-2" /> Reject Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Payment Dialog (for other payment types) */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getTypeIcon(selectedItem.payment_type)}
                    {getTypeBadge(selectedItem.payment_type)}
                  </div>
                  {selectedItem.payment_type === 'stage' ? (
                    <>
                      <p className="font-semibold">{selectedItem.work_order_number}</p>
                      <p className="text-sm font-medium">Stage: {selectedItem.stage_name}</p>
                      <p className="text-sm text-gray-500">Work: {selectedItem.work_type}</p>
                      {selectedItem.contractor_name && (
                        <p className="text-sm text-gray-500">Contractor: {selectedItem.contractor_name}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">{selectedItem.material_name || selectedItem.labour_type || 'Procurement Order'}</p>
                      {(selectedItem.vendor_name || selectedItem.selected_vendor_name) && (
                        <p className="text-sm text-gray-500">Vendor: {selectedItem.vendor_name || selectedItem.selected_vendor_name}</p>
                      )}
                    </>
                  )}
                  <p className="text-sm text-gray-500">Project: {selectedItem.project_name}</p>
                  <p className="text-xl font-bold text-green-600 mt-2">
                    {formatCurrency(selectedItem.amount || selectedItem.final_amount || selectedItem.total_amount || selectedItem.estimated_cost)}
                  </p>
                </CardContent>
              </Card>

              {selectedItem.payment_type !== 'stage' && (
                <>
                  <div>
                    <Label>Payment Type</Label>
                    <Select value={paymentForm.payment_type} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Payment</SelectItem>
                        <SelectItem value="partial">Partial Payment</SelectItem>
                        <SelectItem value="credit">Credit (No Payment)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paymentForm.payment_type === 'partial' && (
                    <div>
                      <Label>Payment Amount</Label>
                      <Input 
                        type="number"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        placeholder="Enter amount"
                      />
                    </div>
                  )}

                  <div>
                    <Label>Remarks (Optional)</Label>
                    <Textarea 
                      value={paymentForm.remarks}
                      onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                      placeholder="Add any notes..."
                      rows={2}
                    />
                  </div>
                </>
              )}

              {selectedItem.payment_type === 'stage' && (
                <p className="text-sm text-gray-600">
                  Click confirm to mark this stage payment as processed.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleProcessPayment} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="h-4 w-4 mr-2" /> Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
