import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Calculator, LogOut, Clock, RefreshCw, CheckCircle, XCircle, FileText,
  Building2, Send, Eye, Edit2, Plus, Trash2, Save, Phone, Mail, MapPin,
  ArrowLeft, Target, Download, AlertCircle, Search, GitBranch, MessageSquare, Upload, X
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { generateREPDF } from '../utils/pdfGenerator';
import { SortableList, SortableTableRow, DragHandle } from '../components/SortableList';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { UnitSelect } from '../components/UnitSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RE_STATUS_CONFIG = {
  re_requested: { label: 'New Request', color: 'bg-amber-50 text-amber-700 border-blue-300', icon: Clock },
  re_in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: RefreshCw },
  re_submitted: { label: 'Submitted for Approval', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: FileText },
  re_approved: { label: 'GM Approved', color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle },
  re_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-300', icon: XCircle },
  sent_to_client: { label: 'Sent to Client', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Send },
  client_feedback: { label: 'Client Feedback', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: MessageSquare },
  client_approved: { label: 'Client Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: CheckCircle },
  deal_closed: { label: 'Deal Closed', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: Target },
  converted: { label: 'Converted to Project', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: Building2 }
};

export default function REProjectsPage({ embedded = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('new');
  
  // Dialogs
  const [editDialog, setEditDialog] = useState(false);
  const [approvalDialog, setApprovalDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Edit Form
  const [editForm, setEditForm] = useState({
    project_name: '',
    location: '',
    sqft: '',
    building_type: '',
    rough_scope_items: [],
    payment_schedule: [],
    handover_months: '',
    planning_notes: ''
  });
  
  const [rejectionReason, setRejectionReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [revisionDialog, setRevisionDialog] = useState(false);
  const [revisionProject, setRevisionProject] = useState(null);
  const [revisionGroup, setRevisionGroup] = useState([]);

  // RE Template picker
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [reTemplates, setReTemplates] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const fetchTemplatesList = async () => {
    try {
      setTemplatesLoading(true);
      const res = await axios.get(`${API}/crm/re-templates`);
      setReTemplates(res.data || []);
    } catch (err) {
      toast.error('Failed to load RE templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (templatePickerOpen) fetchTemplatesList();
  }, [templatePickerOpen]);

  const applyTemplateToRE = (tpl, mode = 'replace') => {
    const templateItems = (tpl.scope_items || []).map(i => ({
      name: i.name || '',
      quantity: Number(i.quantity || 0),
      unit: i.unit || 'nos',
      rate: Number(i.rate || 0),
      total: Number(i.quantity || 0) * Number(i.rate || 0),
    }));
    setEditForm(prev => ({
      ...prev,
      rough_scope_items: mode === 'append'
        ? [...prev.rough_scope_items, ...templateItems]
        : templateItems,
    }));
    setTemplatePickerOpen(false);
    toast.success(`Template "${tpl.name}" applied (${templateItems.length} items)`);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, dashboardRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/planning/re-dashboard`),
        axios.get(`${API}/crm/re-projects`)
      ]);
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
      }
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  // Feb 28 2026 — Claim an RE for the current planner. Sets status to
  // re_in_progress and persists prepared_by + prepared_by_name so every
  // other planner sees "Working: <name>" on the card immediately.
  const handleStartWork = async (project) => {
    try {
      const res = await axios.post(`${API}/crm/re-projects/${project.re_project_id}/start-work`);
      if (res.data?.prepared_by && res.data.prepared_by !== user?.user_id) {
        toast.warning(`Already claimed by ${res.data.prepared_by_name || 'another planner'}`);
      } else {
        toast.success(`You're now working on ${project.re_number}`);
      }
      await fetchData(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start work');
    }
  };

  const openEditDialog = (project) => {
    setSelectedProject(project);
    setEditForm({
      project_name: project.project_name || '',
      location: project.location || '',
      sqft: project.sqft || '',
      building_type: project.building_type || '',
      rough_scope_items: project.rough_scope_items || [],
      payment_schedule: project.payment_schedule || [],
      handover_months: project.handover_months || '',
      planning_notes: project.planning_notes || ''
    });
    setEditDialog(true);
    fetchChangeLogs(project.re_project_id);
  };

  const fetchChangeLogs = async (reProjectId) => {
    try {
      setLoadingLogs(true);
      const res = await axios.get(`${API}/crm/re-projects/${reProjectId}/change-logs`);
      setChangeLogs(res.data);
    } catch {
      setChangeLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSaveProject = async () => {
    // Calculate total from scope items
    const scopeItems = editForm.rough_scope_items.map(item => ({
      ...item,
      quantity: parseFloat(item.quantity) || 0,
      rate: parseFloat(item.rate) || 0,
      total: (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)
    }));
    const scopeTotal = scopeItems.reduce((sum, item) => sum + (item.total || 0), 0);
    
    // Recompute payment_schedule amount from % * scopeTotal so totals match the latest estimate.
    const paymentSchedule = (editForm.payment_schedule || []).map(p => {
      const pct = parseFloat(p.percentage) || 0;
      const explicitAmt = parseFloat(p.amount) || 0;
      return {
        stage_name: p.stage_name || '',
        percentage: pct,
        amount: pct > 0 ? Math.round((scopeTotal * pct) / 100) : explicitAmt,
        due_date: p.due_date || null,
      };
    }).filter(p => p.stage_name && (p.percentage > 0 || p.amount > 0));
    
    try {
      await axios.patch(`${API}/crm/re-projects/${selectedProject.re_project_id}`, {
        ...editForm,
        rough_scope_items: scopeItems,
        payment_schedule: paymentSchedule,
        sqft: editForm.sqft ? parseFloat(editForm.sqft) : null,
        handover_months: editForm.handover_months ? parseInt(editForm.handover_months) : null,
        estimated_total: scopeTotal
      });
      toast.success('RE Project updated');
      fetchChangeLogs(selectedProject.re_project_id);
      setEditDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update project');
    }
  };

  const handleSubmitForApproval = async (projectId) => {
    try {
      await axios.post(`${API}/crm/re-projects/${projectId}/submit-for-approval`);
      toast.success('Submitted for GM approval');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit');
    }
  };

  // Generate PDF handler
  const handleGenerateREPDF = async (project) => {
    try {
      await generateREPDF(project);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleApprove = async (approved) => {
    try {
      await axios.patch(`${API}/crm/re-projects/${selectedProject.re_project_id}/approve`, {
        approved,
        rejection_reason: approved ? null : rejectionReason
      });
      toast.success(approved ? 'RE Project approved' : 'RE Project rejected');
      setApprovalDialog(false);
      setRejectionReason('');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to process approval');
    }
  };

  // Search RE projects
  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (!q || q.length < 2) { setSearchResults(null); return; }
    try {
      const res = await axios.get(`${API}/crm/re-projects/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data);
    } catch { setSearchResults(null); }
  };

  // View all revisions of an RE number
  const viewRevisions = async (reNumber) => {
    try {
      const res = await axios.get(`${API}/crm/re-projects/by-number/${encodeURIComponent(reNumber)}`);
      setRevisionGroup(res.data);
      setRevisionProject(res.data[0]);
      setRevisionDialog(true);
    } catch { toast.error('Failed to load revisions'); }
  };

  // Create a new revision from client feedback
  const handleCreateRevision = async (project) => {
    try {
      const res = await axios.post(`${API}/crm/re-projects/${project.re_project_id}/create-revision`);
      toast.success(res.data.message);
      fetchData(false);
      setRevisionDialog(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create revision');
    }
  };

  const addScopeItem = () => {
    setEditForm({
      ...editForm,
      rough_scope_items: [...editForm.rough_scope_items, { name: '', quantity: 1, unit: 'nos', rate: 0, total: 0 }]
    });
  };

  const updateScopeItem = (index, field, value) => {
    const items = [...editForm.rough_scope_items];
    items[index][field] = value;
    if (field === 'quantity' || field === 'rate') {
      items[index].total = (parseFloat(items[index].quantity) || 0) * (parseFloat(items[index].rate) || 0);
    }
    setEditForm({ ...editForm, rough_scope_items: items });
  };

  const removeScopeItem = (index) => {
    const items = editForm.rough_scope_items.filter((_, i) => i !== index);
    setEditForm({ ...editForm, rough_scope_items: items });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getFilteredProjects = () => {
    switch (activeTab) {
      case 'new':
        return projects.filter(p => p.status === 're_requested');
      case 'in_progress':
        return projects.filter(p => ['re_in_progress', 'client_feedback'].includes(p.status));
      case 'submitted':
        return projects.filter(p => p.status === 're_submitted');
      case 'approved':
        return projects.filter(p => ['re_approved', 'sent_to_client', 'client_approved', 'deal_closed', 'converted'].includes(p.status));
      case 'rejected':
        return projects.filter(p => p.status === 're_rejected');
      default:
        return projects;
    }
  };

  const canEdit = user?.role === 'planning' || user?.role === 'super_admin' || user?.role === 'general_manager';
  const canApprove = user?.role === 'general_manager' || user?.role === 'super_admin';
  const canDelete = canEdit; // Same roles can delete
  const [changeLogs, setChangeLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleDeleteREProject = async (project) => {
    const label = project.re_number || project.project_name || project.re_project_id;
    if (!window.confirm(`Delete Rough Estimate "${label}"?\n\nThis cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/crm/re-projects/${project.re_project_id}`);
      toast.success(`Deleted "${label}"`);
      setProjects(prev => prev.filter(p => p.re_project_id !== project.re_project_id));
      return;
    } catch (e) {
      // 409 = needs force flag (converted RE → cascading delete required)
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
          const res = await axios.delete(`${API}/crm/re-projects/${project.re_project_id}?force=true`);
          toast.success(res.data?.message || `Force-deleted "${label}"`);
          setProjects(prev => prev.filter(p => p.re_project_id !== project.re_project_id));
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
        <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50'}>
      {/* Navigation */}
      {!embedded && <AppHeader user={user} />}

      <div className={embedded ? '' : 'max-w-7xl mx-auto px-4 py-6 sm:px-6'}>
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'new' ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-1 text-amber-600" />
              <p className="text-2xl font-bold text-amber-700">{dashboard?.status_counts?.re_requested || 0}</p>
              <p className="text-xs text-amber-600">New Requests</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'in_progress' ? 'ring-2 ring-yellow-500' : ''}`}
            onClick={() => setActiveTab('in_progress')}
          >
            <CardContent className="p-4 text-center">
              <RefreshCw className="h-6 w-6 mx-auto mb-1 text-yellow-600" />
              <p className="text-2xl font-bold text-yellow-700">{dashboard?.status_counts?.re_in_progress || 0}</p>
              <p className="text-xs text-yellow-600">In Progress</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'submitted' ? 'ring-2 ring-purple-500' : ''}`}
            onClick={() => setActiveTab('submitted')}
          >
            <CardContent className="p-4 text-center">
              <FileText className="h-6 w-6 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold text-purple-700">{dashboard?.status_counts?.re_submitted || 0}</p>
              <p className="text-xs text-purple-600">Awaiting Approval</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'approved' ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => setActiveTab('approved')}
          >
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold text-green-700">{dashboard?.status_counts?.re_approved || 0}</p>
              <p className="text-xs text-green-600">Approved</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all ${activeTab === 'rejected' ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            <CardContent className="p-4 text-center">
              <XCircle className="h-6 w-6 mx-auto mb-1 text-red-600" />
              <p className="text-2xl font-bold text-red-700">{dashboard?.status_counts?.re_rejected || 0}</p>
              <p className="text-xs text-red-600">Rejected</p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <div className="relative flex items-center" data-testid="re-search-bar">
          <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none z-10" />
          <Input
            placeholder="Search by RE number (USB-RE0001), project name, or client..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-11 text-sm"
            data-testid="re-search-input"
          />
          {searchResults && searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map(p => (
                <div key={p.re_project_id} className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between text-sm"
                  onClick={() => { openEditDialog(p); setSearchQuery(''); setSearchResults(null); }}
                >
                  <div>
                    <span className="font-mono font-bold text-purple-700">{p.re_number}</span>
                    <span className="text-gray-400 ml-1">RE{p.revision || 0}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    <span>{p.project_name || p.client_name}</span>
                  </div>
                  <Badge className={RE_STATUS_CONFIG[p.status]?.color || 'bg-gray-100'}>{RE_STATUS_CONFIG[p.status]?.label || p.status}</Badge>
                </div>
              ))}
            </div>
          )}
          {searchResults && searchResults.length === 0 && searchQuery.length >= 2 && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-500 text-center">No results found</div>
          )}
        </div>

        {/* Projects List */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-purple-600" />
              RE Projects - {activeTab.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {getFilteredProjects().length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No projects in this category
                </div>
              ) : (
                getFilteredProjects().map(project => {
                  const isClientApproved = project.status === 'client_approved';
                  const hasOtherApproved = !isClientApproved && projects.some(
                    p => p.parent_re_number === project.parent_re_number && p.status === 'client_approved'
                  );
                  return (
                  <div 
                    key={project.re_project_id} 
                    className={`p-4 hover:bg-gray-50 transition-all ${isClientApproved ? 'border-l-4 border-l-green-500 bg-green-50/30' : ''} ${hasOtherApproved ? 'opacity-50' : ''}`}
                    data-testid={`re-project-${project.re_project_id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {project.re_number && (
                            <span 
                              className="font-mono text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded cursor-pointer hover:bg-purple-200"
                              onClick={() => viewRevisions(project.parent_re_number || project.re_number)}
                              data-testid={`re-number-${project.re_project_id}`}
                            >
                              {project.re_number}
                            </span>
                          )}
                          <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">
                            <GitBranch className="h-3 w-3 mr-0.5" /> RE{project.revision || 0}
                          </Badge>
                          <h4 className="font-semibold text-gray-900">
                            {project.project_name || project.client_name}
                          </h4>
                          {RE_STATUS_CONFIG[project.status] && (
                            <Badge className={RE_STATUS_CONFIG[project.status].color}>
                              {RE_STATUS_CONFIG[project.status].label}
                            </Badge>
                          )}
                          {/* Feb 28 2026 — Show which planner has claimed
                              the RE so other planners don't double-work. */}
                          {project.prepared_by_name && project.status !== 're_requested' && (
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200" data-testid={`re-planner-${project.re_project_id}`}>
                              <RefreshCw className="h-3 w-3 mr-1" /> {project.prepared_by_name} (Planning Person)
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500">Client:</span>
                            <p className="font-medium">{project.client_name}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Location:</span>
                            <p>{project.location || '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Size:</span>
                            <p>{project.sqft ? `${project.sqft} sqft` : '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Estimated Total:</span>
                            <p className="font-bold text-purple-600">{formatCurrency(project.estimated_total)}</p>
                          </div>
                        </div>
                        
                        {project.client_phone && (
                          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {project.client_phone}
                            {project.client_email && (
                              <>
                                <span className="mx-2">•</span>
                                <Mail className="h-3 w-3" /> {project.client_email}
                              </>
                            )}
                          </p>
                        )}
                        
                        {project.status === 're_rejected' && project.gm_rejection_reason && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="rejection-reason-box">
                            <p className="text-xs font-semibold text-red-700 flex items-center gap-1 mb-1">
                              <AlertCircle className="h-3 w-3" /> GM Rejection Reason
                              {(project.rejection_history || []).length > 1 && (
                                <span className="text-[10px] bg-red-100 px-1.5 py-0.5 rounded">{(project.rejection_history || []).length}× rejected</span>
                              )}
                            </p>
                            <p className="text-sm text-red-600">{project.gm_rejection_reason}</p>
                          </div>
                        )}
                        
                        {project.rough_requirement && (
                          <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg" data-testid="rough-requirement-card">
                            <p className="text-xs font-semibold text-amber-700 mb-1">Sales Rough Requirement:</p>
                            <p className="text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap">{project.rough_requirement}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        {canEdit && project.status === 're_requested' && (
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700"
                            onClick={() => handleStartWork(project)}
                            data-testid={`start-work-${project.re_project_id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" /> Start Work
                          </Button>
                        )}
                        {canEdit && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openEditDialog(project)}
                              data-testid={`edit-re-${project.re_project_id}`}
                            >
                              <Edit2 className="h-4 w-4 mr-1" /> Edit
                            </Button>
                            {['re_in_progress', 're_rejected'].includes(project.status) && (
                              <Button 
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleSubmitForApproval(project.re_project_id)}
                                data-testid={`submit-re-${project.re_project_id}`}
                              >
                                <Send className="h-4 w-4 mr-1" /> {project.status === 're_rejected' ? 'Resubmit' : 'Submit'}
                              </Button>
                            )}
                          </>
                        )}
                        
                        {canEdit && project.status === 'client_feedback' && (
                          <Button 
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => handleCreateRevision(project)}
                            data-testid={`create-revision-${project.re_project_id}`}
                          >
                            <GitBranch className="h-4 w-4 mr-1" /> Create Revision
                          </Button>
                        )}
                        
                        {canEdit && project.revision_requested && ['re_approved', 'sent_to_client'].includes(project.status) && (
                          <Button 
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => handleCreateRevision(project)}
                            data-testid={`create-revision-requested-${project.re_project_id}`}
                          >
                            <GitBranch className="h-4 w-4 mr-1" /> Create Revision (Requested)
                          </Button>
                        )}
                        
                        {canApprove && project.status === 're_submitted' && (
                          <Button 
                            size="sm"
                            onClick={() => { setSelectedProject(project); setApprovalDialog(true); }}
                          >
                            Review
                          </Button>
                        )}
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleGenerateREPDF(project)}
                          className="text-purple-600 hover:text-purple-700"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => openEditDialog(project)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteREProject(project)}
                            data-testid={`delete-re-${project.re_project_id}`}
                            title="Delete this Rough Estimate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
      </div>

      {/* Edit RE Project Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-5xl max-h-[92vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-600" />
                {canEdit ? 'Edit' : 'View'} Rough Estimate
              </div>
              <Button 
                size="sm"
                onClick={() => handleGenerateREPDF(selectedProject)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </DialogTitle>
            <DialogDescription>
              URBAN SPACE BUILDERS - Ref: {selectedProject?.re_number || selectedProject?.re_project_id}
              {selectedProject?.revision > 0 && <span className="ml-2 font-semibold">(Revision RE{selectedProject.revision})</span>}
            </DialogDescription>
          </DialogHeader>
          
          {selectedProject && (
            <div className="max-h-[70vh] overflow-y-auto space-y-6 pr-1">
              {/* Client Info (Read-only) */}
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2 text-sm text-gray-600">Client Information</h4>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <p className="font-medium">{selectedProject.client_name}</p>
                    </div>
                    {selectedProject.client_phone && (
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p>{selectedProject.client_phone}</p>
                    </div>
                    )}
                    {selectedProject.client_email && (
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p>{selectedProject.client_email}</p>
                    </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* GM Rejection History — internal-only, never shown to client */}
              {(selectedProject.rejection_history && selectedProject.rejection_history.length > 0) && (
                <Card className="bg-red-50 border-red-300 border-2" data-testid="rejection-history-card">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2 text-sm text-red-800 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      GM Rejection History
                      <Badge className="bg-red-100 text-red-700 text-[10px] ml-1">{selectedProject.rejection_history.length}</Badge>
                    </h4>
                    <div className="space-y-2">
                      {[...selectedProject.rejection_history].reverse().map((rh, idx) => (
                        <div key={idx} className="bg-white p-2.5 rounded border border-red-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-red-700">
                              Attempt #{selectedProject.rejection_history.length - idx}
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

              {/* Rough Requirement from Sales */}
              {selectedProject.rough_requirement && (
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2 text-sm text-amber-800 flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      Rough Requirement from Sales
                    </h4>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{selectedProject.rough_requirement}</p>
                    {selectedProject.rough_requirement_by && (
                      <p className="text-xs text-amber-600 mt-2">
                        Submitted by: {selectedProject.rough_requirement_by}
                        {selectedProject.rough_requirement_at && ` on ${new Date(selectedProject.rough_requirement_at).toLocaleDateString('en-IN')}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Revision Reason / Client Feedback (from previous revision) */}
              {(selectedProject.revision_reason || selectedProject.previous_client_feedback || selectedProject.client_feedback_notes) && (
                <Card className="bg-orange-50 border-orange-300 border-2">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2 text-sm text-orange-800 flex items-center gap-1.5">
                      <RefreshCw className="h-4 w-4" />
                      {selectedProject.revision_reason ? `Revision Requested — RE${selectedProject.revision}` : 'Client Feedback'}
                    </h4>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-white p-2 rounded border border-orange-200">
                      {selectedProject.revision_reason || selectedProject.previous_client_feedback || selectedProject.client_feedback_notes}
                    </p>
                    {selectedProject.client_feedback_by && (
                      <p className="text-xs text-orange-600 mt-2">
                        Entered by: <span className="font-medium">{selectedProject.client_feedback_by}</span>
                        {selectedProject.client_feedback_at && ` on ${new Date(selectedProject.client_feedback_at).toLocaleDateString('en-IN')}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* File Attachments */}
              <Card className="bg-gray-50 border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-purple-600" />
                      Attachments {(selectedProject.attachments || []).length > 0 && <Badge className="bg-purple-100 text-purple-700 text-[10px]">{(selectedProject.attachments || []).length}</Badge>}
                    </h4>
                    {canEdit && (
                      <label className="cursor-pointer inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white">
                        <Upload className="h-3 w-3" /> Upload File
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('label', file.name);
                            try {
                              const res = await axios.post(`${API}/crm/re-projects/${selectedProject.re_project_id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                              setSelectedProject(prev => ({ ...prev, attachments: [...(prev.attachments || []), res.data] }));
                              toast.success('File uploaded');
                            } catch (err) {
                              toast.error(err.response?.data?.detail || 'Upload failed');
                            }
                            e.target.value = '';
                          }}
                          data-testid="re-attachment-upload"
                        />
                      </label>
                    )}
                  </div>
                  {(selectedProject.attachments || []).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">No attachments yet. Upload PDFs, drawings, client signoff, reference images etc.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedProject.attachments || []).map((att) => (
                        <div key={att.file_id} className="flex items-center justify-between gap-2 bg-white border rounded p-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                            <a
                              href={`${API}/crm/re-projects/attachments/${att.file_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate font-medium text-purple-700 hover:underline"
                            >
                              {att.label || att.filename}
                            </a>
                            <span className="text-gray-400 whitespace-nowrap">({Math.round((att.size || 0) / 1024)} KB)</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-gray-500 text-[10px]">
                              {att.uploaded_by_name} · {att.uploaded_at ? new Date(att.uploaded_at).toLocaleDateString('en-IN') : ''}
                            </span>
                            {canEdit && (
                              <button
                                onClick={async () => {
                                  if (!window.confirm('Delete this attachment?')) return;
                                  try {
                                    await axios.delete(`${API}/crm/re-projects/${selectedProject.re_project_id}/attachments/${att.file_id}`);
                                    setSelectedProject(prev => ({ ...prev, attachments: (prev.attachments || []).filter(a => a.file_id !== att.file_id) }));
                                    toast.success('Attachment deleted');
                                  } catch (err) {
                                    toast.error('Failed to delete');
                                  }
                                }}
                                className="text-red-500 hover:text-red-700"
                                data-testid={`delete-attachment-${att.file_id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Project Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project Name</Label>
                  <Input
                    value={editForm.project_name}
                    onChange={(e) => setEditForm({...editForm, project_name: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Square Feet</Label>
                  <NumericInput
                    
                    value={editForm.sqft}
                    onChange={(e) => setEditForm({...editForm, sqft: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Building Type</Label>
                  <Select 
                    value={editForm.building_type} 
                    onValueChange={(v) => setEditForm({...editForm, building_type: v})}
                    disabled={!canEdit}
                  >
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
              
              {/* Rough Scope Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Rough Scope of Work</Label>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTemplatePickerOpen(true)}
                        className="text-purple-700 border-purple-300 hover:bg-purple-50"
                        data-testid="use-template-btn"
                      >
                        <FileText className="h-4 w-4 mr-1" /> Use Template
                      </Button>
                      <Button variant="outline" size="sm" onClick={addScopeItem}>
                        <Plus className="h-4 w-4 mr-1" /> Add Item
                      </Button>
                    </div>
                  )}
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-1 py-2 w-8"></th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-center w-28">Qty</th>
                        <th className="px-3 py-2 text-center w-28">Unit</th>
                        <th className="px-3 py-2 text-right w-32">Rate</th>
                        <th className="px-3 py-2 text-right w-32">Total</th>
                        {canEdit && <th className="px-3 py-2 w-12"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {editForm.rough_scope_items.length === 0 ? (
                        <tr>
                          <td colSpan={canEdit ? 7 : 6} className="px-3 py-4 text-center text-gray-500">
                            No scope items added
                          </td>
                        </tr>
                      ) : (
                        <SortableList
                          items={editForm.rough_scope_items.map((_, i) => `re-scope-${i}`)}
                          onReorder={(newIds) => {
                            const newItems = newIds.map(id => editForm.rough_scope_items[parseInt(id.split('-')[2])]);
                            setEditForm({ ...editForm, rough_scope_items: newItems });
                          }}
                        >
                        {editForm.rough_scope_items.map((item, idx) => (
                          <SortableTableRow key={`re-scope-${idx}`} id={`re-scope-${idx}`}>
                            {({ listeners, attributes }) => (
                              <>
                            <td className="px-1 py-2 text-center">
                              {canEdit && <DragHandle listeners={listeners} attributes={attributes} />}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Input
                                value={item.name}
                                onChange={(e) => updateScopeItem(idx, 'name', e.target.value)}
                                placeholder="Item description"
                                className="h-9 w-full"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <NumericInput
                                
                                value={item.quantity}
                                onChange={(e) => updateScopeItem(idx, 'quantity', e.target.value)}
                                className="h-9 text-center w-full"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <UnitSelect
                                value={item.unit}
                                onChange={(v) => updateScopeItem(idx, 'unit', v)}
                                className="h-9"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <NumericInput
                                
                                value={item.rate}
                                onChange={(e) => updateScopeItem(idx, 'rate', e.target.value)}
                                className="h-9 text-right w-full"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium align-top whitespace-nowrap">
                              {formatCurrency(item.total)}
                            </td>
                            {canEdit && (
                              <td className="px-3 py-2 align-top">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => removeScopeItem(idx)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        ))}
                        </SortableList>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Project Handover Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project Handover Time (Months)</Label>
                  <NumericInput
                    
                    value={editForm.handover_months}
                    onChange={(e) => setEditForm({...editForm, handover_months: e.target.value})}
                    placeholder="Enter number of months"
                    min="1"
                    disabled={!canEdit}
                  />
                </div>
              </div>
              
              {/* Total (calculated from scope items) */}
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-600">Estimated Total (from Scope Items)</p>
                  <p className="text-3xl font-bold text-purple-800">
                    {formatCurrency(
                      editForm.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0)
                    )}
                  </p>
                  {editForm.handover_months && (
                    <p className="text-sm text-purple-600 mt-2">
                      Handover in {editForm.handover_months} month(s)
                    </p>
                  )}
                </CardContent>
              </Card>
              
              {/* Rough Payment Schedule (% of Estimated Total) — drafted by Planning, converted into the
                  project's official payment_stages once the project is created from the RE. */}
              {(() => {
                const scopeTotal = editForm.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0);
                const allocPct = (editForm.payment_schedule || []).reduce((s, p) => s + (parseFloat(p.percentage) || 0), 0);
                const remPct = Math.max(0, Math.round((100 - allocPct) * 100) / 100);
                const overrun = allocPct > 100.01;
                return (
                  <div className="border border-purple-200 rounded-md p-3 bg-white" data-testid="re-payment-schedule">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <h4 className="font-semibold text-sm">Rough Payment Schedule</h4>
                        <p className="text-[11px] text-gray-500">
                          Milestones as % of {formatCurrency(scopeTotal)} · Allocated {allocPct.toFixed(2)}% · Remaining {remPct}%
                          {overrun && <span className="text-red-600 ml-1">⚠ Exceeds 100%</span>}
                        </p>
                      </div>
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => setEditForm(f => ({ ...f, payment_schedule: [...(f.payment_schedule || []), { stage_name: '', percentage: '', amount: '', due_date: '' }] }))} data-testid="re-add-payment-row">
                          <Plus className="h-3 w-3 mr-1" />Add Stage
                        </Button>
                      )}
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left">#</th>
                          <th className="px-2 py-1.5 text-left">Stage Name *</th>
                          <th className="px-2 py-1.5 text-left w-20">%</th>
                          <th className="px-2 py-1.5 text-right w-28">Amount (₹) *</th>
                          <th className="px-2 py-1.5 text-left w-32">Due Date</th>
                          <th className="px-2 py-1.5 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(editForm.payment_schedule || []).length === 0 ? (
                          <tr><td colSpan={6} className="px-2 py-3 text-center text-gray-400">No payment stages yet — click "Add Stage" to create the rough schedule.</td></tr>
                        ) : (editForm.payment_schedule || []).map((row, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                            <td className="px-2 py-1">
                              <Input
                                value={row.stage_name || ''}
                                onChange={e => { const r = [...editForm.payment_schedule]; r[idx] = { ...r[idx], stage_name: e.target.value }; setEditForm(f => ({ ...f, payment_schedule: r })); }}
                                placeholder="e.g., Advance"
                                className="h-8"
                                disabled={!canEdit}
                                data-testid={`re-ps-name-${idx}`}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <NumericInput
                                value={row.percentage || ''}
                                onChange={e => {
                                  const pct = parseFloat(e.target.value) || 0;
                                  const r = [...editForm.payment_schedule];
                                  r[idx] = { ...r[idx], percentage: e.target.value, amount: scopeTotal > 0 && pct > 0 ? Math.round(scopeTotal * pct / 100) : r[idx].amount };
                                  setEditForm(f => ({ ...f, payment_schedule: r }));
                                }}
                                placeholder="%"
                                className="h-8"
                                disabled={!canEdit}
                                data-testid={`re-ps-pct-${idx}`}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <NumericInput
                                value={row.amount || ''}
                                onChange={e => {
                                  const amt = parseFloat(e.target.value) || 0;
                                  const r = [...editForm.payment_schedule];
                                  r[idx] = { ...r[idx], amount: e.target.value, percentage: scopeTotal > 0 && amt > 0 ? ((amt / scopeTotal) * 100).toFixed(2) : r[idx].percentage };
                                  setEditForm(f => ({ ...f, payment_schedule: r }));
                                }}
                                placeholder="₹"
                                className="h-8 text-right"
                                disabled={!canEdit}
                                data-testid={`re-ps-amount-${idx}`}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <Input
                                type="date"
                                value={row.due_date || ''}
                                onChange={e => { const r = [...editForm.payment_schedule]; r[idx] = { ...r[idx], due_date: e.target.value }; setEditForm(f => ({ ...f, payment_schedule: r })); }}
                                className="h-8"
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              {canEdit && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => setEditForm(f => ({ ...f, payment_schedule: f.payment_schedule.filter((_, i) => i !== idx) }))}>
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              
              {/* Planning Notes */}
              <div>
                <Label>Planning Notes</Label>
                <Textarea
                  value={editForm.planning_notes}
                  onChange={(e) => setEditForm({...editForm, planning_notes: e.target.value})}
                  placeholder="Add notes for this rough estimate..."
                  rows={3}
                  disabled={!canEdit}
                />
              </div>

              {/* Change Log / Activity History */}
              {changeLogs.length > 0 && (
                <div data-testid="change-log-section">
                  <Label className="flex items-center gap-1.5 mb-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    Edit History
                  </Label>
                  <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto bg-gray-50">
                    {changeLogs.map((log) => (
                      <div key={log.log_id} className="px-3 py-2.5 text-sm" data-testid={`log-entry-${log.log_id}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">
                            {log.user_name}
                            <Badge className="ml-1.5 text-[10px] py-0 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
                              {log.user_role}
                            </Badge>
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
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
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button onClick={handleSaveProject} variant="outline">
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            )}
            {canEdit && selectedProject?.status === 're_rejected' && (
              <Button 
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="save-and-resubmit-btn"
                onClick={async () => {
                  await handleSaveProject();
                  await handleSubmitForApproval(selectedProject.re_project_id);
                  setEditDialog(false);
                }}
              >
                <Send className="h-4 w-4 mr-1" /> Save & Resubmit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RE Template Picker Sub-Dialog */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" /> Choose RE Template
            </DialogTitle>
            <DialogDescription>
              Select a template to load its scope items. You can still edit, reorder, and delete them afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search templates by name..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-10"
                data-testid="template-search-input"
              />
            </div>
            {templatesLoading ? (
              <div className="py-8 text-center text-gray-500"><RefreshCw className="h-5 w-5 animate-spin inline mr-2" /> Loading templates...</div>
            ) : reTemplates.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="font-medium">No RE templates available</p>
                <p className="text-xs mt-1">Create templates from Planning Board → RE Templates</p>
              </div>
            ) : (
              <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-1">
                {reTemplates
                  .filter(t => !templateSearch || (t.name || '').toLowerCase().includes(templateSearch.toLowerCase()))
                  .map((tpl) => {
                    const itemCount = (tpl.scope_items || []).length;
                    const subtotal = (tpl.scope_items || []).reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.rate || 0)), 0);
                    return (
                      <div
                        key={tpl.template_id}
                        className="border rounded-lg p-3 hover:border-purple-400 hover:shadow-sm transition-all bg-white"
                        data-testid={`template-option-${tpl.template_id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-800 truncate">{tpl.name}</p>
                            <div className="flex gap-3 mt-1 text-xs text-gray-500">
                              {tpl.sqft && <span>{tpl.sqft} sqft</span>}
                              <span>{itemCount} scope item{itemCount !== 1 ? 's' : ''}</span>
                              <span className="font-medium text-purple-700">{formatCurrency(subtotal)}</span>
                            </div>
                            {itemCount > 0 && (
                              <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">
                                {(tpl.scope_items || []).slice(0, 3).map(i => i.name).filter(Boolean).join(' · ')}
                                {itemCount > 3 ? ' · ...' : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
                              onClick={() => applyTemplateToRE(tpl, 'replace')}
                              data-testid={`apply-template-${tpl.template_id}`}
                            >
                              Choose
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePickerOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={approvalDialog} onOpenChange={setApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Rough Estimate</DialogTitle>
            <DialogDescription>
              Approve or reject this rough estimate submission
            </DialogDescription>
          </DialogHeader>
          
          {selectedProject && (
            <div className="space-y-4">
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedProject.project_name || selectedProject.client_name}</p>
                  <p className="text-sm text-gray-600">{selectedProject.location}</p>
                  <p className="text-2xl font-bold text-purple-700 mt-2">
                    {formatCurrency(selectedProject.estimated_total)}
                  </p>
                </CardContent>
              </Card>
              
              <div>
                <Label>Rejection Reason (if rejecting)</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Required if rejecting..."
                  rows={3}
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setApprovalDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={() => handleApprove(false)}
              disabled={!rejectionReason}
            >
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handleApprove(true)}
            >
              <CheckCircle className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revisions Dialog */}
      <Dialog open={revisionDialog} onOpenChange={setRevisionDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-purple-600" />
              Revision History - {revisionProject?.re_number}
            </DialogTitle>
            <DialogDescription>{revisionProject?.project_name || revisionProject?.client_name}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3">
            {revisionGroup.map((rev) => {
              const isApproved = rev.status === 'client_approved';
              return (
                <Card key={rev.re_project_id} className={`transition-all ${isApproved ? 'ring-2 ring-green-500 bg-green-50/50' : ''} ${!isApproved && revisionGroup.some(r => r.status === 'client_approved') ? 'opacity-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-purple-100 text-purple-700 font-mono">RE{rev.revision}</Badge>
                        <Badge className={RE_STATUS_CONFIG[rev.status]?.color || 'bg-gray-100'}>
                          {RE_STATUS_CONFIG[rev.status]?.label || rev.status}
                        </Badge>
                        {isApproved && <Badge className="bg-green-600 text-white">Client Approved</Badge>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => { setRevisionDialog(false); openEditDialog(rev); }}>
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleGenerateREPDF(rev)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Items:</span>
                        <span className="ml-1 font-medium">{rev.rough_scope_items?.length || 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total:</span>
                        <span className="ml-1 font-bold text-purple-700">{formatCurrency(rev.estimated_total)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Date:</span>
                        <span className="ml-1">{new Date(rev.created_at).toLocaleDateString('en-IN')}</span>
                      </div>
                    </div>
                    {rev.client_feedback_notes && (
                      <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                        <span className="font-medium text-orange-700">Client Feedback:</span>
                        <span className="ml-1 text-gray-700">{rev.client_feedback_notes}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {!embedded && <MobileBottomNav user={user} />}
    </div>
  );
}
