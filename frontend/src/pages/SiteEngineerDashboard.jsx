import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, LogOut, HardHat, MapPin, Package, Users, ChevronRight,
  Clock, Menu, X, ClipboardList, DollarSign, CheckCircle, Play, AlertCircle, Truck,
  Wallet, Plus, Receipt, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { Label } from '@/components/ui/label';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Eye } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

// ============ MINI CASHBOOK SECTION ============
function MiniCashbookSection({ projects }) {
  const [cashbookData, setCashbookData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('');
  const [financeTab, setFinanceTab] = useState('income');
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({ project_id: '', category: 'material', amount: '', description: '', vendor_name: '' });

  useEffect(() => {
    fetchCashbook(false);
  }, [selectedProject]);

  const fetchCashbook = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const params = selectedProject ? `?project_id=${selectedProject}` : '';
      const res = await axios.get(`${API}/site-engineer/mini-cashbook${params}`);
      setCashbookData(res.data);
    } catch (err) {
      console.error('Failed to load mini cashbook:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordExpense = async () => {
    if (!newExpense.project_id || !newExpense.amount || !newExpense.description) {
      toast.error('Project, amount and description required'); return;
    }
    try {
      await axios.post(`${API}/accountant/record-expense`, {
        project_id: newExpense.project_id,
        category: newExpense.category,
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        payment_method: 'petty_cash',
        vendor_name: newExpense.vendor_name || null,
      });
      toast.success('Expense recorded');
      setAddExpenseOpen(false);
      setNewExpense({ project_id: '', category: 'material', amount: '', description: '', vendor_name: '' });
      fetchCashbook(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record expense');
    }
  };

  const cashbooks = cashbookData?.cashbooks || [];
  const summary = cashbookData?.summary || {};

  return (
    <div className="space-y-4" data-testid="mini-cashbook-section">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Issued</p>
            <p className="text-lg font-bold text-green-700">{fmtFull(summary.total_issued)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Spent</p>
            <p className="text-lg font-bold text-red-600">{fmtFull(summary.total_spent)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Balance</p>
            <p className={`text-lg font-bold ${(summary.total_balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {fmtFull(summary.total_balance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Project Filter */}
      <div className="flex gap-2 items-center">
        <Select value={selectedProject || 'all'} onValueChange={v => setSelectedProject(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid="cashbook-project-select">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1 h-8 ml-auto" onClick={() => setAddExpenseOpen(true)} data-testid="se-add-expense">
          <Plus className="h-3.5 w-3.5" /> Record Expense
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : cashbooks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">No cashbook entries yet. Request petty cash to get started.</CardContent></Card>
      ) : (
        cashbooks.map(cb => (
          <Card key={cb.project_id} data-testid={`cashbook-project-${cb.project_id}`}>
            <CardHeader className="py-2 px-4 border-b bg-gray-50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{cb.project_name}</CardTitle>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 font-semibold">Issued: {fmtFull(cb.total_issued)}</span>
                  <span className="text-red-600 font-semibold">Spent: {fmtFull(cb.total_spent)}</span>
                  <Badge className={cb.balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    Bal: {fmtFull(cb.balance)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="petty_cash">
                <TabsList className="grid grid-cols-2 w-full max-w-xs ml-3 mt-2">
                  <TabsTrigger value="petty_cash" className="text-xs gap-1 data-[state=active]:bg-green-100">
                    <ArrowDownRight className="h-3 w-3" /> Income ({cb.petty_cash_entries.length})
                  </TabsTrigger>
                  <TabsTrigger value="expenses" className="text-xs gap-1 data-[state=active]:bg-red-100">
                    <ArrowUpRight className="h-3 w-3" /> Expense ({cb.expense_entries.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="petty_cash" className="mt-0">
                  <table className="w-full text-xs">
                    <thead className="bg-green-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Date</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Purpose</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Status</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Requested</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Issued</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Spent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cb.petty_cash_entries.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-4 text-gray-400">No petty cash entries</td></tr>
                      ) : cb.petty_cash_entries.map((pc, i) => (
                        <tr key={pc.petty_cash_id || i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">{new Date(pc.created_at).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-1.5 font-medium">{pc.purpose || '-'}</td>
                          <td className="px-3 py-1.5">
                            <Badge className={
                              pc.status === 'issued' ? 'bg-green-100 text-green-700' :
                              pc.status === 'requested' ? 'bg-amber-100 text-amber-700' :
                              pc.status === 'settled' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }>{pc.status}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtFull(pc.amount_requested)}</td>
                          <td className="px-3 py-1.5 text-right text-green-700 font-semibold">{fmtFull(pc.amount_issued)}</td>
                          <td className="px-3 py-1.5 text-right text-red-600">{fmtFull(pc.amount_spent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
                <TabsContent value="expenses" className="mt-0">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Date</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Category</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Description</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-500">Vendor</th>
                        <th className="text-right px-3 py-1.5 font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cb.expense_entries.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-4 text-gray-400">No expenses recorded</td></tr>
                      ) : cb.expense_entries.map((e, i) => (
                        <tr key={e.expense_id || i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5">{new Date(e.created_at).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-1.5"><Badge className="bg-blue-100 text-blue-700 text-[10px]">{e.category}</Badge></td>
                          <td className="px-3 py-1.5">{e.description || '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{e.vendor_name || '-'}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-red-600">{fmtFull(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ))
      )}

      {/* Record Expense Dialog */}
      <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Project *</Label>
              <Select value={newExpense.project_id} onValueChange={v => setNewExpense(p => ({...p, project_id: v}))}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Category</Label>
              <Select value={newExpense.category} onValueChange={v => setNewExpense(p => ({...p, category: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="labour">Labour</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount *</Label><Input type="number" value={newExpense.amount} onChange={e => setNewExpense(p => ({...p, amount: e.target.value}))} /></div>
            <div><Label>Description *</Label><Input value={newExpense.description} onChange={e => setNewExpense(p => ({...p, description: e.target.value}))} /></div>
            <div><Label>Vendor</Label><Input value={newExpense.vendor_name} onChange={e => setNewExpense(p => ({...p, vendor_name: e.target.value}))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddExpenseOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleRecordExpense}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SiteEngineerDashboard() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');
  
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [paymentRemarks, setPaymentRemarks] = useState('');
  
  // Petty Cash states
  const [pettyCashList, setPettyCashList] = useState([]);
  const [pettyCashDialog, setPettyCashDialog] = useState(false);
  const [pettyCashExpenseDialog, setPettyCashExpenseDialog] = useState(false);
  const [selectedPettyCash, setSelectedPettyCash] = useState(null);
  const [pettyCashForm, setPettyCashForm] = useState({
    project_id: '',
    amount: '',
    purpose: '',
    remarks: ''
  });
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    expense_type: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, projectsRes, workOrdersRes, pettyCashRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/site-engineer/my-projects`),
        axios.get(`${API}/site-engineer/work-orders`).catch(() => ({ data: [] })),
        axios.get(`${API}/site-engineer/petty-cash`).catch(() => ({ data: [] }))
      ]);
      setUser(userRes.data);
      setProjects(projectsRes.data);
      setWorkOrders(workOrdersRes.data);
      setPettyCashList(pettyCashRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. Only Site Engineers can access this page.');
        window.location.href = '/dashboard';
      } else {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Petty Cash Functions
  const handleRequestPettyCash = async () => {
    if (!pettyCashForm.project_id || !pettyCashForm.amount || !pettyCashForm.purpose) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await axios.post(`${API}/site-engineer/petty-cash/request`, {
        project_id: pettyCashForm.project_id,
        amount: parseFloat(pettyCashForm.amount),
        purpose: pettyCashForm.purpose,
        remarks: pettyCashForm.remarks
      });
      toast.success('Petty cash requested');
      setPettyCashDialog(false);
      setPettyCashForm({ project_id: '', amount: '', purpose: '', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request petty cash');
    }
  };
  
  const handleAddExpense = async () => {
    if (!expenseForm.amount || !expenseForm.expense_type || !expenseForm.description) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await axios.post(`${API}/site-engineer/petty-cash/${selectedPettyCash.petty_cash_id}/expense`, {
        petty_cash_id: selectedPettyCash.petty_cash_id,
        amount: parseFloat(expenseForm.amount),
        expense_type: expenseForm.expense_type,
        description: expenseForm.description,
        date: expenseForm.date
      });
      toast.success('Expense added');
      setPettyCashExpenseDialog(false);
      setExpenseForm({ amount: '', expense_type: '', description: '', date: new Date().toISOString().split('T')[0] });
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add expense');
    }
  };
  
  const handleSubmitPettyCash = async (pettyCashId) => {
    try {
      await axios.post(`${API}/site-engineer/petty-cash/${pettyCashId}/submit`);
      toast.success('Petty cash submitted for settlement');
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit petty cash');
    }
  };
  
  const getPettyCashStatusBadge = (status) => {
    const config = {
      requested: { label: 'Requested', className: 'bg-yellow-100 text-yellow-700' },
      issued: { label: 'Issued', className: 'bg-green-100 text-green-700' },
      partially_spent: { label: 'In Use', className: 'bg-amber-50 text-amber-700' },
      pending_settlement: { label: 'Pending Settlement', className: 'bg-orange-100 text-orange-700' },
      settled: { label: 'Settled', className: 'bg-gray-100 text-gray-700' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const handleStartStage = async (workOrderId, stageId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/stages/${stageId}/start`);
      toast.success('Stage started');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to start stage');
    }
  };

  const handleCompleteStage = async (workOrderId, stageId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/stages/${stageId}/complete`);
      toast.success('Stage marked as completed');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to complete stage');
    }
  };

  const openPaymentRequest = (workOrder, stage) => {
    setSelectedStage({ workOrder, stage });
    setPaymentRemarks('');
    setPaymentDialog(true);
  };

  const handleRequestPayment = async () => {
    if (!selectedStage) return;
    
    try {
      await axios.patch(
        `${API}/work-orders/${selectedStage.workOrder.work_order_id}/stages/${selectedStage.stage.stage_id}/request-payment`,
        null,
        { params: { remarks: paymentRemarks } }
      );
      toast.success('Payment request submitted to Planning');
      setPaymentDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request payment');
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getStageStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
      in_progress: { label: 'In Progress', className: 'bg-amber-50 text-amber-700' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
      payment_requested: { label: 'Payment Requested', className: 'bg-orange-100 text-orange-700' },
      payment_approved: { label: 'Approved', className: 'bg-purple-100 text-purple-700' },
      paid: { label: 'Paid', className: 'bg-green-200 text-green-800' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== 'site_engineer') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <HardHat className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">This page is only accessible to Site Engineers.</p>
            <Button onClick={() => window.location.href = '/dashboard'} className="w-full">Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-friendly Navigation */}
      <nav className="bg-gradient-to-r from-orange-600 to-orange-700 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-white/20 p-1.5 sm:p-2 rounded-lg">
              <HardHat className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white">Site Engineer</h1>
              <p className="text-xs text-orange-100 hidden sm:block">My Projects</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button 
              variant="outline" 
              className="text-white border-white/50 hover:bg-orange-500 h-8 text-xs sm:text-sm"
              onClick={() => window.location.href = '/site-engineer/material-receipt'}
            >
              <Package className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Material Receipt</span>
              <span className="sm:hidden">Receipt</span>
            </Button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-orange-100">Site Engineer</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-orange-500 h-8 w-8 sm:h-10 sm:w-10">
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
        {/* Mobile user info */}
        <div className="sm:hidden mt-2 pt-2 border-t border-orange-400/50">
          <p className="text-sm text-white">{user.name}</p>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <h2 data-testid="site-engineer-title" className="text-xl sm:text-3xl font-bold text-gray-900">My Projects</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Select a project to manage materials and labour</p>
        </div>

        {/* Stats - Stack on mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Assigned</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Building2 className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600" />
                <span className="text-lg sm:text-2xl font-bold text-orange-700">{projects.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600" />
                <span className="text-lg sm:text-2xl font-bold text-amber-700">
                  {projects.reduce((acc, p) => acc + (p.active_orders || 0), 0)}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active Sites</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <MapPin className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
                <span className="text-lg sm:text-2xl font-bold text-green-700">
                  {projects.filter(p => p.status === 'active').length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Projects, Work Orders, Petty Cash, and Mini Cashbook */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="projects" className="gap-2">
              <Building2 className="h-4 w-4" /> Projects
            </TabsTrigger>
            <TabsTrigger value="workorders" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Work Orders
              {workOrders.filter(w => w.status === 'assigned' || w.status === 'in_progress').length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {workOrders.filter(w => w.status === 'assigned' || w.status === 'in_progress').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pettycash" className="gap-2">
              <Wallet className="h-4 w-4" /> Petty Cash
              {pettyCashList.filter(p => p.status === 'issued' || p.status === 'partially_spent').length > 0 && (
                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-green-500">
                  {pettyCashList.filter(p => p.status === 'issued' || p.status === 'partially_spent').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="minicashbook" className="gap-2" data-testid="tab-mini-cashbook">
              <Receipt className="h-4 w-4" /> Mini Cashbook
            </TabsTrigger>
          </TabsList>

          {/* Projects Tab */}
          <TabsContent value="projects" className="mt-4">
            {projects.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center">
                  <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Projects Assigned</h3>
                  <p className="text-sm text-gray-600">
                    You haven't been assigned to any projects yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {projects.map((project) => (
                  <Card 
                    key={project.project_id} 
                    data-testid={`project-card-${project.project_id}`}
                    className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-orange-500 active:bg-gray-50"
                    onClick={() => window.location.href = `/site-engineer/project/${project.project_id}`}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-base sm:text-xl font-bold text-gray-900 truncate">{project.name}</h3>
                            <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {project.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1 sm:gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">{project.client_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate">{project.location}</span>
                            </div>
                          </div>
                          {project.active_orders > 0 && (
                            <div className="mt-2 sm:mt-3">
                              <div className="inline-flex items-center gap-1.5 bg-orange-100 px-2 py-1 rounded-lg">
                                <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
                                <span className="text-xs sm:text-sm font-medium text-orange-700">
                                  {project.active_orders} Active Orders
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400 flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Work Orders Tab */}
          <TabsContent value="workorders" className="mt-4">
            {workOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center">
                  <ClipboardList className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No Work Orders</h3>
                  <p className="text-sm text-gray-600">
                    No work orders have been assigned to you yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {workOrders.map((wo) => (
                  <Card key={wo.work_order_id} className="border-l-4 border-l-indigo-500">
                    <CardContent className="p-4">
                      {/* Work Order Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {wo.order_type === 'labour' ? (
                              <Users className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Package className="h-4 w-4 text-green-600" />
                            )}
                            <span className="font-bold">{wo.work_order_number}</span>
                            <Badge variant={wo.order_type === 'labour' ? 'default' : 'secondary'}>
                              {wo.order_type}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium">
                            {wo.order_type === 'labour' ? wo.work_type : wo.material_name}
                            {wo.brand && <span className="text-gray-500"> - {wo.brand}</span>}
                          </p>
                          <p className="text-xs text-gray-500">Project: {wo.project_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(wo.total_amount)}</p>
                        </div>
                      </div>

                      {/* Payment Stages for Labour Orders */}
                      {wo.order_type === 'labour' && wo.stages && wo.stages.length > 0 && (
                        <div className="border-t pt-3">
                          <p className="text-xs font-semibold text-gray-500 mb-2">PAYMENT STAGES</p>
                          <div className="space-y-2">
                            {wo.stages.map((stage, idx) => (
                              <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                      Stage {stage.stage_number}: {stage.stage_name}
                                    </span>
                                    {getStageStatusBadge(stage.status)}
                                  </div>
                                  <span className="font-bold text-green-600">{formatCurrency(stage.amount)}</span>
                                </div>
                                
                                {/* Stage Actions */}
                                <div className="flex gap-2 flex-wrap">
                                  {stage.status === 'pending' && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleStartStage(wo.work_order_id, stage.stage_id)}
                                      className="gap-1"
                                    >
                                      <Play className="h-3 w-3" /> Start Work
                                    </Button>
                                  )}
                                  
                                  {stage.status === 'in_progress' && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleCompleteStage(wo.work_order_id, stage.stage_id)}
                                      className="gap-1"
                                    >
                                      <CheckCircle className="h-3 w-3" /> Mark Complete
                                    </Button>
                                  )}
                                  
                                  {(stage.status === 'completed' || stage.status === 'in_progress') && stage.status !== 'payment_requested' && stage.status !== 'payment_approved' && stage.status !== 'paid' && (
                                    <Button 
                                      size="sm"
                                      onClick={() => openPaymentRequest(wo, stage)}
                                      className="gap-1 bg-orange-600 hover:bg-orange-700"
                                    >
                                      <DollarSign className="h-3 w-3" /> Request Payment
                                    </Button>
                                  )}
                                  
                                  {stage.status === 'payment_requested' && (
                                    <span className="text-xs text-orange-600 flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> Waiting for Planning approval
                                    </span>
                                  )}
                                  
                                  {stage.status === 'payment_approved' && (
                                    <span className="text-xs text-purple-600 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Approved - Awaiting payment
                                    </span>
                                  )}
                                  
                                  {stage.status === 'paid' && (
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Payment completed
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Petty Cash Tab */}
          <TabsContent value="pettycash" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Petty Cash</h3>
              <Button onClick={() => setPettyCashDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Request Petty Cash
              </Button>
            </div>
            
            {pettyCashList.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Petty Cash</h3>
                  <p className="text-sm text-gray-600">Request petty cash for site expenses</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pettyCashList.map((pc) => (
                  <Card key={pc.petty_cash_id} className="border-l-4 border-l-green-500">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{pc.project_name}</h4>
                            {getPettyCashStatusBadge(pc.status)}
                          </div>
                          <p className="text-sm text-gray-600">{pc.purpose}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">₹{pc.amount_issued || pc.amount_requested}</p>
                          <p className="text-xs text-gray-500">
                            Spent: ₹{pc.amount_spent || 0}
                          </p>
                        </div>
                      </div>
                      
                      {/* Expenses List */}
                      {pc.expenses && pc.expenses.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Expenses ({pc.expenses.length})</p>
                          <div className="space-y-1">
                            {pc.expenses.slice(-3).map((exp, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-gray-600">{exp.description}</span>
                                <span className="font-medium">₹{exp.amount}</span>
                              </div>
                            ))}
                            {pc.expenses.length > 3 && (
                              <p className="text-xs text-gray-400">...and {pc.expenses.length - 3} more</p>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-wrap">
                        {(pc.status === 'issued' || pc.status === 'partially_spent') && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedPettyCash(pc);
                                setPettyCashExpenseDialog(true);
                              }}
                            >
                              <Receipt className="h-4 w-4 mr-1" /> Add Expense
                            </Button>
                            <Button 
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700"
                              onClick={() => handleSubmitPettyCash(pc.petty_cash_id)}
                            >
                              <Send className="h-4 w-4 mr-1" /> Submit for Settlement
                            </Button>
                          </>
                        )}
                        {pc.status === 'pending_settlement' && (
                          <Badge className="bg-orange-100 text-orange-700">Waiting for Accountant</Badge>
                        )}
                        {pc.status === 'settled' && (
                          <Badge className="bg-green-100 text-green-700">Settled ✓</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Mini Cashbook Tab */}
          <TabsContent value="minicashbook" className="mt-4">
            <MiniCashbookSection projects={projects} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Stage Payment</DialogTitle>
            <DialogDescription>
              Submit payment request for approval by Planning
            </DialogDescription>
          </DialogHeader>
          
          {selectedStage && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">Work Order</p>
                  <p className="font-semibold">{selectedStage.workOrder.work_order_number} - {selectedStage.workOrder.work_type}</p>
                  <p className="text-sm text-gray-500 mt-2">Stage</p>
                  <p className="font-semibold">{selectedStage.stage.stage_name}</p>
                  <p className="text-xl font-bold text-green-600 mt-2">
                    {formatCurrency(selectedStage.stage.amount)}
                  </p>
                </CardContent>
              </Card>
              
              <div>
                <label className="text-sm font-medium">Remarks (Optional)</label>
                <Textarea 
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                  placeholder="Add any notes for Planning..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestPayment} className="bg-orange-600 hover:bg-orange-700">
              <DollarSign className="h-4 w-4 mr-2" /> Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petty Cash Request Dialog */}
      <Dialog open={pettyCashDialog} onOpenChange={setPettyCashDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Petty Cash</DialogTitle>
            <DialogDescription>
              Request petty cash for site expenses. Will be sent to Accountant for approval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Project *</label>
              <Select 
                value={pettyCashForm.project_id} 
                onValueChange={(v) => setPettyCashForm({...pettyCashForm, project_id: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Amount *</label>
              <Input 
                type="number"
                value={pettyCashForm.amount}
                onChange={(e) => setPettyCashForm({...pettyCashForm, amount: e.target.value})}
                placeholder="Enter amount"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Purpose *</label>
              <Input 
                value={pettyCashForm.purpose}
                onChange={(e) => setPettyCashForm({...pettyCashForm, purpose: e.target.value})}
                placeholder="e.g., Site expenses for week"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Remarks</label>
              <Textarea 
                value={pettyCashForm.remarks}
                onChange={(e) => setPettyCashForm({...pettyCashForm, remarks: e.target.value})}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPettyCashDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestPettyCash} className="bg-green-600 hover:bg-green-700">
              <Wallet className="h-4 w-4 mr-2" /> Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Petty Cash Expense Dialog */}
      <Dialog open={pettyCashExpenseDialog} onOpenChange={setPettyCashExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Record an expense from your petty cash
            </DialogDescription>
          </DialogHeader>
          
          {selectedPettyCash && (
            <div className="space-y-4">
              <Card className="bg-green-50">
                <CardContent className="p-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Available Balance</p>
                      <p className="text-xl font-bold text-green-600">
                        ₹{(selectedPettyCash.amount_issued - selectedPettyCash.amount_spent).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Total Issued</p>
                      <p className="font-semibold">₹{selectedPettyCash.amount_issued?.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div>
                <label className="text-sm font-medium">Amount *</label>
                <Input 
                  type="number"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  placeholder="Expense amount"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Expense Type *</label>
                <Select 
                  value={expenseForm.expense_type}
                  onValueChange={(v) => setExpenseForm({...expenseForm, expense_type: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="food">Food & Refreshments</SelectItem>
                    <SelectItem value="tools">Tools & Equipment</SelectItem>
                    <SelectItem value="misc">Miscellaneous</SelectItem>
                    <SelectItem value="printing">Printing & Stationery</SelectItem>
                    <SelectItem value="courier">Courier & Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Description *</label>
                <Input 
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  placeholder="Brief description of expense"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input 
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPettyCashExpenseDialog(false)}>Cancel</Button>
            <Button onClick={handleAddExpense} className="bg-green-600 hover:bg-green-700">
              <Receipt className="h-4 w-4 mr-2" /> Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}