import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Plus, TrendingUp, DollarSign, Wallet, FileText, Eye, 
  Landmark, BookOpen, CreditCard, Banknote, Receipt
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '₹0';
  const num = Number(amount);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(2)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [createProjectDialog, setCreateProjectDialog] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: '', client_name: '', location: '', total_value: '',
    start_date: new Date().toISOString().split('T')[0],
    expected_completion: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
    status: 'planning'
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      if (userRes.data.role === 'site_engineer') { window.location.href = '/site-engineer'; return; }
      if (userRes.data.role === 'pre_sales') { window.location.href = '/crm-pre-sales'; return; }
      if (userRes.data.role === 'sales') { window.location.href = '/crm-sales'; return; }
      if (userRes.data.role === 'general_manager') { window.location.href = '/gm-dashboard'; return; }
      
      const [dashboardRes, notifsRes] = await Promise.all([
        axios.get(`${API}/admin/dashboard-summary`).catch(() => ({ data: null })),
        axios.get(`${API}/notifications`).catch(() => ({ data: [] }))
      ]);
      
      setDashboardData(dashboardRes.data);
      const notifs = notifsRes.data || [];
      setUnreadNotifs(notifs.filter(n => !n.read).length);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/projects`, {
        ...projectForm,
        total_value: Number(projectForm.total_value) || 0
      });
      toast.success('Project created successfully');
      setCreateProjectDialog(false);
      setProjectForm({ name: '', client_name: '', location: '', total_value: '',
        start_date: new Date().toISOString().split('T')[0],
        expected_completion: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
        status: 'planning'
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500 font-medium">Loading dashboard...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Please <a href="/login" className="text-amber-600 underline">login</a></p>
    </div>
  );

  const totals = dashboardData?.totals || {};
  const projects = dashboardData?.projects || [];

  return (
    <div className="min-h-screen bg-gray-50" data-testid="super-admin-dashboard">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />

      <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
        {/* Page Title + Create */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 data-testid="dashboard-title" className="text-xl sm:text-2xl font-bold text-gray-900">
              Project Finance Board
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Overview of all projects and finances</p>
          </div>
          <Dialog open={createProjectDialog} onOpenChange={setCreateProjectDialog}>
            <DialogTrigger asChild>
              <Button data-testid="create-project-btn" className="gap-1.5 bg-secondary hover:bg-secondary/90">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">New Project</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Add a new project to the system</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div><Label>Project Name</Label><Input data-testid="project-name-input" value={projectForm.name} onChange={(e) => setProjectForm({...projectForm, name: e.target.value})} placeholder="e.g., Vinoth Residence" required /></div>
                <div><Label>Client Name</Label><Input data-testid="client-name-input" value={projectForm.client_name} onChange={(e) => setProjectForm({...projectForm, client_name: e.target.value})} placeholder="e.g., Mr. Vinoth Kumar" required /></div>
                <div><Label>Location</Label><Input data-testid="location-input" value={projectForm.location} onChange={(e) => setProjectForm({...projectForm, location: e.target.value})} placeholder="e.g., Chennai" required /></div>
                <div><Label>Initial Project Value (₹)</Label><Input data-testid="value-input" type="number" value={projectForm.total_value} onChange={(e) => setProjectForm({...projectForm, total_value: e.target.value})} placeholder="e.g., 5000000" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Start Date</Label><Input data-testid="start-date-input" type="date" value={projectForm.start_date} onChange={(e) => setProjectForm({...projectForm, start_date: e.target.value})} required /></div>
                  <div><Label>Expected Completion</Label><Input data-testid="completion-date-input" type="date" value={projectForm.expected_completion} onChange={(e) => setProjectForm({...projectForm, expected_completion: e.target.value})} required /></div>
                </div>
                <div><Label>Status</Label>
                  <Select value={projectForm.status} onValueChange={(v) => setProjectForm({...projectForm, status: v})}>
                    <SelectTrigger data-testid="status-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button data-testid="submit-project-btn" type="submit" className="w-full">Create Project</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* ═══ Finance Summary Cards ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {/* Project Value */}
          <Card data-testid="card-project-value" className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-500 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-500" /> Project Value
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="flex justify-between py-1.5 border-b border-dashed border-gray-100">
                <span className="text-xs text-gray-500">Project Total</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(totals.project_total_value)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-dashed border-gray-100">
                <span className="text-xs text-gray-500">Addition Cost</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(totals.project_addition_cost)}</span>
              </div>
              <div className="flex justify-between py-1.5 bg-amber-50 px-2 -mx-2 rounded">
                <span className="text-xs font-bold text-amber-800">Total Value</span>
                <span className="text-sm font-extrabold text-amber-700">{formatCurrency(totals.project_value_total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Income */}
          <Card data-testid="card-income" className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-500 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" /> Income
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="flex justify-between py-1.5 border-b border-dashed border-gray-100">
                <span className="text-xs text-gray-500">Project Income</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(totals.income_project)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-dashed border-gray-100">
                <span className="text-xs text-gray-500">Additional Income</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(totals.income_additional)}</span>
              </div>
              <div className="flex justify-between py-1.5 bg-green-50 px-2 -mx-2 rounded">
                <span className="text-xs font-bold text-green-800">Total Income</span>
                <span className="text-sm font-extrabold text-green-700">{formatCurrency(totals.income_total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Balance */}
          <Card data-testid="card-balance" className="border-l-4 border-l-red-500">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-gray-500 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-red-500" /> Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="flex justify-between py-1.5 border-b border-dashed border-gray-100">
                <span className="text-xs text-gray-500">Project Balance</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(totals.balance_project)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-dashed border-gray-100">
                <span className="text-xs text-gray-500">Additional Balance</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(totals.balance_additional)}</span>
              </div>
              <div className="flex justify-between py-1.5 bg-red-50 px-2 -mx-2 rounded">
                <span className="text-xs font-bold text-red-800">Grand Total</span>
                <span className="text-sm font-extrabold text-red-700">{formatCurrency(totals.balance_grand_total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ Account View — Finance Summary ═══ */}
        <Card data-testid="card-account-view" className="mb-5">
          <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
            <CardTitle className="text-sm sm:text-base font-bold text-gray-800 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-gray-500" /> Account View
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-5 pb-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Total Income */}
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 sm:p-4" data-testid="account-total-income">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <span className="text-xs font-semibold text-green-700">Total Income</span>
                </div>
                <p className="text-lg sm:text-xl font-extrabold text-green-800">{formatCurrency(totals.income_total)}</p>
              </div>

              {/* Total Expense */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 sm:p-4" data-testid="account-total-expense">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                    <Receipt className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <span className="text-xs font-semibold text-orange-700">Total Expense</span>
                </div>
                <p className="text-lg sm:text-xl font-extrabold text-orange-800">{formatCurrency(totals.total_expense)}</p>
              </div>

              {/* Cash in Book */}
              <div className={`border rounded-xl p-3 sm:p-4 ${totals.cash_in_book >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`} data-testid="account-cash-in-book">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${totals.cash_in_book >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
                    <BookOpen className={`h-3.5 w-3.5 ${totals.cash_in_book >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
                  </div>
                  <span className={`text-xs font-semibold ${totals.cash_in_book >= 0 ? 'text-blue-700' : 'text-red-700'}`}>Cash in Book</span>
                </div>
                <p className={`text-lg sm:text-xl font-extrabold ${totals.cash_in_book >= 0 ? 'text-blue-800' : 'text-red-800'}`}>{formatCurrency(totals.cash_in_book)}</p>
              </div>

              {/* Mode of Amounts */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4" data-testid="account-modes">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                    <Banknote className="h-3.5 w-3.5 text-gray-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">Amount Modes</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Cash</span><span className="font-bold text-gray-700">-</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Bank</span><span className="font-bold text-gray-700">-</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">UPI</span><span className="font-bold text-gray-700">-</span></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ All Projects ═══ */}
        <Card data-testid="card-all-projects">
          <CardHeader className="border-b flex flex-row items-center justify-between py-3 px-4 sm:px-5">
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              All Projects ({projects.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/projects'} data-testid="view-all-projects-btn">
              View All
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile Cards */}
            <div className="block sm:hidden divide-y">
              {projects.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">No projects yet.</div>
              ) : projects.map((p) => (
                <div key={p.project_id} data-testid={`project-card-mobile-${p.project_id}`}
                  className="p-4 active:bg-gray-50 cursor-pointer"
                  onClick={() => window.location.href = `/projects/${p.project_id}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.client_name}</p>
                    </div>
                    <Badge variant={p.status === 'active' || p.status === 'in_progress' ? 'default' : 'secondary'} className="text-[10px]">{p.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><p className="text-[10px] text-gray-400">Value</p><p className="text-xs font-bold text-amber-600">{formatCurrency(p.total_value)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Income</p><p className="text-xs font-bold text-green-600">{formatCurrency(p.income_received)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Balance</p><p className="text-xs font-bold text-red-600">{formatCurrency(p.balance)}</p></div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Value</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Income</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Expense</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {projects.length === 0 ? (
                    <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400 text-sm">No projects yet.</td></tr>
                  ) : projects.map((p, i) => (
                    <tr key={p.project_id} data-testid={`project-row-${p.project_id}`}
                      className="hover:bg-gray-50/50 cursor-pointer" onClick={() => window.location.href = `/projects/${p.project_id}`}>
                      <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3"><span className="font-medium text-sm">{p.name}</span><p className="text-xs text-gray-400">{p.location}</p></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.client_name}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-amber-600">{formatCurrency(p.total_value)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{formatCurrency(p.income_received)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-orange-600">{formatCurrency(p.expenses)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{formatCurrency(p.balance)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.status === 'active' || p.status === 'in_progress' ? 'default' : p.status === 'completed' ? 'secondary' : 'outline'} className="text-[10px]">{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); window.location.href = `/projects/${p.project_id}`; }}>
                          <Eye className="h-3.5 w-3.5 mr-1" />View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <MobileBottomNav user={user} />
    </div>
  );
}
