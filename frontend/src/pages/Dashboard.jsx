import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, TrendingUp, TrendingDown, DollarSign, Users, FileText, Menu, LogOut, Plus, UserPlus, Truck, Briefcase, Bell, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchUser();
    fetchDashboardData();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const userRes = await axios.get(`${API}/auth/me`);
      const userData = userRes.data;
      setUser(userData);

      // Fetch projects
      const projectsRes = await axios.get(`${API}/projects`);
      setProjects(projectsRes.data);

      // Fetch all work orders
      const woRes = await axios.get(`${API}/work-orders`);
      setWorkOrders(woRes.data);
      
      // Get pending work orders (waiting for approval)
      const pending = woRes.data.filter(wo => wo.status === 'submitted');
      setPendingApprovals(pending);

      // Fetch notifications
      const notifsRes = await axios.get(`${API}/notifications`);
      setRecentNotifications(notifsRes.data.slice(0, 10)); // Get latest 10

      if (userData.role === 'super_admin') {
        const response = await axios.get(`${API}/dashboards/super-admin`);
        setDashboardData(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
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

  const handleApprove = async (workOrderId) => {
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/approve`);
      toast.success('Work order approved');
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to approve work order');
    }
  };

  const handleReject = async (workOrderId) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    try {
      await axios.patch(`${API}/work-orders/${workOrderId}/reject?reason=${encodeURIComponent(reason)}`);
      toast.success('Work order rejected');
      fetchDashboardData();
    } catch (error) {
      toast.error('Failed to reject work order');
    }
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.project_id === projectId);
    return project?.name || projectId;
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canApprove = user.role === 'super_admin' || user.role === 'accountant';

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
              className="text-blue-600 font-semibold"
            >
              Dashboard
            </Button>
            <Button
              data-testid="financial-btn"
              variant="ghost"
              onClick={() => window.location.href = '/financial-overview'}
            >
              Financial Overview
            </Button>
            <Button
              data-testid="expenses-btn"
              variant="ghost"
              onClick={() => window.location.href = '/expenses'}
            >
              Overall Expenses
            </Button>
            <Button
              data-testid="notifications-btn"
              variant="ghost"
              onClick={() => window.location.href = '/notifications'}
              className="relative"
            >
              <Bell className="h-5 w-5" />
              {recentNotifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {recentNotifications.filter(n => !n.read).length}
                </span>
              )}
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
        <div className="mb-8">
          <h2 data-testid="dashboard-title" className="text-3xl font-bold text-gray-900 mb-2">
            Dashboard
          </h2>
          <p className="text-gray-600">Overview of all your construction projects</p>
        </div>

        {/* Pending Approvals Alert */}
        {pendingApprovals.length > 0 && canApprove && (
          <Card className="mb-6 border-yellow-300 bg-yellow-50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <AlertTriangle className="h-5 w-5" />
                {pendingApprovals.length} Work Order(s) Waiting for Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => window.location.href = '/approvals'}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Review Approvals
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="bg-white border border-gray-200">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="approvals">
              Pending Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="destructive" className="ml-2">{pendingApprovals.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="notifications">
              Notifications
              {recentNotifications.filter(n => !n.read).length > 0 && (
                <Badge variant="destructive" className="ml-2">{recentNotifications.filter(n => !n.read).length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            {user.role === 'super_admin' && dashboardData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card data-testid="total-revenue-card" className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold text-gray-900">
                        ₹{(dashboardData.total_project_value / 100000).toFixed(1)}L
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="total-expenses-card" className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold text-gray-900">
                        ₹{(dashboardData.total_spent / 100000).toFixed(1)}L
                      </div>
                      <TrendingDown className="h-8 w-8 text-orange-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="pending-approvals-card" className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Pending Approvals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold text-yellow-700">{pendingApprovals.length}</div>
                      <Clock className="h-8 w-8 text-yellow-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="net-profit-card" className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Net Profit</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold text-gray-900">
                        ₹{(dashboardData.balance / 100000).toFixed(1)}L
                      </div>
                      <DollarSign className="h-8 w-8 text-emerald-600" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    data-testid="quick-new-project"
                    onClick={() => window.location.href = '/projects'}
                    className="flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-8 w-8 mb-2" />
                    <span className="font-semibold">New Project</span>
                  </button>

                  <button
                    data-testid="quick-approvals"
                    onClick={() => window.location.href = '/approvals'}
                    className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors relative"
                  >
                    <Clock className="h-8 w-8 mb-2 text-yellow-600" />
                    <span className="font-semibold">Approvals</span>
                    {pendingApprovals.length > 0 && (
                      <Badge variant="destructive" className="absolute top-2 right-2">
                        {pendingApprovals.length}
                      </Badge>
                    )}
                  </button>

                  <button
                    data-testid="quick-add-vendor"
                    onClick={() => window.location.href = '/procurement'}
                    className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Truck className="h-8 w-8 mb-2 text-blue-600" />
                    <span className="font-semibold">Add Vendor</span>
                    <span className="text-xs text-gray-500 mt-1">Manage suppliers</span>
                  </button>

                  <button
                    data-testid="quick-work-orders"
                    onClick={() => window.location.href = '/work-orders'}
                    className="flex flex-col items-center justify-center p-6 border-2 border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="h-8 w-8 mb-2 text-blue-600" />
                    <span className="font-semibold">Work Orders</span>
                    <span className="text-xs text-gray-500 mt-1">{workOrders.length} total</span>
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-bold">All Projects</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project Name</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Value</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Received</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Spent</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {projects.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                            No projects found
                          </td>
                        </tr>
                      ) : (
                        projects.map((project) => (
                          <tr
                            key={project.project_id}
                            data-testid={`project-row-${project.project_id}`}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <div className="font-semibold text-gray-900">{project.name}</div>
                                <div className="text-sm text-gray-500">{project.client_name}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-semibold text-gray-900">
                              ₹{(project.total_value / 100000).toFixed(2)}L
                            </td>
                            <td className="px-6 py-4 text-gray-700">₹0</td>
                            <td className="px-6 py-4 text-gray-700">₹0</td>
                            <td className="px-6 py-4 font-semibold text-gray-900">
                              ₹{(project.total_value / 100000).toFixed(2)}L
                            </td>
                            <td className="px-6 py-4">
                              <Badge 
                                variant={project.status === 'active' ? 'default' : 'secondary'}
                                className="capitalize"
                              >
                                {project.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <Button
                                data-testid={`view-project-${project.project_id}`}
                                variant="outline"
                                size="sm"
                                onClick={() => window.location.href = `/projects/${project.project_id}`}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Approvals Tab */}
          <TabsContent value="approvals" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  Work Orders Waiting for Approval
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Order</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Purpose</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Est. Cost</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Submitted</th>
                        {canApprove && <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pendingApprovals.length === 0 ? (
                        <tr>
                          <td colSpan={canApprove ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
                            No pending approvals
                          </td>
                        </tr>
                      ) : (
                        pendingApprovals.map((wo) => (
                          <tr key={wo.work_order_id} data-testid={`pending-wo-${wo.work_order_id}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-semibold text-blue-600">{wo.work_order_id}</td>
                            <td className="px-6 py-4">{getProjectName(wo.project_id)}</td>
                            <td className="px-6 py-4 max-w-xs truncate">{wo.purpose}</td>
                            <td className="px-6 py-4">{wo.requested_quantity}</td>
                            <td className="px-6 py-4 font-semibold">₹{wo.estimated_cost?.toLocaleString() || 0}</td>
                            <td className="px-6 py-4 text-gray-500 text-sm">
                              {new Date(wo.created_at).toLocaleDateString()}
                            </td>
                            {canApprove && (
                              <td className="px-6 py-4">
                                <div className="flex gap-2">
                                  <Button
                                    data-testid={`approve-${wo.work_order_id}`}
                                    size="sm"
                                    className="gap-1 bg-green-600 hover:bg-green-700"
                                    onClick={() => handleApprove(wo.work_order_id)}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    Approve
                                  </Button>
                                  <Button
                                    data-testid={`reject-${wo.work_order_id}`}
                                    size="sm"
                                    variant="destructive"
                                    className="gap-1"
                                    onClick={() => handleReject(wo.work_order_id)}
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Reject
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-blue-600" />
                  Recent Notifications
                </CardTitle>
                <Button variant="outline" onClick={() => window.location.href = '/notifications'}>
                  View All
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {recentNotifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Bell className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    No notifications yet
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {recentNotifications.map((notif) => (
                      <div
                        key={notif.notification_id}
                        data-testid={`notif-${notif.notification_id}`}
                        className={`p-4 flex items-start gap-4 hover:bg-gray-50 ${!notif.read ? 'bg-blue-50' : ''}`}
                      >
                        <div className={`p-2 rounded-full ${!notif.read ? 'bg-blue-100' : 'bg-gray-100'}`}>
                          <Bell className={`h-5 w-5 ${!notif.read ? 'text-blue-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">{notif.title}</h4>
                              <p className="text-gray-600 mt-1">{notif.message}</p>
                            </div>
                            {!notif.read && (
                              <Badge variant="default" className="bg-blue-600">New</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm text-gray-400">
                              {new Date(notif.created_at).toLocaleString()}
                            </span>
                            {notif.link && (
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 h-auto text-blue-600"
                                onClick={() => window.location.href = notif.link}
                              >
                                View Details
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
