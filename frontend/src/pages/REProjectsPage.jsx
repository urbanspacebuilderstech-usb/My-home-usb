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
  ArrowLeft, Target, Download, AlertCircle, Search, GitBranch, MessageSquare
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

  const openEditDialog = (project) => {
    setSelectedProject(project);
    setEditForm({
      project_name: project.project_name || '',
      location: project.location || '',
      sqft: project.sqft || '',
      building_type: project.building_type || '',
      rough_scope_items: project.rough_scope_items || [],
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
    
    try {
      await axios.patch(`${API}/crm/re-projects/${selectedProject.re_project_id}`, {
        ...editForm,
        rough_scope_items: scopeItems,
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
  const [changeLogs, setChangeLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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
        <div className="relative" data-testid="re-search-bar">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by RE number (USB-RE0001), project name, or client..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
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
                              <AlertCircle className="h-3 w-3" /> GM Rejection Reason:
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

              {/* Client Feedback (from previous revision) */}
              {(selectedProject.previous_client_feedback || selectedProject.client_feedback_notes) && (
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2 text-sm text-orange-800 flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4" />
                      Client Feedback
                    </h4>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {selectedProject.previous_client_feedback || selectedProject.client_feedback_notes}
                    </p>
                    {selectedProject.client_feedback_by && (
                      <p className="text-xs text-orange-600 mt-2">
                        Entered by: {selectedProject.client_feedback_by}
                        {selectedProject.client_feedback_at && ` on ${new Date(selectedProject.client_feedback_at).toLocaleDateString('en-IN')}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
              
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
                              className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                              onClick={() => applyTemplateToRE(tpl, 'replace')}
                              data-testid={`apply-template-replace-${tpl.template_id}`}
                            >
                              Use (Replace)
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                              onClick={() => applyTemplateToRE(tpl, 'append')}
                              data-testid={`apply-template-append-${tpl.template_id}`}
                            >
                              Append
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
