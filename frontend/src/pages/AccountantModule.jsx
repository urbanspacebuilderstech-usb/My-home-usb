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
  Calculator, LogOut, Package, Users, Wallet, DollarSign, 
  CreditCard, CheckCircle, Clock, Eye, Building2, AlertCircle, X, FileText,
  ArrowLeft, RefreshCw, Plus, Truck, Briefcase, TrendingUp, TrendingDown,
  Receipt, CheckCircle2, XCircle, Search, Filter, Coins, HelpCircle
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// 10 Expense Categories
const EXPENSE_CATEGORIES = [
  { value: 'salary', label: 'Salary & Wages', icon: Users, color: 'bg-violet-100 text-violet-700' },
  { value: 'material', label: 'Material Purchase', icon: Package, color: 'bg-amber-50 text-amber-700' },
  { value: 'labour', label: 'Labour Payment', icon: Users, color: 'bg-green-100 text-green-700' },
  { value: 'transport', label: 'Transport & Logistics', icon: Truck, color: 'bg-orange-100 text-orange-700' },
  { value: 'utility', label: 'Utilities (Power/Water)', icon: Building2, color: 'bg-cyan-100 text-cyan-700' },
  { value: 'rent', label: 'Rent & Lease', icon: Building2, color: 'bg-amber-100 text-amber-700' },
  { value: 'marketing', label: 'Marketing & Advertising', icon: TrendingUp, color: 'bg-pink-100 text-pink-700' },
  { value: 'office', label: 'Office Supplies', icon: FileText, color: 'bg-gray-100 text-gray-700' },
  { value: 'maintenance', label: 'Maintenance & Repairs', icon: Briefcase, color: 'bg-red-100 text-red-700' },
  { value: 'other', label: 'Other Expenses', icon: Coins, color: 'bg-indigo-100 text-indigo-700' }
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'credit_card', label: 'Credit Card' }
];

