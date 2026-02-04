import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Building2, LogOut, ArrowLeft, Plus, Edit, Trash2, Save, X,
  DollarSign, FileText, TrendingUp, Wallet, MinusCircle, CheckCircle2, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState('scope');
  
  // Dialog states
  const [scopeDialog, setScopeDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [additionDialog, setAdditionDialog] = useState(false);
  const [deductionDialog, setDeductionDialog] = useState(false);
  
  // Editing states
  const [editingScope, setEditingScope] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingAddition, setEditingAddition] = useState(null);
  const [editingDeduction, setEditingDeduction] = useState(null);
  
  // Form data
  const [scopeForm, setScopeForm] = useState({
    item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: ''
  });
  
  const [paymentForm, setPaymentForm] = useState({
    stage_name: '', percentage: '', amount: '', due_date: ''
  });
  
  const [additionForm, setAdditionForm] = useState({
    description: '', estimated_amount: ''
  });
  
  const [deductionForm, setDeductionForm] = useState({
    description: '', amount: '', remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, projectRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects/${projectId}/full-details`)
      ]);
      setUser(userRes.data);
      setProjectData(projectRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
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

  // ==================== SCOPE HANDLERS ====================
  const handleAddScope = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/scope-items`, {
        project_id: projectId,
        item_name: scopeForm.item_name,
        quantity: parseFloat(scopeForm.quantity) || 1,
        unit: scopeForm.unit,
        unit_rate: parseFloat(scopeForm.unit_rate) || 0,
        remarks: scopeForm.remarks || null
      });
      toast.success('Scope item added');
      setScopeDialog(false);
      setScopeForm({ item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add scope item');
    }
  };

  const handleUpdateScope = async (scopeId, updates) => {
    try {
      await axios.patch(`${API}/scope-items/${scopeId}`, updates);
      toast.success('Scope item updated');
      setEditingScope(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update scope item');
    }
  };

  const handleDeleteScope = async (scopeId) => {
    if (!confirm('Delete this scope item?')) return;
    try {
      await axios.delete(`${API}/scope-items/${scopeId}`);
      toast.success('Scope item deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete scope item');
    }
  };

  // ==================== PAYMENT HANDLERS ====================
  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/payment-stages`, {
        project_id: projectId,
        stage_name: paymentForm.stage_name,
        percentage: parseFloat(paymentForm.percentage) || 0,
        amount: parseFloat(paymentForm.amount) || 0,
        due_date: paymentForm.due_date || null
      });
      toast.success('Payment stage added');
      setPaymentDialog(false);
      setPaymentForm({ stage_name: '', percentage: '', amount: '', due_date: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add payment stage');
    }
  };

  const handleUpdatePayment = async (stageId, updates) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}`, updates);
      toast.success('Payment updated');
      setEditingPayment(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update payment');
    }
  };

  const handleDeletePayment = async (stageId) => {
    if (!confirm('Delete this payment stage?')) return;
    try {
      await axios.delete(`${API}/payment-stages/${stageId}`);
      toast.success('Payment stage deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete payment stage');
    }
  };

  // ==================== ADDITION HANDLERS ====================
  const handleAddAddition = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/additional-costs`, {
        project_id: projectId,
        description: additionForm.description,
        estimated_amount: parseFloat(additionForm.estimated_amount) || 0
      });
      toast.success('Addition added');
      setAdditionDialog(false);
      setAdditionForm({ description: '', estimated_amount: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add addition');
    }
  };

  const handleUpdateAddition = async (costId, updates) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}`, updates);
      toast.success('Addition updated');
      setEditingAddition(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update addition');
    }
  };

  const handleDeleteAddition = async (costId) => {
    if (!confirm('Delete this addition?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Addition deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete addition');
    }
  };

  // ==================== DEDUCTION HANDLERS ====================
  const handleAddDeduction = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/deductions`, {
        project_id: projectId,
        description: deductionForm.description,
        amount: parseFloat(deductionForm.amount) || 0,
        remarks: deductionForm.remarks || null
      });
      toast.success('Deduction added');
      setDeductionDialog(false);
      setDeductionForm({ description: '', amount: '', remarks: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add deduction');
    }
  };

  const handleUpdateDeduction = async (deductionId, updates) => {
    try {
      await axios.patch(`${API}/deductions/${deductionId}`, updates);
      toast.success('Deduction updated');
      setEditingDeduction(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update deduction');
    }
  };

  const handleDeleteDeduction = async (deductionId) => {
    if (!confirm('Delete this deduction?')) return;
    try {
      await axios.delete(`${API}/deductions/${deductionId}`);
      toast.success('Deduction deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete deduction');
    }
  };

  const formatCurrency = (amount) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant' || user?.role === 'planning';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!projectData || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Failed to load project</div>
      </div>
    );
  }

  const { project, scope_items, payment_stages, additional_costs, deductions, summary } = projectData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500">Project View</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              data-testid="dashboard-btn"
              variant="ghost"
              onClick={() => window.location.href = '/dashboard'}
            >
              Dashboard
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button
                data-testid="logout-btn"
                variant="ghost"
                size="icon"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Project Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = '/projects'}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h2 data-testid="project-detail-title" className="text-3xl font-bold text-gray-900">
                {project.name}
              </h2>
              <div className="flex items-center gap-4 mt-1 flex-wrap text-sm">
                <span className="text-gray-600">
                  <strong>Client:</strong> {project.client_name}
                </span>
                <span className="text-gray-600">
                  <strong>Location:</strong> {project.location}
                </span>
                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                  {project.status}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Project Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-700">{formatCurrency(summary.project_value)}</div>
              <p className="text-xs text-gray-500">Scope Total</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Plus className="h-3 w-3" />Additions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-cyan-700">{formatCurrency(summary.additions_total)}</div>
              <p className="text-xs text-gray-500">Extra Work</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <FileText className="h-3 w-3" />Total Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-purple-700">{formatCurrency(summary.total_value)}</div>
              <p className="text-xs text-gray-500">Scope + Additions</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Income Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-green-700">{formatCurrency(summary.income_total)}</div>
              <p className="text-xs text-gray-500">
                <span 
                  className="text-blue-600 cursor-pointer hover:underline"
                  onClick={() => window.location.href = '/income'}
                >
                  View Income Module
                </span>
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <MinusCircle className="h-3 w-3" />Deductions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-orange-700">{formatCurrency(summary.deductions_total)}</div>
              <p className="text-xs text-gray-500">Adjustments</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Wallet className="h-3 w-3" />Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-bold ${summary.balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(summary.balance)}
              </div>
              <p className="text-xs text-gray-500">Pending</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b">
              <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-2">
                <TabsTrigger 
                  value="scope" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Scope
                </TabsTrigger>
                <TabsTrigger 
                  value="payments"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Payments
                </TabsTrigger>
                <TabsTrigger 
                  value="additions"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Additions
                </TabsTrigger>
                <TabsTrigger 
                  value="deductions"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Deductions
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* ==================== SCOPE TAB ==================== */}
            <TabsContent value="scope" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Project Scope</h3>
                  <p className="text-sm text-gray-500">Define scope items - total becomes project value</p>
                </div>
                {canManage && (
                  <Dialog open={scopeDialog} onOpenChange={setScopeDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-scope-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Scope
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Scope Item</DialogTitle>
                        <DialogDescription>Define a new scope item for this project</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddScope} className="space-y-4">
                        <div>
                          <Label>Item Name</Label>
                          <Input
                            data-testid="scope-name-input"
                            value={scopeForm.item_name}
                            onChange={(e) => setScopeForm({...scopeForm, item_name: e.target.value})}
                            placeholder="e.g., Foundation Work, Electrical, Plumbing"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label>Quantity</Label>
                            <Input
                              data-testid="scope-qty-input"
                              type="number"
                              value={scopeForm.quantity}
                              onChange={(e) => setScopeForm({...scopeForm, quantity: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>Unit</Label>
                            <Input
                              data-testid="scope-unit-input"
                              value={scopeForm.unit}
                              onChange={(e) => setScopeForm({...scopeForm, unit: e.target.value})}
                              placeholder="Nos, Sqft, etc."
                            />
                          </div>
                          <div>
                            <Label>Unit Rate (₹)</Label>
                            <Input
                              data-testid="scope-rate-input"
                              type="number"
                              value={scopeForm.unit_rate}
                              onChange={(e) => setScopeForm({...scopeForm, unit_rate: e.target.value})}
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Remarks (Optional)</Label>
                          <Input
                            data-testid="scope-remarks-input"
                            value={scopeForm.remarks}
                            onChange={(e) => setScopeForm({...scopeForm, remarks: e.target.value})}
                          />
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-sm text-gray-600">
                            Total: <strong>₹{((parseFloat(scopeForm.quantity) || 0) * (parseFloat(scopeForm.unit_rate) || 0)).toLocaleString()}</strong>
                          </p>
                        </div>
                        <Button data-testid="submit-scope-btn" type="submit" className="w-full">Add Scope Item</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                          No scope items defined yet. Click "Add Scope" to define project scope.
                        </td>
                      </tr>
                    ) : (
                      scope_items.map((item, index) => (
                        <tr key={item.scope_id} data-testid={`scope-row-${item.scope_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{item.item_name}</td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-center">{item.unit}</td>
                          <td className="px-4 py-3 text-right">₹{item.unit_rate?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-semibold text-blue-600">₹{item.total_amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.remarks || '-'}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteScope(item.scope_id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {scope_items.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2">
                      <tr>
                        <td colSpan="5" className="px-4 py-3 text-right font-bold">Project Value (Scope Total):</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">₹{summary.scope_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PAYMENTS TAB ==================== */}
            <TabsContent value="payments" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">Track milestone-based payments</p>
                </div>
                {canManage && (
                  <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-payment-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Payment
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Payment Stage</DialogTitle>
                        <DialogDescription>Define a payment milestone</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddPayment} className="space-y-4">
                        <div>
                          <Label>Stage Name</Label>
                          <Input
                            data-testid="payment-name-input"
                            value={paymentForm.stage_name}
                            onChange={(e) => setPaymentForm({...paymentForm, stage_name: e.target.value})}
                            placeholder="e.g., Advance, Foundation, Finishing"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Percentage (%)</Label>
                            <Input
                              data-testid="payment-pct-input"
                              type="number"
                              step="0.01"
                              value={paymentForm.percentage}
                              onChange={(e) => {
                                const pct = parseFloat(e.target.value) || 0;
                                setPaymentForm({
                                  ...paymentForm, 
                                  percentage: e.target.value,
                                  amount: ((pct / 100) * summary.project_value).toFixed(0)
                                });
                              }}
                            />
                          </div>
                          <div>
                            <Label>Amount (₹)</Label>
                            <Input
                              data-testid="payment-amount-input"
                              type="number"
                              value={paymentForm.amount}
                              onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Due Date (Optional)</Label>
                          <Input
                            data-testid="payment-due-input"
                            type="date"
                            value={paymentForm.due_date}
                            onChange={(e) => setPaymentForm({...paymentForm, due_date: e.target.value})}
                          />
                        </div>
                        <Button data-testid="submit-payment-btn" type="submit" className="w-full">Add Payment Stage</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">%</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payment_stages.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                          No payment stages defined yet. Click "Add Payment" to define milestones.
                        </td>
                      </tr>
                    ) : (
                      payment_stages.map((stage, index) => {
                        const balance = stage.amount - (stage.amount_received || 0);
                        const isEditing = editingPayment === stage.stage_id;
                        
                        return (
                          <tr key={stage.stage_id} data-testid={`payment-row-${stage.stage_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{stage.stage_name}</td>
                            <td className="px-4 py-3 text-right">{stage.percentage}%</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{stage.amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-28 text-right"
                                  defaultValue={stage.amount_received}
                                  onBlur={(e) => handleUpdatePayment(stage.stage_id, { amount_received: parseFloat(e.target.value) || 0 })}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-green-600">₹{(stage.amount_received || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={balance <= 0 ? 'default' : balance < stage.amount ? 'secondary' : 'outline'}>
                                {balance <= 0 ? 'Completed' : balance < stage.amount ? 'Partial' : 'Pending'}
                              </Badge>
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingPayment(isEditing ? null : stage.stage_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-blue-500" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(stage.stage_id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {payment_stages.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{summary.payment_schedule_total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.payment_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{(summary.payment_schedule_total - summary.payment_received)?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== ADDITIONS TAB ==================== */}
            <TabsContent value="additions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Additional Work</h3>
                  <p className="text-sm text-gray-500">Track extra work and variations</p>
                </div>
                {canManage && (
                  <Dialog open={additionDialog} onOpenChange={setAdditionDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-addition-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Addition
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Additional Work</DialogTitle>
                        <DialogDescription>Record extra work or variations</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddAddition} className="space-y-4">
                        <div>
                          <Label>Description</Label>
                          <Input
                            data-testid="addition-desc-input"
                            value={additionForm.description}
                            onChange={(e) => setAdditionForm({...additionForm, description: e.target.value})}
                            placeholder="e.g., Extra flooring, Additional electrical"
                            required
                          />
                        </div>
                        <div>
                          <Label>Estimated Amount (₹)</Label>
                          <Input
                            data-testid="addition-amount-input"
                            type="number"
                            value={additionForm.estimated_amount}
                            onChange={(e) => setAdditionForm({...additionForm, estimated_amount: e.target.value})}
                            required
                          />
                        </div>
                        <Button data-testid="submit-addition-btn" type="submit" className="w-full">Add Addition</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {additional_costs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                          No additions recorded yet. Click "Add Addition" for extra work.
                        </td>
                      </tr>
                    ) : (
                      additional_costs.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const isEditing = editingAddition === cost.cost_id;
                        
                        return (
                          <tr key={cost.cost_id} data-testid={`addition-row-${cost.cost_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{cost.description}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{cost.estimated_amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-28 text-right"
                                  defaultValue={cost.income_received}
                                  onBlur={(e) => handleUpdateAddition(cost.cost_id, { income_received: parseFloat(e.target.value) || 0 })}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-green-600">₹{(cost.income_received || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={cost.status === 'completed' ? 'default' : cost.status === 'in_progress' ? 'secondary' : 'outline'}>
                                {cost.status}
                              </Badge>
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingAddition(isEditing ? null : cost.cost_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-blue-500" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {additional_costs.length > 0 && (
                    <tfoot className="bg-cyan-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{summary.additions_total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.additions_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{(summary.additions_total - summary.additions_received)?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== DEDUCTIONS TAB ==================== */}
            <TabsContent value="deductions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Deductions</h3>
                  <p className="text-sm text-gray-500">Track penalties, discounts, and adjustments (reduces balance only)</p>
                </div>
                {canManage && (
                  <Dialog open={deductionDialog} onOpenChange={setDeductionDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-deduction-btn" className="gap-2 bg-orange-600 hover:bg-orange-700">
                        <MinusCircle className="h-4 w-4" />Add Deduction
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Deduction</DialogTitle>
                        <DialogDescription>Record penalty, discount or adjustment</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddDeduction} className="space-y-4">
                        <div>
                          <Label>Description</Label>
                          <Input
                            data-testid="deduction-desc-input"
                            value={deductionForm.description}
                            onChange={(e) => setDeductionForm({...deductionForm, description: e.target.value})}
                            placeholder="e.g., Penalty, Discount, Adjustment"
                            required
                          />
                        </div>
                        <div>
                          <Label>Amount (₹)</Label>
                          <Input
                            data-testid="deduction-amount-input"
                            type="number"
                            value={deductionForm.amount}
                            onChange={(e) => setDeductionForm({...deductionForm, amount: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Remarks (Optional)</Label>
                          <Input
                            data-testid="deduction-remarks-input"
                            value={deductionForm.remarks}
                            onChange={(e) => setDeductionForm({...deductionForm, remarks: e.target.value})}
                          />
                        </div>
                        <Button data-testid="submit-deduction-btn" type="submit" className="w-full bg-orange-600 hover:bg-orange-700">Add Deduction</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                          No deductions recorded yet. Click "Add Deduction" for penalties or adjustments.
                        </td>
                      </tr>
                    ) : (
                      deductions.map((d, index) => (
                        <tr key={d.deduction_id} data-testid={`deduction-row-${d.deduction_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{d.description}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-600">-₹{d.amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={d.status === 'approved' ? 'default' : d.status === 'rejected' ? 'destructive' : 'outline'}>
                              {d.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{d.remarks || '-'}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDeduction(d.deduction_id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-orange-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">-₹{summary.deductions_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
