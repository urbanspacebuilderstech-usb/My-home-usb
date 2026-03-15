import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import {
  LayoutDashboard, Building2, ClipboardCheck, Calculator, Users, Package,
  HardHat, DollarSign, CheckCircle, XCircle, Clock, AlertTriangle, Eye,
  ArrowRight, LogOut, FileText, TrendingUp, BarChart3, Shield, Briefcase, Download
} from 'lucide-react';
import { generateREPDF } from '../utils/pdfGenerator';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const GMDashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const lastActiveTabRef = React.useRef('overview');
  
  // Dashboard Data
  const [stats, setStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [reProjects, setReProjects] = useState([]);
  const [siteRequests, setSiteRequests] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [accountantRequests, setAccountantRequests] = useState([]);
  const [suspenseRequests, setSuspenseRequests] = useState([]);
  const [designApprovals, setDesignApprovals] = useState([]);
  
  // Approval Dialog
  const [approvalDialog, setApprovalDialog] = useState(false);
  const [approvalType, setApprovalType] = useState(''); // 're_project', 'project', 'payment', etc.
  const [selectedItem, setSelectedItem] = useState(null);
  const [approveConfirmText, setApproveConfirmText] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalAction, setApprovalAction] = useState('approve'); // 'approve' or 'reject'
  
  // View Dialog
  const [viewDialog, setViewDialog] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [viewType, setViewType] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [userRes, projectsRes, reProjectsRes, materialReqRes, labourReqRes, paymentReqRes, suspenseRes, designRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects`).catch(() => ({ data: [] })),
        axios.get(`${API}/crm/re-projects`).catch(() => ({ data: [] })),
        axios.get(`${API}/site-engineer/material-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/site-engineer/labour-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/work-orders/payment-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/financial/suspense`).catch(() => ({ data: [] })),
        axios.get(`${API}/architect/pending-approvals`).catch(() => ({ data: [] }))
      ]);
      
      if (!['general_manager', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. GM/Admin access required.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setProjects(projectsRes.data || []);
      setReProjects(reProjectsRes.data || []);
      const allSiteReqs = [...(materialReqRes.data || []), ...(labourReqRes.data || [])];
      setSiteRequests(allSiteReqs);
      setPaymentRequests(paymentReqRes.data || []);
      setSuspenseRequests(suspenseRes.data || []);
      setDesignApprovals(designRes.data || []);
      
      // Calculate stats - RE projects pending approval have status 're_submitted'
      const pendingREApprovals = (reProjectsRes.data || []).filter(p => p.status === 're_submitted').length;
      const pendingProjectApprovals = (projectsRes.data || []).filter(p => p.status === 'awaiting_approval' && !p.gm_approved_by).length;
      const pendingSiteRequests = allSiteReqs.filter(r => r.status === 'pending').length;
      const pendingPayments = (paymentReqRes.data || []).filter(p => p.status === 'pending').length;
      const pendingSuspense = (suspenseRes.data || []).filter(s => s.status === 'pending_approval').length;
      const pendingDesignApprovals = (designRes.data || []).length;
      
      setStats({
        totalProjects: (projectsRes.data || []).length,
        activeProjects: (projectsRes.data || []).filter(p => ['active', 'working', 'gm_approved'].includes(p.status)).length,
        pendingApprovals: pendingREApprovals + pendingProjectApprovals,
        pendingREApprovals,
        pendingProjectApprovals,
        pendingSiteRequests,
        pendingPayments,
        pendingSuspense,
        pendingDesignApprovals,
        completedProjects: (projectsRes.data || []).filter(p => p.status === 'completed').length
      });
      
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchAllData, 15000);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDesignApproval = async (plan, approved) => {
    try {
      const reason = approved ? '' : window.prompt('Rejection reason:');
      if (!approved && !reason) return;
      await axios.patch(`${API}/architect/site-plans/${plan.plan_id}/approve`, null, {
        params: { approved, rejection_reason: reason || '' }
      });
      toast.success(approved ? 'Design approved' : 'Design rejected');
      fetchAllData(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      // RE Project statuses
      're_requested': { label: 'New Request', color: 'bg-amber-50 text-amber-800' },
      're_in_progress': { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
      're_submitted': { label: 'Pending GM Approval', color: 'bg-orange-100 text-orange-800' },
      're_awaiting_approval': { label: 'Awaiting GM Approval', color: 'bg-orange-100 text-orange-800' },
      're_approved': { label: 'Approved', color: 'bg-green-100 text-green-800' },
      're_rejected': { label: 'Rejected', color: 'bg-red-100 text-red-800' },
      // Project statuses
      'new': { label: 'New', color: 'bg-amber-50 text-amber-800' },
      'planning_review': { label: 'Planning Review', color: 'bg-purple-100 text-purple-800' },
      'awaiting_approval': { label: 'Awaiting Approval', color: 'bg-orange-100 text-orange-800' },
      'gm_approved': { label: 'GM Approved', color: 'bg-green-100 text-green-800' },
      'active': { label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
      'completed': { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
      // Request statuses
      'pending': { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
      'approved': { label: 'Approved', color: 'bg-green-100 text-green-800' },
      'rejected': { label: 'Rejected', color: 'bg-red-100 text-red-800' },
      'pending_approval': { label: 'Pending Approval', color: 'bg-orange-100 text-orange-800' }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    return <Badge className={`${config.color} font-medium`}>{config.label}</Badge>;
  };

  // Open approval dialog
  const openApprovalDialog = (item, type, action = 'approve') => {
    setSelectedItem(item);
    setApprovalType(type);
    setApprovalAction(action);
    setApproveConfirmText('');
    setRejectionReason('');
    setApprovalDialog(true);
  };

  // Handle approval/rejection
  const handleApproval = async () => {
    if (approvalAction === 'approve' && approveConfirmText !== 'APPROVE') {
      toast.error('Please type APPROVE to confirm');
      return;
    }
    if (approvalAction === 'reject' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    try {
      let endpoint = '';
      let payload = {};
      
      switch (approvalType) {
        case 're_project':
          endpoint = `${API}/crm/re-projects/${selectedItem.re_project_id}/approve`;
          break;
        case 'project':
          if (approvalAction === 'approve') {
            endpoint = `${API}/approvals/projects/${selectedItem.project_id}/gm-approve`;
          } else {
            endpoint = `${API}/approvals/projects/${selectedItem.project_id}/reject?reason=${encodeURIComponent(rejectionReason)}`;
          }
          break;
        case 'suspense':
          if (approvalAction === 'approve') {
            endpoint = `${API}/suspense/${selectedItem.entry_id}/approve`;
          } else {
            endpoint = `${API}/suspense/${selectedItem.entry_id}/reject`;
            payload = { reason: rejectionReason };
          }
          break;
        default:
          toast.error('Unknown approval type');
          return;
      }
      
      if (approvalAction === 'approve') {
        await axios.patch(endpoint, { approved: true });
        toast.success('Approved successfully!');
      } else {
        await axios.patch(endpoint, { approved: false, rejection_reason: rejectionReason });
        toast.success('Rejected successfully');
      }
      
      setApprovalDialog(false);
      fetchAllData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Action failed');
    }
  };

  // Open view dialog
  const openViewDialog = (item, type) => {
    setViewItem(item);
    setViewType(type);
    setViewDialog(true);
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (error) {}
    window.location.href = '/login';
  };

  // Generate PDF handler using shared utility
  const handleGenerateREPDF = async (project) => {
    if (!project) return;
    try {
      await generateREPDF(project);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading GM Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-gray-700 to-gray-800 text-white">
            <CardContent className="p-4">
              <Building2 className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.totalProjects}</p>
              <p className="text-xs opacity-80">Total Projects</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <TrendingUp className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.activeProjects}</p>
              <p className="text-xs opacity-80">Active Projects</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <ClipboardCheck className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingApprovals}</p>
              <p className="text-xs opacity-80">Pending Approvals</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <Calculator className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingREApprovals}</p>
              <p className="text-xs opacity-80">RE Approvals</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
            <CardContent className="p-4">
              <HardHat className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingSiteRequests}</p>
              <p className="text-xs opacity-80">Site Requests</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
            <CardContent className="p-4">
              <CheckCircle className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.completedProjects}</p>
              <p className="text-xs opacity-80">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(value) => {
            // Only change tab if it's a valid tab value from explicit tab click
            const validTabs = ['overview', 'planning', 'projects', 'site_engineer', 'accountant', 'design'];
            if (validTabs.includes(value)) {
              lastActiveTabRef.current = value;
              setActiveTab(value);
            }
          }} 
          className="space-y-4"
        >
          <TabsList className="bg-white border shadow-sm p-1 flex-wrap h-auto">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="planning" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Planning
              {stats.pendingREApprovals > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">{stats.pendingREApprovals}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Projects
              {stats.pendingProjectApprovals > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">{stats.pendingProjectApprovals}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="site_engineer" className="flex items-center gap-2">
              <HardHat className="h-4 w-4" /> Site Engineer
              {stats.pendingSiteRequests > 0 && (
                <Badge className="bg-orange-500 text-white text-xs ml-1">{stats.pendingSiteRequests}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accountant" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Accounts
              {stats.pendingSuspense > 0 && (
                <Badge className="bg-orange-500 text-white text-xs ml-1">{stats.pendingSuspense}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="design" className="flex items-center gap-2" data-testid="gm-tab-design">
              <FileText className="h-4 w-4" /> Design
              {stats.pendingDesignApprovals > 0 && (
                <Badge className="bg-purple-500 text-white text-xs ml-1">{stats.pendingDesignApprovals}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Pending Approvals Alert */}
            {(stats.pendingREApprovals > 0 || stats.pendingProjectApprovals > 0) && (
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-800">Pending Approvals Require Your Attention</p>
                      <p className="text-sm text-amber-600">
                        {stats.pendingREApprovals > 0 && `${stats.pendingREApprovals} RE Project(s)`}
                        {stats.pendingREApprovals > 0 && stats.pendingProjectApprovals > 0 && ' • '}
                        {stats.pendingProjectApprovals > 0 && `${stats.pendingProjectApprovals} Project(s)`}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => setActiveTab('planning')} className="bg-amber-600 hover:bg-amber-700">
                    Review Now
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Recent Projects Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-600" />
                  All Projects Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-semibold text-gray-700">Project</th>
                        <th className="pb-3 font-semibold text-gray-700">Client</th>
                        <th className="pb-3 font-semibold text-gray-700">Value</th>
                        <th className="pb-3 font-semibold text-gray-700">Stage</th>
                        <th className="pb-3 font-semibold text-gray-700">Status</th>
                        <th className="pb-3 font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.slice(0, 10).map(project => (
                        <tr key={project.project_id} className="border-b hover:bg-gray-50">
                          <td className="py-3">
                            <p className="font-medium">{project.name}</p>
                            <p className="text-xs text-gray-500">{project.project_id}</p>
                          </td>
                          <td className="py-3">{project.client_name || '-'}</td>
                          <td className="py-3">{formatCurrency(project.value)}</td>
                          <td className="py-3">
                            <Badge variant="outline">{project.current_stage || 'Not Started'}</Badge>
                          </td>
                          <td className="py-3">{getStatusBadge(project.status)}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => openViewDialog(project, 'project')}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {project.status === 'awaiting_approval' && !project.gm_approved_by && (
                                <Button 
                                  size="sm" 
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => openApprovalDialog(project, 'project', 'approve')}
                                >
                                  Approve
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {projects.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-500">
                            No projects found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Planning Tab - RE Projects */}
          <TabsContent value="planning" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-purple-600" />
                  Rough Estimate Projects
                </CardTitle>
                <CardDescription>Review and approve rough estimates from Planning department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reProjects.map(re => (
                    <div 
                      key={re.re_project_id} 
                      className={`p-4 rounded-lg border ${
                        re.status === 're_submitted' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{re.project_name || `RE - ${re.client_name}`}</p>
                            {getStatusBadge(re.status)}
                          </div>
                          <p className="text-sm text-gray-600">Client: {re.client_name}</p>
                          <p className="text-sm text-gray-500">Location: {re.location || '-'}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm">
                              <strong>Scope Items:</strong> {re.rough_scope_items?.length || 0}
                            </span>
                            <span className="text-sm">
                              <strong>Handover:</strong> {re.handover_months ? `${re.handover_months} months` : '-'}
                            </span>
                            <span className="text-lg font-bold text-purple-700">
                              {formatCurrency(re.estimated_total)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline"
                            className="text-purple-600 hover:bg-purple-50"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleGenerateREPDF(re);
                            }}
                            data-testid={`download-re-${re.re_project_id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openViewDialog(re, 're_project');
                            }}
                            data-testid={`view-re-${re.re_project_id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                          {(re.status === 're_submitted' || re.status === 're_in_progress') && (
                            <>
                              <Button 
                                type="button"
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openApprovalDialog(re, 're_project', 'approve');
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" /> Approve
                              </Button>
                              <Button 
                                type="button"
                                size="sm" 
                                variant="destructive"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openApprovalDialog(re, 're_project', 'reject');
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {reProjects.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Calculator className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      No RE Projects found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-600" />
                  Project Approvals
                </CardTitle>
                <CardDescription>Projects awaiting GM approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {projects.filter(p => p.status === 'awaiting_approval' && !p.gm_approved_by).map(project => (
                    <div 
                      key={project.project_id} 
                      className="p-4 rounded-lg border bg-orange-50 border-orange-200"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{project.name}</p>
                            {getStatusBadge(project.status)}
                          </div>
                          <p className="text-sm text-gray-600">Client: {project.client_name || '-'}</p>
                          <p className="text-sm text-gray-500">Package: {project.package_name || '-'}</p>
                          <p className="text-lg font-bold text-amber-700 mt-2">
                            {formatCurrency(project.value)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => openViewDialog(project, 'project')}
                          >
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => openApprovalDialog(project, 'project', 'approve')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {projects.filter(p => p.status === 'awaiting_approval' && !p.gm_approved_by).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
                      No projects pending approval
                    </div>
                  )}
                </div>

                {/* All Projects Table */}
                <div className="mt-8">
                  <h3 className="font-semibold text-gray-900 mb-4">All Projects</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 font-semibold">Project</th>
                          <th className="pb-2 font-semibold">Client</th>
                          <th className="pb-2 font-semibold">Value</th>
                          <th className="pb-2 font-semibold">Stage</th>
                          <th className="pb-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map(p => (
                          <tr key={p.project_id} className="border-b hover:bg-gray-50">
                            <td className="py-2">{p.name}</td>
                            <td className="py-2">{p.client_name || '-'}</td>
                            <td className="py-2">{formatCurrency(p.value)}</td>
                            <td className="py-2">{p.current_stage || '-'}</td>
                            <td className="py-2">{getStatusBadge(p.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Site Engineer Tab */}
          <TabsContent value="site_engineer" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardHat className="h-5 w-5 text-amber-600" />
                  Site Engineer Requests
                </CardTitle>
                <CardDescription>Material and labour requests from site</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {siteRequests.map(req => (
                    <div 
                      key={req.request_id || req._id} 
                      className={`p-4 rounded-lg border ${
                        req.status === 'pending' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">
                              {req.request_type === 'material' ? 'Material Request' : 'Labour Request'}
                            </p>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-sm text-gray-600">Project: {req.project_name || '-'}</p>
                          <p className="text-sm text-gray-500">Requested: {formatDate(req.created_at)}</p>
                          {req.items && (
                            <p className="text-sm mt-1">Items: {req.items.length}</p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => openViewDialog(req, 'site_request')}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                  {siteRequests.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <HardHat className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      No site requests found
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accountant Tab */}
          <TabsContent value="accountant" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  Suspense Account Entries
                </CardTitle>
                <CardDescription>Pending suspense entries requiring approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {suspenseRequests.filter(s => s.status === 'pending_approval').map(entry => (
                    <div 
                      key={entry.entry_id} 
                      className="p-4 rounded-lg border bg-orange-50 border-orange-200"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{entry.description}</p>
                            {getStatusBadge(entry.status)}
                          </div>
                          <p className="text-sm text-gray-600">Project: {entry.project_name || '-'}</p>
                          <p className="text-lg font-bold text-emerald-700 mt-2">
                            {formatCurrency(entry.amount)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => openApprovalDialog(entry, 'suspense', 'approve')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => openApprovalDialog(entry, 'suspense', 'reject')}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {suspenseRequests.filter(s => s.status === 'pending_approval').length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
                      No pending suspense entries
                    </div>
                  )}
                </div>

                {/* Payment Requests */}
                <div className="mt-8">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5" /> Work Order Payments
                  </h3>
                  <div className="space-y-3">
                    {paymentRequests.map(payment => (
                      <div 
                        key={payment.request_id} 
                        className={`p-3 rounded-lg border ${
                          payment.status === 'pending' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{payment.contractor_name || 'Contractor'}</p>
                            <p className="text-sm text-gray-500">Project: {payment.project_name || '-'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-700">{formatCurrency(payment.amount)}</p>
                            {getStatusBadge(payment.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {paymentRequests.length === 0 && (
                      <p className="text-center py-4 text-gray-500">No payment requests</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Design Tab */}
          <TabsContent value="design" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  Site Plan Approvals
                </CardTitle>
                <CardDescription>Design submissions from Architect awaiting your approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {designApprovals.length === 0 ? (
                    <div className="text-center py-8 text-gray-500" data-testid="no-design-approvals">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-300" />
                      No pending design approvals
                    </div>
                  ) : (
                    designApprovals.map(plan => (
                      <div
                        key={plan.plan_id}
                        className="p-4 rounded-lg border bg-purple-50 border-purple-200"
                        data-testid={`design-approval-${plan.plan_id}`}
                      >
                        <div className="flex items-start justify-between flex-wrap gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{plan.floor_name}</p>
                            <p className="text-sm text-gray-600">Project: {plan.project_name || plan.project_id}</p>
                            {plan.client_name && <p className="text-xs text-gray-400">Client: {plan.client_name}</p>}
                            {plan.drive_link && (
                              <a href={plan.drive_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-1">
                                <Eye className="h-3 w-3" /> View on Google Drive
                              </a>
                            )}
                            <p className="text-xs text-gray-400 mt-1">Submitted: {formatDate(plan.submitted_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleDesignApproval(plan, true)}
                              data-testid={`approve-design-${plan.plan_id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDesignApproval(plan, false)}
                              data-testid={`reject-design-${plan.plan_id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Approval Dialog with APPROVE confirmation */}
      <Dialog 
        open={approvalDialog} 
        onOpenChange={(open) => {
          setApprovalDialog(open);
        }} 
        modal={true}
      >
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${approvalAction === 'reject' ? 'text-red-600' : 'text-green-600'}`}>
              {approvalAction === 'approve' ? (
                <><CheckCircle className="h-5 w-5" /> Confirm Approval</>
              ) : (
                <><XCircle className="h-5 w-5" /> Confirm Rejection</>
              )}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approve' 
                ? 'This action will approve the item and proceed to the next step.'
                : 'This action will reject the item and notify the submitter.'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg border ${approvalAction === 'approve' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <p className="font-medium">
                  {approvalType === 're_project' && (selectedItem.project_name || `RE - ${selectedItem.client_name}`)}
                  {approvalType === 'project' && selectedItem.name}
                  {approvalType === 'suspense' && selectedItem.description}
                </p>
                {approvalType === 're_project' && (
                  <p className="text-sm text-gray-600">Total: {formatCurrency(selectedItem.estimated_total)}</p>
                )}
                {approvalType === 'project' && (
                  <p className="text-sm text-gray-600">Value: {formatCurrency(selectedItem.value)}</p>
                )}
                {approvalType === 'suspense' && (
                  <p className="text-sm text-gray-600">Amount: {formatCurrency(selectedItem.amount)}</p>
                )}
              </div>
              
              {approvalAction === 'approve' ? (
                <div>
                  <Label className="text-gray-700">
                    Type <span className="font-bold text-green-600">APPROVE</span> to confirm
                  </Label>
                  <Input
                    value={approveConfirmText}
                    onChange={(e) => setApproveConfirmText(e.target.value.toUpperCase())}
                    placeholder="Type APPROVE"
                    className="mt-1"
                    data-testid="approve-confirm-input"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-gray-700">Rejection Reason *</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Provide a reason for rejection..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setApprovalDialog(false);
                setSelectedItem(null);
                setApproveConfirmText('');
                setRejectionReason('');
              }}
            >
              Cancel
            </Button>
            <Button 
              className={approvalAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              onClick={handleApproval}
              disabled={approvalAction === 'approve' ? approveConfirmText !== 'APPROVE' : !rejectionReason.trim()}
              data-testid="confirm-approval-btn"
            >
              {approvalAction === 'approve' ? (
                <><CheckCircle className="h-4 w-4 mr-1" /> Approve</>
              ) : (
                <><XCircle className="h-4 w-4 mr-1" /> Reject</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog 
        open={viewDialog} 
        onOpenChange={(open) => {
          setViewDialog(open);
        }} 
        modal={true}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-amber-600" />
                {viewType === 're_project' && 'RE Project Details'}
                {viewType === 'project' && 'Project Details'}
                {viewType === 'site_request' && 'Site Request Details'}
              </div>
              {viewType === 're_project' && viewItem && (
                <Button 
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleGenerateREPDF(viewItem);
                  }}
                  className="bg-purple-600 hover:bg-purple-700"
                  data-testid="download-pdf-dialog"
                >
                  <Download className="h-4 w-4 mr-1" /> Download PDF
                </Button>
              )}
            </DialogTitle>
            {viewType === 're_project' && (
              <DialogDescription>
                URBAN SPACE BUILDERS - Ref: {viewItem?.re_project_id}
              </DialogDescription>
            )}
          </DialogHeader>
          
          {viewItem && (
            <div className="space-y-4">
              {viewType === 're_project' && (
                <>
                  {/* Client Info Card */}
                  <Card className="bg-gray-50">
                    <CardContent className="p-4">
                      <h4 className="font-semibold mb-2 text-gray-700">Client Information</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">Name:</span>
                          <p className="font-medium">{viewItem.client_name}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Phone:</span>
                          <p>{viewItem.client_phone || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Email:</span>
                          <p>{viewItem.client_email || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Location:</span>
                          <p>{viewItem.location || '-'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Project Details */}
                  <Card>
                    <CardContent className="p-4">
                      <h4 className="font-semibold mb-2 text-gray-700">Project Details</h4>
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">Project Name:</span>
                          <p className="font-medium">{viewItem.project_name || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Square Feet:</span>
                          <p>{viewItem.sqft ? `${viewItem.sqft} sqft` : '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Building Type:</span>
                          <p className="capitalize">{viewItem.building_type || '-'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Handover:</span>
                          <p>{viewItem.handover_months ? `${viewItem.handover_months} months` : '-'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Full Scope of Works */}
                  <Card className="border-purple-200">
                    <CardContent className="p-4">
                      <h4 className="font-semibold mb-3 text-purple-800">Scope of Works</h4>
                      {viewItem.rough_scope_items?.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-100 border-b">
                                <th className="text-left p-2 font-semibold">S.No</th>
                                <th className="text-left p-2 font-semibold">Description</th>
                                <th className="text-center p-2 font-semibold">Qty</th>
                                <th className="text-center p-2 font-semibold">Unit</th>
                                <th className="text-right p-2 font-semibold">Rate</th>
                                <th className="text-right p-2 font-semibold">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewItem.rough_scope_items.map((item, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="p-2 text-center">{idx + 1}</td>
                                  <td className="p-2">{item.description || item.name || '-'}</td>
                                  <td className="p-2 text-center">{item.quantity || '-'}</td>
                                  <td className="p-2 text-center">{item.unit || '-'}</td>
                                  <td className="p-2 text-right">{formatCurrency(item.rate || 0)}</td>
                                  <td className="p-2 text-right font-medium">{formatCurrency(item.total || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-purple-50">
                                <td colSpan={5} className="p-2 text-right font-bold text-purple-800">Total:</td>
                                <td className="p-2 text-right font-bold text-purple-900 text-lg">
                                  {formatCurrency(viewItem.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-500">
                          <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          No scope items added yet
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Estimated Total */}
                  <Card className="bg-gradient-to-r from-purple-600 to-purple-700">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-purple-100">Estimated Total</p>
                      <p className="text-3xl font-bold text-white">
                        {formatCurrency(viewItem.estimated_total || viewItem.rough_scope_items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0)}
                      </p>
                      {viewItem.handover_months && (
                        <p className="text-sm text-purple-200 mt-1">
                          Project Duration: {viewItem.handover_months} months
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  
                  {viewItem.planning_notes && (
                    <Card className="bg-gray-50">
                      <CardContent className="p-4">
                        <h4 className="font-semibold mb-2 text-gray-700">Planning Notes</h4>
                        <p className="text-sm text-gray-600">{viewItem.planning_notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
              
              {viewType === 'project' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Project Name</p>
                      <p className="font-medium">{viewItem.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Client</p>
                      <p className="font-medium">{viewItem.client_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Package</p>
                      <p className="font-medium">{viewItem.package_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Current Stage</p>
                      <p className="font-medium">{viewItem.current_stage || 'Not Started'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      {getStatusBadge(viewItem.status)}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Value</p>
                      <p className="font-bold text-amber-700">{formatCurrency(viewItem.value)}</p>
                    </div>
                  </div>
                </>
              )}
              
              {viewType === 'site_request' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Request Type</p>
                      <p className="font-medium capitalize">{viewItem.request_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Project</p>
                      <p className="font-medium">{viewItem.project_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Status</p>
                      {getStatusBadge(viewItem.status)}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Requested On</p>
                      <p className="font-medium">{formatDate(viewItem.created_at)}</p>
                    </div>
                  </div>
                  
                  {viewItem.items && viewItem.items.length > 0 && (
                    <div>
                      <p className="font-semibold mb-2">Items</p>
                      <div className="space-y-2">
                        {viewItem.items.map((item, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 rounded flex justify-between">
                            <span>{item.name || item.material_name}</span>
                            <span>Qty: {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
          <DialogFooter className="border-t pt-4 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setViewDialog(false)}
              data-testid="close-view-dialog"
              className="min-w-[100px]"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
};

export default GMDashboard;
