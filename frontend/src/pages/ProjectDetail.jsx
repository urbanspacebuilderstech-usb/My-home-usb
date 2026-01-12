import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Building2, LogOut, ArrowLeft, Plus, Edit, FileText } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('payments');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [userRes, projRes, paymentsRes, expensesRes, boqRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects/${projectId}`),
        axios.get(`${API}/payments?project_id=${projectId}`),
        axios.get(`${API}/expenses?project_id=${projectId}`),
        axios.get(`${API}/boq/${projectId}`)
      ]);
      setUser(userRes.data);
      setProject(projRes.data);
      setPayments(paymentsRes.data || []);
      setExpenses(expensesRes.data || []);
      setBoqItems(boqRes.data || []);
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

  if (!user || !project) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const balance = project.total_value - totalPaid;
  const boqTotal = boqItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Agreement Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                ₹{(project.total_value / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-700">
                ₹{(totalPaid / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Spent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-700">
                ₹{(totalSpent / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Balance Due</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-700">
                ₹{(balance / 100000).toFixed(2)}L
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b">
              <TabsList className="bg-transparent border-0 p-0 h-auto">
                <TabsTrigger 
                  value="payments" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-6"
                >
                  Payments
                </TabsTrigger>
                <TabsTrigger 
                  value="expenses"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-6"
                >
                  Expenses
                </TabsTrigger>
                <TabsTrigger 
                  value="additional"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-6"
                >
                  Additional Cost
                </TabsTrigger>
                <TabsTrigger 
                  value="other"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-6"
                >
                  Other Than Scope
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="payments" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Payments Received</h3>
                <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
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
                          type="number"
                          value={paymentFormData.amount}
                          onChange={(e) => setPaymentFormData({...paymentFormData, amount: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={paymentFormData.payment_date}
                          onChange={(e) => setPaymentFormData({...paymentFormData, payment_date: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={paymentFormData.description}
                          onChange={(e) => setPaymentFormData({...paymentFormData, description: e.target.value})}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full">Add Payment</Button>
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
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                          No payments recorded yet
                        </td>
                      </tr>
                    ) : (
                      payments.map((payment) => (
                        <tr key={payment.payment_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">{new Date(payment.payment_date).toLocaleDateString()}</td>
                          <td className="px-6 py-4"><Badge variant="outline">Advance</Badge></td>
                          <td className="px-6 py-4">Bank Transfer</td>
                          <td className="px-6 py-4 font-semibold text-green-600">₹{payment.amount.toLocaleString()}</td>
                          <td className="px-6 py-4 text-gray-600">{payment.description}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <Button variant="ghost" size="icon"><FileText className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="expenses" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Project Expenses</h3>
                <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
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
                          <SelectTrigger>
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
                          type="number"
                          value={expenseFormData.amount}
                          onChange={(e) => setExpenseFormData({...expenseFormData, amount: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={expenseFormData.description}
                          onChange={(e) => setExpenseFormData({...expenseFormData, description: e.target.value})}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full">Add Expense</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DATE</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CATEGORY</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">DESCRIPTION</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">AMOUNT</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                          No expenses recorded yet
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
                        <tr key={expense.expense_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">{new Date(expense.created_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4"><Badge>{expense.category}</Badge></td>
                          <td className="px-6 py-4 text-gray-600">{expense.description}</td>
                          <td className="px-6 py-4 font-semibold text-orange-600">₹{expense.amount.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="additional" className="p-6">
              <div className="py-12 text-center text-gray-500">
                <p>Additional cost tracking coming soon...</p>
              </div>
            </TabsContent>

            <TabsContent value="other" className="p-6">
              <div className="py-12 text-center text-gray-500">
                <p>Other than scope items will appear here...</p>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
