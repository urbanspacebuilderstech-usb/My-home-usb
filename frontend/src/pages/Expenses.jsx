import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Plus, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Expenses() {
  const [user, setUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('all');
  const [formData, setFormData] = useState({
    project_id: '',
    category: 'Material',
    amount: '',
    description: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, expensesRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/expenses`),
        axios.get(`${API}/projects`)
      ]);
      setUser(userRes.data);
      setExpenses(expensesRes.data);
      setProjects(projectsRes.data);
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

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses`, {
        project_id: formData.project_id,
        category: formData.category,
        amount: parseFloat(formData.amount),
        description: formData.description
      });
      toast.success('Expense added successfully');
      setDialogOpen(false);
      setFormData({ project_id: '', category: 'Material', amount: '', description: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add expense');
    }
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.project_id === projectId);
    return project?.name || projectId;
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canAddExpense = user.role === 'accountant' || user.role === 'super_admin';
  
  const filteredExpenses = selectedProject === 'all' 
    ? expenses 
    : expenses.filter(e => e.project_id === selectedProject);

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const materialExpenses = filteredExpenses.filter(e => e.category === 'Material').reduce((sum, e) => sum + (e.amount || 0), 0);
  const labourExpenses = filteredExpenses.filter(e => e.category === 'Labour').reduce((sum, e) => sum + (e.amount || 0), 0);

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
            <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/projects'}>
              Projects
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 data-testid="expenses-title" className="text-3xl font-bold text-gray-900">Overall Expenses</h2>
            <p className="text-gray-600 mt-1">Track and manage all project expenses</p>
          </div>
          {canAddExpense && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-expense-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4" />Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Expense</DialogTitle>
                  <DialogDescription>Record a new expense entry</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddExpense} className="space-y-4">
                  <div>
                    <Label>Project</Label>
                    <Select
                      value={formData.project_id}
                      onValueChange={(v) => setFormData({...formData, project_id: v})}
                    >
                      <SelectTrigger data-testid="expense-project-select">
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
                    <Label>Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(v) => setFormData({...formData, category: v})}
                    >
                      <SelectTrigger data-testid="expense-category-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Material">Material</SelectItem>
                        <SelectItem value="Labour">Labour</SelectItem>
                        <SelectItem value="Transport">Transport</SelectItem>
                        <SelectItem value="Machinery">Machinery</SelectItem>
                        <SelectItem value="Overhead">Overhead</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input
                      data-testid="expense-amount-input"
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      data-testid="expense-desc-input"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Brief description of the expense"
                      required
                    />
                  </div>
                  <Button data-testid="submit-expense-btn" type="submit" className="w-full">Add Expense</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-orange-700">₹{(totalExpenses / 100000).toFixed(2)}L</div>
                <TrendingDown className="h-6 w-6 text-orange-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Material</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">₹{(materialExpenses / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Labour</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">₹{(labourExpenses / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-700">{filteredExpenses.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger data-testid="filter-project-select" className="w-64">
              <SelectValue placeholder="Filter by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Expenses Table */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Records</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                        No expenses recorded yet
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((expense) => (
                      <tr key={expense.expense_id} data-testid={`expense-row-${expense.expense_id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-600">
                          {new Date(expense.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 font-medium">{getProjectName(expense.project_id)}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{expense.category}</Badge>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{expense.description}</td>
                        <td className="px-6 py-4 font-semibold text-orange-600">₹{expense.amount.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
