import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  ClipboardList, LogOut, FileText, Clock, CheckCircle, Briefcase,
  Eye, Send, Package, Users, Building2, ArrowRight, Check, X, DollarSign,
  Pencil, Hammer, Home, PaintBucket, Layers, HardHat, KeyRound, Play, Calculator
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Stage icons and colors
const STAGE_CONFIG = {
  drawing: { icon: Pencil, color: 'from-purple-50 to-purple-100', border: 'border-purple-200', text: 'text-purple-700', bg: 'bg-purple-600' },
  yet_to_start: { icon: Play, color: 'from-gray-50 to-gray-100', border: 'border-gray-200', text: 'text-gray-700', bg: 'bg-gray-600' },
  foundation: { icon: Layers, color: 'from-amber-50 to-amber-100', border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-600' },
  basement: { icon: Building2, color: 'from-stone-50 to-stone-100', border: 'border-stone-200', text: 'text-stone-700', bg: 'bg-stone-600' },
  brick_work: { icon: HardHat, color: 'from-orange-50 to-orange-100', border: 'border-orange-200', text: 'text-orange-700', bg: 'bg-orange-600' },
  plastering: { icon: PaintBucket, color: 'from-cyan-50 to-cyan-100', border: 'border-cyan-200', text: 'text-cyan-700', bg: 'bg-cyan-600' },
  finishing: { icon: Hammer, color: 'from-blue-50 to-blue-100', border: 'border-blue-200', text: 'text-blue-700', bg: 'bg-blue-600' },
  handover: { icon: KeyRound, color: 'from-green-50 to-green-100', border: 'border-green-200', text: 'text-green-700', bg: 'bg-green-600' }
};

export default function PlanningBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [projects, setProjects] = useState([]);
  const [stages, setStages] = useState([]);
  const [stageCounts, setStageCounts] = useState({});
  const [activeTab, setActiveTab] = useState('stages'); // Default to stages view
  const [activeStage, setActiveStage] = useState('all');
  
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestsDialog, setRequestsDialog] = useState(false);
  const [reProjectsCount, setReProjectsCount] = useState(0);
  
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  
  // New projects from CRE
  const [newProjectsFromCRE, setNewProjectsFromCRE] = useState([]);
  const [newProjectsDialog, setNewProjectsDialog] = useState(false);
  
  // Stage update dialog
  const [stageDialog, setStageDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newStage, setNewStage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, paymentReqRes, reProjectsRes, newFromCRERes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/planning/stage-dashboard`),
        axios.get(`${API}/work-orders/payment-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/crm/re-projects?status=re_requested`).catch(() => ({ data: [] })),
        axios.get(`${API}/planning/projects?status=new`).catch(() => ({ data: [] }))
      ]);
      
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only Planning can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setStages(dashboardRes.data.stages || []);
      setStageCounts(dashboardRes.data.stage_counts || {});
      setPaymentRequests(paymentReqRes.data);
      setReProjectsCount(reProjectsRes.data.length || 0);
      setNewProjectsFromCRE(newFromCRERes.data || []);
      
      // Fetch projects based on active tab
      if (activeTab === 'stages') {
        fetchProjectsByStage(activeStage);
      } else {
        fetchProjectsByStatus(activeTab);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectsByStage = async (stage) => {
    try {
      const url = stage === 'all' 
        ? `${API}/planning/projects-by-stage`
        : `${API}/planning/projects-by-stage?stage=${stage}`;
      const res = await axios.get(url);
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects by stage:', error);
    }
  };

  const fetchProjectsByStatus = async (status) => {
    try {
      const res = await axios.get(`${API}/planning/projects?status=${status}`);
      setProjects(res.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleMainTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'stages') {
      fetchProjectsByStage(activeStage);
    } else {
      fetchProjectsByStatus(tab);
    }
  };

  const handleStageTabChange = (stage) => {
    setActiveStage(stage);
    fetchProjectsByStage(stage);
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

  const openStageDialog = (project) => {
    setSelectedProject(project);
    setNewStage(project.current_stage || 'yet_to_start');
    setStageDialog(true);
  };

  const handleUpdateStage = async () => {
    if (!selectedProject || !newStage) return;
    
    try {
      await axios.patch(`${API}/planning/projects/${selectedProject.project_id}/update-stage?stage=${newStage}`);
      toast.success('Project stage updated successfully');
      setStageDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update stage');
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
      in_planning: { label: 'New from CRE', variant: 'default', className: 'bg-green-600' },
      planning_review: { label: 'New', variant: 'default' },
      awaiting_approval: { label: 'Awaiting Approval', variant: 'outline' },
      gm_approved: { label: 'GM Approved', variant: 'default' },
      planning_approved: { label: 'Approved', variant: 'default' },
      active: { label: 'Active', variant: 'default' },
      completed: { label: 'Completed', variant: 'secondary' }
    };
    const c = config[status] || { label: status, variant: 'secondary' };
    return <Badge variant={c.variant} className={c.className}>{c.label}</Badge>;
  };

  const getStageBadge = (stageId) => {
    const stage = stages.find(s => s.id === stageId);
    const config = STAGE_CONFIG[stageId] || STAGE_CONFIG.yet_to_start;
    return (
      <Badge className={`${config.bg} text-white`}>
        {stage?.name || stageId}
      </Badge>
    );
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const totalStageProjects = Object.values(stageCounts).reduce((a, b) => a + b, 0);

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
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 cursor-pointer" onClick={() => handleMainTabChange('new')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">New Projects</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{dashboard.new_projects || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 cursor-pointer" onClick={() => handleMainTabChange('awaiting')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-yellow-600 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Awaiting Approval</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-yellow-700">{dashboard.awaiting_approval || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 cursor-pointer" onClick={() => handleMainTabChange('working')}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <Briefcase className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Working</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700">{dashboard.working_projects || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 cursor-pointer" onClick={() => handleMainTabChange('completed')}>
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

        {/* Rough Estimate Projects Alert */}
        {reProjectsCount > 0 && (
          <Card className="bg-indigo-50 border-indigo-200 mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500 p-2 rounded-full">
                  <Calculator className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-indigo-800">Rough Estimate Requests</p>
                  <p className="text-sm text-indigo-600">
                    {reProjectsCount} new RE project(s) waiting for rough estimate
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => window.location.href = '/crm/re-projects'} 
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Review RE Projects
              </Button>
            </CardContent>
          </Card>
        )}

        {/* New Projects from CRE Alert */}
        {newProjectsFromCRE.length > 0 && (
          <Card className="bg-green-50 border-green-200 mb-6" data-testid="new-projects-alert">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-green-500 p-2 rounded-full">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-green-800">New Projects from CRE</p>
                  <p className="text-sm text-green-600">
                    {newProjectsFromCRE.length} project(s) sent by CRE for planning
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => setNewProjectsDialog(true)} 
                className="bg-green-600 hover:bg-green-700"
                data-testid="view-new-projects-btn"
              >
                View New Projects
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Construction Stages Cards */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <HardHat className="h-5 w-5 text-indigo-600" />
              Construction Stages Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {stages.map((stage) => {
                const config = STAGE_CONFIG[stage.id] || STAGE_CONFIG.yet_to_start;
                const Icon = config.icon;
                const count = stageCounts[stage.id] || 0;
                
                return (
                  <Card 
                    key={stage.id}
                    className={`bg-gradient-to-br ${config.color} ${config.border} cursor-pointer hover:shadow-md transition-shadow ${activeStage === stage.id ? 'ring-2 ring-indigo-500' : ''}`}
                    onClick={() => { setActiveTab('stages'); handleStageTabChange(stage.id); }}
                  >
                    <CardContent className="p-3 text-center">
                      <div className={`${config.bg} w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <p className="text-lg font-bold">{count}</p>
                      <p className="text-xs truncate">{stage.name}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

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

        {/* Main Content Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleMainTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <TabsList className="bg-transparent p-0 flex-wrap gap-1">
                <TabsTrigger value="stages" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none text-xs sm:text-sm">
                  <HardHat className="h-4 w-4 mr-1" />
                  By Stage ({totalStageProjects})
                </TabsTrigger>
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

            {/* Stage Filter Tabs (when Stages tab is active) */}
            {activeTab === 'stages' && (
              <div className="border-b px-4 py-2 bg-gray-50 overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                  <Button 
                    size="sm" 
                    variant={activeStage === 'all' ? 'default' : 'outline'}
                    onClick={() => handleStageTabChange('all')}
                  >
                    All ({totalStageProjects})
                  </Button>
                  {stages.map((stage) => {
                    const count = stageCounts[stage.id] || 0;
                    return (
                      <Button 
                        key={stage.id}
                        size="sm" 
                        variant={activeStage === stage.id ? 'default' : 'outline'}
                        onClick={() => handleStageTabChange(stage.id)}
                        className="whitespace-nowrap"
                      >
                        {stage.name} ({count})
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

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
                        <div className="flex flex-col gap-1 items-end">
                          {getStatusBadge(project.status)}
                          {getStageBadge(project.current_stage)}
                        </div>
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
                        <Button size="sm" variant="outline" onClick={() => openStageDialog(project)}>
                          <ArrowRight className="h-3 w-3 mr-1" /> Stage
                        </Button>
                        {project.status === 'planning_review' && (
                          <Button size="sm" onClick={() => handleSubmitForApproval(project.project_id)}>
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
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">VALUE</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STAGE</th>
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
                          <td className="px-4 py-3 text-right font-semibold text-green-600">
                            {formatCurrency(project.total_value)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStageBadge(project.current_stage || 'yet_to_start')}
                          </td>
                          <td className="px-4 py-3 text-center">{getStatusBadge(project.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => window.location.href = `/projects/${project.project_id}`}>
                                <Eye className="h-3 w-3 mr-1" /> View
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openStageDialog(project)}>
                                <ArrowRight className="h-3 w-3" />
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

      {/* Update Stage Dialog */}
      <Dialog open={stageDialog} onOpenChange={setStageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Project Stage</DialogTitle>
            <DialogDescription>
              Move "{selectedProject?.name}" to a new construction stage
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Current Stage</label>
              <div className="p-3 bg-gray-100 rounded-lg">
                {getStageBadge(selectedProject?.current_stage || 'yet_to_start')}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Move to Stage</label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <span>{stage.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateStage} className="bg-indigo-600 hover:bg-indigo-700">
              Update Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        <Button size="sm" variant="destructive" onClick={() => handleRejectRequest(req)}>
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Requests Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stage Payment Requests</DialogTitle>
            <DialogDescription>Review and verify payment requests from Site Engineers</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {paymentRequests.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No payment requests</p>
            ) : (
              paymentRequests.map((payment) => (
                <Card key={payment.stage_id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{payment.stage_name}</p>
                        <p className="text-sm text-gray-500">Project: {payment.project_name}</p>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                        <p className="text-xs text-gray-400">Requested by: {payment.requested_by_name}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApprovePayment(payment)}>
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => openRejectPaymentDialog(payment)}>
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment Request</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Rejection Reason</label>
            <Input 
              placeholder="Enter reason for rejection"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectPayment}>Reject Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
