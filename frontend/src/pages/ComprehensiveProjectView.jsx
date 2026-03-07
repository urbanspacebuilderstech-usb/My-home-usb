import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Building2, LogOut, ArrowLeft, Plus, Edit, Trash2, Save, X, 
  DollarSign, FileText, Calendar, TrendingUp, Wallet, Receipt,
  CheckCircle2, Clock, AlertCircle
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
import MobileBottomNav from '../components/MobileBottomNav';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ComprehensiveProjectView() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Dialog states
  const [paymentStageDialog, setPaymentStageDialog] = useState(false);
  const [additionalCostDialog, setAdditionalCostDialog] = useState(false);
  const [editingStage, setEditingStage] = useState(null);
  const [editingCost, setEditingCost] = useState(null);
  
  // Form data
  const [stageForm, setStageForm] = useState({
    stage_name: '',
    percentage: '',
    amount: '',
    due_date: ''
  });
  
  const [costForm, setCostForm] = useState({
    description: '',
    estimated_amount: ''
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, comprehensiveRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects/${projectId}/comprehensive`)
      ]);
      setUser(userRes.data);
      setProjectData(comprehensiveRes.data);
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

  // Payment Stage handlers
  const handleAddPaymentStage = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/payment-stages`, {
        project_id: projectId,
        stage_name: stageForm.stage_name,
        percentage: parseFloat(stageForm.percentage) || 0,
        amount: parseFloat(stageForm.amount) || 0,
        due_date: stageForm.due_date || null
      });
      toast.success('Payment stage added');
      setPaymentStageDialog(false);
      setStageForm({ stage_name: '', percentage: '', amount: '', due_date: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add payment stage');
    }
  };

  const handleUpdatePaymentStage = async (stageId, updates) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}`, updates);
      toast.success('Payment stage updated');
      setEditingStage(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update payment stage');
    }
  };

  const handleDeletePaymentStage = async (stageId) => {
    if (!confirm('Delete this payment stage?')) return;
    try {
      await axios.delete(`${API}/payment-stages/${stageId}`);
      toast.success('Payment stage deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete payment stage');
    }
  };

  // Additional Cost handlers
  const handleAddAdditionalCost = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/additional-costs`, {
        project_id: projectId,
        description: costForm.description,
        estimated_amount: parseFloat(costForm.estimated_amount) || 0
      });
      toast.success('Additional cost added');
      setAdditionalCostDialog(false);
      setCostForm({ description: '', estimated_amount: '' });
      fetchData();
    } catch (error) {
      toast.error('Failed to add additional cost');
    }
  };

  const handleUpdateAdditionalCost = async (costId, updates) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}`, updates);
      toast.success('Additional cost updated');
      setEditingCost(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update additional cost');
    }
  };

  const handleDeleteAdditionalCost = async (costId) => {
    if (!confirm('Delete this additional cost?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Additional cost deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete additional cost');
    }
  };

  const formatCurrency = (amount) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading project data...</div>
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

  const { project, boq_items, payment_stages, additional_costs, summary } = projectData;

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
              <p className="text-xs text-gray-500">Comprehensive Project View</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              data-testid="back-dashboard-btn"
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
              onClick={() => window.location.href = `/projects/${projectId}`}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h2 data-testid="comprehensive-project-title" className="text-3xl font-bold text-gray-900">
                {project.name}
              </h2>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                <span className="text-gray-600 flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {project.client_name}
                </span>
                <span className="text-gray-600">• {project.location}</span>
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
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Total Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-green-700">{formatCurrency(summary.total_payments)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Receipt className="h-3 w-3" />Total Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-orange-700">{formatCurrency(summary.total_expenses)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Wallet className="h-3 w-3" />Cash in Book
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-bold ${summary.cash_in_book >= 0 ? 'text-purple-700' : 'text-red-600'}`}>
                {formatCurrency(summary.cash_in_book)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Plus className="h-3 w-3" />Additional Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-cyan-700">{formatCurrency(summary.additional_estimated)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />Balance Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-red-700">{formatCurrency(summary.overall_balance)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b">
              <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-2">
                <TabsTrigger 
                  value="overview" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="boq"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  BOQ / Project Value
                </TabsTrigger>
                <TabsTrigger 
                  value="payment-schedule"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Payment Schedule
                </TabsTrigger>
                <TabsTrigger 
                  value="additional-costs"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Additional Costs
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* Overview Tab */}
            <TabsContent value="overview" className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Project Value Summary */}
                <Card className="border-2 border-blue-100">
                  <CardHeader className="bg-blue-50 border-b">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                      Project Value Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Agreement Value</span>
                      <span className="font-semibold">{formatCurrency(summary.project_value)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">BOQ Total</span>
                      <span className="font-semibold">{formatCurrency(summary.boq_total)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Additional Costs (Est.)</span>
                      <span className="font-semibold">{formatCurrency(summary.additional_estimated)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 bg-gray-50 px-2 rounded">
                      <span className="font-semibold text-gray-800">Total Project Scope</span>
                      <span className="font-bold text-blue-600">{formatCurrency(summary.project_value + summary.additional_estimated)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Income Summary */}
                <Card className="border-2 border-green-100">
                  <CardHeader className="bg-green-50 border-b">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                      Income Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Payment Schedule Received</span>
                      <span className="font-semibold text-green-600">{formatCurrency(summary.payment_schedule_received)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Additional Cost Income</span>
                      <span className="font-semibold text-green-600">{formatCurrency(summary.additional_income)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Total Payments Received</span>
                      <span className="font-semibold text-green-600">{formatCurrency(summary.total_payments)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 bg-gray-50 px-2 rounded">
                      <span className="font-semibold text-gray-800">Balance Due</span>
                      <span className="font-bold text-red-600">{formatCurrency(summary.overall_balance)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Expense Summary */}
                <Card className="border-2 border-orange-100">
                  <CardHeader className="bg-orange-50 border-b">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-orange-600" />
                      Expense Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Total Expenses</span>
                      <span className="font-semibold text-orange-600">{formatCurrency(summary.total_expenses)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 bg-gray-50 px-2 rounded">
                      <span className="font-semibold text-gray-800">Cash in Book</span>
                      <span className={`font-bold ${summary.cash_in_book >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                        {formatCurrency(summary.cash_in_book)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card className="border-2 border-gray-100">
                  <CardHeader className="bg-gray-50 border-b">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-600" />
                      Quick Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">BOQ Items</span>
                      <Badge variant="outline">{boq_items.length} items</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Payment Stages</span>
                      <Badge variant="outline">{payment_stages.length} stages</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Additional Cost Items</span>
                      <Badge variant="outline">{additional_costs.length} items</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-600">Project Status</span>
                      <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                        {project.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* BOQ Tab */}
            <TabsContent value="boq" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Bill of Quantities</h3>
                  <p className="text-sm text-gray-500">Project budget breakdown by item</p>
                </div>
                <Button
                  data-testid="manage-boq-btn"
                  variant="outline"
                  onClick={() => window.location.href = `/boq/${projectId}`}
                >
                  <Edit className="h-4 w-4 mr-2" />Manage BOQ
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {boq_items.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                          No BOQ items defined. Click "Manage BOQ" to add items.
                        </td>
                      </tr>
                    ) : (
                      boq_items.map((item, index) => (
                        <tr key={item.boq_id} data-testid={`boq-row-${item.boq_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{item.item_name}</td>
                          <td className="px-4 py-3"><Badge variant="outline">{item.category}</Badge></td>
                          <td className="px-4 py-3 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-right">{item.unit}</td>
                          <td className="px-4 py-3 text-right">₹{item.unit_rate?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-semibold">₹{item.total_cost?.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {boq_items.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2">
                      <tr>
                        <td colSpan="6" className="px-4 py-3 text-right font-bold">Total BOQ Value:</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">₹{summary.boq_total?.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* Payment Schedule Tab */}
            <TabsContent value="payment-schedule" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">Track milestone-based payments</p>
                </div>
                {canManage && (
                  <Dialog open={paymentStageDialog} onOpenChange={setPaymentStageDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-payment-stage-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Stage
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Payment Stage</DialogTitle>
                        <DialogDescription>Define a new payment milestone</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddPaymentStage} className="space-y-4">
                        <div>
                          <Label>Stage Name</Label>
                          <Input
                            data-testid="stage-name-input"
                            value={stageForm.stage_name}
                            onChange={(e) => setStageForm({...stageForm, stage_name: e.target.value})}
                            placeholder="e.g., Agreement, Foundation, 1st Floor"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Percentage (%)</Label>
                            <Input
                              data-testid="stage-percentage-input"
                              type="number"
                              step="0.01"
                              value={stageForm.percentage}
                              onChange={(e) => {
                                const pct = parseFloat(e.target.value) || 0;
                                setStageForm({
                                  ...stageForm, 
                                  percentage: e.target.value,
                                  amount: ((pct / 100) * summary.project_value).toFixed(0)
                                });
                              }}
                              placeholder="e.g., 10"
                            />
                          </div>
                          <div>
                            <Label>Amount (₹)</Label>
                            <Input
                              data-testid="stage-amount-input"
                              type="number"
                              value={stageForm.amount}
                              onChange={(e) => setStageForm({...stageForm, amount: e.target.value})}
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Due Date (Optional)</Label>
                          <Input
                            data-testid="stage-due-date-input"
                            type="date"
                            value={stageForm.due_date}
                            onChange={(e) => setStageForm({...stageForm, due_date: e.target.value})}
                          />
                        </div>
                        <Button data-testid="submit-stage-btn" type="submit" className="w-full">Add Stage</Button>
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
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Due Date</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payment_stages.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 9 : 8} className="px-4 py-8 text-center text-gray-500">
                          No payment stages defined yet. Click "Add Stage" to create payment milestones.
                        </td>
                      </tr>
                    ) : (
                      payment_stages.map((stage, index) => {
                        const balance = stage.amount - (stage.amount_received || 0);
                        const isEditing = editingStage === stage.stage_id;
                        
                        return (
                          <tr key={stage.stage_id} data-testid={`stage-row-${stage.stage_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{stage.stage_name}</td>
                            <td className="px-4 py-3 text-right">{stage.percentage}%</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{stage.amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-24 text-right"
                                  defaultValue={stage.amount_received}
                                  onBlur={(e) => handleUpdatePaymentStage(stage.stage_id, { amount_received: parseFloat(e.target.value) || 0 })}
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
                              <Badge variant={
                                stage.status === 'completed' ? 'default' :
                                stage.status === 'partial' ? 'secondary' : 'outline'
                              }>
                                {stage.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {stage.status === 'partial' && <Clock className="h-3 w-3 mr-1" />}
                                {stage.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center text-sm">
                              {stage.due_date ? new Date(stage.due_date).toLocaleDateString() : '-'}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingStage(isEditing ? null : stage.stage_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-blue-500" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeletePaymentStage(stage.stage_id)}
                                  >
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
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.payment_schedule_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{summary.payment_schedule_balance?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* Additional Costs Tab */}
            <TabsContent value="additional-costs" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Additional Costs</h3>
                  <p className="text-sm text-gray-500">Track extra work and variations</p>
                </div>
                {canManage && (
                  <Dialog open={additionalCostDialog} onOpenChange={setAdditionalCostDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-additional-cost-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Cost Item
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Additional Cost</DialogTitle>
                        <DialogDescription>Record extra work or variations</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddAdditionalCost} className="space-y-4">
                        <div>
                          <Label>Description</Label>
                          <Input
                            data-testid="cost-description-input"
                            value={costForm.description}
                            onChange={(e) => setCostForm({...costForm, description: e.target.value})}
                            placeholder="e.g., Extra flooring, Additional electrical work"
                            required
                          />
                        </div>
                        <div>
                          <Label>Estimated Amount (₹)</Label>
                          <Input
                            data-testid="cost-amount-input"
                            type="number"
                            value={costForm.estimated_amount}
                            onChange={(e) => setCostForm({...costForm, estimated_amount: e.target.value})}
                            required
                          />
                        </div>
                        <Button data-testid="submit-cost-btn" type="submit" className="w-full">Add Cost Item</Button>
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
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Estimated</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actual</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {additional_costs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                          No additional costs recorded yet. Click "Add Cost Item" to track extra work.
                        </td>
                      </tr>
                    ) : (
                      additional_costs.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const isEditing = editingCost === cost.cost_id;
                        
                        return (
                          <tr key={cost.cost_id} data-testid={`cost-row-${cost.cost_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{cost.description}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{cost.estimated_amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-24 text-right"
                                  defaultValue={cost.actual_amount}
                                  onBlur={(e) => handleUpdateAdditionalCost(cost.cost_id, { actual_amount: parseFloat(e.target.value) || 0 })}
                                />
                              ) : (
                                <span className="text-orange-600">₹{(cost.actual_amount || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-24 text-right"
                                  defaultValue={cost.income_received}
                                  onBlur={(e) => handleUpdateAdditionalCost(cost.cost_id, { income_received: parseFloat(e.target.value) || 0 })}
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
                              <Badge variant={
                                cost.status === 'completed' ? 'default' :
                                cost.status === 'in_progress' ? 'secondary' : 'outline'
                              }>
                                {cost.status}
                              </Badge>
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingCost(isEditing ? null : cost.cost_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-blue-500" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteAdditionalCost(cost.cost_id)}
                                  >
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
                        <td className="px-4 py-3 text-right font-bold">₹{summary.additional_estimated?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">₹{summary.additional_actual?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.additional_income?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{summary.additional_balance?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