export default function AccountantModule() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('requests');
  
  // Requests data
  const [creRequests, setCreRequests] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [labourRequests, setLabourRequests] = useState([]);
  const [pettyCashRequests, setPettyCashRequests] = useState([]);
  const [hrRequests, setHrRequests] = useState([]);
  
  // Income data (view-only)
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [incomeSummary, setIncomeSummary] = useState({});
  
  // Expense data
  const [expenses, setExpenses] = useState([]);
  const [expenseSummary, setExpenseSummary] = useState({});
  
  // Suspense data
  const [suspenseEntries, setSuspenseEntries] = useState([]);
  
  // Projects for dropdown
  const [projects, setProjects] = useState([]);
  
  // Dialogs
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [suspenseDialog, setSuspenseDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestType, setRequestType] = useState('');
  
  // Forms
  const [verifyForm, setVerifyForm] = useState({
    transaction_id: '',
    bank_name: '',
    remarks: ''
  });
  const [rejectReason, setRejectReason] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    project_id: '',
    category: '',
    description: '',
    amount: '',
    payment_method: 'bank_transfer',
    reference: '',
    vendor_name: '',
    remarks: ''
  });
  const [suspenseForm, setSuspenseForm] = useState({
    transaction_type: 'expense',
    source_type: '',
    reference_id: '',
    amount: '',
    description: '',
    reason: ''
  });
  
  // Filters
  const [requestFilter, setRequestFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [
        userRes, 
        creRes, 
        materialRes, 
        labourRes,
        pettyCashRes,
        incomeRes,
        incomeSummaryRes,
        expenseRes,
        suspenseRes,
        projectsRes
      ] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accounts/pending-advance-payments`).catch(() => ({ data: [] })),
        axios.get(`${API}/accountant/material-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/accountant/labour-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/accountant/petty-cash`).catch(() => ({ data: [] })),
        axios.get(`${API}/income`).catch(() => ({ data: [] })),
        axios.get(`${API}/income/summary`).catch(() => ({ data: {} })),
        axios.get(`${API}/accountant/recorded-expenses`).catch(() => ({ data: [] })),
        axios.get(`${API}/financial/suspense`).catch(() => ({ data: [] })),
        axios.get(`${API}/projects`).catch(() => ({ data: [] }))
      ]);
      
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only Accountants can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setCreRequests(creRes.data || []);
      setMaterialRequests(materialRes.data || []);
      setLabourRequests(labourRes.data || []);
      setPettyCashRequests(pettyCashRes.data || []);
      setIncomeEntries(incomeRes.data || []);
      setIncomeSummary(incomeSummaryRes.data || {});
      setExpenses(expenseRes.data || []);
      setSuspenseEntries(suspenseRes.data || []);
      setProjects(projectsRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  // Verify handlers
  const openVerifyDialog = (request, type) => {
    setSelectedRequest(request);
    setRequestType(type);
    setVerifyForm({ transaction_id: '', bank_name: '', remarks: '' });
    setVerifyDialog(true);
  };

  const openRejectDialog = (request, type) => {
    setSelectedRequest(request);
    setRequestType(type);
    setRejectReason('');
    setRejectDialog(true);
  };

  const handleVerify = async () => {
    if (!selectedRequest) return;
    
    try {
      let endpoint = '';
      let payload = verifyForm;
      
      switch (requestType) {
        case 'cre':
          endpoint = `${API}/accounts/verify-advance-payment/${selectedRequest.project_id}`;
          break;
        case 'material':
          endpoint = `${API}/accountant/material-requests/${selectedRequest.request_id}/approve`;
          payload = { action: 'approve', ...verifyForm };
          break;
        case 'labour':
          endpoint = `${API}/accountant/labour-requests/${selectedRequest.labour_expense_id}/approve`;
          break;
        case 'petty_cash':
          endpoint = `${API}/accountant/petty-cash/${selectedRequest.petty_cash_id}/issue`;
          payload = { amount: selectedRequest.amount_requested };
          break;
        case 'petty_cash_settle':
          endpoint = `${API}/accountant/petty-cash/${selectedRequest.petty_cash_id}/settle`;
          break;
        default:
          toast.error('Unknown request type');
          return;
      }
      
      await axios.patch(endpoint, payload);
      toast.success('Request verified successfully');
      setVerifyDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to verify');
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectReason) {
      toast.error('Rejection reason is required');
      return;
    }
    
    try {
      let endpoint = '';
      
      switch (requestType) {
        case 'cre':
          endpoint = `${API}/accounts/reject-advance-payment/${selectedRequest.project_id}`;
          await axios.patch(endpoint, { reason: rejectReason });
          break;
        case 'material':
          endpoint = `${API}/accountant/material-requests/${selectedRequest.request_id}/reject`;
          await axios.patch(endpoint, { reason: rejectReason });
          break;
        case 'labour':
          endpoint = `${API}/accountant/labour-requests/${selectedRequest.labour_expense_id}/reject`;
          await axios.patch(endpoint, { reason: rejectReason });
          break;
        case 'petty_cash':
          endpoint = `${API}/accountant/petty-cash/${selectedRequest.petty_cash_id}/reject`;
          await axios.patch(endpoint, { reason: rejectReason });
          break;
        default:
          toast.error('Unknown request type');
          return;
      }
      
      toast.success('Request rejected');
      setRejectDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to reject');
    }
  };

  // Record expense
  const handleRecordExpense = async () => {
    if (!expenseForm.category || !expenseForm.amount || !expenseForm.description) {
      toast.error('Category, amount, and description are required');
      return;
    }
    
    try {
      await axios.post(`${API}/accountant/record-expense`, {
        ...expenseForm,
        amount: parseFloat(expenseForm.amount)
      });
      toast.success('Expense recorded successfully');
      setExpenseDialog(false);
      setExpenseForm({
        project_id: '',
        category: '',
        description: '',
        amount: '',
        payment_method: 'bank_transfer',
        reference: '',
        vendor_name: '',
        remarks: ''
      });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to record expense');
    }
  };

  // Add to suspense
  const handleAddToSuspense = async () => {
    if (!suspenseForm.amount || !suspenseForm.description || !suspenseForm.source_type) {
      toast.error('Amount, description, and source type are required');
      return;
    }
    
    try {
      await axios.post(`${API}/financial/suspense`, {
        transaction_type: suspenseForm.transaction_type,
        amount: parseFloat(suspenseForm.amount),
        description: suspenseForm.description,
        source: `${suspenseForm.source_type}: ${suspenseForm.reference_id}`,
        remarks: suspenseForm.reason
      });
      toast.success('Added to suspense account');
      setSuspenseDialog(false);
      setSuspenseForm({
        transaction_type: 'expense',
        source_type: '',
        reference_id: '',
        amount: '',
        description: '',
        reason: ''
      });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add to suspense');
    }
  };

  const getRequestCounts = () => {
    return {
      cre: creRequests.filter(r => r.status === 'pending_payment').length,
      material: materialRequests.filter(r => r.status === 'pending_accounts_approval').length,
      labour: labourRequests.filter(r => r.status === 'pending_accounts_approval').length,
      petty_cash: pettyCashRequests.filter(r => ['requested', 'pending_settlement'].includes(r.status)).length,
      total: 0
    };
  };
  
  const counts = getRequestCounts();
  counts.total = counts.cre + counts.material + counts.labour + counts.petty_cash;

  const getCategoryBadge = (category) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === category);
    if (!cat) return <Badge>{category}</Badge>;
    const Icon = cat.icon;
    return (
      <Badge className={cat.color}>
        <Icon className="h-3 w-3 mr-1" />
        {cat.label}
      </Badge>
    );
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-amber-50 border-amber-200 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('requests')} data-testid="pending-requests-card">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-1 text-amber-600" />
              <p className="text-2xl font-bold text-amber-700">{counts.total}</p>
              <p className="text-xs text-amber-600">Pending Requests</p>
            </CardContent>
          </Card>
          
          <Card className="bg-green-50 border-green-200 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('income')} data-testid="income-card">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-1 text-green-600" />
              <p className="text-xl font-bold text-green-700">{formatCurrency(incomeSummary.total || 0)}</p>
              <p className="text-xs text-green-600">Total Income</p>
            </CardContent>
          </Card>
          
          <Card className="bg-red-50 border-red-200 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('expense')} data-testid="expense-card">
            <CardContent className="p-4 text-center">
              <TrendingDown className="h-6 w-6 mx-auto mb-1 text-red-600" />
              <p className="text-xl font-bold text-red-700">{formatCurrency(expenses.reduce((sum, e) => sum + (e.amount || 0), 0))}</p>
              <p className="text-xs text-red-600">Total Expenses</p>
            </CardContent>
          </Card>
          
          <Card className="bg-orange-50 border-orange-200 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('suspense')} data-testid="suspense-card">
            <CardContent className="p-4 text-center">
              <HelpCircle className="h-6 w-6 mx-auto mb-1 text-orange-600" />
              <p className="text-2xl font-bold text-orange-700">{suspenseEntries.filter(s => s.status === 'pending').length}</p>
              <p className="text-xs text-orange-600">Suspense Entries</p>
            </CardContent>
          </Card>
          
          <Card className="bg-violet-50 border-violet-200 cursor-pointer hover:shadow-md" onClick={() => setSuspenseDialog(true)} data-testid="add-suspense-card">
            <CardContent className="p-4 text-center">
              <Plus className="h-6 w-6 mx-auto mb-1 text-violet-600" />
              <p className="text-lg font-bold text-violet-700">Add</p>
              <p className="text-xs text-violet-600">Suspense Entry</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full max-w-md mb-6">
            <TabsTrigger value="requests" className="gap-1" data-testid="tab-requests">
              <CheckCircle className="h-4 w-4" />
              Verify
              {counts.total > 0 && <Badge className="ml-1 bg-red-500 text-white text-xs">{counts.total}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="income" data-testid="tab-income">
              <TrendingUp className="h-4 w-4" />
              Income
            </TabsTrigger>
            <TabsTrigger value="expense" data-testid="tab-expense">
              <Receipt className="h-4 w-4" />
              Expense
            </TabsTrigger>
            <TabsTrigger value="suspense" data-testid="tab-suspense">
              <HelpCircle className="h-4 w-4" />
              Suspense
            </TabsTrigger>
          </TabsList>

          {/* REQUESTS TAB - Verify Requests */}
          <TabsContent value="requests">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Verification Queue
                  </CardTitle>
                  <div className="flex gap-2">
                    <Select value={requestFilter} onValueChange={setRequestFilter}>
                      <SelectTrigger className="w-40">
                        <Filter className="h-4 w-4 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Requests</SelectItem>
                        <SelectItem value="cre">CRE Payments ({counts.cre})</SelectItem>
                        <SelectItem value="material">Material ({counts.material})</SelectItem>
                        <SelectItem value="labour">Labour ({counts.labour})</SelectItem>
                        <SelectItem value="petty_cash">Petty Cash ({counts.petty_cash})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Request Categories */}
                <div className="grid grid-cols-4 gap-2 p-4 border-b bg-gray-50">
                  <Card className={`cursor-pointer ${requestFilter === 'cre' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setRequestFilter('cre')}>
                    <CardContent className="p-3 text-center">
                      <DollarSign className="h-5 w-5 mx-auto text-amber-600" />
                      <p className="text-lg font-bold">{counts.cre}</p>
                      <p className="text-xs text-gray-600">CRE Advance</p>
                    </CardContent>
                  </Card>
                  <Card className={`cursor-pointer ${requestFilter === 'material' ? 'ring-2 ring-green-500' : ''}`} onClick={() => setRequestFilter('material')}>
                    <CardContent className="p-3 text-center">
                      <Package className="h-5 w-5 mx-auto text-green-600" />
                      <p className="text-lg font-bold">{counts.material}</p>
                      <p className="text-xs text-gray-600">Material</p>
                    </CardContent>
                  </Card>
                  <Card className={`cursor-pointer ${requestFilter === 'labour' ? 'ring-2 ring-orange-500' : ''}`} onClick={() => setRequestFilter('labour')}>
                    <CardContent className="p-3 text-center">
                      <Users className="h-5 w-5 mx-auto text-orange-600" />
                      <p className="text-lg font-bold">{counts.labour}</p>
                      <p className="text-xs text-gray-600">Labour</p>
                    </CardContent>
                  </Card>
                  <Card className={`cursor-pointer ${requestFilter === 'petty_cash' ? 'ring-2 ring-violet-500' : ''}`} onClick={() => setRequestFilter('petty_cash')}>
                    <CardContent className="p-3 text-center">
                      <Wallet className="h-5 w-5 mx-auto text-violet-600" />
                      <p className="text-lg font-bold">{counts.petty_cash}</p>
                      <p className="text-xs text-gray-600">Petty Cash</p>
                    </CardContent>
                  </Card>
                </div>

                {/* CRE Requests */}
                {(requestFilter === 'all' || requestFilter === 'cre') && creRequests.filter(r => r.status === 'pending_payment').length > 0 && (
                  <div className="p-4 border-b">
                    <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> CRE Advance Payment Verification
                    </h3>
                    <div className="space-y-3">
                      {creRequests.filter(r => r.status === 'pending_payment').map(req => (
                        <Card key={req.project_id} className="border-blue-200" data-testid={`cre-request-${req.project_id}`}>
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{req.name}</p>
                              <p className="text-sm text-gray-600">{req.client_name} • {req.location}</p>
                              <p className="text-lg font-bold text-amber-600">{formatCurrency(req.advance_amount)}</p>
                              <p className="text-xs text-gray-500">Mode: {req.advance_payment_mode}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openVerifyDialog(req, 'cre')}>
                                <CheckCircle className="h-4 w-4 mr-1" /> Verify
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openRejectDialog(req, 'cre')}>
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Material Requests */}
                {(requestFilter === 'all' || requestFilter === 'material') && materialRequests.filter(r => r.status === 'pending_accounts_approval').length > 0 && (
                  <div className="p-4 border-b">
                    <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" /> Material Request Verification
                    </h3>
                    <div className="space-y-3">
                      {materialRequests.filter(r => r.status === 'pending_accounts_approval').map(req => (
                        <Card key={req.request_id} className="border-green-200" data-testid={`material-request-${req.request_id}`}>
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{req.material_name}</p>
                              <p className="text-sm text-gray-600">Project: {req.project_name}</p>
                              <p className="text-sm">Qty: {req.quantity} {req.unit} • Vendor: {req.vendor_name || 'N/A'}</p>
                              <p className="text-lg font-bold text-green-600">{formatCurrency(req.total_amount)}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openVerifyDialog(req, 'material')}>
                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openRejectDialog(req, 'material')}>
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Labour Requests */}
                {(requestFilter === 'all' || requestFilter === 'labour') && labourRequests.filter(r => r.status === 'pending_accounts_approval').length > 0 && (
                  <div className="p-4 border-b">
                    <h3 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" /> Labour Payment Verification
                    </h3>
                    <div className="space-y-3">
                      {labourRequests.filter(r => r.status === 'pending_accounts_approval').map(req => (
                        <Card key={req.labour_expense_id} className="border-orange-200" data-testid={`labour-request-${req.labour_expense_id}`}>
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{req.labour_type}</p>
                              <p className="text-sm text-gray-600">Project: {req.project_name}</p>
                              <p className="text-sm">Workers: {req.workers} • Days: {req.days} • Rate: {formatCurrency(req.rate)}</p>
                              <p className="text-lg font-bold text-orange-600">{formatCurrency(req.total_amount)}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openVerifyDialog(req, 'labour')}>
                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openRejectDialog(req, 'labour')}>
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Petty Cash Requests */}
                {(requestFilter === 'all' || requestFilter === 'petty_cash') && pettyCashRequests.filter(r => ['requested', 'pending_settlement'].includes(r.status)).length > 0 && (
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-violet-700 mb-3 flex items-center gap-2">
                      <Wallet className="h-4 w-4" /> Petty Cash Verification
                    </h3>
                    <div className="space-y-3">
                      {pettyCashRequests.filter(r => ['requested', 'pending_settlement'].includes(r.status)).map(req => (
                        <Card key={req.petty_cash_id} className="border-violet-200" data-testid={`petty-cash-${req.petty_cash_id}`}>
                          <CardContent className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{req.purpose}</p>
                              <p className="text-sm text-gray-600">Project: {req.project_name}</p>
                              <p className="text-sm">Requested by: {req.requested_by_name}</p>
                              <div className="flex gap-4 mt-1">
                                <p className="text-lg font-bold text-violet-600">{formatCurrency(req.amount_requested)}</p>
                                {req.status === 'pending_settlement' && (
                                  <p className="text-sm text-gray-600">Spent: {formatCurrency(req.amount_spent)}</p>
                                )}
                              </div>
                              <Badge className={req.status === 'requested' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'}>
                                {req.status === 'requested' ? 'New Request' : 'Pending Settlement'}
                              </Badge>
                            </div>
                            <div className="flex gap-2">
                              {req.status === 'requested' && (
                                <>
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openVerifyDialog(req, 'petty_cash')}>
                                    <Wallet className="h-4 w-4 mr-1" /> Issue Cash
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openRejectDialog(req, 'petty_cash')}>
                                    <XCircle className="h-4 w-4 mr-1" /> Reject
                                  </Button>
                                </>
                              )}
                              {req.status === 'pending_settlement' && (
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openVerifyDialog(req, 'petty_cash_settle')}>
                                  <CheckCircle className="h-4 w-4 mr-1" /> Settle
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {counts.total === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
                    <p className="font-semibold">All caught up!</p>
                    <p className="text-sm">No pending verification requests</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* INCOME TAB - View Only */}
          <TabsContent value="income">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Income Records (View Only)
                  </CardTitle>
                  <Badge className="bg-gray-100 text-gray-700">
                    <Eye className="h-3 w-3 mr-1" /> Read Only
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Income Summary */}
                <div className="grid grid-cols-5 gap-3 p-4 border-b bg-gray-50">
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Cash</p>
                    <p className="font-bold text-green-600">{formatCurrency(incomeSummary.cash || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Cheque</p>
                    <p className="font-bold text-amber-600">{formatCurrency(incomeSummary.cheque || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Bank Transfer</p>
                    <p className="font-bold text-purple-600">{formatCurrency(incomeSummary.bank_transfer || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600">UPI</p>
                    <p className="font-bold text-indigo-600">{formatCurrency(incomeSummary.upi || 0)}</p>
                  </div>
                  <div className="text-center bg-green-100 rounded p-2">
                    <p className="text-xs text-green-700">Total Income</p>
                    <p className="font-bold text-green-700">{formatCurrency(incomeSummary.total || 0)}</p>
                  </div>
                </div>

                {/* Income Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DATE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">MODE</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">COLLECTED BY</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {incomeEntries.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            No income records found
                          </td>
                        </tr>
                      ) : (
                        incomeEntries.slice(0, 20).map((entry, idx) => (
                          <tr key={entry.income_id || idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{new Date(entry.payment_date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm font-medium">{entry.project_name || '-'}</td>
                            <td className="px-4 py-3 text-sm">{entry.remarks || entry.description || '-'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{entry.payment_mode}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(entry.amount)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{entry.collected_by_name || 'CRE'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EXPENSE TAB - Record Expenses */}
          <TabsContent value="expense">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-red-600" />
                    Expense Records
                  </CardTitle>
                  <Button 
                    size="sm"
                    onClick={() => { setExpenseForm({ project_id: '', category: '', description: '', amount: '', payment_method: 'bank_transfer', reference: '', vendor_name: '', remarks: '' }); setExpenseDialog(true); }}
                    data-testid="add-expense-btn"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Record Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Expense Categories Summary */}
                <div className="grid grid-cols-5 gap-2 p-4 border-b bg-gray-50">
                  {EXPENSE_CATEGORIES.slice(0, 5).map(cat => {
                    const Icon = cat.icon;
                    const catTotal = expenses.filter(e => e.category === cat.value).reduce((sum, e) => sum + (e.amount || 0), 0);
                    return (
                      <div key={cat.value} className="text-center">
                        <Icon className="h-4 w-4 mx-auto text-gray-600" />
                        <p className="text-xs text-gray-600">{cat.label}</p>
                        <p className="font-bold text-red-600">{formatCurrency(catTotal)}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Expense Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DATE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CATEGORY</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">VENDOR</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            No expense records found
                          </td>
                        </tr>
                      ) : (
                        expenses.slice(0, 20).map((exp, idx) => (
                          <tr key={exp.expense_id || idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{new Date(exp.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3">{getCategoryBadge(exp.category)}</td>
                            <td className="px-4 py-3 text-sm">{exp.description}</td>
                            <td className="px-4 py-3 text-sm">{exp.project_name || '-'}</td>
                            <td className="px-4 py-3 text-sm">{exp.vendor_name || '-'}</td>
                            <td className="px-4 py-3 text-right font-bold text-red-600">{formatCurrency(exp.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUSPENSE TAB */}
          <TabsContent value="suspense">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-orange-600" />
                    Suspense Account
                  </CardTitle>
                  <Button 
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
                    onClick={() => setSuspenseDialog(true)}
                    data-testid="add-suspense-btn"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Entry
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Suspense Info */}
                <div className="p-4 bg-orange-50 border-b">
                  <p className="text-sm text-orange-700">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    Use suspense account for: Excess payments (Petty Cash, Material, Labour), Unidentified deposits, Unclear transactions
                  </p>
                </div>

                {/* Suspense Summary */}
                <div className="grid grid-cols-3 gap-4 p-4 border-b">
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Pending</p>
                    <p className="text-2xl font-bold text-orange-600">{suspenseEntries.filter(s => s.status === 'pending').length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Allocated</p>
                    <p className="text-2xl font-bold text-green-600">{suspenseEntries.filter(s => s.status === 'allocated').length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Pending Amount</p>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(suspenseEntries.filter(s => s.status === 'pending').reduce((sum, s) => sum + (s.amount || 0), 0))}
                    </p>
                  </div>
                </div>

                {/* Suspense Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">TYPE</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">SOURCE</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {suspenseEntries.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                            No suspense entries
                          </td>
                        </tr>
                      ) : (
                        suspenseEntries.map((entry, idx) => (
                          <tr key={entry.suspense_id || idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <Badge className={entry.transaction_type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                                {entry.transaction_type}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm">{entry.description}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{entry.source || '-'}</td>
                            <td className="px-4 py-3 text-right font-bold text-orange-600">{formatCurrency(entry.amount)}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={
                                entry.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                entry.status === 'allocated' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                              }>
                                {entry.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Verify Dialog */}
      <Dialog open={verifyDialog} onOpenChange={setVerifyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              {requestType === 'petty_cash_settle' ? 'Settle Petty Cash' : 'Verify Request'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedRequest.name || selectedRequest.material_name || selectedRequest.purpose || selectedRequest.labour_type}</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(selectedRequest.advance_amount || selectedRequest.total_amount || selectedRequest.amount_requested)}
                  </p>
                </CardContent>
              </Card>
              
              {requestType === 'cre' && (
                <>
                  <div>
                    <Label>Transaction ID *</Label>
                    <Input 
                      value={verifyForm.transaction_id}
                      onChange={(e) => setVerifyForm({...verifyForm, transaction_id: e.target.value})}
                      placeholder="Enter transaction reference"
                      data-testid="input-transaction-id"
                    />
                  </div>
                  <div>
                    <Label>Bank Name</Label>
                    <Input 
                      value={verifyForm.bank_name}
                      onChange={(e) => setVerifyForm({...verifyForm, bank_name: e.target.value})}
                      placeholder="Enter bank name"
                    />
                  </div>
                </>
              )}
              
              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={verifyForm.remarks}
                  onChange={(e) => setVerifyForm({...verifyForm, remarks: e.target.value})}
                  placeholder="Add any notes..."
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog(false)}>Cancel</Button>
            <Button onClick={handleVerify} className="bg-green-600 hover:bg-green-700" data-testid="confirm-verify">
              <CheckCircle className="h-4 w-4 mr-1" /> 
              {requestType === 'petty_cash' ? 'Issue Cash' : requestType === 'petty_cash_settle' ? 'Settle' : 'Verify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Reject Request
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason *</Label>
              <Textarea 
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                rows={3}
                data-testid="input-reject-reason"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button>
            <Button onClick={handleReject} variant="destructive" data-testid="confirm-reject">
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Expense Dialog */}
      <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-red-600" />
              Record Expense
            </DialogTitle>
            <DialogDescription>
              Record an expense after verification from team member request
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm({...expenseForm, category: v})}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount *</Label>
                <NumericInput 
                  
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  placeholder="Enter amount"
                  data-testid="input-expense-amount"
                />
              </div>
            </div>
            
            <div>
              <Label>Description *</Label>
              <Input 
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                placeholder="Expense description"
                data-testid="input-expense-description"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Project (Optional)</Label>
                <Select value={expenseForm.project_id || "none"} onValueChange={(v) => setExpenseForm({...expenseForm, project_id: v === "none" ? "" : v})}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Indirect Cost)</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={expenseForm.payment_method} onValueChange={(v) => setExpenseForm({...expenseForm, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendor/Payee Name</Label>
                <Input 
                  value={expenseForm.vendor_name}
                  onChange={(e) => setExpenseForm({...expenseForm, vendor_name: e.target.value})}
                  placeholder="Who was paid"
                />
              </div>
              <div>
                <Label>Reference/Transaction ID</Label>
                <Input 
                  value={expenseForm.reference}
                  onChange={(e) => setExpenseForm({...expenseForm, reference: e.target.value})}
                  placeholder="Payment reference"
                />
              </div>
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Textarea 
                value={expenseForm.remarks}
                onChange={(e) => setExpenseForm({...expenseForm, remarks: e.target.value})}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialog(false)}>Cancel</Button>
            <Button onClick={handleRecordExpense} className="bg-red-600 hover:bg-red-700" data-testid="confirm-expense">
              <Receipt className="h-4 w-4 mr-1" /> Record Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Suspense Dialog */}
      <Dialog open={suspenseDialog} onOpenChange={setSuspenseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-orange-600" />
              Add to Suspense Account
            </DialogTitle>
            <DialogDescription>
              Record excess payments or unclear transactions for later allocation
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Transaction Type *</Label>
                <Select value={suspenseForm.transaction_type} onValueChange={(v) => setSuspenseForm({...suspenseForm, transaction_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income (Excess Received)</SelectItem>
                    <SelectItem value="expense">Expense (Excess Paid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount *</Label>
                <NumericInput 
                  
                  value={suspenseForm.amount}
                  onChange={(e) => setSuspenseForm({...suspenseForm, amount: e.target.value})}
                  placeholder="Excess amount"
                  data-testid="input-suspense-amount"
                />
              </div>
            </div>
            
            <div>
              <Label>Source Type *</Label>
              <Select value={suspenseForm.source_type} onValueChange={(v) => setSuspenseForm({...suspenseForm, source_type: v})}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="petty_cash">Petty Cash Excess</SelectItem>
                  <SelectItem value="material">Material Payment Excess</SelectItem>
                  <SelectItem value="labour">Labour Payment Excess</SelectItem>
                  <SelectItem value="vendor">Vendor Payment Excess</SelectItem>
                  <SelectItem value="client">Client Overpayment</SelectItem>
                  <SelectItem value="unknown">Unknown/Unidentified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Reference ID (Optional)</Label>
              <Input 
                value={suspenseForm.reference_id}
                onChange={(e) => setSuspenseForm({...suspenseForm, reference_id: e.target.value})}
                placeholder="Original request/transaction ID"
              />
            </div>
            
            <div>
              <Label>Description *</Label>
              <Input 
                value={suspenseForm.description}
                onChange={(e) => setSuspenseForm({...suspenseForm, description: e.target.value})}
                placeholder="Describe the suspense entry"
                data-testid="input-suspense-description"
              />
            </div>
            
            <div>
              <Label>Reason for Suspense</Label>
              <Textarea 
                value={suspenseForm.reason}
                onChange={(e) => setSuspenseForm({...suspenseForm, reason: e.target.value})}
                placeholder="Why is this being added to suspense?"
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspenseDialog(false)}>Cancel</Button>
            <Button onClick={handleAddToSuspense} className="bg-orange-600 hover:bg-orange-700" data-testid="confirm-suspense">
              <HelpCircle className="h-4 w-4 mr-1" /> Add to Suspense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
