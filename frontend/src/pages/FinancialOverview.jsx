import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  LogOut,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Wallet,
  PiggyBank,
  Receipt,
  ChevronRight,
  Edit2,
  Save,
  X,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  planning: { label: 'Planning', color: 'bg-gray-500', bgLight: 'bg-gray-100' },
  documentation: { label: 'Documentation', color: 'bg-orange-500', bgLight: 'bg-orange-50' },
  sub_structure: { label: 'Sub-Structure', color: 'bg-yellow-500', bgLight: 'bg-yellow-50' },
  super_structure: { label: 'Super-Structure', color: 'bg-amber-500', bgLight: 'bg-amber-50' },
  finishing: { label: 'Finishing', color: 'bg-purple-500', bgLight: 'bg-purple-50' },
  handover: { label: 'Handover', color: 'bg-teal-500', bgLight: 'bg-teal-50' },
  active: { label: 'Active', color: 'bg-green-500', bgLight: 'bg-green-50' },
  completed: { label: 'Completed', color: 'bg-emerald-600', bgLight: 'bg-emerald-50' }
};

const formatCurrency = (value) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)} K`;
  return `₹${value.toLocaleString()}`;
};

const formatFullCurrency = (value) => `₹${value.toLocaleString()}`;

export default function FinancialOverview() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      const [userRes, financialRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/admin/financial-overview`)
      ]);
      setUser(userRes.data);
      setData(financialRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 403) {
        toast.error('Super Admin access required');
        window.location.href = '/dashboard';
      }
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

  const openEditDialog = (project) => {
    setEditingProject(project);
    setFormData({
      status: project.status,
      project_value: project.project_value,
      additional_cost: project.additional_cost,
      income_project: project.income_project,
      income_additional: project.income_additional,
      total_expense: project.total_expense
    });
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      await axios.patch(`${API}/projects/${editingProject.project_id}`, {
        status: formData.status,
        total_value: parseFloat(formData.project_value) || 0,
        additional_cost: parseFloat(formData.additional_cost) || 0,
        income_project: parseFloat(formData.income_project) || 0,
        income_additional: parseFloat(formData.income_additional) || 0,
        total_expense: parseFloat(formData.total_expense) || 0
      });
      toast.success('Project updated successfully');
      setEditDialogOpen(false);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to update project');
    }
  };

  const calculateValues = (p) => {
    const valueTotal = p.project_value + p.additional_cost;
    const incomeTotal = p.income_project + p.income_additional;
    const balanceTotal = valueTotal - incomeTotal;
    const cashInBook = incomeTotal - p.total_expense;
    const collectionProgress = valueTotal > 0 ? (incomeTotal / valueTotal) * 100 : 0;
    return { valueTotal, incomeTotal, balanceTotal, cashInBook, collectionProgress };
  };

  if (!user || !data) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const summary = data.summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">Financial Overview</h2>
          <p className="text-gray-600 mt-1">Complete financial snapshot of all projects</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-gray-700 to-gray-800 text-white border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-100 flex items-center gap-2">
                <IndianRupee className="h-4 w-4" />
                Total Project Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary.total_value)}</div>
              <p className="text-blue-200 text-sm mt-1">Across {data.projects.length} projects</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-100 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary.total_income)}</div>
              <p className="text-green-200 text-sm mt-1">
                {summary.total_value > 0 ? Math.round((summary.total_income / summary.total_value) * 100) : 0}% collected
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-100 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Total Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary.total_expense)}</div>
              <p className="text-orange-200 text-sm mt-1">All project expenses</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-100 flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Balance Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary.total_balance)}</div>
              <p className="text-purple-200 text-sm mt-1">Pending collection</p>
            </CardContent>
          </Card>

          <Card className={`border-0 shadow-lg ${summary.total_cash_in_book >= 0 ? 'bg-gradient-to-br from-teal-500 to-teal-600' : 'bg-gradient-to-br from-red-500 to-red-600'} text-white`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium flex items-center gap-2 ${summary.total_cash_in_book >= 0 ? 'text-teal-100' : 'text-red-100'}`}>
                <Wallet className="h-4 w-4" />
                Cash in Book
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(Math.abs(summary.total_cash_in_book))}</div>
              <p className={`text-sm mt-1 ${summary.total_cash_in_book >= 0 ? 'text-teal-200' : 'text-red-200'}`}>
                {summary.total_cash_in_book >= 0 ? 'Available funds' : 'Deficit'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Projects Grid */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">Project Breakdown</h3>
          <Button 
            onClick={() => window.location.href = '/projects'}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.projects.map((project) => {
            const calc = calculateValues(project);
            const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.planning;
            
            return (
              <Card key={project.project_id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className={`h-2 ${statusConfig.color}`} />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {project.name}
                        <Badge className={`${statusConfig.color} text-white text-xs`}>
                          {statusConfig.label}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">{project.project_id}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => openEditDialog(project)}
                      className="text-gray-400 hover:text-amber-600"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Project Value */}
                  <div className="grid grid-cols-3 gap-4 p-3 bg-yellow-50 rounded-lg">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Project Value</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(project.project_value)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Additional</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(project.additional_cost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Total Value</p>
                      <p className="font-bold text-yellow-700">{formatCurrency(calc.valueTotal)}</p>
                    </div>
                  </div>

                  {/* Collection Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Collection Progress</span>
                      <span className="text-sm font-semibold text-green-600">{Math.round(calc.collectionProgress)}%</span>
                    </div>
                    <Progress value={calc.collectionProgress} className="h-2" />
                  </div>

                  {/* Financial Metrics */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-gray-500">Income Received</span>
                      </div>
                      <p className="font-bold text-green-700">{formatCurrency(calc.incomeTotal)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Project: {formatCurrency(project.income_project)} + Add: {formatCurrency(project.income_additional)}
                      </p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Receipt className="h-4 w-4 text-amber-600" />
                        <span className="text-xs text-gray-500">Balance Due</span>
                      </div>
                      <p className="font-bold text-amber-700">{formatCurrency(calc.balanceTotal)}</p>
                      <p className="text-xs text-gray-500 mt-1">Pending collection</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        <span className="text-xs text-gray-500">Total Expenses</span>
                      </div>
                      <p className="font-bold text-red-700">{formatCurrency(project.total_expense)}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${calc.cashInBook >= 0 ? 'bg-teal-50' : 'bg-red-100'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Wallet className={`h-4 w-4 ${calc.cashInBook >= 0 ? 'text-teal-600' : 'text-red-600'}`} />
                        <span className="text-xs text-gray-500">Cash in Book</span>
                      </div>
                      <p className={`font-bold ${calc.cashInBook >= 0 ? 'text-teal-700' : 'text-red-700'}`}>
                        {calc.cashInBook >= 0 ? '' : '-'}{formatCurrency(Math.abs(calc.cashInBook))}
                      </p>
                    </div>
                  </div>

                  {/* View Details Button */}
                  <Button 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => window.location.href = `/projects/${project.project_id}`}
                  >
                    View Project Details
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Financial Data</DialogTitle>
            <DialogDescription>{editingProject?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Project Value (₹)</Label>
                <NumericInput
                  
                  value={formData.project_value}
                  onChange={(e) => setFormData({...formData, project_value: e.target.value})}
                />
              </div>
              <div>
                <Label>Additional Cost (₹)</Label>
                <NumericInput
                  
                  value={formData.additional_cost}
                  onChange={(e) => setFormData({...formData, additional_cost: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Income - Project (₹)</Label>
                <NumericInput
                  
                  value={formData.income_project}
                  onChange={(e) => setFormData({...formData, income_project: e.target.value})}
                />
              </div>
              <div>
                <Label>Income - Additional (₹)</Label>
                <NumericInput
                  
                  value={formData.income_additional}
                  onChange={(e) => setFormData({...formData, income_additional: e.target.value})}
                />
              </div>
            </div>

            <div>
              <Label>Total Expenses (₹)</Label>
              <NumericInput
                
                value={formData.total_expense}
                onChange={(e) => setFormData({...formData, total_expense: e.target.value})}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} className="flex-1 gap-2 bg-secondary hover:bg-secondary/90">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
