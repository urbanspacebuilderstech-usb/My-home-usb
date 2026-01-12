import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Building2, LogOut, ArrowLeft, Plus, Edit, FileText, Trash2, Users, ClipboardList } from 'lucide-react';
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
  const [project, setProject] = useState(null);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [commitments, setCommitments] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('payments');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [commitmentDialogOpen, setCommitmentDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);

  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    payment_date: '',
    description: ''
  });

  const [expenseFormData, setExpenseFormData] = useState({
    category: 'Material',
    amount: '',
    description: ''
  });

  const [commitmentFormData, setCommitmentFormData] = useState({
    item_name: '',
    quantity: '',
    units: '',
    unit_rate: '',
    category: 'Material'
  });

  const [assignmentFormData, setAssignmentFormData] = useState({
    work_order_id: '',
    assigned_to_user_id: '',
    due_date: '',
    priority: 'medium',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [userRes, projRes, paymentsRes, expensesRes, boqRes, commitmentsRes, assignmentsRes, woRes, usersRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects/${projectId}`),
        axios.get(`${API}/payments?project_id=${projectId}`),
        axios.get(`${API}/expenses?project_id=${projectId}`),
        axios.get(`${API}/boq/${projectId}`),
        axios.get(`${API}/project-commitments/${projectId}`),
        axios.get(`${API}/work-order-assignments/${projectId}`),
        axios.get(`${API}/work-orders`),
        axios.get(`${API}/users`).catch(() => ({ data: [] }))
      ]);
      setUser(userRes.data);
      setProject(projRes.data);
      setPayments(paymentsRes.data || []);
      setExpenses(expensesRes.data || []);
      setBoqItems(boqRes.data || []);
      setCommitments(commitmentsRes.data || []);
      setAssignments(assignmentsRes.data || []);
      setWorkOrders(woRes.data?.filter(wo => wo.project_id === projectId) || []);
      setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/payments`, {
        project_id: projectId,
        amount: parseFloat(paymentFormData.amount),
        payment_date: new Date(paymentFormData.payment_date).toISOString(),
        description: paymentFormData.description
      });
      toast.success('Payment added successfully');
      setPaymentDialogOpen(false);
      fetchData();
      setPaymentFormData({ amount: '', payment_date: '', description: '' });
    } catch (error) {
      toast.error('Failed to add payment');
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses`, {
        project_id: projectId,
        category: expenseFormData.category,
        amount: parseFloat(expenseFormData.amount),
        description: expenseFormData.description
      });
      toast.success('Expense added successfully');
      setExpenseDialogOpen(false);
      fetchData();
      setExpenseFormData({ category: 'Material', amount: '', description: '' });
    } catch (error) {
      toast.error('Failed to add expense');
    }
  };

  const handleAddCommitment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/project-commitments`, {
        project_id: projectId,
        item_name: commitmentFormData.item_name,
        quantity: parseFloat(commitmentFormData.quantity),
        units: commitmentFormData.units,
        unit_rate: parseFloat(commitmentFormData.unit_rate),
        category: commitmentFormData.category
      });
      toast.success('Commitment added successfully');
      setCommitmentDialogOpen(false);
      fetchData();
      setCommitmentFormData({ item_name: '', quantity: '', units: '', unit_rate: '', category: 'Material' });
    } catch (error) {
      toast.error('Failed to add commitment');
    }
  };

  const handleDeleteCommitment = async (commitmentId) => {
    try {
      await axios.delete(`${API}/project-commitments/${commitmentId}`);
      toast.success('Commitment deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete commitment');
    }
  };

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/work-order-assignments`, {
        work_order_id: assignmentFormData.work_order_id,
        project_id: projectId,
        assigned_to_user_id: assignmentFormData.assigned_to_user_id,
        due_date: new Date(assignmentFormData.due_date).toISOString(),
        priority: assignmentFormData.priority,
        notes: assignmentFormData.notes
      });
      toast.success('Work order assigned successfully');
      setAssignmentDialogOpen(false);
      fetchData();
      setAssignmentFormData({ work_order_id: '', assigned_to_user_id: '', due_date: '', priority: 'medium', notes: '' });
    } catch (error) {
      toast.error('Failed to assign work order');
    }
  };

  if (!user || !project) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const balance = project.total_value - totalPaid;
  const totalCommitted = commitments.reduce((sum, c) => sum + (c.total_cost || 0), 0);

  const canManage = user.role === 'super_admin' || user.role === 'project_manager' || user.role === 'planning';
  const canAssign = user.role === 'super_admin' || user.role === 'project_manager';

  const getUserName = (userId) => {
    const u = users.find(u => u.user_id === userId);
    return u?.name || userId;
  };

  const getWorkOrderInfo = (woId) => {
    const wo = workOrders.find(w => w.work_order_id === woId);
    return wo?.purpose || woId;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500">Project Management System</p>
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
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = '/dashboard'}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 data-testid="project-detail-title" className="text-3xl font-bold text-gray-900">
                {project.name}
              </h2>
              <div className="flex items-center gap-4 mt-1">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Agreement Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                ₹{(project.total_value / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">
                ₹{(totalPaid / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Spent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">
                ₹{(totalSpent / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Committed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-700">
                ₹{(totalCommitted / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Balance Due</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">
                ₹{(balance / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b">
              <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-2">
                <TabsTrigger 
                  value="payments" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Payments
                </TabsTrigger>
                <TabsTrigger 
                  value="expenses"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Expenses
                </TabsTrigger>
                <TabsTrigger 
                  value="commitments"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Commitments
                </TabsTrigger>
                <TabsTrigger 
                  value="assignments"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  Work Order Assignments
                </TabsTrigger>
                <TabsTrigger 
                  value="boq"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4"
                >
                  BOQ
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* Payments Tab */}
            <TabsContent value="payments" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Payments Received</h3>
                <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="add-payment-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4" />Add Payment
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Payment</DialogTitle>
                      <DialogDescription>Record a new payment received</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddPayment} className="space-y-4">
                      <div>
                        <Label>Amount</Label>
                        <Input
                          data-testid="payment-amount-input"
                          type="number"
                          value={paymentFormData.amount}
                          onChange={(e) => setPaymentFormData({...paymentFormData, amount: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label>Date</Label>
                        <Input
                          data-testid="payment-date-input"
                          type="date"
                          value={paymentFormData.payment_date}
                          onChange={(e) => setPaymentFormData({...paymentFormData, payment_date: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          data-testid="payment-desc-input"
                          value={paymentFormData.description}
                          onChange={(e) => setPaymentFormData({...paymentFormData, description: e.target.value})}
                          required
                        />
                      </div>
                      <Button data-testid="submit-payment-btn" type="submit" className="w-full">Add Payment</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DATE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">TYPE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">MODE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">AMOUNT</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">REMARKS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                          No payments recorded yet
                        </td>
                      </tr>
                    ) : (
                      payments.map((payment) => (
                        <tr key={payment.payment_id} data-testid={`payment-row-${payment.payment_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4">{new Date(payment.payment_date).toLocaleDateString()}</td>
                          <td className="px-6 py-4"><Badge variant="outline">Advance</Badge></td>
                          <td className="px-6 py-4">Bank Transfer</td>
                          <td className="px-6 py-4 font-semibold text-green-600">₹{payment.amount.toLocaleString()}</td>
                          <td className="px-6 py-4 text-gray-600">{payment.description}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Expenses Tab */}
            <TabsContent value="expenses" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Project Expenses</h3>
                {user.role === 'accountant' && (
                  <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-expense-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Expense
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Expense</DialogTitle>
                        <DialogDescription>Record a new expense</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddExpense} className="space-y-4">
                        <div>
                          <Label>Category</Label>
                          <Select
                            value={expenseFormData.category}
                            onValueChange={(value) => setExpenseFormData({...expenseFormData, category: value})}
                          >
                            <SelectTrigger data-testid="expense-category-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Material">Material</SelectItem>
                              <SelectItem value="Labour">Labour</SelectItem>
                              <SelectItem value="Transport">Transport</SelectItem>
                              <SelectItem value="Machinery">Machinery</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Amount</Label>
                          <Input
                            data-testid="expense-amount-input"
                            type="number"
                            value={expenseFormData.amount}
                            onChange={(e) => setExpenseFormData({...expenseFormData, amount: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Input
                            data-testid="expense-desc-input"
                            value={expenseFormData.description}
                            onChange={(e) => setExpenseFormData({...expenseFormData, description: e.target.value})}
                            required
                          />
                        </div>
                        <Button data-testid="submit-expense-btn" type="submit" className="w-full">Add Expense</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DATE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CATEGORY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DESCRIPTION</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                          No expenses recorded yet
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
                        <tr key={expense.expense_id} data-testid={`expense-row-${expense.expense_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4">{new Date(expense.created_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4"><Badge>{expense.category}</Badge></td>
                          <td className="px-6 py-4 text-gray-600">{expense.description}</td>
                          <td className="px-6 py-4 font-semibold text-orange-600">₹{expense.amount.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Commitments Tab */}
            <TabsContent value="commitments" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Project Commitments</h3>
                  <p className="text-sm text-gray-500">Track committed resources and materials for this project</p>
                </div>
                {canManage && (
                  <Dialog open={commitmentDialogOpen} onOpenChange={setCommitmentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-commitment-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4" />Add Commitment
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Commitment</DialogTitle>
                        <DialogDescription>Record a new resource commitment</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddCommitment} className="space-y-4">
                        <div>
                          <Label>Item Name</Label>
                          <Input
                            data-testid="commitment-item-input"
                            value={commitmentFormData.item_name}
                            onChange={(e) => setCommitmentFormData({...commitmentFormData, item_name: e.target.value})}
                            placeholder="e.g., Cement, Steel, Labour"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Quantity</Label>
                            <Input
                              data-testid="commitment-qty-input"
                              type="number"
                              value={commitmentFormData.quantity}
                              onChange={(e) => setCommitmentFormData({...commitmentFormData, quantity: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>Units</Label>
                            <Input
                              data-testid="commitment-units-input"
                              value={commitmentFormData.units}
                              onChange={(e) => setCommitmentFormData({...commitmentFormData, units: e.target.value})}
                              placeholder="e.g., bags, tons, days"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Unit Rate (₹)</Label>
                          <Input
                            data-testid="commitment-rate-input"
                            type="number"
                            value={commitmentFormData.unit_rate}
                            onChange={(e) => setCommitmentFormData({...commitmentFormData, unit_rate: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Category</Label>
                          <Select
                            value={commitmentFormData.category}
                            onValueChange={(value) => setCommitmentFormData({...commitmentFormData, category: value})}
                          >
                            <SelectTrigger data-testid="commitment-category-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Material">Material</SelectItem>
                              <SelectItem value="Labour">Labour</SelectItem>
                              <SelectItem value="Equipment">Equipment</SelectItem>
                              <SelectItem value="Services">Services</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button data-testid="submit-commitment-btn" type="submit" className="w-full">Add Commitment</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ITEM</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CATEGORY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">QUANTITY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">UNIT RATE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">TOTAL COST</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DATE</th>
                      {canManage && <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ACTIONS</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {commitments.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                          No commitments recorded yet
                        </td>
                      </tr>
                    ) : (
                      commitments.map((commitment) => (
                        <tr key={commitment.commitment_id} data-testid={`commitment-row-${commitment.commitment_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium">{commitment.item_name}</td>
                          <td className="px-6 py-4"><Badge variant="outline">{commitment.category}</Badge></td>
                          <td className="px-6 py-4">{commitment.quantity} {commitment.units}</td>
                          <td className="px-6 py-4">₹{commitment.unit_rate.toLocaleString()}</td>
                          <td className="px-6 py-4 font-semibold text-purple-600">₹{commitment.total_cost.toLocaleString()}</td>
                          <td className="px-6 py-4 text-gray-600">{new Date(commitment.committed_date).toLocaleDateString()}</td>
                          {canManage && (
                            <td className="px-6 py-4">
                              <Button
                                data-testid={`delete-commitment-${commitment.commitment_id}`}
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteCommitment(commitment.commitment_id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {commitments.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2">
                      <tr>
                        <td colSpan="4" className="px-6 py-3 text-right font-semibold">Total Committed:</td>
                        <td className="px-6 py-3 font-bold text-purple-700">₹{totalCommitted.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* Work Order Assignments Tab */}
            <TabsContent value="assignments" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Work Order Assignments</h3>
                  <p className="text-sm text-gray-500">Track work order assignments to team members</p>
                </div>
                {canAssign && workOrders.length > 0 && (
                  <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-assignment-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                        <Users className="h-4 w-4" />Assign Work Order
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign Work Order</DialogTitle>
                        <DialogDescription>Assign a work order to a team member</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleAddAssignment} className="space-y-4">
                        <div>
                          <Label>Work Order</Label>
                          <Select
                            value={assignmentFormData.work_order_id}
                            onValueChange={(value) => setAssignmentFormData({...assignmentFormData, work_order_id: value})}
                          >
                            <SelectTrigger data-testid="assignment-wo-select">
                              <SelectValue placeholder="Select work order" />
                            </SelectTrigger>
                            <SelectContent>
                              {workOrders.map(wo => (
                                <SelectItem key={wo.work_order_id} value={wo.work_order_id}>
                                  {wo.purpose} ({wo.status})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Assign To</Label>
                          <Select
                            value={assignmentFormData.assigned_to_user_id}
                            onValueChange={(value) => setAssignmentFormData({...assignmentFormData, assigned_to_user_id: value})}
                          >
                            <SelectTrigger data-testid="assignment-user-select">
                              <SelectValue placeholder="Select team member" />
                            </SelectTrigger>
                            <SelectContent>
                              {users.filter(u => u.role === 'site_engineer' || u.role === 'procurement').map(u => (
                                <SelectItem key={u.user_id} value={u.user_id}>
                                  {u.name} ({u.role.replace('_', ' ')})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Due Date</Label>
                          <Input
                            data-testid="assignment-due-date"
                            type="date"
                            value={assignmentFormData.due_date}
                            onChange={(e) => setAssignmentFormData({...assignmentFormData, due_date: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Priority</Label>
                          <Select
                            value={assignmentFormData.priority}
                            onValueChange={(value) => setAssignmentFormData({...assignmentFormData, priority: value})}
                          >
                            <SelectTrigger data-testid="assignment-priority-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input
                            data-testid="assignment-notes-input"
                            value={assignmentFormData.notes}
                            onChange={(e) => setAssignmentFormData({...assignmentFormData, notes: e.target.value})}
                            placeholder="Optional notes..."
                          />
                        </div>
                        <Button data-testid="submit-assignment-btn" type="submit" className="w-full">Assign Work Order</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">WORK ORDER</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ASSIGNED TO</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DUE DATE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PRIORITY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">STATUS</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">NOTES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {assignments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                          No work order assignments yet
                        </td>
                      </tr>
                    ) : (
                      assignments.map((assignment) => (
                        <tr key={assignment.assignment_id} data-testid={`assignment-row-${assignment.assignment_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium">{getWorkOrderInfo(assignment.work_order_id)}</td>
                          <td className="px-6 py-4">{getUserName(assignment.assigned_to_user_id)}</td>
                          <td className="px-6 py-4">{new Date(assignment.due_date).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <Badge variant={
                              assignment.priority === 'urgent' ? 'destructive' :
                              assignment.priority === 'high' ? 'default' :
                              'secondary'
                            }>
                              {assignment.priority}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline">{assignment.status}</Badge>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{assignment.notes || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* BOQ Tab */}
            <TabsContent value="boq" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Bill of Quantities</h3>
                  <p className="text-sm text-gray-500">Project budget breakdown</p>
                </div>
                <Button
                  data-testid="manage-boq-btn"
                  variant="outline"
                  onClick={() => window.location.href = `/boq/${projectId}`}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />Manage BOQ
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ITEM</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CATEGORY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">QUANTITY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">UNIT RATE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {boqItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                          No BOQ items defined yet
                        </td>
                      </tr>
                    ) : (
                      boqItems.map((item) => (
                        <tr key={item.boq_id} data-testid={`boq-row-${item.boq_id}`} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-medium">{item.item_name}</td>
                          <td className="px-6 py-4"><Badge variant="outline">{item.category}</Badge></td>
                          <td className="px-6 py-4">{item.quantity} {item.unit}</td>
                          <td className="px-6 py-4">₹{item.unit_rate.toLocaleString()}</td>
                          <td className="px-6 py-4 font-semibold">₹{item.total_cost.toLocaleString()}</td>
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
    </div>
  );
}
