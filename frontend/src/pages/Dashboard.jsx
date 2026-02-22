import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Building2, LogOut, Plus, Bell, TrendingUp, TrendingDown, DollarSign, 
  Wallet, Users, FileText, Eye, MinusCircle, CheckCircle, AlertTriangle
} from 'lucide-react';
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

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [createProjectDialog, setCreateProjectDialog] = useState(false);
  
  const [projectForm, setProjectForm] = useState({
    name: '',
    client_name: '',
    location: '',
    total_value: '',
    start_date: new Date().toISOString().split('T')[0],
    expected_completion: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
    status: 'planning'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      // Redirect Site Engineers to their dedicated board
      if (userRes.data.role === 'site_engineer') {
        window.location.href = '/site-engineer';
        return;
      }
      
      // Redirect Pre-Sales users to CRM Pre-Sales
      if (userRes.data.role === 'pre_sales') {
        window.location.href = '/crm-pre-sales';
        return;
      }
      
      // Redirect Sales users to CRM Sales
      if (userRes.data.role === 'sales') {
        window.location.href = '/crm-sales';
        return;
      }
      
      const [dashboardRes, notifsRes] = await Promise.all([
        axios.get(`${API}/admin/dashboard-summary`).catch(() => ({ data: null })),
        axios.get(`${API}/notifications`).catch(() => ({ data: [] }))
      ]);
      
      setDashboardData(dashboardRes.data);
      setNotifications(notifsRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      // Redirect to login if not authenticated
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
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

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/projects`, {
        name: projectForm.name,
        client_name: projectForm.client_name,
        location: projectForm.location,
        total_value: parseFloat(projectForm.total_value) || 0,
        start_date: projectForm.start_date,
        expected_completion: projectForm.expected_completion,
        status: projectForm.status
      });
      toast.success('Project/Client created successfully');
      setCreateProjectDialog(false);
      setProjectForm({ 
        name: '', 
        client_name: '', 
        location: '', 
        total_value: '', 
        start_date: new Date().toISOString().split('T')[0],
        expected_completion: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
        status: 'planning' 
      });
      fetchData();
    } catch (error) {
      toast.error('Failed to create project');
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Please login to continue</div>
      </div>
    );
  }

  // If not super admin, show basic dashboard
  if (user.role !== 'super_admin') {
    // Procurement role gets redirected to Procurement Board
    if (user.role === 'procurement') {
      window.location.href = '/procurement-board';
      return null;
    }
    
    // Site Engineer gets redirected to Site Engineer Dashboard
    if (user.role === 'site_engineer') {
      window.location.href = '/site-engineer';
      return null;
    }
    
    // CRO gets redirected to CRO Board
    if (user.role === 'cro') {
      window.location.href = '/cro-board';
      return null;
    }
    
    // Planning gets redirected to Planning Board
    if (user.role === 'planning') {
      window.location.href = '/planning-board';
      return null;
    }
    
    // Accountant gets redirected to Accounts Board
    if (user.role === 'accountant') {
      window.location.href = '/accounts-board';
      return null;
    }
    
    // General Manager gets redirected to Approvals
    if (user.role === 'general_manager') {
      window.location.href = '/approvals';
      return null;
    }
    
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg">
                <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-bold text-gray-900">ConstructionOS</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Project Management System</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/projects'}>Projects</Button>
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/work-orders'}>Work Orders</Button>
              <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 sm:h-10 sm:w-10">
                  <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            </div>
          </div>
        </nav>
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
          <h2 className="text-xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-4">Welcome, {user.name}</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-8">Access your assigned tasks from the navigation above.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow active:bg-gray-50" onClick={() => window.location.href = '/projects'}>
              <CardContent className="p-4 sm:p-6 text-center">
                <FileText className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-blue-600" />
                <h3 className="font-semibold text-sm sm:text-base">Projects</h3>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow active:bg-gray-50" onClick={() => window.location.href = '/work-orders'}>
              <CardContent className="p-4 sm:p-6 text-center">
                <CheckCircle className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-green-600" />
                <h3 className="font-semibold text-sm sm:text-base">Work Orders</h3>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow active:bg-gray-50" onClick={() => window.location.href = '/notifications'}>
              <CardContent className="p-4 sm:p-6 text-center">
                <Bell className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-4 text-orange-600" />
                <h3 className="font-semibold text-sm sm:text-base">Notifications</h3>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const totals = dashboardData?.totals || {};
  const projects = dashboardData?.projects || [];
  const unreadNotifs = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Super Admin Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4">
            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-blue-600 font-semibold">Dashboard</Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/projects'}>Projects</Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/income'}>Income</Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/expense-management'}>Expenses</Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/users'}>Users</Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/settings'}>Settings</Button>
            </div>
            
            {/* Notification & Profile */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = '/notifications'}
              className="relative h-8 w-8 sm:h-10 sm:w-10"
            >
              <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center text-[10px] sm:text-xs">
                  {unreadNotifs}
                </span>
              )}
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">SUPER ADMIN</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 sm:h-10 sm:w-10">
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation Links */}
        <div className="lg:hidden flex items-center gap-1 mt-3 pt-3 border-t overflow-x-auto pb-1 -mx-2 px-2">
          <Button variant="ghost" size="sm" className="text-blue-600 font-semibold flex-shrink-0 text-xs h-8">Dashboard</Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/projects'} className="flex-shrink-0 text-xs h-8">Projects</Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/income'} className="flex-shrink-0 text-xs h-8">Income</Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/expense-management'} className="flex-shrink-0 text-xs h-8">Expenses</Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/users'} className="flex-shrink-0 text-xs h-8">Users</Button>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/settings'} className="flex-shrink-0 text-xs h-8">Settings</Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header with Create Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-8">
          <div>
            <h2 data-testid="super-admin-title" className="text-xl sm:text-3xl font-bold text-gray-900">
              Super Admin View
            </h2>
            <p className="text-sm sm:text-base text-gray-600">Complete overview of all projects and finances</p>
          </div>
          <Dialog open={createProjectDialog} onOpenChange={setCreateProjectDialog}>
            <DialogTrigger asChild>
              <Button data-testid="create-project-btn" className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                <span className="sm:inline">Create Project</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project / Client</DialogTitle>
                <DialogDescription>Add a new project to the system</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <Label>Project Name</Label>
                  <Input
                    data-testid="project-name-input"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({...projectForm, name: e.target.value})}
                    placeholder="e.g., Vinoth Residence"
                    required
                  />
                </div>
                <div>
                  <Label>Client Name</Label>
                  <Input
                    data-testid="client-name-input"
                    value={projectForm.client_name}
                    onChange={(e) => setProjectForm({...projectForm, client_name: e.target.value})}
                    placeholder="e.g., Mr. Vinoth Kumar"
                    required
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    data-testid="location-input"
                    value={projectForm.location}
                    onChange={(e) => setProjectForm({...projectForm, location: e.target.value})}
                    placeholder="e.g., Chennai, Tamil Nadu"
                    required
                  />
                </div>
                <div>
                  <Label>Initial Project Value (₹)</Label>
                  <Input
                    data-testid="value-input"
                    type="number"
                    value={projectForm.total_value}
                    onChange={(e) => setProjectForm({...projectForm, total_value: e.target.value})}
                    placeholder="e.g., 5000000"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      data-testid="start-date-input"
                      type="date"
                      value={projectForm.start_date}
                      onChange={(e) => setProjectForm({...projectForm, start_date: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Expected Completion</Label>
                    <Input
                      data-testid="completion-date-input"
                      type="date"
                      value={projectForm.expected_completion}
                      onChange={(e) => setProjectForm({...projectForm, expected_completion: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={projectForm.status}
                    onValueChange={(value) => setProjectForm({...projectForm, status: value})}
                  >
                    <SelectTrigger data-testid="status-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button data-testid="submit-project-btn" type="submit" className="w-full">
                  Create Project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Section - 3 Card Groups */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
          {/* Project Value Card */}
          <Card className="border-2 border-blue-200">
            <CardHeader className="bg-blue-50 border-b pb-2 sm:pb-3 p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                Project Value
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b">
                <span className="text-xs sm:text-sm text-gray-600">Project Total</span>
                <span className="font-semibold text-sm sm:text-base text-blue-700">{formatCurrency(totals.project_total_value)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b">
                <span className="text-xs sm:text-sm text-gray-600">Addition Cost</span>
                <span className="font-semibold text-sm sm:text-base text-cyan-700">{formatCurrency(totals.project_addition_cost)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 bg-blue-50 px-2 rounded">
                <span className="font-bold text-xs sm:text-sm text-gray-800">Total</span>
                <span className="font-bold text-sm sm:text-base text-blue-700">{formatCurrency(totals.project_value_total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Income Card */}
          <Card className="border-2 border-green-200">
            <CardHeader className="bg-green-50 border-b pb-2 sm:pb-3 p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                Income
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b">
                <span className="text-xs sm:text-sm text-gray-600">Project Amount</span>
                <span className="font-semibold text-sm sm:text-base text-green-700">{formatCurrency(totals.income_project)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b">
                <span className="text-xs sm:text-sm text-gray-600">Additional</span>
                <span className="font-semibold text-sm sm:text-base text-green-700">{formatCurrency(totals.income_additional)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 bg-green-50 px-2 rounded">
                <span className="font-bold text-xs sm:text-sm text-gray-800">Total</span>
                <span className="font-bold text-sm sm:text-base text-green-700">{formatCurrency(totals.income_total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Balance Card */}
          <Card className="border-2 border-red-200 md:col-span-2 lg:col-span-1">
            <CardHeader className="bg-red-50 border-b pb-2 sm:pb-3 p-3 sm:p-6">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
                Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b">
                <span className="text-xs sm:text-sm text-gray-600">Project Balance</span>
                <span className="font-semibold text-sm sm:text-base text-red-700">{formatCurrency(totals.balance_project)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 border-b">
                <span className="text-xs sm:text-sm text-gray-600">Additional</span>
                <span className="font-semibold text-sm sm:text-base text-red-700">{formatCurrency(totals.balance_additional)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 sm:py-2 bg-red-50 px-2 rounded">
                <span className="font-bold text-xs sm:text-sm text-gray-800">Grand Total</span>
                <span className="font-bold text-sm sm:text-base text-red-700">{formatCurrency(totals.balance_grand_total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expense & Cash Bar */}
        <Card className="mb-4 sm:mb-8 border-2 border-orange-200">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              <div className="bg-orange-50 p-2 sm:p-4 rounded-lg text-center">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">Total Expense</p>
                <p className="text-base sm:text-xl font-bold text-orange-700">{formatCurrency(totals.total_expense)}</p>
              </div>
              <div className="bg-gray-100 p-2 sm:p-4 rounded-lg text-center">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">X Amount</p>
                <p className="text-base sm:text-xl font-bold text-gray-700">-</p>
              </div>
              <div className="bg-purple-50 p-2 sm:p-4 rounded-lg text-center">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">Cash in Book</p>
                <p className={`text-base sm:text-xl font-bold ${totals.cash_in_book >= 0 ? 'text-purple-700' : 'text-red-700'}`}>
                  {formatCurrency(totals.cash_in_book)}
                </p>
              </div>
              <div className="bg-gray-100 p-2 sm:p-4 rounded-lg text-center">
                <p className="text-xs sm:text-sm text-gray-600 mb-1">Y Amount</p>
                <p className="text-base sm:text-xl font-bold text-gray-700">-</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        <Card>
          <CardHeader className="border-b flex flex-row items-center justify-between p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
              All Projects ({projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile Card View */}
            <div className="block sm:hidden divide-y divide-gray-200">
              {projects.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No projects yet. Click "Create Project" to add one.
                </div>
              ) : (
                projects.map((project, index) => (
                  <div 
                    key={project.project_id}
                    data-testid={`project-card-mobile-${project.project_id}`}
                    className="p-4 active:bg-gray-50 cursor-pointer"
                    onClick={() => window.location.href = `/projects/${project.project_id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{project.name}</p>
                        <p className="text-xs text-gray-500">{project.client_name} • {project.location}</p>
                      </div>
                      <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                        {project.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <p className="text-xs text-gray-500">Value</p>
                        <p className="text-sm font-semibold text-blue-600">{formatCurrency(project.total_value)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Income</p>
                        <p className="text-sm font-semibold text-green-600">{formatCurrency(project.income_received)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Balance</p>
                        <p className="text-sm font-semibold text-red-600">{formatCurrency(project.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Value</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                        No projects yet. Click "Create Project" to add one.
                      </td>
                    </tr>
                  ) : (
                    projects.map((project, index) => (
                      <tr 
                        key={project.project_id} 
                        data-testid={`project-row-${project.project_id}`}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => window.location.href = `/projects/${project.project_id}`}
                      >
                        <td className="px-4 py-4 text-sm">{index + 1}</td>
                        <td className="px-4 py-4">
                          <span className="font-medium">{project.name}</span>
                          <p className="text-xs text-gray-500">{project.location}</p>
                        </td>
                        <td className="px-4 py-4 text-sm">{project.client_name}</td>
                        <td className="px-4 py-4 text-right font-semibold text-blue-600">
                          {formatCurrency(project.total_value)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-green-600">
                          {formatCurrency(project.income_received)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-red-600">
                          {formatCurrency(project.balance)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Badge variant={
                            project.status === 'active' ? 'default' :
                            project.status === 'completed' ? 'secondary' :
                            'outline'
                          }>
                            {project.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/projects/${project.project_id}`;
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* View All Projects Button */}
            <div className="p-3 sm:p-4 border-t text-center">
              <Button 
                data-testid="view-all-projects-btn"
                variant="outline"
                onClick={() => window.location.href = '/projects'}
                className="w-full sm:w-auto"
              >
                View All Projects
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
