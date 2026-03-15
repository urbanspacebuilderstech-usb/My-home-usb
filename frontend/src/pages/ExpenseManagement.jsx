import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, LogOut, Plus, Trash2, CheckCircle, XCircle, Clock, DollarSign,
  Package, Users, Briefcase, Filter, Eye, CreditCard, ArrowRight, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ExpenseManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('material');
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [summary, setSummary] = useState(null);
  
  // Expense lists
  const [materialExpenses, setMaterialExpenses] = useState([]);
  const [labourExpenses, setLabourExpenses] = useState([]);
  const [vendorExpenses, setVendorExpenses] = useState([]);
  
  // Dialog states
  const [materialDialog, setMaterialDialog] = useState(false);
  const [labourDialog, setLabourDialog] = useState(false);
  const [vendorServiceDialog, setVendorServiceDialog] = useState(false);
  const [approvalDialog, setApprovalDialog] = useState(false);
  const [pricingDialog, setPricingDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  
  // Forms
  const [materialForm, setMaterialForm] = useState({
    project_id: '', material_name: '', material_type: '', quantity: '', unit: 'units',
    required_date: new Date().toISOString().split('T')[0], remarks: ''
  });
  
  const [labourForm, setLabourForm] = useState({
    project_id: '', labour_type: '', num_workers: '', days_worked: '', rate_per_day: '',
    work_date: new Date().toISOString().split('T')[0], remarks: ''
  });
  
  const [vendorServiceForm, setVendorServiceForm] = useState({
    project_id: '', vendor_name: '', service_type: '', amount: '', invoice_number: '', remarks: ''
  });
  
  const [approvalForm, setApprovalForm] = useState({ action: '', comments: '' });
  
  const [pricingForm, setPricingForm] = useState({
    quotes: [{ vendor_id: '', vendor_name: '', unit_price: '', quantity: '' }],
    selected_vendor_id: ''
  });
  
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'full', amount: '', payment_mode: 'cash', reference: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, projectsRes, vendorsRes, summaryRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects`),
        axios.get(`${API}/vendors`).catch(() => ({ data: [] })),
        axios.get(`${API}/expenses/summary`)
      ]);
      
      setUser(userRes.data);
      setProjects(projectsRes.data);
      setVendors(vendorsRes.data);
      setSummary(summaryRes.data);
      
      await fetchAllExpenses();
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllExpenses = async () => {
    try {
      const [materialRes, labourRes, vendorRes] = await Promise.all([
        axios.get(`${API}/expenses/material`),
        axios.get(`${API}/expenses/labour`),
        axios.get(`${API}/expenses/vendor-service`)
      ]);
      setMaterialExpenses(materialRes.data);
      setLabourExpenses(labourRes.data);
      setVendorExpenses(vendorRes.data);
    } catch (error) {
      console.error('Failed to fetch expenses');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  // ==================== CREATE HANDLERS ====================
  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses/material`, materialForm);
      toast.success('Material request created');
      setMaterialDialog(false);
      setMaterialForm({
        project_id: '', material_name: '', material_type: '', quantity: '', unit: 'units',
        required_date: new Date().toISOString().split('T')[0], remarks: ''
      });
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create request');
    }
  };

  const handleCreateLabour = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses/labour`, {
        ...labourForm,
        num_workers: parseInt(labourForm.num_workers),
        days_worked: parseFloat(labourForm.days_worked),
        rate_per_day: parseFloat(labourForm.rate_per_day)
      });
      toast.success('Labour expense created');
      setLabourDialog(false);
      setLabourForm({
        project_id: '', labour_type: '', num_workers: '', days_worked: '', rate_per_day: '',
        work_date: new Date().toISOString().split('T')[0], remarks: ''
      });
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create expense');
    }
  };

  const handleCreateVendorService = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses/vendor-service`, {
        ...vendorServiceForm,
        amount: parseFloat(vendorServiceForm.amount)
      });
      toast.success('Vendor expense created');
      setVendorServiceDialog(false);
      setVendorServiceForm({
        project_id: '', vendor_name: '', service_type: '', amount: '', invoice_number: '', remarks: ''
      });
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create expense');
    }
  };

  // ==================== APPROVAL HANDLERS ====================
  const handleApproval = async (expenseType, expenseId, stage) => {
    try {
      let endpoint = '';
      if (expenseType === 'material') {
        if (stage === 'planning') endpoint = `/expenses/material/${expenseId}/planning-approval`;
        else if (stage === 'accounts') endpoint = `/expenses/material/${expenseId}/accounts-approval`;
      } else if (expenseType === 'labour') {
        if (stage === 'planning') endpoint = `/expenses/labour/${expenseId}/planning-approval`;
        else if (stage === 'accounts') endpoint = `/expenses/labour/${expenseId}/accounts-approval`;
      } else if (expenseType === 'vendor_service') {
        if (stage === 'planning') endpoint = `/expenses/vendor-service/${expenseId}/planning-approval`;
        else if (stage === 'accounts') endpoint = `/expenses/vendor-service/${expenseId}/accounts-approval`;
      }
      
      await axios.patch(`${API}${endpoint}`, approvalForm);
      toast.success(`Expense ${approvalForm.action}`);
      setApprovalDialog(false);
      setApprovalForm({ action: '', comments: '' });
      setSelectedExpense(null);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Approval failed');
    }
  };

  // ==================== PRICING HANDLER ====================
  const handleProcurementPricing = async () => {
    try {
      const quotes = pricingForm.quotes.map(q => ({
        vendor_id: q.vendor_id || `v_${Date.now()}`,
        vendor_name: q.vendor_name,
        unit_price: parseFloat(q.unit_price),
        quantity: parseFloat(q.quantity)
      }));
      
      await axios.patch(`${API}/expenses/material/${selectedExpense.expense_id}/procurement-pricing`, null, {
        params: { selected_vendor_id: pricingForm.selected_vendor_id },
        data: quotes
      });
      
      // Use POST-style body with PATCH
      await axios({
        method: 'patch',
        url: `${API}/expenses/material/${selectedExpense.expense_id}/procurement-pricing?selected_vendor_id=${pricingForm.selected_vendor_id}`,
        data: quotes
      });
      
      toast.success('Pricing submitted');
      setPricingDialog(false);
      setPricingForm({ quotes: [{ vendor_id: '', vendor_name: '', unit_price: '', quantity: '' }], selected_vendor_id: '' });
      setSelectedExpense(null);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit pricing');
    }
  };

  // ==================== PAYMENT HANDLER ====================
  const handlePayment = async () => {
    try {
      await axios.patch(`${API}/expenses/${selectedExpense.expense_id}/payment`, {
        payment_type: paymentForm.payment_type,
        amount: paymentForm.payment_type === 'credit' ? 0 : parseFloat(paymentForm.amount) || 0,
        payment_mode: paymentForm.payment_mode,
        reference: paymentForm.reference
      });
      toast.success('Payment recorded');
      setPaymentDialog(false);
      setPaymentForm({ payment_type: 'full', amount: '', payment_mode: 'cash', reference: '' });
      setSelectedExpense(null);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Payment failed');
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'requested': { variant: 'outline', color: 'text-amber-600', label: 'Requested' },
      'planning_approved': { variant: 'secondary', color: 'text-purple-600', label: 'Planning Approved' },
      'planning_rejected': { variant: 'destructive', color: 'text-red-600', label: 'Planning Rejected' },
      'procurement_priced': { variant: 'secondary', color: 'text-orange-600', label: 'Pricing Done' },
      'accounts_approved': { variant: 'default', color: 'text-green-600', label: 'Accounts Approved' },
      'accounts_rejected': { variant: 'destructive', color: 'text-red-600', label: 'Accounts Rejected' },
      'completed': { variant: 'default', color: 'text-green-700', label: 'Completed' }
    };
    const config = statusConfig[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentStatusBadge = (status) => {
    const config = {
      'pending': { variant: 'outline', label: 'Pending' },
      'partial': { variant: 'secondary', label: 'Partial' },
      'paid': { variant: 'default', label: 'Paid' },
      'credit': { variant: 'destructive', label: 'Credit' }
    };
    const c = config[status] || { variant: 'outline', label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const canCreateExpense = user?.role === 'site_engineer' || user?.role === 'super_admin' || user?.role === 'project_manager';
  const canApproveAsPlanning = user?.role === 'planning' || user?.role === 'super_admin';
  const canApproveAsProcurement = user?.role === 'procurement' || user?.role === 'super_admin';
  const canApproveAsAccounts = user?.role === 'accountant' || user?.role === 'super_admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading expense management...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h2 data-testid="expense-module-title" className="text-xl sm:text-3xl font-bold text-gray-900">
            Expense Management
          </h2>
          <p className="text-sm sm:text-base text-gray-600">Track and manage all project expenses with approval workflows</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <Package className="h-3 w-3" />Material
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-base sm:text-xl font-bold text-orange-700">{formatCurrency(summary?.material?.total_amount)}</div>
              <p className="text-xs text-gray-500">{summary?.material?.count || 0} items</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <Users className="h-3 w-3" />Labour
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-base sm:text-xl font-bold text-amber-700">{formatCurrency(summary?.labour?.total_amount)}</div>
              <p className="text-xs text-gray-500">{summary?.labour?.count || 0} entries</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <Briefcase className="h-3 w-3" />Vendor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-base sm:text-xl font-bold text-purple-700">{formatCurrency(summary?.vendor_service?.total_amount)}</div>
              <p className="text-xs text-gray-500">{summary?.vendor_service?.count || 0} entries</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Total
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-base sm:text-xl font-bold text-red-700">{formatCurrency(summary?.totals?.total_expenses)}</div>
              <p className="text-xs text-gray-500">Paid: {formatCurrency(summary?.totals?.total_paid)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-1 sm:gap-2 w-full sm:w-auto">
                  <TabsTrigger value="material" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                    <Package className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />Material
                  </TabsTrigger>
                  <TabsTrigger value="labour" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />Labour
                  </TabsTrigger>
                  <TabsTrigger value="vendor" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                    <Briefcase className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />Vendor
                  </TabsTrigger>
                </TabsList>
                
                {canCreateExpense && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    {activeTab === 'material' && (
                      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
                        <DialogTrigger asChild>
                          <Button data-testid="add-material-btn" className="gap-1 sm:gap-2 bg-orange-600 hover:bg-orange-700 flex-1 sm:flex-none text-xs sm:text-sm">
                            <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Material
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
                          <DialogHeader>
                            <DialogTitle className="text-base sm:text-lg">New Material Request</DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm">Create a material expense request</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateMaterial} className="space-y-4">
                            <div>
                              <Label>Project</Label>
                              <Select value={materialForm.project_id} onValueChange={(v) => setMaterialForm({...materialForm, project_id: v})}>
                                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                                <SelectContent>
                                  {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Material Name</Label>
                                <Input value={materialForm.material_name} onChange={(e) => setMaterialForm({...materialForm, material_name: e.target.value})} required />
                              </div>
                              <div>
                                <Label>Material Type</Label>
                                <Input value={materialForm.material_type} onChange={(e) => setMaterialForm({...materialForm, material_type: e.target.value})} />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <Label>Quantity</Label>
                                <Input type="number" value={materialForm.quantity} onChange={(e) => setMaterialForm({...materialForm, quantity: e.target.value})} required />
                              </div>
                              <div>
                                <Label>Unit</Label>
                                <Input value={materialForm.unit} onChange={(e) => setMaterialForm({...materialForm, unit: e.target.value})} />
                              </div>
                              <div>
                                <Label>Required Date</Label>
                                <Input type="date" value={materialForm.required_date} onChange={(e) => setMaterialForm({...materialForm, required_date: e.target.value})} required />
                              </div>
                            </div>
                            <div>
                              <Label>Remarks</Label>
                              <Textarea value={materialForm.remarks} onChange={(e) => setMaterialForm({...materialForm, remarks: e.target.value})} />
                            </div>
                            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700">Submit Request</Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                    
                    {activeTab === 'labour' && (
                      <Dialog open={labourDialog} onOpenChange={setLabourDialog}>
                        <DialogTrigger asChild>
                          <Button data-testid="add-labour-btn" className="gap-1 sm:gap-2 bg-secondary hover:bg-secondary/90 flex-1 sm:flex-none text-xs sm:text-sm">
                            <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Labour
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
                          <DialogHeader>
                            <DialogTitle className="text-base sm:text-lg">New Labour Expense</DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm">Record labour work expense</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateLabour} className="space-y-4">
                            <div>
                              <Label>Project</Label>
                              <Select value={labourForm.project_id} onValueChange={(v) => setLabourForm({...labourForm, project_id: v})}>
                                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                                <SelectContent>
                                  {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Labour Type</Label>
                              <Select value={labourForm.labour_type} onValueChange={(v) => setLabourForm({...labourForm, labour_type: v})}>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mason">Mason</SelectItem>
                                  <SelectItem value="helper">Helper</SelectItem>
                                  <SelectItem value="carpenter">Carpenter</SelectItem>
                                  <SelectItem value="plumber">Plumber</SelectItem>
                                  <SelectItem value="electrician">Electrician</SelectItem>
                                  <SelectItem value="painter">Painter</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <Label>No. of Workers</Label>
                                <Input type="number" value={labourForm.num_workers} onChange={(e) => setLabourForm({...labourForm, num_workers: e.target.value})} required />
                              </div>
                              <div>
                                <Label>Days Worked</Label>
                                <Input type="number" step="0.5" value={labourForm.days_worked} onChange={(e) => setLabourForm({...labourForm, days_worked: e.target.value})} required />
                              </div>
                              <div>
                                <Label>Rate/Day (₹)</Label>
                                <Input type="number" value={labourForm.rate_per_day} onChange={(e) => setLabourForm({...labourForm, rate_per_day: e.target.value})} required />
                              </div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded">
                              <p className="text-sm">Total: <strong>₹{((parseInt(labourForm.num_workers) || 0) * (parseFloat(labourForm.days_worked) || 0) * (parseFloat(labourForm.rate_per_day) || 0)).toLocaleString()}</strong></p>
                            </div>
                            <div>
                              <Label>Work Date</Label>
                              <Input type="date" value={labourForm.work_date} onChange={(e) => setLabourForm({...labourForm, work_date: e.target.value})} required />
                            </div>
                            <div>
                              <Label>Remarks</Label>
                              <Textarea value={labourForm.remarks} onChange={(e) => setLabourForm({...labourForm, remarks: e.target.value})} />
                            </div>
                            <Button type="submit" className="w-full bg-secondary hover:bg-secondary/90">Submit Expense</Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                    
                    {activeTab === 'vendor' && (
                      <Dialog open={vendorServiceDialog} onOpenChange={setVendorServiceDialog}>
                        <DialogTrigger asChild>
                          <Button data-testid="add-vendor-btn" className="gap-1 sm:gap-2 bg-purple-600 hover:bg-purple-700 flex-1 sm:flex-none text-xs sm:text-sm">
                            <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Vendor
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
                          <DialogHeader>
                            <DialogTitle className="text-base sm:text-lg">New Vendor/Service Expense</DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm">Record vendor or service expense</DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateVendorService} className="space-y-4">
                            <div>
                              <Label>Project</Label>
                              <Select value={vendorServiceForm.project_id} onValueChange={(v) => setVendorServiceForm({...vendorServiceForm, project_id: v})}>
                                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                                <SelectContent>
                                  {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Vendor Name</Label>
                                <Input value={vendorServiceForm.vendor_name} onChange={(e) => setVendorServiceForm({...vendorServiceForm, vendor_name: e.target.value})} required />
                              </div>
                              <div>
                                <Label>Service Type</Label>
                                <Input value={vendorServiceForm.service_type} onChange={(e) => setVendorServiceForm({...vendorServiceForm, service_type: e.target.value})} required />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Amount (₹)</Label>
                                <Input type="number" value={vendorServiceForm.amount} onChange={(e) => setVendorServiceForm({...vendorServiceForm, amount: e.target.value})} required />
                              </div>
                              <div>
                                <Label>Invoice Number</Label>
                                <Input value={vendorServiceForm.invoice_number} onChange={(e) => setVendorServiceForm({...vendorServiceForm, invoice_number: e.target.value})} />
                              </div>
                            </div>
                            <div>
                              <Label>Remarks</Label>
                              <Textarea value={vendorServiceForm.remarks} onChange={(e) => setVendorServiceForm({...vendorServiceForm, remarks: e.target.value})} />
                            </div>
                            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700">Submit Expense</Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Material Tab */}
            <TabsContent value="material" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Material</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Payment</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {materialExpenses.length === 0 ? (
                      <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No material expenses found</td></tr>
                    ) : (
                      materialExpenses.map((exp, index) => (
                        <tr key={exp.expense_id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm">{index + 1}</td>
                          <td className="px-4 py-4 font-medium">{exp.project_name}</td>
                          <td className="px-4 py-4">
                            <span className="font-medium">{exp.material_name}</span>
                            {exp.material_type && <span className="text-xs text-gray-500 block">{exp.material_type}</span>}
                          </td>
                          <td className="px-4 py-4 text-right">{exp.quantity} {exp.unit}</td>
                          <td className="px-4 py-4 text-right font-semibold text-orange-600">
                            {exp.final_amount ? formatCurrency(exp.final_amount) : '-'}
                          </td>
                          <td className="px-4 py-4 text-center">{getStatusBadge(exp.status)}</td>
                          <td className="px-4 py-4 text-center">{getPaymentStatusBadge(exp.payment_status)}</td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Planning Approval */}
                              {canApproveAsPlanning && exp.status === 'requested' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense(exp); setApprovalDialog(true); }}>
                                  <CheckCircle className="h-4 w-4 mr-1" />Approve
                                </Button>
                              )}
                              {/* Procurement Pricing */}
                              {canApproveAsProcurement && exp.status === 'planning_approved' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense(exp); setPricingDialog(true); }}>
                                  <DollarSign className="h-4 w-4 mr-1" />Price
                                </Button>
                              )}
                              {/* Accounts Approval */}
                              {canApproveAsAccounts && exp.status === 'procurement_priced' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense(exp); setApprovalDialog(true); }}>
                                  <CheckCircle className="h-4 w-4 mr-1" />Approve
                                </Button>
                              )}
                              {/* Payment */}
                              {canApproveAsAccounts && exp.status === 'accounts_approved' && exp.payment_status !== 'paid' && (
                                <Button size="sm" variant="default" onClick={() => { setSelectedExpense(exp); setPaymentDialog(true); }}>
                                  <CreditCard className="h-4 w-4 mr-1" />Pay
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Labour Tab */}
            <TabsContent value="labour" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Labour Type</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Workers</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Days</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {labourExpenses.length === 0 ? (
                      <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-500">No labour expenses found</td></tr>
                    ) : (
                      labourExpenses.map((exp, index) => (
                        <tr key={exp.expense_id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm">{index + 1}</td>
                          <td className="px-4 py-4 font-medium">{exp.project_name}</td>
                          <td className="px-4 py-4 capitalize">{exp.labour_type}</td>
                          <td className="px-4 py-4 text-right">{exp.num_workers}</td>
                          <td className="px-4 py-4 text-right">{exp.days_worked}</td>
                          <td className="px-4 py-4 text-right">₹{exp.rate_per_day?.toLocaleString()}</td>
                          <td className="px-4 py-4 text-right font-semibold text-amber-600">₹{exp.total_amount?.toLocaleString()}</td>
                          <td className="px-4 py-4 text-center">{getStatusBadge(exp.status)}</td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {canApproveAsPlanning && exp.status === 'requested' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense({...exp, expense_type: 'labour'}); setApprovalDialog(true); }}>
                                  <CheckCircle className="h-4 w-4 mr-1" />Approve
                                </Button>
                              )}
                              {canApproveAsAccounts && exp.status === 'planning_approved' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense({...exp, expense_type: 'labour'}); setApprovalDialog(true); }}>
                                  <CheckCircle className="h-4 w-4 mr-1" />Approve
                                </Button>
                              )}
                              {canApproveAsAccounts && exp.status === 'accounts_approved' && exp.payment_status !== 'paid' && (
                                <Button size="sm" variant="default" onClick={() => { setSelectedExpense(exp); setPaymentDialog(true); }}>
                                  <CreditCard className="h-4 w-4 mr-1" />Pay
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Vendor Tab */}
            <TabsContent value="vendor" className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Service</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Invoice</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {vendorExpenses.length === 0 ? (
                      <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No vendor expenses found</td></tr>
                    ) : (
                      vendorExpenses.map((exp, index) => (
                        <tr key={exp.expense_id} className="hover:bg-gray-50">
                          <td className="px-4 py-4 text-sm">{index + 1}</td>
                          <td className="px-4 py-4 font-medium">{exp.project_name}</td>
                          <td className="px-4 py-4">{exp.vendor_name}</td>
                          <td className="px-4 py-4">{exp.service_type}</td>
                          <td className="px-4 py-4 text-right font-semibold text-purple-600">₹{exp.amount?.toLocaleString()}</td>
                          <td className="px-4 py-4 text-center text-sm">{exp.invoice_number || '-'}</td>
                          <td className="px-4 py-4 text-center">{getStatusBadge(exp.status)}</td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {canApproveAsPlanning && exp.status === 'requested' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense({...exp, expense_type: 'vendor_service'}); setApprovalDialog(true); }}>
                                  <CheckCircle className="h-4 w-4 mr-1" />Approve
                                </Button>
                              )}
                              {canApproveAsAccounts && exp.status === 'planning_approved' && (
                                <Button size="sm" variant="outline" onClick={() => { setSelectedExpense({...exp, expense_type: 'vendor_service'}); setApprovalDialog(true); }}>
                                  <CheckCircle className="h-4 w-4 mr-1" />Approve
                                </Button>
                              )}
                              {canApproveAsAccounts && exp.status === 'accounts_approved' && exp.payment_status !== 'paid' && (
                                <Button size="sm" variant="default" onClick={() => { setSelectedExpense(exp); setPaymentDialog(true); }}>
                                  <CreditCard className="h-4 w-4 mr-1" />Pay
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Approval Dialog */}
      <Dialog open={approvalDialog} onOpenChange={setApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve/Reject Expense</DialogTitle>
            <DialogDescription>
              {selectedExpense?.material_name || selectedExpense?.labour_type || selectedExpense?.vendor_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Action</Label>
              <Select value={approvalForm.action} onValueChange={(v) => setApprovalForm({...approvalForm, action: v})}>
                <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comments</Label>
              <Textarea value={approvalForm.comments} onChange={(e) => setApprovalForm({...approvalForm, comments: e.target.value})} />
            </div>
            <Button 
              className="w-full" 
              onClick={() => {
                const expType = selectedExpense?.expense_type || (selectedExpense?.expense_id?.startsWith('mexp_') ? 'material' : selectedExpense?.expense_id?.startsWith('lexp_') ? 'labour' : 'vendor_service');
                const stage = selectedExpense?.status === 'requested' ? 'planning' : 
                              selectedExpense?.status === 'planning_approved' ? (expType === 'material' ? 'procurement' : 'accounts') :
                              selectedExpense?.status === 'procurement_priced' ? 'accounts' : 'accounts';
                handleApproval(expType, selectedExpense?.expense_id, stage);
              }}
              disabled={!approvalForm.action}
            >
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Total Amount: ₹{(selectedExpense?.final_amount || selectedExpense?.total_amount || selectedExpense?.amount || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Payment Type</Label>
              <Select value={paymentForm.payment_type} onValueChange={(v) => setPaymentForm({...paymentForm, payment_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Settlement</SelectItem>
                  <SelectItem value="advance">Advance/Partial</SelectItem>
                  <SelectItem value="credit">Credit (No Payment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {paymentForm.payment_type !== 'credit' && (
              <>
                <div>
                  <Label>Amount (₹)</Label>
                  <Input 
                    type="number" 
                    value={paymentForm.amount} 
                    onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                    placeholder={paymentForm.payment_type === 'full' ? 'Full amount' : 'Enter advance amount'}
                  />
                </div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={paymentForm.payment_mode} onValueChange={(v) => setPaymentForm({...paymentForm, payment_mode: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input value={paymentForm.reference} onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})} />
                </div>
              </>
            )}
            
            {paymentForm.payment_type === 'credit' && (
              <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                <p className="text-sm text-yellow-800">This will mark the expense as Credit/Payable without recording any payment.</p>
              </div>
            )}
            
            <Button className="w-full" onClick={handlePayment}>
              {paymentForm.payment_type === 'credit' ? 'Mark as Credit' : 'Record Payment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
