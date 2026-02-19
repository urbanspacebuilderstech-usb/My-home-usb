import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { 
  ClipboardList, LogOut, FileText, Clock, CheckCircle, Briefcase,
  Eye, Send, Package, Users, Building2, ArrowRight, Check, X, DollarSign
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function PlanningBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('new');
  
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestsDialog, setRequestsDialog] = useState(false);
  
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, projectsRes, paymentReqRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/planning/dashboard`),
        axios.get(`${API}/planning/projects?status=new`),
        axios.get(`${API}/work-orders/payment-requests`).catch(() => ({ data: [] }))
      ]);
      
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only Planning can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setProjects(projectsRes.data);
      setPaymentRequests(paymentReqRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async (status) => {
    try {
      const res = await axios.get(`${API}/planning/projects?status=${status}`);
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    fetchProjects(tab);
  };

  const handleSubmitForApproval = async (projectId) => {
    try {
      await axios.patch(`${API}/planning/projects/${projectId}/submit-for-approval`);
      toast.success('Project submitted for GM/Admin approval');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit');
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const [materialRes, labourRes] = await Promise.all([
        axios.get(`${API}/material-requests?status=requested`).catch(() => ({ data: [] })),
        axios.get(`${API}/labour-expenses?status=requested`).catch(() => ({ data: [] }))
      ]);
      
      const requests = [
        ...materialRes.data.map(r => ({ ...r, type: 'material' })),
        ...labourRes.data.map(r => ({ ...r, type: 'labour' }))
      ];
      
      setPendingRequests(requests);
      setRequestsDialog(true);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleApproveRequest = async (request) => {
    try {
      const endpoint = request.type === 'material' 
        ? `${API}/material-requests/${request.request_id}/planning-action`
        : `${API}/labour-expenses/${request.expense_id}/planning-action`;
      
      await axios.patch(endpoint, null, { params: { action: 'approve' } });
      toast.success('Request approved');
      fetchPendingRequests();
      fetchData();
    } catch (error) {
      toast.error('Failed to approve');
    }
  };

  const handleRejectRequest = async (request, reason = 'Rejected by Planning') => {
    try {
      const endpoint = request.type === 'material' 
        ? `${API}/material-requests/${request.request_id}/planning-action`
        : `${API}/labour-expenses/${request.expense_id}/planning-action`;
      
      await axios.patch(endpoint, null, { params: { action: 'reject', reason } });
      toast.success('Request rejected');
      fetchPendingRequests();
      fetchData();
    } catch (error) {
      toast.error('Failed to reject');
    }
  };

  const handleApprovePayment = async (payment) => {
    try {
      await axios.patch(`${API}/work-orders/${payment.work_order_id}/stages/${payment.stage_id}/approve-payment`);
      toast.success('Payment approved - Sent to Accounts');
      fetchData();
    } catch (error) {
      toast.error('Failed to approve payment');
    }
  };

  const openRejectPaymentDialog = (payment) => {
    setSelectedPayment(payment);
    setRejectReason('');
    setRejectDialog(true);
  };

  const handleRejectPayment = async () => {
    if (!selectedPayment) return;
    
    try {
      await axios.patch(
        `${API}/work-orders/${selectedPayment.work_order_id}/stages/${selectedPayment.stage_id}/reject-payment`,
        null,
        { params: { reason: rejectReason || 'Work not verified' } }
      );
      toast.success('Payment rejected');
      setRejectDialog(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to reject payment');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (error) {
      console.error('Logout error:', error);
    }
    window.location.href = '/login';
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: 'Draft', variant: 'secondary' },
      planning_review: { label: 'New', variant: 'default' },
      awaiting_approval: { label: 'Awaiting Approval', variant: 'outline' },
      gm_approved: { label: 'GM Approved', variant: 'default' },
      planning_approved: { label: 'Approved', variant: 'default' },
      active: { label: 'Active', variant: 'default' },
      completed: { label: 'Completed', variant: 'secondary' }
    };
    const c = config[status] || { label: status, variant: 'secondary' };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold">Planning Board</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Project Planning & Execution Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/vendor-management'}>
              Vendors
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/materials'}>
              Materials
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500">PLANNING</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer" onClick={() => handleTabChange('new')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">New Projects</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{dashboard.new_projects || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 cursor-pointer" onClick={() => handleTabChange('awaiting')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-yellow-600 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Awaiting Approval</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-yellow-700">{dashboard.awaiting_approval || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 cursor-pointer" onClick={() => handleTabChange('working')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <Briefcase className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Working</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700">{dashboard.working_projects || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 cursor-pointer" onClick={() => handleTabChange('completed')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Completed</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-gray-700">{dashboard.completed_projects || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Requests Alert */}
        {(dashboard.pending_material_requests > 0 || dashboard.pending_labour_requests > 0) && (
          <Card className="bg-orange-50 border-orange-200 mb-6">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 p-2 rounded-full">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-orange-800">Pending Site Engineer Requests</p>
                  <p className="text-sm text-orange-600">
                    {dashboard.pending_material_requests || 0} material, {dashboard.pending_labour_requests || 0} labour
                  </p>
                </div>
              </div>
              <Button onClick={fetchPendingRequests} className="bg-orange-600 hover:bg-orange-700">
                Review Requests
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Payment Requests Alert */}
        {paymentRequests.length > 0 && (
          <Card className="bg-purple-50 border-purple-200 mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-purple-500 p-2 rounded-full">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-purple-800">Stage Payment Requests</p>
                  <p className="text-sm text-purple-600">
                    {paymentRequests.length} payment(s) awaiting verification
                  </p>
                </div>
              </div>
              <Button onClick={() => setPaymentDialog(true)} className="bg-purple-600 hover:bg-purple-700">
                Review Payments
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => window.location.href = '/materials'}>
            <Package className="h-5 w-5" />
            <span className="text-xs">Materials</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => window.location.href = '/vendor-management'}>
            <Building2 className="h-5 w-5" />
            <span className="text-xs">Vendors</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => window.location.href = '/labour-contractors'}>
            <Users className="h-5 w-5" />
            <span className="text-xs">Contractors</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1 bg-indigo-50 border-indigo-200" onClick={() => window.location.href = '/work-order-management'}>
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            <span className="text-xs font-medium">Work Orders</span>
          </Button>
        </div>

        {/* Projects Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <TabsList className="bg-transparent p-0 flex-wrap gap-1">
                <TabsTrigger value="new" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none text-xs sm:text-sm">
                  New Projects
                </TabsTrigger>
                <TabsTrigger value="awaiting" className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-600 rounded-none text-xs sm:text-sm">
                  Awaiting Approval
                </TabsTrigger>
                <TabsTrigger value="working" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none text-xs sm:text-sm">
                  Working
                </TabsTrigger>
                <TabsTrigger value="completed" className="data-[state=active]:border-b-2 data-[state=active]:border-gray-600 rounded-none text-xs sm:text-sm">
                  Completed
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-0">
              {/* Mobile Card View */}
              <div className="block sm:hidden divide-y">
                {projects.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No projects found</div>
                ) : (
                  projects.map((project) => (
                    <div key={project.project_id} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold">{project.name}</p>
                          <p className="text-sm text-gray-500">{project.client_name}</p>
                        </div>
                        {getStatusBadge(project.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>
                          <span className="text-gray-500">Package:</span>
                          <span className="ml-1">{project.package_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Sqft:</span>
                          <span className="ml-1">{project.sqft?.toLocaleString()}</span>
                        </div>
                        <div className="col-span-2 font-semibold text-green-600">
                          {formatCurrency(project.total_value)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => window.location.href = `/projects/${project.project_id}`}>
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Button>
                        {project.status === 'planning_review' && (
                          <Button size="sm" className="flex-1" onClick={() => handleSubmitForApproval(project.project_id)}>
                            <Send className="h-3 w-3 mr-1" /> Submit
                          </Button>
                        )}
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CLIENT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PACKAGE</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">SQFT</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">VALUE</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {projects.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500">No projects found</td>
                      </tr>
                    ) : (
                      projects.map((project) => (
                        <tr key={project.project_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-gray-500">{project.location}</p>
                          </td>
                          <td className="px-4 py-3">{project.client_name}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{project.package_name || 'N/A'}</Badge>
                          </td>
                          <td className="px-4 py-3">{project.sqft?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-600">
                            {formatCurrency(project.total_value)}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(project.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => window.location.href = `/projects/${project.project_id}`}>
                                <Eye className="h-3 w-3 mr-1" /> Edit
                              </Button>
                              {project.status === 'planning_review' && (
                                <Button size="sm" onClick={() => handleSubmitForApproval(project.project_id)}>
                                  <Send className="h-3 w-3 mr-1" /> Submit
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Pending Requests Dialog */}
      <Dialog open={requestsDialog} onOpenChange={setRequestsDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pending Site Engineer Requests</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {pendingRequests.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No pending requests</p>
            ) : (
              pendingRequests.map((req) => (
                <Card key={req.request_id || req.expense_id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge variant={req.type === 'material' ? 'default' : 'secondary'} className="mb-2">
                          {req.type === 'material' ? 'Material' : 'Labour'}
                        </Badge>
                        <p className="font-semibold">{req.material_name || req.labour_type}</p>
                        <p className="text-sm text-gray-500">
                          {req.type === 'material' 
                            ? `Qty: ${req.quantity} ${req.unit}` 
                            : `Workers: ${req.workers_count}, Days: ${req.days}`}
                        </p>
                        <p className="text-xs text-gray-400">Project: {req.project_name}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveRequest(req)}>
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleRejectRequest(req)}>
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Requests Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stage Payment Requests</DialogTitle>
            <DialogDescription>Verify work completion and approve payments</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {paymentRequests.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No pending payment requests</p>
            ) : (
              paymentRequests.map((req, idx) => (
                <Card key={idx} className="border-l-4 border-l-purple-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold">{req.work_order_number}</span>
                          <Badge variant="secondary">{req.work_type}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">Stage: <strong>{req.stage_name}</strong></p>
                        <p className="text-xs text-gray-500">Project: {req.project_name}</p>
                        {req.contractor_name && (
                          <p className="text-xs text-gray-500">Contractor: {req.contractor_name}</p>
                        )}
                        {req.remarks && (
                          <p className="text-xs text-gray-400 mt-1">Note: {req.remarks}</p>
                        )}
                        <p className="text-lg font-bold text-green-600 mt-2">{formatCurrency(req.amount)}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApprovePayment(req)}>
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => openRejectPaymentDialog(req)}>
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this payment request</DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-3">
                  <p className="text-sm"><strong>{selectedPayment.work_order_number}</strong> - {selectedPayment.stage_name}</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(selectedPayment.amount)}</p>
                </CardContent>
              </Card>
              
              <div>
                <label className="text-sm font-medium">Rejection Reason</label>
                <Input 
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g., Work not completed as per specification"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectPayment}>
              Reject Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
