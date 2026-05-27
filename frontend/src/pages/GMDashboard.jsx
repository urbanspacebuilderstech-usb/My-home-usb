import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import LabourAdvanceQueue from '../components/LabourAdvanceQueue';
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
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  Calculator,
  Users,
  Package,
  HardHat,
  IndianRupee,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  ArrowRight,
  LogOut,
  FileText,
  TrendingUp,
  BarChart3,
  Shield,
  Briefcase,
  Download,
  Edit2,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Wallet
} from 'lucide-react';
import { generateREPDF } from '../utils/pdfGenerator';
import PlanningBoard from './PlanningBoard';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { UnitSelect } from '../components/UnitSelect';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const GMDashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('planning');  // Default to Rough Estimate
  const lastActiveTabRef = React.useRef('overview');

  // Project Drill-down dialog (opened when a stats card is clicked)
  const [drillDialog, setDrillDialog] = useState({ open: false, title: '', items: [], emptyText: '' });

  // FE Approve confirmation dialog — GM must type "APPROVE" to confirm
  const [feApproveDialog, setFeApproveDialog] = useState({ open: false, project: null, typed: '', autoShare: false, submitting: false });
  
  // Dashboard Data
  const [stats, setStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [reProjects, setReProjects] = useState([]);
  const [siteRequests, setSiteRequests] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [accountantRequests, setAccountantRequests] = useState([]);
  const [suspenseRequests, setSuspenseRequests] = useState([]);
  const [designApprovals, setDesignApprovals] = useState([]);
  const [feProjects, setFeProjects] = useState([]);
  const [feRejectDialog, setFeRejectDialog] = useState({ open: false, project: null, reason: '' });
  const [feBusy, setFeBusy] = useState(false);
  
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

  // RE Edit Dialog
  const [reEditDialog, setReEditDialog] = useState(false);
  const [reEditProject, setReEditProject] = useState(null);
  const [reEditForm, setReEditForm] = useState({
    project_name: '', location: '', sqft: '', building_type: '',
    rough_scope_items: [], handover_months: '', planning_notes: ''
  });
  const [reChangeLogs, setReChangeLogs] = useState([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [userRes, projectsRes, reProjectsRes, materialReqRes, labourReqRes, paymentReqRes, suspenseRes, designRes, feRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects`).catch(() => ({ data: [] })),
        axios.get(`${API}/crm/re-projects`).catch(() => ({ data: [] })),
        axios.get(`${API}/site-engineer/material-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/site-engineer/labour-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/work-orders/payment-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/financial/suspense`).catch(() => ({ data: [] })),
        axios.get(`${API}/architect/pending-approvals`).catch(() => ({ data: [] })),
        axios.get(`${API}/gm/final-estimates`).catch(() => ({ data: [] }))
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
      setFeProjects(feRes.data || []);
      
      // Calculate stats - RE projects pending approval have status 're_submitted'
      const pendingREApprovals = (reProjectsRes.data || []).filter(p => p.status === 're_submitted').length;
      const pendingProjectApprovals = (projectsRes.data || []).filter(p => p.status === 'awaiting_approval' && !p.gm_approved_by).length;
      const pendingSiteRequests = allSiteReqs.filter(r => r.status === 'pending').length;
      const pendingPayments = (paymentReqRes.data || []).filter(p => p.status === 'pending').length;
      const pendingSuspense = (suspenseRes.data || []).filter(s => s.status === 'pending_approval').length;
      const pendingDesignApprovals = (designRes.data || []).length;
      const pendingFEApprovals = (feRes.data || []).filter(p => (p.fe?.status === 'pending_gm_review')).length;
      
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
        pendingFEApprovals,
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
      toast.success(approved ? 'Design approved! Architect will be notified.' : 'Design rejected. Architect will be notified.');
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
      're_approved': { label: 'GM Approved', color: 'bg-green-100 text-green-800' },
      're_rejected': { label: 'Rejected', color: 'bg-red-100 text-red-800' },
      'sent_to_client': { label: 'Sent to Client', color: 'bg-blue-100 text-blue-800' },
      'client_feedback': { label: 'Client Feedback', color: 'bg-orange-100 text-orange-800' },
      'client_approved': { label: 'Client Approved', color: 'bg-emerald-100 text-emerald-800' },
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
        toast.success('Approved! Planning will be notified to proceed.');
      } else {
        await axios.patch(endpoint, { approved: false, rejection_reason: rejectionReason });
        toast.success('Rejected. Planning will be notified.');
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

  // RE Edit functions
  const openReEditDialog = (re) => {
    setReEditProject(re);
    setReEditForm({
      project_name: re.project_name || '',
      location: re.location || '',
      sqft: re.sqft || '',
      building_type: re.building_type || '',
      rough_scope_items: re.rough_scope_items || [],
      handover_months: re.handover_months || '',
      planning_notes: re.planning_notes || ''
    });
    setReEditDialog(true);
    fetchReChangeLogs(re.re_project_id);
  };

  const fetchReChangeLogs = async (reProjectId) => {
    try {
      const res = await axios.get(`${API}/crm/re-projects/${reProjectId}/change-logs`);
      setReChangeLogs(res.data);
    } catch { setReChangeLogs([]); }
  };

  const addReScopeItem = () => {
    setReEditForm({
      ...reEditForm,
      rough_scope_items: [...reEditForm.rough_scope_items, { name: '', quantity: 1, unit: 'nos', rate: 0, total: 0 }]
    });
  };

  const updateReScopeItem = (index, field, value) => {
    const items = [...reEditForm.rough_scope_items];
    items[index][field] = value;
    if (field === 'quantity' || field === 'rate') {
      items[index].total = (parseFloat(items[index].quantity) || 0) * (parseFloat(items[index].rate) || 0);
    }
    setReEditForm({ ...reEditForm, rough_scope_items: items });
  };

  const removeReScopeItem = (index) => {
    setReEditForm({ ...reEditForm, rough_scope_items: reEditForm.rough_scope_items.filter((_, i) => i !== index) });
  };

  const handleSaveReProject = async () => {
    const scopeItems = reEditForm.rough_scope_items.map(item => ({
      ...item,
      quantity: parseFloat(item.quantity) || 0,
      rate: parseFloat(item.rate) || 0,
      total: (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)
    }));
    const scopeTotal = scopeItems.reduce((sum, item) => sum + (item.total || 0), 0);
    try {
      await axios.patch(`${API}/crm/re-projects/${reEditProject.re_project_id}`, {
        ...reEditForm,
        rough_scope_items: scopeItems,
        sqft: reEditForm.sqft ? parseFloat(reEditForm.sqft) : null,
        handover_months: reEditForm.handover_months ? parseInt(reEditForm.handover_months) : null,
        estimated_total: scopeTotal
      });
      toast.success('RE Project updated');
      fetchReChangeLogs(reEditProject.re_project_id);
      setReEditDialog(false);
      fetchAllData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update');
    }
  };

  const handleDeleteREProject = async (re) => {
    const label = re.re_number || re.project_name || re.re_project_id;
    if (!window.confirm(`Delete Rough Estimate "${label}"?\n\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/crm/re-projects/${re.re_project_id}`);
      toast.success(`Deleted "${label}"`);
      setReProjects(prev => prev.filter(p => p.re_project_id !== re.re_project_id));
      return;
    } catch (e) {
      if (e.response?.status === 409) {
        const second = window.confirm(
          `⚠ This RE has already been converted into a Project.\n\n` +
          `Force delete will ALSO permanently delete:\n` +
          `  • The linked Project\n` +
          `  • All Stages, Work Orders, DLRs, Materials, Expenses & Income\n\n` +
          `This is irreversible. Continue?`
        );
        if (!second) return;
        try {
          const res = await axios.delete(`${API}/crm/re-projects/${re.re_project_id}?force=true`);
          toast.success(res.data?.message || `Force-deleted "${label}"`);
          setReProjects(prev => prev.filter(p => p.re_project_id !== re.re_project_id));
        } catch (e2) {
          toast.error(e2.response?.data?.detail || 'Failed to force-delete RE project');
        }
        return;
      }
      toast.error(e.response?.data?.detail || 'Failed to delete RE project');
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
      {/* AppHeader rendered with `hideNav` — keeps logo, role badge, notifications,
          user menu but suppresses the role-based top nav. GM users navigate via
          the Final Estimate / Rough Estimate / Planning pill buttons below. */}
      <AppHeader user={user} hideNav />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Overview — each card is clickable to drill into the underlying list */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card
            className="bg-gradient-to-br from-gray-700 to-gray-800 text-white cursor-pointer hover:scale-[1.02] active:scale-100 transition-transform"
            data-testid="gm-stat-total-projects"
            onClick={() => setDrillDialog({ open: true, title: 'All Projects', items: projects, emptyText: 'No projects yet.' })}
          >
            <CardContent className="p-4">
              <Building2 className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.totalProjects}</p>
              <p className="text-xs opacity-80">Total Projects</p>
            </CardContent>
          </Card>
          <Card
            className="bg-gradient-to-br from-green-500 to-green-600 text-white cursor-pointer hover:scale-[1.02] active:scale-100 transition-transform"
            data-testid="gm-stat-active-projects"
            onClick={() => setDrillDialog({
              open: true,
              title: 'Active Projects',
              items: (projects || []).filter(p => ['active', 'working', 'gm_approved'].includes(p.status)),
              emptyText: 'No active projects.'
            })}
          >
            <CardContent className="p-4">
              <TrendingUp className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.activeProjects}</p>
              <p className="text-xs opacity-80">Active Projects</p>
            </CardContent>
          </Card>
          <Card
            className="bg-gradient-to-br from-orange-500 to-orange-600 text-white cursor-pointer hover:scale-[1.02] active:scale-100 transition-transform"
            data-testid="gm-stat-pending-approvals"
            onClick={() => setActiveTab('final_estimate')}
          >
            <CardContent className="p-4">
              <ClipboardCheck className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingApprovals}</p>
              <p className="text-xs opacity-80">Pending Approvals</p>
            </CardContent>
          </Card>
          <Card
            className="bg-gradient-to-br from-purple-500 to-purple-600 text-white cursor-pointer hover:scale-[1.02] active:scale-100 transition-transform"
            data-testid="gm-stat-re-approvals"
            onClick={() => setActiveTab('planning')}
          >
            <CardContent className="p-4">
              <Calculator className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingREApprovals}</p>
              <p className="text-xs opacity-80">RE Approvals</p>
            </CardContent>
          </Card>
          <Card
            className="bg-gradient-to-br from-amber-500 to-amber-600 text-white cursor-pointer hover:scale-[1.02] active:scale-100 transition-transform"
            data-testid="gm-stat-site-requests"
            onClick={() => setActiveTab('planning_board')}
          >
            <CardContent className="p-4">
              <HardHat className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingSiteRequests}</p>
              <p className="text-xs opacity-80">Site Requests</p>
            </CardContent>
          </Card>
          <Card
            className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white cursor-pointer hover:scale-[1.02] active:scale-100 transition-transform"
            data-testid="gm-stat-completed"
            onClick={() => setDrillDialog({
              open: true,
              title: 'Completed Projects',
              items: (projects || []).filter(p => p.status === 'completed'),
              emptyText: 'No completed projects yet.'
            })}
          >
            <CardContent className="p-4">
              <CheckCircle className="h-6 w-6 mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.completedProjects}</p>
              <p className="text-xs opacity-80">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* ===== Dashboard Menu — 3 peer tabs at the top: 
                Final Estimate | Rough Estimate | Planning =====
            Internally we keep using the legacy `activeTab` values so existing
            TabsContent blocks render unchanged. RE maps to legacy 'planning'.
            FE maps to legacy 'final_estimate'. Planning maps to 'planning_board'. */}
        {(() => {
          const isRE = activeTab === 'planning' || activeTab === 'rough_estimate';
          const isFE = activeTab === 'final_estimate';
          const isPlanningBoard = activeTab === 'planning_board';
          return (
            <div className="bg-white border shadow-sm p-1 rounded-md inline-flex gap-1 flex-wrap mb-4" data-testid="gm-main-tabs">
              <button
                onClick={() => setActiveTab('final_estimate')}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${isFE ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'}`}
                data-testid="gm-tab-fe"
              >
                <FileText className="h-4 w-4" /> Final Estimate
                {stats.pendingFEApprovals > 0 && (
                  <Badge className="bg-blue-500 text-white text-xs ml-1">{stats.pendingFEApprovals}</Badge>
                )}
              </button>
              <button
                onClick={() => setActiveTab('planning')}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${isRE ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'}`}
                data-testid="gm-tab-re"
              >
                <Calculator className="h-4 w-4" /> Rough Estimate
                {stats.pendingREApprovals > 0 && (
                  <Badge className="bg-red-500 text-white text-xs ml-1">{stats.pendingREApprovals}</Badge>
                )}
              </button>
              <button
                onClick={() => setActiveTab('planning_board')}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${isPlanningBoard ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'}`}
                data-testid="gm-tab-planning-board"
              >
                <Building2 className="h-4 w-4" /> Planning
              </button>
              <button
                onClick={() => setActiveTab('labour_advance')}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${activeTab === 'labour_advance' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'}`}
                data-testid="gm-tab-labour-advance-pill"
              >
                <Wallet className="h-4 w-4" /> Labour Advance
                {stats.pendingLabourAdvances > 0 && (
                  <Badge className="bg-amber-500 text-white text-xs ml-1">{stats.pendingLabourAdvances}</Badge>
                )}
              </button>
            </div>
          );
        })()}

        {/* Single Tabs container — legacy values continue to drive content rendering */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const validTabs = ['overview', 'planning', 'projects', 'site_engineer', 'accountant', 'design', 'final_estimate', 'planning_board', 'labour_advance'];
            if (validTabs.includes(value)) {
              lastActiveTabRef.current = value;
              setActiveTab(value);
            }
          }}
          className="space-y-4 mt-4"
        >
          <TabsList className="hidden">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="planning">Rough Estimates</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="site_engineer">Site Engineer</TabsTrigger>
            <TabsTrigger value="accountant">Accountant</TabsTrigger>
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="final_estimate">Final Estimates</TabsTrigger>
            <TabsTrigger value="planning_board">Planning Board</TabsTrigger>
            <TabsTrigger value="labour_advance" data-testid="gm-tab-labour-advance">Labour Advance</TabsTrigger>
          </TabsList>
          
          {/* Embedded Planning Board (rendered for the new Planning outer tab) */}
          <TabsContent value="planning_board" className="space-y-3" data-testid="gm-planning-board-tab">
            <PlanningBoard embedded />
          </TabsContent>

          {/* Labour Advance Approvals */}
          <TabsContent value="labour_advance" className="space-y-3" data-testid="gm-labour-advance-tab">
            <LabourAdvanceQueue role="general_manager" />
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Labour Advance Approvals (Planning → PM → GM → Accountant) */}
            <LabourAdvanceQueue role="general_manager" />

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
                            {re.re_number && (
                              <span className="font-mono text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                                {re.re_number}
                              </span>
                            )}
                            <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">
                              RE{re.revision || 0}
                            </Badge>
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
                              openReEditDialog(re);
                            }}
                            data-testid={`edit-re-${re.re_project_id}`}
                          >
                            <Edit2 className="h-4 w-4 mr-1" /> Edit
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
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteREProject(re);
                            }}
                            data-testid={`delete-re-${re.re_project_id}`}
                            title="Delete this Rough Estimate"
                          >
                            <Trash2 className="h-4 w-4" />
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
                  <IndianRupee className="h-5 w-5 text-emerald-600" />
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

          {/* ==================== FINAL ESTIMATE TAB ==================== */}
          <TabsContent value="final_estimate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-blue-600" /> Final Estimates — Pending GM Approval
                </CardTitle>
                <p className="text-sm text-gray-500">Review and approve/reject Final Estimates submitted by Planning. Approved FEs move to CRE. Rejections return to Planning with your reason.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {feProjects.length === 0 ? (
                    <p className="text-center text-gray-400 py-8" data-testid="fe-empty">No Final Estimates pending review.</p>
                  ) : (
                    feProjects.map(p => {
                      const fe = p.fe || {};
                      const isRejected = fe.status === 'rejected_by_gm';
                      return (
                        <div key={p.project_id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow" data-testid={`fe-card-${p.project_id}`}>
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold">{p.name}</h4>
                                <Badge variant="outline" className="text-xs">Rev {fe.revision || 0}</Badge>
                                <Badge className={isRejected ? 'bg-red-100 text-red-700 text-xs' : 'bg-blue-100 text-blue-700 text-xs'}>
                                  {isRejected ? 'Rejected — Awaiting Re-submission' : 'Pending GM Review'}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {p.client_name || 'Client'} {p.client_phone ? `· ${p.client_phone}` : ''} {p.location ? `· ${p.location}` : ''}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                Submitted: {fe.sent_to_gm_at ? new Date(fe.sent_to_gm_at).toLocaleString() : '—'}
                              </p>
                              {isRejected && (fe.gm_rejections || []).length > 0 && (
                                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                                  <span className="font-semibold text-red-600">Your last rejection:</span> <span className="text-gray-700">{fe.gm_rejections[fe.gm_rejections.length - 1].reason}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <Button size="sm" variant="outline" onClick={() => window.open(`/projects/${p.project_id}?tab=scope`, '_blank')} data-testid={`fe-view-${p.project_id}`}>
                                <Eye className="h-3.5 w-3.5 mr-1" /> View FE
                              </Button>
                              {!isRejected && (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    disabled={feBusy}
                                    data-testid={`fe-approve-${p.project_id}`}
                                    onClick={() => setFeApproveDialog({ open: true, project: p, typed: '', autoShare: false, submitting: false })}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={feBusy}
                                    data-testid={`fe-reject-${p.project_id}`}
                                    onClick={() => setFeRejectDialog({ open: true, project: p, reason: '' })}
                                  >
                                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* FE Reject Dialog */}
      <Dialog open={feRejectDialog.open} onOpenChange={(o) => !o && setFeRejectDialog({ open: false, project: null, reason: '' })}>
        <DialogContent className="max-w-md" data-testid="fe-reject-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" /> Reject Final Estimate
            </DialogTitle>
            <DialogDescription>
              Project: <b>{feRejectDialog.project?.name}</b> · Rev {feRejectDialog.project?.fe?.revision || 0}. Rejection reason is visible to Planning so they can fix and re-submit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Rejection reason <span className="text-red-500">*</span></Label>
            <Textarea
              rows={5}
              value={feRejectDialog.reason}
              onChange={(e) => setFeRejectDialog({ ...feRejectDialog, reason: e.target.value })}
              placeholder="e.g., Scope item quantities do not match the site measurements. Please correct and re-submit."
              data-testid="fe-reject-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeRejectDialog({ open: false, project: null, reason: '' })}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!feRejectDialog.reason.trim() || feBusy}
              data-testid="fe-reject-submit-btn"
              onClick={async () => {
                setFeBusy(true);
                try {
                  await axios.post(`${API}/gm/final-estimates/${feRejectDialog.project.project_id}/reject`, { reason: feRejectDialog.reason.trim() });
                  toast.success('Final Estimate rejected — sent back to Planning');
                  setFeRejectDialog({ open: false, project: null, reason: '' });
                  fetchDashboardData(false);
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to reject');
                } finally { setFeBusy(false); }
              }}
            >
              Reject &amp; Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                        {viewItem.client_phone && (
                        <div>
                          <span className="text-gray-500">Phone:</span>
                          <p>{viewItem.client_phone}</p>
                        </div>
                        )}
                        {viewItem.client_email && (
                        <div>
                          <span className="text-gray-500">Email:</span>
                          <p>{viewItem.client_email}</p>
                        </div>
                        )}
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

                  {/* Sales Rough Requirement — always visible to GM */}
                  {viewItem.rough_requirement && (
                    <Card className="bg-amber-50 border-amber-200" data-testid="gm-rough-requirement">
                      <CardContent className="p-4">
                        <h4 className="font-semibold mb-2 text-sm text-amber-800 flex items-center gap-1.5">
                          <FileText className="h-4 w-4" />
                          Sales Team Input
                        </h4>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{viewItem.rough_requirement}</p>
                        {viewItem.rough_requirement_by && (
                          <p className="text-xs text-amber-600 mt-2">
                            Submitted by: <span className="font-medium">{viewItem.rough_requirement_by}</span>
                            {viewItem.rough_requirement_at && ` on ${new Date(viewItem.rough_requirement_at).toLocaleDateString('en-IN')}`}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* GM Rejection History — internal-only */}
                  {(viewItem.rejection_history && viewItem.rejection_history.length > 0) && (
                    <Card className="bg-red-50 border-red-300 border-2" data-testid="gm-rejection-history">
                      <CardContent className="p-4">
                        <h4 className="font-semibold mb-2 text-sm text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4" />
                          Past Rejection Reasons
                          <Badge className="bg-red-100 text-red-700 text-[10px] ml-1">{viewItem.rejection_history.length}</Badge>
                        </h4>
                        <div className="space-y-2">
                          {[...viewItem.rejection_history].reverse().map((rh, idx) => (
                            <div key={idx} className="bg-white p-2.5 rounded border border-red-200">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-red-700">
                                  Attempt #{viewItem.rejection_history.length - idx}
                                  {typeof rh.revision === 'number' && ` · RE${rh.revision}`}
                                </span>
                                <span className="text-[10px] text-red-500">
                                  {rh.rejected_at ? new Date(rh.rejected_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{rh.reason || '(no reason provided)'}</p>
                              {rh.rejected_by_name && (
                                <p className="text-[10px] text-red-600 mt-1">— {rh.rejected_by_name}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

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

      {/* RE Edit Dialog */}
      <Dialog open={reEditDialog} onOpenChange={setReEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-600" />
                Edit Rough Estimate
              </div>
              <Button 
                size="sm"
                onClick={() => handleGenerateREPDF(reEditProject)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </DialogTitle>
            <DialogDescription>
              URBAN SPACE BUILDERS - Ref: {reEditProject?.re_number || reEditProject?.re_project_id}
              {reEditProject?.revision > 0 && <span className="ml-2 font-semibold">(Revision RE{reEditProject.revision})</span>}
            </DialogDescription>
          </DialogHeader>

          {reEditProject && (
            <div className="max-h-[70vh] overflow-y-auto space-y-6 pr-1">
              {/* Client Info (Read-only) */}
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2 text-sm text-gray-600">Client Information</h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><span className="text-gray-500">Name:</span><p className="font-medium">{reEditProject.client_name}</p></div>
                    {reEditProject.client_phone && <div><span className="text-gray-500">Phone:</span><p>{reEditProject.client_phone}</p></div>}
                    {reEditProject.client_email && <div><span className="text-gray-500">Email:</span><p>{reEditProject.client_email}</p></div>}
                  </div>
                </CardContent>
              </Card>

              {/* Project Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project Name</Label>
                  <Input value={reEditForm.project_name} onChange={(e) => setReEditForm({...reEditForm, project_name: e.target.value})} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={reEditForm.location} onChange={(e) => setReEditForm({...reEditForm, location: e.target.value})} />
                </div>
                <div>
                  <Label>Square Feet</Label>
                  <NumericInput value={reEditForm.sqft} onChange={(e) => setReEditForm({...reEditForm, sqft: e.target.value})} />
                </div>
                <div>
                  <Label>Building Type</Label>
                  <Select value={reEditForm.building_type} onValueChange={(v) => setReEditForm({...reEditForm, building_type: v})}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="villa">Villa</SelectItem>
                      <SelectItem value="apartment">Apartment</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Scope Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Rough Scope of Work</Label>
                  <Button variant="outline" size="sm" onClick={addReScopeItem}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center w-20">Qty</th>
                        <th className="px-3 py-2 text-center w-20">Unit</th>
                        <th className="px-3 py-2 text-right w-24">Rate</th>
                        <th className="px-3 py-2 text-right w-24">Total</th>
                        <th className="px-3 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {reEditForm.rough_scope_items.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-500">No scope items added</td></tr>
                      ) : (
                        reEditForm.rough_scope_items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2">
                              <Input value={item.name} onChange={(e) => updateReScopeItem(idx, 'name', e.target.value)} placeholder="Item description" className="h-8" />
                            </td>
                            <td className="px-3 py-2">
                              <NumericInput value={item.quantity} onChange={(e) => updateReScopeItem(idx, 'quantity', e.target.value)} className="h-8 text-center" />
                            </td>
                            <td className="px-3 py-2">
                              <UnitSelect value={item.unit} onChange={(v) => updateReScopeItem(idx, 'unit', v)} className="h-8" />
                            </td>
                            <td className="px-3 py-2">
                              <NumericInput value={item.rate} onChange={(e) => updateReScopeItem(idx, 'rate', e.target.value)} className="h-8 text-right" />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                            <td className="px-3 py-2">
                              <Button variant="ghost" size="sm" onClick={() => removeReScopeItem(idx)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Handover + Total */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project Handover Time (Months)</Label>
                  <NumericInput value={reEditForm.handover_months} onChange={(e) => setReEditForm({...reEditForm, handover_months: e.target.value})} placeholder="Enter number of months" />
                </div>
              </div>
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-600">Estimated Total (from Scope Items)</p>
                  <p className="text-3xl font-bold text-purple-800">
                    {formatCurrency(reEditForm.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0))}
                  </p>
                </CardContent>
              </Card>

              {/* Planning Notes */}
              <div>
                <Label>Planning Notes</Label>
                <Textarea value={reEditForm.planning_notes} onChange={(e) => setReEditForm({...reEditForm, planning_notes: e.target.value})} placeholder="Add notes for this rough estimate..." rows={3} />
              </div>

              {/* Change Log */}
              {reChangeLogs.length > 0 && (
                <div data-testid="gm-change-log-section">
                  <Label className="flex items-center gap-1.5 mb-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    Edit History
                  </Label>
                  <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto bg-gray-50">
                    {reChangeLogs.map((log) => (
                      <div key={log.log_id} className="px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">
                            {log.user_name}
                            <Badge className="ml-1.5 text-[10px] py-0 px-1.5 bg-blue-50 text-blue-700 border-blue-200">{log.user_role}</Badge>
                          </span>
                          <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                        <ul className="space-y-0.5">
                          {log.changes.map((c, i) => (
                            <li key={i} className="text-xs text-gray-600">
                              <span className="font-medium text-gray-700">{c.field}</span>
                              {c.old ? (
                                <span>: <span className="line-through text-red-500">{c.old}</span> &rarr; <span className="text-green-700">{c.new}</span></span>
                              ) : (
                                <span>: set to <span className="text-green-700">{c.new}</span></span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveReProject} variant="outline" data-testid="gm-save-re-btn">
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FE Approve confirmation — GM must type APPROVE to confirm */}
      <Dialog open={feApproveDialog.open} onOpenChange={(o) => !o && !feApproveDialog.submitting && setFeApproveDialog({ open: false, project: null, typed: '', autoShare: false, submitting: false })}>
        <DialogContent className="max-w-md" data-testid="gm-fe-approve-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-600" /> Approve Final Estimate</DialogTitle>
            <DialogDescription>
              You are about to approve <strong>{feApproveDialog.project?.name || 'this project'}</strong>. Choose where it goes next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 text-xs">
              <p className="font-semibold text-emerald-900 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Auto-share with Client
              </p>
              <p className="text-emerald-700 mt-1">
                On approval, the Final Estimate share link is generated immediately and sent to the client.
                CRE receives a notification but does not gate the flow.
              </p>
            </div>
            <Input
              autoFocus
              placeholder='Type "APPROVE" to enable the button'
              value={feApproveDialog.typed}
              onChange={(e) => setFeApproveDialog(d => ({ ...d, typed: e.target.value }))}
              data-testid="gm-fe-approve-typed"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeApproveDialog({ open: false, project: null, typed: '', autoShare: false, submitting: false })} disabled={feApproveDialog.submitting}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={feApproveDialog.submitting || (feApproveDialog.typed || '').trim().toUpperCase() !== 'APPROVE'}
              data-testid="gm-fe-approve-confirm"
              onClick={async () => {
                const proj = feApproveDialog.project;
                if (!proj) return;
                setFeApproveDialog(d => ({ ...d, submitting: true }));
                try {
                  const res = await axios.post(`${API}/gm/final-estimates/${proj.project_id}/approve`, {
                    auto_share_to_client: true,
                  });
                  if (res.data?.public_url) {
                    try { await navigator.clipboard.writeText(window.location.origin + res.data.public_url); } catch {}
                    toast.success('FE approved — client link copied to clipboard');
                  } else {
                    toast.success('Final Estimate approved');
                  }
                  setFeApproveDialog({ open: false, project: null, typed: '', autoShare: false, submitting: false });
                  fetchAllData(false);
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Failed to approve');
                  setFeApproveDialog(d => ({ ...d, submitting: false }));
                }
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" /> {feApproveDialog.submitting ? 'Approving…' : 'Confirm Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GM Stats Drill-down Dialog */}
      <Dialog open={drillDialog.open} onOpenChange={(o) => !o && setDrillDialog({ open: false, title: '', items: [], emptyText: '' })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="gm-drill-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-violet-600" /> {drillDialog.title}
              <Badge variant="outline" className="ml-2">{(drillDialog.items || []).length}</Badge>
            </DialogTitle>
            <DialogDescription>Click any project to open its detail page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {(drillDialog.items || []).length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">{drillDialog.emptyText}</p>
            ) : (
              (drillDialog.items || []).map(p => (
                <div
                  key={p.project_id}
                  className="border rounded-md p-3 hover:bg-violet-50 cursor-pointer transition"
                  onClick={() => window.open(`/projects/${p.project_id}`, '_blank')}
                  data-testid={`gm-drill-item-${p.project_id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{p.name || p.client_name || 'Untitled Project'}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.client_name || '—'} {p.client_phone ? `· ${p.client_phone}` : ''} {p.location ? `· ${p.location}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] capitalize">{(p.status || '').replace(/_/g, ' ') || 'unknown'}</Badge>
                      {p.total_value ? <span className="text-xs font-semibold text-violet-700">{formatCurrency(p.total_value)}</span> : null}
                      <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrillDialog({ open: false, title: '', items: [], emptyText: '' })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
};

export default GMDashboard;
