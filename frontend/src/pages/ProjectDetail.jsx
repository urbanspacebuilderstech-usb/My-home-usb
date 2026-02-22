import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Building2, LogOut, ArrowLeft, Plus, Edit, Trash2, Save, X,
  DollarSign, FileText, TrendingUp, Wallet, MinusCircle, CheckCircle2, Clock,
  AlertTriangle, Check, XCircle, ShieldCheck, Send, Upload, Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Initial empty rows for bulk add
const createEmptyRows = (type, count = 3) => {
  if (type === 'scope') {
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }));
  } else if (type === 'payment') {
    return Array(count).fill(null).map(() => ({ stage_name: '', percentage: '', amount: '', due_date: '' }));
  } else if (type === 'addition') {
    return Array(count).fill(null).map(() => ({ description: '', estimated_amount: '' }));
  } else if (type === 'deduction') {
    return Array(count).fill(null).map(() => ({ description: '', amount: '', remarks: '' }));
  }
  return [];
};

const WorkflowBadge = ({ status }) => {
  const config = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: Clock },
    pending_verification: { label: 'Pending Verification', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
    pending_approval: { label: 'Pending Approval', color: 'bg-blue-100 text-blue-700', icon: ShieldCheck },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: Check },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle }
  };
  const cfg = config[status] || config.draft;
  const Icon = cfg.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState('scope');
  
  // Bulk dialog states
  const [bulkScopeDialog, setBulkScopeDialog] = useState(false);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(false);
  const [bulkAdditionDialog, setBulkAdditionDialog] = useState(false);
  const [bulkDeductionDialog, setBulkDeductionDialog] = useState(false);
  
  // Verification dialog
  const [verifyDialog, setVerifyDialog] = useState({ open: false, type: '', ids: [] });
  const [verifyCode, setVerifyCode] = useState('');
  
  // Bulk form data
  const [bulkScopeRows, setBulkScopeRows] = useState(createEmptyRows('scope'));
  const [bulkPaymentRows, setBulkPaymentRows] = useState(createEmptyRows('payment'));
  const [bulkAdditionRows, setBulkAdditionRows] = useState(createEmptyRows('addition'));
  const [bulkDeductionRows, setBulkDeductionRows] = useState(createEmptyRows('deduction'));
  
  // Editing states
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingAddition, setEditingAddition] = useState(null);
  const [editingScopeItem, setEditingScopeItem] = useState(null);
  const [editScopeForm, setEditScopeForm] = useState({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  const [deleteProjectDialog, setDeleteProjectDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Payment Schedule Edit Dialog states
  const [editPaymentDialog, setEditPaymentDialog] = useState(false);
  const [editPaymentStage, setEditPaymentStage] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ stage_name: '', percentage: '', amount: '', due_date: '' });
  const [submitScheduleDialog, setSubmitScheduleDialog] = useState(false);
  
  // Payment Summary state
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [collectPaymentDialog, setCollectPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [collectForm, setCollectForm] = useState({ amount_received: '', payment_mode: 'bank_transfer', payment_reference: '', remarks: '' });
  
  // Rough Estimate state
  const [reProject, setReProject] = useState(null);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      // Redirect Site Engineers to their dedicated board
      if (userRes.data.role === 'site_engineer') {
        window.location.href = `/site-engineer/project/${projectId}`;
        return;
      }
      
      const projectRes = await axios.get(`${API}/projects/${projectId}/full-details`);
      setProjectData(projectRes.data);
      
      // Fetch Rough Estimate (RE) project if available
      if (projectRes.data.project?.re_project_id) {
        try {
          const reRes = await axios.get(`${API}/crm/re-projects/${projectRes.data.project.re_project_id}`);
          setReProject(reRes.data);
        } catch (e) {
          console.log('RE project not available');
        }
      }
      
      // Fetch payment summary
      try {
        const summaryRes = await axios.get(`${API}/projects/${projectId}/payment-summary`);
        setPaymentSummary(summaryRes.data);
      } catch (e) {
        console.log('Payment summary not available');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load project data');
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

  // ==================== BULK ADD HANDLERS ====================
  const handleBulkAddScope = async () => {
    const validItems = bulkScopeRows.filter(r => r.item_name && r.unit_rate);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          item_name: r.item_name,
          quantity: parseFloat(r.quantity) || 1,
          unit: r.unit || 'Nos',
          unit_rate: parseFloat(r.unit_rate) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} scope items`);
      setBulkScopeDialog(false);
      setBulkScopeRows(createEmptyRows('scope'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add scope items');
    }
  };

  const handleBulkAddPayment = async () => {
    const validItems = bulkPaymentRows.filter(r => r.stage_name && r.amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          stage_name: r.stage_name,
          percentage: parseFloat(r.percentage) || 0,
          amount: parseFloat(r.amount) || 0,
          due_date: r.due_date || null
        }))
      });
      toast.success(`Added ${validItems.length} payment stages`);
      setBulkPaymentDialog(false);
      setBulkPaymentRows(createEmptyRows('payment'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add payment stages');
    }
  };

  const handleBulkAddAddition = async () => {
    const validItems = bulkAdditionRows.filter(r => r.description && r.estimated_amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/additional-costs/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          description: r.description,
          estimated_amount: parseFloat(r.estimated_amount) || 0
        }))
      });
      toast.success(`Added ${validItems.length} additions`);
      setBulkAdditionDialog(false);
      setBulkAdditionRows(createEmptyRows('addition'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add additions');
    }
  };

  const handleBulkAddDeduction = async () => {
    const validItems = bulkDeductionRows.filter(r => r.description && r.amount);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/deductions/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          description: r.description,
          amount: parseFloat(r.amount) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} deductions`);
      setBulkDeductionDialog(false);
      setBulkDeductionRows(createEmptyRows('deduction'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add deductions');
    }
  };

  // ==================== VERIFICATION HANDLER ====================
  const openVerifyDialog = (type, ids) => {
    setVerifyDialog({ open: true, type, ids });
    setVerifyCode('');
  };

  const handleVerify = async () => {
    if (verifyCode !== 'VERIFY') {
      toast.error("Please type 'VERIFY' exactly in capital letters");
      return;
    }
    
    try {
      const endpoint = {
        scope: '/scope-items/verify',
        payment: '/payment-stages/verify',
        addition: '/additional-costs/verify',
        deduction: '/deductions/verify'
      }[verifyDialog.type];
      
      await axios.post(`${API}${endpoint}`, {
        item_ids: verifyDialog.ids,
        verification_code: verifyCode
      });
      
      toast.success('Items verified and sent for approval');
      setVerifyDialog({ open: false, type: '', ids: [] });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Verification failed');
    }
  };

  // ==================== APPROVAL HANDLER (Super Admin) ====================
  const handleApprove = async (type, ids, action) => {
    try {
      const endpoint = {
        scope: '/scope-items/approve',
        payment: '/payment-stages/approve',
        addition: '/additional-costs/approve',
        deduction: '/deductions/approve'
      }[type];
      
      await axios.post(`${API}${endpoint}`, { item_ids: ids, action });
      toast.success(`Items ${action}d successfully`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || `${action} failed`);
    }
  };

  // ==================== DELETE HANDLERS ====================
  const handleDeleteScope = async (scopeId) => {
    if (!confirm('Delete this scope item?')) return;
    try {
      await axios.delete(`${API}/scope-items/${scopeId}`);
      toast.success('Scope item deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete scope item');
    }
  };

  const handleDeletePayment = async (stageId) => {
    if (!confirm('Delete this payment stage?')) return;
    try {
      await axios.delete(`${API}/payment-stages/${stageId}`);
      toast.success('Payment stage deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete payment stage');
    }
  };

  const handleRequestPayment = async (stageId) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}/request`);
      toast.success('Payment requested - sent to CRE');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to request payment');
    }
  };

  const handleDeleteAddition = async (costId) => {
    if (!confirm('Delete this addition?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Addition deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete addition');
    }
  };

  const handleDeleteDeduction = async (deductionId) => {
    if (!confirm('Delete this deduction?')) return;
    try {
      await axios.delete(`${API}/deductions/${deductionId}`);
      toast.success('Deduction deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete deduction');
    }
  };

  // ==================== UPDATE HANDLERS ====================
  const handleUpdatePayment = async (stageId, updates) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}`, updates);
      toast.success('Payment updated');
      setEditingPayment(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update payment');
    }
  };

  // Open edit dialog for payment stage
  const openEditPaymentDialog = (stage) => {
    setEditPaymentStage(stage);
    setEditPaymentForm({
      stage_name: stage.stage_name || '',
      percentage: stage.percentage?.toString() || '',
      amount: stage.amount?.toString() || '',
      due_date: stage.due_date ? new Date(stage.due_date).toISOString().split('T')[0] : ''
    });
    setEditPaymentDialog(true);
  };

  // Handle save from edit payment dialog
  const handleSavePaymentEdit = async () => {
    if (!editPaymentStage) return;
    
    try {
      await axios.patch(`${API}/payment-stages/${editPaymentStage.stage_id}`, {
        stage_name: editPaymentForm.stage_name,
        percentage: parseFloat(editPaymentForm.percentage) || 0,
        amount: parseFloat(editPaymentForm.amount) || 0,
        due_date: editPaymentForm.due_date || null
      });
      toast.success('Payment stage updated');
      setEditPaymentDialog(false);
      setEditPaymentStage(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update payment stage');
    }
  };

  // Submit/finalize draft payment schedule
  const handleSubmitPaymentSchedule = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/payment-schedule/submit`);
      toast.success('Payment schedule submitted for collection');
      setSubmitScheduleDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit payment schedule');
    }
  };

  const handleUpdateAddition = async (costId, updates) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}`, updates);
      toast.success('Addition updated');
      setEditingAddition(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to update addition');
    }
  };

  // ==================== SCOPE ITEM EDIT HANDLERS ====================
  const openScopeEdit = (item) => {
    setEditingScopeItem(item.scope_id);
    setEditScopeForm({
      item_name: item.item_name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'Nos',
      unit_rate: item.unit_rate || 0,
      remarks: item.remarks || ''
    });
  };

  const handleUpdateScope = async () => {
    if (!editingScopeItem) return;
    
    try {
      await axios.patch(`${API}/scope-items/${editingScopeItem}`, {
        item_name: editScopeForm.item_name,
        quantity: parseFloat(editScopeForm.quantity) || 1,
        unit: editScopeForm.unit,
        unit_rate: parseFloat(editScopeForm.unit_rate) || 0,
        remarks: editScopeForm.remarks || null
      });
      toast.success('Scope item updated');
      setEditingScopeItem(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update scope item');
    }
  };

  const cancelScopeEdit = () => {
    setEditingScopeItem(null);
    setEditScopeForm({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  };

  // ==================== DELETE PROJECT HANDLER ====================
  const handleDeleteProject = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error("Please type 'DELETE' exactly in capital letters to confirm");
      return;
    }
    
    try {
      await axios.delete(`${API}/projects/${projectId}`);
      toast.success('Project deleted successfully');
      setDeleteProjectDialog(false);
      // Redirect to projects list
      window.location.href = '/projects';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete project');
    }
  };

  // ==================== PAYMENT COLLECTION HANDLERS ====================
  const openCollectDialog = (stage) => {
    setSelectedStage(stage);
    setCollectForm({ 
      amount_received: stage.amount - (stage.amount_received || 0), 
      payment_mode: 'bank_transfer', 
      payment_reference: '', 
      remarks: '' 
    });
    setCollectPaymentDialog(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedStage || !collectForm.amount_received) {
      toast.error('Please enter amount');
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/${selectedStage.stage_id}/collect`, {
        amount_received: parseFloat(collectForm.amount_received),
        payment_mode: collectForm.payment_mode,
        payment_reference: collectForm.payment_reference || null,
        remarks: collectForm.remarks || null
      });
      toast.success('Payment collected successfully');
      setCollectPaymentDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to collect payment');
    }
  };

  const handleGenerateSchedule = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/payment-schedule/generate`);
      toast.success('Payment schedule generated');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate schedule');
    }
  };

  const getPaymentStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700' },
      partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
      collected: { label: 'Collected', color: 'bg-blue-100 text-blue-700' }
    };
    const c = config[status] || config.pending;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
  };

  const canDeleteProject = user?.role === 'super_admin' || 
    (user?.role === 'planning' && (
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.status?.toLowerCase()) ||
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.project_stage?.toLowerCase())
    ));

  const formatCurrency = (amount) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant' || user?.role === 'planning';
  const isSuperAdmin = user?.role === 'super_admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!projectData || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Failed to load project</div>
      </div>
    );
  }

  const { project, scope_items, payment_stages, additional_costs, deductions, summary } = projectData;

  // Get draft items for verification
  const draftScopeItems = scope_items.filter(s => s.workflow_status === 'draft');
  const draftPaymentItems = payment_stages.filter(p => p.workflow_status === 'draft');
  const draftAdditions = additional_costs.filter(a => a.workflow_status === 'draft');
  const draftDeductions = deductions.filter(d => d.workflow_status === 'draft');
  
  // Get pending approval items
  const pendingApprovalScope = scope_items.filter(s => s.workflow_status === 'pending_approval');
  const pendingApprovalPayment = payment_stages.filter(p => p.workflow_status === 'pending_approval');
  const pendingApprovalAdditions = additional_costs.filter(a => a.workflow_status === 'pending_approval');
  const pendingApprovalDeductions = deductions.filter(d => d.workflow_status === 'pending_approval');

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
              <p className="text-xs text-gray-500 hidden sm:block">Project View</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button data-testid="dashboard-btn" variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <div className="flex items-center gap-2 pl-2 sm:pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button data-testid="logout-btn" variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 sm:h-10 sm:w-10">
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Project Header */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-4">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/projects'} className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 data-testid="project-detail-title" className="text-xl sm:text-3xl font-bold text-gray-900 truncate">
                {project.name}
              </h2>
              <div className="flex items-center gap-2 sm:gap-4 mt-1 flex-wrap text-xs sm:text-sm">
                <span className="text-gray-600"><strong>Client:</strong> {project.client_name}</span>
                <span className="text-gray-600 hidden sm:inline"><strong>Location:</strong> {project.location}</span>
                <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>{project.status}</Badge>
              </div>
            </div>
            {/* Delete Project Button - visible for super_admin or planning (for draft/in_planning projects) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Share as PDF Button */}
              <Button 
                data-testid="share-pdf-btn"
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Share as PDF</span>
              </Button>
              
              {canDeleteProject && (
                <Dialog open={deleteProjectDialog} onOpenChange={setDeleteProjectDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      data-testid="delete-project-btn"
                      variant="destructive" 
                      size="sm" 
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete Project</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Project
                      </DialogTitle>
                      <DialogDescription>
                        This action <strong>cannot be undone</strong>. This will permanently delete the project 
                        <strong> "{project.name}"</strong> and all related data including scope items, payment stages, 
                        additions, and deductions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                          Type <strong>DELETE</strong> to confirm:
                        </p>
                        <Input
                          data-testid="delete-confirm-input"
                          placeholder="Type DELETE to confirm"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setDeleteProjectDialog(false); setDeleteConfirmText(''); }}>
                      Cancel
                    </Button>
                    <Button 
                      data-testid="confirm-delete-project-btn"
                      variant="destructive" 
                      onClick={handleDeleteProject}
                      disabled={deleteConfirmText !== 'DELETE'}
                    >
                      Delete Project
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Value
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-blue-700">{formatCurrency(summary.project_value)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Scope Total</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Plus className="h-3 w-3" />Additions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-cyan-700">{formatCurrency(summary.additions_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Extra Work</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <FileText className="h-3 w-3" />Total
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-purple-700">{formatCurrency(summary.total_value)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Scope + Add</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Income
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-green-700">{formatCurrency(summary.income_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">
                <span className="text-blue-600 cursor-pointer hover:underline" onClick={() => window.location.href = '/income'}>
                  View Income
                </span>
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <MinusCircle className="h-3 w-3" />Deductions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="text-sm sm:text-lg font-bold text-orange-700">{formatCurrency(summary.deductions_total)}</div>
              <p className="text-xs text-gray-500 hidden sm:block">Adjustments</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Wallet className="h-3 w-3" />Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className={`text-sm sm:text-lg font-bold ${summary.balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatCurrency(summary.balance)}
              </div>
              <p className="text-xs text-gray-500 hidden sm:block">Pending</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b p-3 sm:p-6">
              <TabsList className="bg-transparent border-0 p-0 h-auto flex-wrap gap-1 sm:gap-2 w-full overflow-x-auto">
                <TabsTrigger value="scope" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Scope {draftScopeItems.length > 0 && <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">{draftScopeItems.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="payments" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Payments {draftPaymentItems.length > 0 && <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">{draftPaymentItems.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="additions" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Additions {draftAdditions.length > 0 && <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">{draftAdditions.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="deductions" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm">
                  Deductions {draftDeductions.length > 0 && <Badge variant="secondary" className="ml-1 sm:ml-2 text-xs">{draftDeductions.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="payment-summary" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none px-2 sm:px-4 text-xs sm:text-sm bg-green-50">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Payment Summary
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* ==================== SCOPE TAB ==================== */}
            <TabsContent value="scope" className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Project Scope</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Define scope items - total becomes project value</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draftScopeItems.length > 0 && (
                    <Button 
                      data-testid="verify-scope-btn"
                      variant="outline"
                      size="sm"
                      className="gap-1 sm:gap-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50 text-xs sm:text-sm"
                      onClick={() => openVerifyDialog('scope', draftScopeItems.map(s => s.scope_id))}
                    >
                      <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />Verify ({draftScopeItems.length})
                    </Button>
                  )}
                  {isSuperAdmin && pendingApprovalScope.length > 0 && (
                    <>
                      <Button 
                        size="sm"
                        className="gap-1 sm:gap-2 bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                        onClick={() => handleApprove('scope', pendingApprovalScope.map(s => s.scope_id), 'approve')}
                      >
                        <Check className="h-3 w-3 sm:h-4 sm:w-4" />Approve ({pendingApprovalScope.length})
                      </Button>
                      <Button 
                        variant="destructive"
                        size="sm"
                        className="gap-1 sm:gap-2 text-xs sm:text-sm"
                        onClick={() => handleApprove('scope', pendingApprovalScope.map(s => s.scope_id), 'reject')}
                      >
                        <XCircle className="h-3 w-3 sm:h-4 sm:w-4" />Reject
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Dialog open={bulkScopeDialog} onOpenChange={setBulkScopeDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-scope-btn" size="sm" className="gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Scope
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Scope Items</DialogTitle>
                          <DialogDescription>Add rows as needed. Use X to remove empty rows.</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left w-8">#</th>
                                <th className="px-2 py-2 text-left">Item Name *</th>
                                <th className="px-2 py-2 text-left w-20">Qty</th>
                                <th className="px-2 py-2 text-left w-20">Unit</th>
                                <th className="px-2 py-2 text-left w-28">Rate (₹) *</th>
                                <th className="px-2 py-2 text-left w-28">Total</th>
                                <th className="px-2 py-2 text-left">Remarks</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkScopeRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.item_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].item_name = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      placeholder="e.g., Foundation Work"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.quantity}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].quantity = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.unit}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.unit_rate}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit_rate = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-blue-600 font-medium">
                                    ₹{((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_rate) || 0)).toLocaleString()}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkScopeRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkScopeRows.filter((_, i) => i !== idx);
                                          setBulkScopeRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, { item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, ...createEmptyRows('scope', 5)])}
                            >
                              + Add 5 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkScopeDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-scope-btn" onClick={handleBulkAddScope}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 9 : 8} className="px-4 py-8 text-center text-gray-500">
                          No scope items defined yet. Click "Add Scope Items" to define project scope.
                        </td>
                      </tr>
                    ) : (
                      scope_items.map((item, index) => {
                        const isEditing = editingScopeItem === item.scope_id;
                        
                        return (
                          <tr key={item.scope_id} data-testid={`scope-row-${item.scope_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-name-${item.scope_id}`}
                                  value={editScopeForm.item_name}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, item_name: e.target.value})}
                                  className="h-8 w-full min-w-[150px]"
                                />
                              ) : (
                                item.item_name
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-qty-${item.scope_id}`}
                                  type="number"
                                  value={editScopeForm.quantity}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, quantity: e.target.value})}
                                  className="h-8 w-20 text-right"
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-unit-${item.scope_id}`}
                                  value={editScopeForm.unit}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, unit: e.target.value})}
                                  className="h-8 w-16 text-center"
                                />
                              ) : (
                                item.unit
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-rate-${item.scope_id}`}
                                  type="number"
                                  value={editScopeForm.unit_rate}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, unit_rate: e.target.value})}
                                  className="h-8 w-24 text-right"
                                />
                              ) : (
                                `₹${item.unit_rate?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-blue-600">
                              {isEditing ? (
                                `₹${((parseFloat(editScopeForm.quantity) || 0) * (parseFloat(editScopeForm.unit_rate) || 0)).toLocaleString()}`
                              ) : (
                                `₹${item.total_amount?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={item.workflow_status || 'draft'} />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-remarks-${item.scope_id}`}
                                  value={editScopeForm.remarks}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, remarks: e.target.value})}
                                  className="h-8 w-full"
                                  placeholder="Remarks"
                                />
                              ) : (
                                item.remarks || '-'
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button 
                                        data-testid={`save-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handleUpdateScope}
                                        className="h-8 w-8"
                                      >
                                        <Save className="h-4 w-4 text-green-500" />
                                      </Button>
                                      <Button 
                                        data-testid={`cancel-scope-edit-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={cancelScopeEdit}
                                        className="h-8 w-8"
                                      >
                                        <X className="h-4 w-4 text-gray-500" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button 
                                        data-testid={`edit-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => openScopeEdit(item)}
                                        className="h-8 w-8"
                                      >
                                        <Edit className="h-4 w-4 text-blue-500" />
                                      </Button>
                                      <Button 
                                        data-testid={`delete-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleDeleteScope(item.scope_id)}
                                        className="h-8 w-8"
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {scope_items.length > 0 && (
                    <tfoot className="bg-blue-50 border-t-2">
                      <tr>
                        <td colSpan="5" className="px-4 py-3 text-right font-bold">Project Value (Scope Total):</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">₹{summary.scope_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PAYMENTS TAB ==================== */}
            <TabsContent value="payments" className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-lg font-bold">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">Create and manage milestone-based payments</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Submit Schedule button - only show if there are draft items */}
                  {canManage && draftPaymentItems.length > 0 && (
                    <Dialog open={submitScheduleDialog} onOpenChange={setSubmitScheduleDialog}>
                      <DialogTrigger asChild>
                        <Button 
                          data-testid="submit-schedule-btn"
                          className="gap-2 bg-green-600 hover:bg-green-700"
                        >
                          <Upload className="h-4 w-4" />Submit Schedule ({draftPaymentItems.length})
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Submit Payment Schedule</DialogTitle>
                          <DialogDescription>
                            This will submit all {draftPaymentItems.length} draft payment stages for collection.
                            Once submitted, these stages will be visible to CRE for payment collection.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-700 font-medium">Summary:</p>
                            <ul className="mt-2 text-sm text-blue-600 space-y-1">
                              <li>• {draftPaymentItems.length} payment stages will be submitted</li>
                              <li>• Total amount: ₹{draftPaymentItems.reduce((sum, s) => sum + (s.amount || 0), 0).toLocaleString()}</li>
                            </ul>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setSubmitScheduleDialog(false)}>Cancel</Button>
                          <Button 
                            data-testid="confirm-submit-schedule-btn"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={handleSubmitPaymentSchedule}
                          >
                            Submit Schedule
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  {isSuperAdmin && pendingApprovalPayment.length > 0 && (
                    <>
                      <Button 
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove('payment', pendingApprovalPayment.map(p => p.stage_id), 'approve')}
                      >
                        <Check className="h-4 w-4" />Approve All ({pendingApprovalPayment.length})
                      </Button>
                      <Button 
                        variant="destructive"
                        className="gap-2"
                        onClick={() => handleApprove('payment', pendingApprovalPayment.map(p => p.stage_id), 'reject')}
                      >
                        <XCircle className="h-4 w-4" />Reject
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Dialog open={bulkPaymentDialog} onOpenChange={setBulkPaymentDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-payment-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                          <Plus className="h-4 w-4" />Add Payments
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Payment Stages</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped). Project value: ₹{projectData?.summary?.total_value?.toLocaleString() || 0}</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Stage Name *</th>
                                <th className="px-2 py-2 text-left w-20">%</th>
                                <th className="px-2 py-2 text-left w-28">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Due Date</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkPaymentRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.stage_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].stage_name = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="e.g., Advance"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.percentage}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const pct = parseFloat(e.target.value) || 0;
                                        newRows[idx].percentage = e.target.value;
                                        // Auto-calculate amount from percentage
                                        if (projectData?.summary?.total_value && pct > 0) {
                                          newRows[idx].amount = Math.round((projectData.summary.total_value * pct) / 100);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="%"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const amt = parseFloat(e.target.value) || 0;
                                        newRows[idx].amount = e.target.value;
                                        // Auto-calculate percentage from amount
                                        if (projectData?.summary?.total_value && amt > 0) {
                                          newRows[idx].percentage = ((amt / projectData.summary.total_value) * 100).toFixed(2);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="₹"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="date"
                                      value={row.due_date}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].due_date = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkPaymentRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkPaymentRows.filter((_, i) => i !== idx);
                                          setBulkPaymentRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, { stage_name: '', percentage: '', amount: '', due_date: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, ...createEmptyRows('payment', 5)])}
                            >
                              + Add 5 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkPaymentDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-payment-btn" onClick={handleBulkAddPayment}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Edit Payment Stage Dialog */}
              <Dialog open={editPaymentDialog} onOpenChange={setEditPaymentDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Payment Stage</DialogTitle>
                    <DialogDescription>
                      Update payment stage details. Enter percentage or amount - the other will auto-calculate.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-stage-name">Stage Name</Label>
                      <Input
                        id="edit-stage-name"
                        data-testid="edit-payment-stage-name"
                        value={editPaymentForm.stage_name}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, stage_name: e.target.value })}
                        placeholder="e.g., Foundation Payment"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-percentage">Percentage (%)</Label>
                        <Input
                          id="edit-percentage"
                          data-testid="edit-payment-percentage"
                          type="number"
                          value={editPaymentForm.percentage}
                          onChange={(e) => {
                            const pct = parseFloat(e.target.value) || 0;
                            let newAmount = editPaymentForm.amount;
                            if (projectData?.summary?.total_value && pct > 0) {
                              newAmount = Math.round((projectData.summary.total_value * pct) / 100).toString();
                            }
                            setEditPaymentForm({ ...editPaymentForm, percentage: e.target.value, amount: newAmount });
                          }}
                          placeholder="e.g., 10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-amount">Amount (₹)</Label>
                        <Input
                          id="edit-amount"
                          data-testid="edit-payment-amount"
                          type="number"
                          value={editPaymentForm.amount}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            let newPct = editPaymentForm.percentage;
                            if (projectData?.summary?.total_value && amt > 0) {
                              newPct = ((amt / projectData.summary.total_value) * 100).toFixed(2);
                            }
                            setEditPaymentForm({ ...editPaymentForm, amount: e.target.value, percentage: newPct });
                          }}
                          placeholder="e.g., 100000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-due-date">Due Date</Label>
                      <Input
                        id="edit-due-date"
                        data-testid="edit-payment-due-date"
                        type="date"
                        value={editPaymentForm.due_date}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, due_date: e.target.value })}
                      />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                      <p>Project Total Value: <span className="font-semibold">₹{projectData?.summary?.total_value?.toLocaleString() || 0}</span></p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditPaymentDialog(false)}>Cancel</Button>
                    <Button data-testid="save-payment-edit-btn" onClick={handleSavePaymentEdit}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">%</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payment_stages.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          No payment stages defined yet. Click "Add Payments" to define milestones.
                        </td>
                      </tr>
                    ) : (
                      payment_stages.map((stage, index) => {
                        const balance = stage.amount - (stage.amount_received || 0);
                        const isPaid = balance <= 0;
                        const isDraft = stage.workflow_status === 'draft';
                        const isRequested = stage.workflow_status === 'requested' || stage.workflow_status === 'pending_collection';
                        const isPartial = stage.amount_received > 0 && balance > 0;
                        
                        // Determine status badge
                        let statusBadge;
                        if (isPaid) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Collected</span>;
                        } else if (isPartial) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Partially Collected</span>;
                        } else if (isRequested) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Requested</span>;
                        } else {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">Draft</span>;
                        }
                        
                        return (
                          <tr key={stage.stage_id} data-testid={`payment-row-${stage.stage_id}`} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''}`}>
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{stage.stage_name}</p>
                              {stage.due_date && (
                                <p className="text-xs text-gray-500">Due: {new Date(stage.due_date).toLocaleDateString('en-IN')}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">{stage.percentage}%</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{stage.amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-green-600 font-semibold">₹{(stage.amount_received || 0).toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {statusBadge}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Request Payment - for Planning/Admin, only if draft and balance > 0 */}
                                {canManage && isDraft && balance > 0 && (
                                  <Button
                                    data-testid={`req-payment-${stage.stage_id}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                    onClick={() => handleRequestPayment(stage.stage_id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Req Payment
                                  </Button>
                                )}
                                {/* Request Balance - for partially collected */}
                                {canManage && isPartial && !isRequested && (
                                  <Button
                                    data-testid={`req-balance-${stage.stage_id}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-orange-600 border-orange-300 hover:bg-orange-50"
                                    onClick={() => handleRequestPayment(stage.stage_id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Req Balance
                                  </Button>
                                )}
                                {/* Edit button - only for draft items that are not paid */}
                                {canManage && isDraft && !isPaid && (
                                  <Button
                                    data-testid={`edit-payment-${stage.stage_id}`}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditPaymentDialog(stage)}
                                    title="Edit payment stage"
                                  >
                                    <Edit className="h-4 w-4 text-blue-500" />
                                  </Button>
                                )}
                                {/* Delete button - only for draft items that are not paid */}
                                {canManage && isDraft && !isPaid && (
                                  <Button 
                                    data-testid={`delete-payment-${stage.stage_id}`}
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeletePayment(stage.stage_id)}
                                    title="Delete payment stage"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                                {/* Done badge */}
                                {isPaid && (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {payment_stages.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{(summary.payment_schedule_total || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{(summary.payment_received || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{((summary.payment_schedule_total || 0) - (summary.payment_received || 0)).toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== ADDITIONS TAB ==================== */}
            <TabsContent value="additions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Additional Work</h3>
                  <p className="text-sm text-gray-500">Track extra work and variations</p>
                </div>
                <div className="flex gap-2">
                  {draftAdditions.length > 0 && (
                    <Button 
                      variant="outline"
                      className="gap-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                      onClick={() => openVerifyDialog('addition', draftAdditions.map(a => a.cost_id))}
                    >
                      <CheckCircle2 className="h-4 w-4" />Verify ({draftAdditions.length})
                    </Button>
                  )}
                  {isSuperAdmin && pendingApprovalAdditions.length > 0 && (
                    <>
                      <Button 
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove('addition', pendingApprovalAdditions.map(a => a.cost_id), 'approve')}
                      >
                        <Check className="h-4 w-4" />Approve All ({pendingApprovalAdditions.length})
                      </Button>
                      <Button 
                        variant="destructive"
                        className="gap-2"
                        onClick={() => handleApprove('addition', pendingApprovalAdditions.map(a => a.cost_id), 'reject')}
                      >
                        <XCircle className="h-4 w-4" />Reject
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Dialog open={bulkAdditionDialog} onOpenChange={setBulkAdditionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-addition-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                          <Plus className="h-4 w-4" />Add Additions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Additions</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped)</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Description *</th>
                                <th className="px-2 py-2 text-left w-32">Amount (₹) *</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkAdditionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.description}
                                      onChange={(e) => {
                                        const newRows = [...bulkAdditionRows];
                                        newRows[idx].description = e.target.value;
                                        setBulkAdditionRows(newRows);
                                      }}
                                      placeholder="e.g., Extra flooring"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.estimated_amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkAdditionRows];
                                        newRows[idx].estimated_amount = e.target.value;
                                        setBulkAdditionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkAdditionRows([...bulkAdditionRows, ...createEmptyRows('addition', 5)])}>
                            + Add More Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkAdditionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddAddition}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {additional_costs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                          No additions recorded yet. Click "Add Additions" for extra work.
                        </td>
                      </tr>
                    ) : (
                      additional_costs.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const isEditing = editingAddition === cost.cost_id;
                        
                        return (
                          <tr key={cost.cost_id} data-testid={`addition-row-${cost.cost_id}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{cost.description}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{cost.estimated_amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <Input
                                  type="number"
                                  className="w-28 text-right"
                                  defaultValue={cost.income_received}
                                  onBlur={(e) => handleUpdateAddition(cost.cost_id, { income_received: parseFloat(e.target.value) || 0 })}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-green-600">₹{(cost.income_received || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={cost.workflow_status || 'draft'} />
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setEditingAddition(isEditing ? null : cost.cost_id)}
                                  >
                                    {isEditing ? <Save className="h-4 w-4 text-green-500" /> : <Edit className="h-4 w-4 text-blue-500" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {additional_costs.length > 0 && (
                    <tfoot className="bg-cyan-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{summary.additions_total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.additions_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{(summary.additions_total - summary.additions_received)?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== DEDUCTIONS TAB ==================== */}
            <TabsContent value="deductions" className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Deductions</h3>
                  <p className="text-sm text-gray-500">Track penalties, discounts, and adjustments</p>
                </div>
                <div className="flex gap-2">
                  {draftDeductions.length > 0 && (
                    <Button 
                      variant="outline"
                      className="gap-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                      onClick={() => openVerifyDialog('deduction', draftDeductions.map(d => d.deduction_id))}
                    >
                      <CheckCircle2 className="h-4 w-4" />Verify ({draftDeductions.length})
                    </Button>
                  )}
                  {isSuperAdmin && pendingApprovalDeductions.length > 0 && (
                    <>
                      <Button 
                        className="gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => handleApprove('deduction', pendingApprovalDeductions.map(d => d.deduction_id), 'approve')}
                      >
                        <Check className="h-4 w-4" />Approve All ({pendingApprovalDeductions.length})
                      </Button>
                      <Button 
                        variant="destructive"
                        className="gap-2"
                        onClick={() => handleApprove('deduction', pendingApprovalDeductions.map(d => d.deduction_id), 'reject')}
                      >
                        <XCircle className="h-4 w-4" />Reject
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Dialog open={bulkDeductionDialog} onOpenChange={setBulkDeductionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-deduction-btn" className="gap-2 bg-orange-600 hover:bg-orange-700">
                          <MinusCircle className="h-4 w-4" />Add Deductions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Deductions</DialogTitle>
                          <DialogDescription>Fill in the rows below (empty rows will be skipped)</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Description *</th>
                                <th className="px-2 py-2 text-left w-32">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkDeductionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.description}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].description = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      placeholder="e.g., Penalty"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="number"
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].amount = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkDeductionRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkDeductionRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkDeductionRows([...bulkDeductionRows, ...createEmptyRows('deduction', 5)])}>
                            + Add More Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkDeductionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddDeduction} className="bg-orange-600 hover:bg-orange-700">Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-gray-500">
                          No deductions recorded yet. Click "Add Deductions" for penalties or adjustments.
                        </td>
                      </tr>
                    ) : (
                      deductions.map((d, index) => (
                        <tr key={d.deduction_id} data-testid={`deduction-row-${d.deduction_id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{d.description}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-600">-₹{d.amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <WorkflowBadge status={d.workflow_status || 'draft'} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{d.remarks || '-'}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteDeduction(d.deduction_id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-orange-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">-₹{summary.deductions_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PAYMENT SUMMARY TAB ==================== */}
            <TabsContent value="payment-summary" className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Payment Summary</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Complete payment schedule from advance to handover</p>
                </div>
                {user?.role === 'planning' && (!paymentSummary || paymentSummary.payment_stages?.length === 0) && (
                  <Button onClick={handleGenerateSchedule} className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" /> Generate Payment Schedule
                  </Button>
                )}
              </div>

              {/* Summary Cards */}
              {paymentSummary?.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-blue-600 font-medium">Total Scheduled</p>
                      <p className="text-lg font-bold text-blue-700">{formatCurrency(paymentSummary.summary.total_scheduled)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-green-600 font-medium">Total Received</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(paymentSummary.summary.total_received)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-orange-600 font-medium">Balance Due</p>
                      <p className="text-lg font-bold text-orange-700">{formatCurrency(paymentSummary.summary.total_balance)}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-purple-600 font-medium">Collection %</p>
                      <p className="text-lg font-bold text-purple-700">{paymentSummary.summary.collection_percentage?.toFixed(1)}%</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Progress Bar */}
              {paymentSummary?.summary && (
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Collection Progress</span>
                    <span className="font-medium">{paymentSummary.summary.stages_paid} / {paymentSummary.summary.stages_total} stages paid</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-green-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${paymentSummary.summary.collection_percentage || 0}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Payment Schedule Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">S.No</th>
                      <th className="px-3 py-3 text-left font-semibold">Payment Stage</th>
                      <th className="px-3 py-3 text-right font-semibold">%</th>
                      <th className="px-3 py-3 text-right font-semibold">Amount</th>
                      <th className="px-3 py-3 text-right font-semibold">Received</th>
                      <th className="px-3 py-3 text-center font-semibold">Mode</th>
                      <th className="px-3 py-3 text-center font-semibold">Date</th>
                      <th className="px-3 py-3 text-center font-semibold">Status</th>
                      <th className="px-3 py-3 text-left font-semibold">Remarks</th>
                      {(user?.role === 'cre' || user?.role === 'super_admin') && (
                        <th className="px-3 py-3 text-center font-semibold">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(!paymentSummary?.payment_stages || paymentSummary.payment_stages.length === 0) ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                          No payment schedule created yet. Planning team can generate the schedule.
                        </td>
                      </tr>
                    ) : (
                      paymentSummary.payment_stages.map((stage, idx) => {
                        const balance = (stage.amount || 0) - (stage.amount_received || 0);
                        const isPaid = stage.status === 'paid';
                        
                        return (
                          <tr key={stage.stage_id} className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''}`}>
                            <td className="px-3 py-3 font-medium">{stage.stage_label || idx + 1}</td>
                            <td className="px-3 py-3 max-w-xs">
                              <p className="font-medium truncate">{stage.stage_name}</p>
                            </td>
                            <td className="px-3 py-3 text-right">{stage.percentage}%</td>
                            <td className="px-3 py-3 text-right font-semibold">{formatCurrency(stage.amount)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-green-600">
                              {formatCurrency(stage.amount_received || 0)}
                            </td>
                            <td className="px-3 py-3 text-center text-xs">
                              {stage.payment_mode ? (
                                <Badge variant="outline" className="capitalize">{stage.payment_mode.replace('_', ' ')}</Badge>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-3 text-center text-xs">
                              {stage.payment_date ? new Date(stage.payment_date).toLocaleDateString('en-IN') : '-'}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {getPaymentStatusBadge(stage.status)}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-500 max-w-xs truncate">
                              {stage.remarks || '-'}
                            </td>
                            {(user?.role === 'cre' || user?.role === 'super_admin') && (
                              <td className="px-3 py-3 text-center">
                                {!isPaid && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => openCollectDialog(stage)}
                                  >
                                    <DollarSign className="h-3 w-3 mr-1" />
                                    Collect
                                  </Button>
                                )}
                                {isPaid && (
                                  <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {paymentSummary?.payment_stages?.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={2} className="px-3 py-3">Total</td>
                        <td className="px-3 py-3 text-right">100%</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(paymentSummary.summary?.total_scheduled)}</td>
                        <td className="px-3 py-3 text-right text-green-600">{formatCurrency(paymentSummary.summary?.total_received)}</td>
                        <td colSpan={5}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Verification Dialog */}
      <Dialog open={verifyDialog.open} onOpenChange={(open) => !open && setVerifyDialog({ open: false, type: '', ids: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Verify Items
            </DialogTitle>
            <DialogDescription>
              You are about to verify {verifyDialog.ids.length} {verifyDialog.type} item(s) and send them for Super Admin approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Please review all items carefully before verification. 
                Once verified, items will be sent to the Super Admin for final approval.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Type <span className="font-bold text-blue-600">VERIFY</span> to confirm
              </Label>
              <Input
                data-testid="verify-code-input"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Type VERIFY"
                className="mt-2"
              />
              {verifyCode && verifyCode !== 'VERIFY' && (
                <p className="text-xs text-red-500 mt-1">Please type 'VERIFY' exactly in capital letters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog({ open: false, type: '', ids: [] })}>
              Cancel
            </Button>
            <Button 
              data-testid="confirm-verify-btn"
              onClick={handleVerify}
              disabled={verifyCode !== 'VERIFY'}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify & Send for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={collectPaymentDialog} onOpenChange={setCollectPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Collect Payment
            </DialogTitle>
            <DialogDescription>
              {selectedStage?.stage_label} - {selectedStage?.stage_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Stage Amount</p>
                <p className="font-semibold">{formatCurrency(selectedStage?.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Already Received</p>
                <p className="font-semibold text-green-600">{formatCurrency(selectedStage?.amount_received || 0)}</p>
              </div>
            </div>
            
            <div>
              <Label>Amount to Collect *</Label>
              <Input
                type="number"
                value={collectForm.amount_received}
                onChange={(e) => setCollectForm({...collectForm, amount_received: e.target.value})}
                placeholder="Enter amount"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Payment Mode *</Label>
              <select
                value={collectForm.payment_mode}
                onChange={(e) => setCollectForm({...collectForm, payment_mode: e.target.value})}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            
            <div>
              <Label>Reference / Transaction ID</Label>
              <Input
                value={collectForm.payment_reference}
                onChange={(e) => setCollectForm({...collectForm, payment_reference: e.target.value})}
                placeholder="Transaction ID or Cheque No."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Input
                value={collectForm.remarks}
                onChange={(e) => setCollectForm({...collectForm, remarks: e.target.value})}
                placeholder="Optional remarks"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
