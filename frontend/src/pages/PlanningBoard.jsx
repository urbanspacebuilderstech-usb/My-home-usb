import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Eye, Send, Package, Users, Building2, ArrowRight, Check, X, DollarSign,
  Plus, Search, Trash2, Edit, Truck, EyeOff, ClipboardList, AlertCircle,
  Clock, RefreshCw, CheckCircle, XCircle, FileText, Calculator, Phone, Mail,
  MapPin, Target, Download, Save
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { generateREPDF } from '../utils/pdfGenerator';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MATERIAL_CATEGORIES = ['cement','sand','steel','bricks','aggregate','tiles','electrical','plumbing','paint','wood','hardware','other'];
const MATERIAL_UNITS = ['bag','ton','kg','load','nos','sqft','cft','rft','litre','meter','bundle','set'];
const WORK_TYPES = ['Masonry','Plumbing','Electrical','Carpentry','Painting','Flooring','Roofing','HVAC','Civil','Finishing','Tiling','Waterproofing'];

export default function PlanningBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all_projects');

  // Projects
  const [projects, setProjects] = useState([]);
  const [stages, setStages] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [stageDialog, setStageDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newStage, setNewStage] = useState('');

  // Requests (site engineer + payment)
  const [pendingRequests, setPendingRequests] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [newProjectsFromCRE, setNewProjectsFromCRE] = useState([]);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Materials
  const [materials, setMaterials] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState('active');
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialForm, setMaterialForm] = useState({ name: '', category: 'cement', unit: 'bag', description: '', hsn_code: '' });

  // Labours
  const [contractors, setContractors] = useState([]);
  const [contractorSearch, setContractorSearch] = useState('');
  const [contractorDialog, setContractorDialog] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const [contractorForm, setContractorForm] = useState({ name: '', work_types: [], phone: '', email: '', address: '', bank_name: '', account_number: '', ifsc_code: '' });

  // Suppliers
  const [vendors, setVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorDialog, setVendorDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0 });

  const [vendorLoading, setVendorLoading] = useState(false);

  // RE Projects (Rough Estimates)
  const [reProjects, setReProjects] = useState([]);
  const [reDashboard, setReDashboard] = useState(null);
  const [reActiveTab, setReActiveTab] = useState('new');
  const [reEditDialog, setReEditDialog] = useState(false);
  const [reApprovalDialog, setReApprovalDialog] = useState(false);
  const [reSelectedProject, setReSelectedProject] = useState(null);
  const [reEditForm, setReEditForm] = useState({
    project_name: '', client_name: '', client_phone: '', client_email: '',
    location: '', total_area_sqft: '', estimated_rate_per_sqft: '', additional_notes: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);

      const [dashRes, projRes, payReqRes, matReqRes, labReqRes, newCRERes, reDashRes, reProjRes] = await Promise.allSettled([
        axios.get(`${API}/planning/stage-dashboard`),
        axios.get(`${API}/planning/projects-by-stage`),
        axios.get(`${API}/work-orders/payment-requests`),
        axios.get(`${API}/material-requests?status=requested`),
        axios.get(`${API}/labour-expenses?status=requested`),
        axios.get(`${API}/planning/projects?status=new`),
        axios.get(`${API}/crm/planning/re-dashboard`).catch(() => null),
        axios.get(`${API}/crm/re-projects`).catch(() => null)
      ]);

      if (dashRes.status === 'fulfilled') setStages(dashRes.value.data.stages || []);
      if (projRes.status === 'fulfilled') setProjects(projRes.value.data || []);
      if (payReqRes.status === 'fulfilled') setPaymentRequests(payReqRes.value.data || []);
      if (newCRERes.status === 'fulfilled') setNewProjectsFromCRE(newCRERes.value.data || []);
      if (reDashRes.status === 'fulfilled' && reDashRes.value?.data) setReDashboard(reDashRes.value.data);
      if (reProjRes.status === 'fulfilled' && reProjRes.value?.data) setReProjects(reProjRes.value.data || []);

      const allReqs = [];
      if (matReqRes.status === 'fulfilled') allReqs.push(...(matReqRes.value.data || []).map(r => ({ ...r, type: 'material' })));
      if (labReqRes.status === 'fulfilled') allReqs.push(...(labReqRes.value.data || []).map(r => ({ ...r, type: 'labour' })));
      setPendingRequests(allReqs);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 15000);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'materials' && materials.length === 0) fetchMaterials();
    if (tab === 'labours' && contractors.length === 0) fetchContractors();
    if (tab === 'suppliers' && vendors.length === 0) fetchVendors();
  };

  const fetchMaterials = async () => { try { const r = await axios.get(`${API}/materials?active_only=false`); setMaterials(r.data); } catch {} };
  const fetchContractors = async () => { try { const r = await axios.get(`${API}/labour-contractors`); setContractors(r.data); } catch {} };
  const fetchVendors = async () => {
    if (vendorLoading) return;
    setVendorLoading(true);
    try {
      const [v, m] = await Promise.all([
        axios.get(`${API}/vendor-master?active_only=false`),
        materials.length === 0 ? axios.get(`${API}/materials?active_only=false`) : Promise.resolve({ data: materials })
      ]);
      setVendors(v.data); if (materials.length === 0) setMaterials(m.data);
    } catch {} finally { setVendorLoading(false); }
  };

  // === PROJECT HANDLERS ===
  const handleSubmitForApproval = async (id) => {
    try { await axios.patch(`${API}/planning/projects/${id}/submit-for-approval`); toast.success('Submitted for GM approval'); fetchData(false); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const openStageDialog = (p) => { setSelectedProject(p); setNewStage(p.current_stage || 'yet_to_start'); setStageDialog(true); };
  const handleUpdateStage = async () => {
    if (!selectedProject || !newStage) return;
    try { await axios.patch(`${API}/planning/projects/${selectedProject.project_id}/update-stage?stage=${newStage}`); toast.success('Stage updated'); setStageDialog(false); fetchData(false); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  // === REQUEST HANDLERS ===
  const handleApproveRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      await axios.patch(ep, null, { params: { action: 'approve' } }); toast.success('Approved'); fetchData(false);
    } catch { toast.error('Failed'); }
  };
  const handleRejectRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      await axios.patch(ep, null, { params: { action: 'reject', reason: 'Rejected by Planning' } }); toast.success('Rejected'); fetchData(false);
    } catch { toast.error('Failed'); }
  };
  const handleApprovePayment = async (p) => {
    try { await axios.patch(`${API}/work-orders/${p.work_order_id}/stages/${p.stage_id}/approve-payment`); toast.success('Payment approved'); fetchData(false); } catch { toast.error('Failed'); }
  };
  const handleRejectPayment = async () => {
    if (!selectedPayment) return;
    try { await axios.patch(`${API}/work-orders/${selectedPayment.work_order_id}/stages/${selectedPayment.stage_id}/reject-payment`, null, { params: { reason: rejectReason || 'Not verified' } }); toast.success('Rejected'); setRejectDialog(false); fetchData(false); } catch { toast.error('Failed'); }
  };

  // === MATERIAL HANDLERS ===
  const openMaterialDialog = (m = null) => {
    setEditingMaterial(m);
    setMaterialForm(m ? { name: m.name, category: m.category, unit: m.unit, description: m.description || '', hsn_code: m.hsn_code || '' } : { name: '', category: 'cement', unit: 'bag', description: '', hsn_code: '' });
    setMaterialDialog(true);
  };
  const handleSaveMaterial = async () => {
    if (!materialForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingMaterial) { await axios.patch(`${API}/materials/${editingMaterial.material_id}`, materialForm); toast.success('Updated'); }
      else { await axios.post(`${API}/materials`, materialForm); toast.success('Created'); }
      setMaterialDialog(false); fetchMaterials();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleToggleMaterial = async (m) => {
    try { await axios.patch(`${API}/materials/${m.material_id}`, { is_active: !m.is_active }); toast.success(m.is_active ? 'Hidden' : 'Activated'); fetchMaterials(); } catch { toast.error('Failed'); }
  };

  // === CONTRACTOR HANDLERS ===
  const openContractorDialog = (c = null) => {
    setEditingContractor(c);
    setContractorForm(c ? { name: c.name, work_types: c.work_types || [], phone: c.phone || '', email: c.email || '', address: c.address || '', bank_name: c.bank_name || '', account_number: c.account_number || '', ifsc_code: c.ifsc_code || '' } : { name: '', work_types: [], phone: '', email: '', address: '', bank_name: '', account_number: '', ifsc_code: '' });
    setContractorDialog(true);
  };
  const handleSaveContractor = async () => {
    if (!contractorForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingContractor) { await axios.patch(`${API}/labour-contractors/${editingContractor.contractor_id}`, contractorForm); toast.success('Updated'); }
      else { await axios.post(`${API}/labour-contractors`, contractorForm); toast.success('Created'); }
      setContractorDialog(false); fetchContractors();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleDeleteContractor = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await axios.delete(`${API}/labour-contractors/${c.contractor_id}`); toast.success('Deleted'); fetchContractors(); } catch { toast.error('Failed'); }
  };

  // === VENDOR HANDLERS ===
  const openVendorDialog = (v = null) => {
    setEditingVendor(v);
    setVendorForm(v ? { name: v.name, contact_person: v.contact_person || '', phone: v.phone || '', email: v.email || '', address: v.address || '', gst_number: v.gst_number || '', materials_supplied: v.materials_supplied || [], payment_terms: v.payment_terms || 'full', credit_limit: v.credit_limit || 0, credit_days: v.credit_days || 0 } : { name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0 });
    setVendorDialog(true);
  };
  const handleSaveVendor = async () => {
    if (!vendorForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingVendor) { await axios.patch(`${API}/vendor-master/${editingVendor.vendor_id}`, vendorForm); toast.success('Updated'); }
      else { await axios.post(`${API}/vendor-master`, vendorForm); toast.success('Created'); }
      setVendorDialog(false); fetchVendors();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleToggleVendor = async (v) => {
    try { await axios.patch(`${API}/vendor-master/${v.vendor_id}`, { is_active: !v.is_active }); toast.success(v.is_active ? 'Hidden' : 'Activated'); fetchVendors(); } catch { toast.error('Failed'); }
  };

  // === HELPERS ===
  const formatCurrency = (a) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);
  const getStatusBadge = (s) => {
    const m = { in_planning: 'bg-green-100 text-green-700', planning_review: 'bg-amber-100 text-amber-700', awaiting_approval: 'bg-yellow-100 text-yellow-700', gm_approved: 'bg-purple-100 text-purple-700', planning_approved: 'bg-green-100 text-green-700', active: 'bg-green-100 text-green-700', completed: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${m[s] || 'bg-gray-100 text-gray-700'}`}>{s?.replace(/_/g, ' ')}</span>;
  };
  const getStageBadge = (id) => {
    const s = stages.find(x => x.id === id);
    return <Badge variant="outline" className="text-xs capitalize">{s?.name || id?.replace(/_/g, ' ') || '-'}</Badge>;
  };
  const getMaterialName = (id) => materials.find(m => m.material_id === id)?.name || id;

  const filteredProjects = projects.filter(p => !projectSearch || (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) || (p.client_name || '').toLowerCase().includes(projectSearch.toLowerCase()));
  const filteredMaterials = materials.filter(m => {
    const search = !materialSearch || m.name.toLowerCase().includes(materialSearch.toLowerCase()) || m.category?.toLowerCase().includes(materialSearch.toLowerCase());
    if (materialFilter === 'active') return search && m.is_active !== false;
    if (materialFilter === 'inactive') return search && m.is_active === false;
    return search;
  });
  const filteredContractors = contractors.filter(c => !contractorSearch || c.name.toLowerCase().includes(contractorSearch.toLowerCase()));
  const filteredVendors = vendors.filter(v => !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()));

  const newProjectCount = newProjectsFromCRE.length;
  const requestCount = pendingRequests.length + paymentRequests.length;
  const reNewCount = reProjects.filter(p => p.status === 're_requested').length;

  const RE_STATUS_CONFIG = {
    re_requested: { label: 'New Request', color: 'bg-amber-50 text-amber-700 border-blue-300', icon: Clock },
    re_in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: RefreshCw },
    re_submitted: { label: 'Submitted', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: FileText },
    re_approved: { label: 'Approved', color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle },
    re_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-300', icon: XCircle },
    deal_closed: { label: 'Deal Closed', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: Target },
    converted: { label: 'Converted', color: 'bg-teal-100 text-teal-700 border-teal-300', icon: Building2 }
  };

  const reFilteredProjects = (status) => {
    const statusMap = {
      'new': ['re_requested'],
      'in_progress': ['re_in_progress'],
      'awaiting': ['re_submitted'],
      'approved': ['re_approved', 'deal_closed', 'converted'],
      'rejected': ['re_rejected']
    };
    return reProjects.filter(p => (statusMap[status] || []).includes(p.status));
  };

  const openReEdit = (p) => {
    setReSelectedProject(p);
    setReEditForm({
      project_name: p.project_name || '', client_name: p.client_name || '',
      client_phone: p.client_phone || '', client_email: p.client_email || '',
      location: p.location || '', total_area_sqft: p.total_area_sqft || '',
      estimated_rate_per_sqft: p.estimated_rate_per_sqft || '', additional_notes: p.additional_notes || ''
    });
    setReEditDialog(true);
  };

  const handleReSaveEdit = async () => {
    if (!reSelectedProject) return;
    try {
      await axios.patch(`${API}/crm/re-projects/${reSelectedProject.re_project_id}`, {
        ...reEditForm,
        total_area_sqft: parseFloat(reEditForm.total_area_sqft) || 0,
        estimated_rate_per_sqft: parseFloat(reEditForm.estimated_rate_per_sqft) || 0
      });
      toast.success('RE Project updated');
      setReEditDialog(false);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update'); }
  };

  const handleReStatusChange = async (projectId, newStatus) => {
    try {
      if (newStatus === 're_in_progress') {
        // Start: PATCH the project (backend auto-changes status from re_requested to re_in_progress)
        await axios.patch(`${API}/crm/re-projects/${projectId}`, { additional_notes: '' });
      } else if (newStatus === 're_submitted') {
        // Submit for approval
        await axios.post(`${API}/crm/re-projects/${projectId}/submit-for-approval`);
      }
      toast.success(`Status updated to ${RE_STATUS_CONFIG[newStatus]?.label || newStatus}`);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleReApproval = async (approved) => {
    if (!reSelectedProject) return;
    try {
      await axios.patch(`${API}/crm/re-projects/${reSelectedProject.re_project_id}/approve`, { approved });
      toast.success(approved ? 'RE Project approved' : 'RE Project rejected');
      setReApprovalDialog(false);
      fetchData(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const CountBadge = ({ count }) => count > 0 ? <span className="ml-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] inline-flex items-center justify-center">{count}</span> : null;

  if (loading && !user) return <div className="min-h-screen bg-gray-50"><div className="max-w-7xl mx-auto px-4 py-8"><div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-48 mb-4" /><div className="h-4 bg-gray-200 rounded w-full" /></div></div></div>;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="planning-board">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="bg-white border shadow-sm mb-3 flex-wrap">
            <TabsTrigger value="all_projects" className="text-xs sm:text-sm" data-testid="tab-all-projects">
              All Projects<CountBadge count={newProjectCount} />
            </TabsTrigger>
            <TabsTrigger value="requests" className="text-xs sm:text-sm" data-testid="tab-requests">
              Requests<CountBadge count={requestCount} />
            </TabsTrigger>
            <TabsTrigger value="materials" className="text-xs sm:text-sm" data-testid="tab-materials">Materials</TabsTrigger>
            <TabsTrigger value="labours" className="text-xs sm:text-sm" data-testid="tab-labours">Labours</TabsTrigger>
            <TabsTrigger value="suppliers" className="text-xs sm:text-sm" data-testid="tab-suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="rough_estimates" className="text-xs sm:text-sm" data-testid="tab-rough-estimates">
              Rough Estimates<CountBadge count={reNewCount} />
            </TabsTrigger>
          </TabsList>

          {/* ==================== ALL PROJECTS ==================== */}
          <TabsContent value="all_projects">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-indigo-600" />All Projects ({filteredProjects.length})</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="project-search" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="projects-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Stage</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredProjects.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No projects found</td></tr>
                      ) : filteredProjects.map((p) => (
                        <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`project-row-${p.project_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{p.name}</p><p className="text-xs text-gray-400">{p.location || '-'}</p></td>
                          <td className="px-4 py-2.5 text-gray-600">{p.client_name}</td>
                          <td className="px-4 py-2.5 text-center">{getStageBadge(p.current_stage || 'yet_to_start')}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-green-600">{formatCurrency(p.total_value)}</td>
                          <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.location.href = `/projects/${p.project_id}`}><Eye className="h-3 w-3 mr-1" />View</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openStageDialog(p)}><ArrowRight className="h-3 w-3" /></Button>
                              {p.status === 'planning_review' && <Button size="sm" className="h-7 text-xs" onClick={() => handleSubmitForApproval(p.project_id)}><Send className="h-3 w-3 mr-1" />Submit</Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== REQUESTS ==================== */}
          <TabsContent value="requests">
            <div className="space-y-4">
              {/* Site Requests */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-orange-600" />Site Requests ({pendingRequests.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {pendingRequests.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No pending site requests</div>
                  ) : (
                    <div className="divide-y">
                      {pendingRequests.map((req) => (
                        <div key={req.request_id || req.expense_id} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`request-${req.request_id || req.expense_id}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant={req.type === 'material' ? 'default' : 'secondary'} className="text-xs">{req.type}</Badge>
                              <span className="font-medium text-sm">{req.material_name || req.labour_type}</span>
                            </div>
                            <p className="text-xs text-gray-500">{req.type === 'material' ? `Qty: ${req.quantity} ${req.unit}` : `Workers: ${req.workers_count}, Days: ${req.days}`} | {req.project_name}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => handleApproveRequest(req)}><Check className="h-3 w-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleRejectRequest(req)}><X className="h-3 w-3 mr-1" />Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment Requests */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-purple-600" />Payment Requests ({paymentRequests.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {paymentRequests.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No payment requests</div>
                  ) : (
                    <div className="divide-y">
                      {paymentRequests.map((p) => (
                        <div key={p.stage_id} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`payment-req-${p.stage_id}`}>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{p.stage_name}</p>
                            <p className="text-xs text-gray-500">{p.project_name} | By: {p.requested_by_name}</p>
                            <p className="font-bold text-green-600 text-sm">{formatCurrency(p.amount)}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs" onClick={() => handleApprovePayment(p)}><Check className="h-3 w-3 mr-1" />Approve</Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setSelectedPayment(p); setRejectReason(''); setRejectDialog(true); }}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ==================== MATERIALS ==================== */}
          <TabsContent value="materials">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-blue-600" />Materials ({filteredMaterials.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                      {['active', 'inactive', 'all'].map(f => (
                        <button key={f} className={`px-2 py-1 text-xs rounded-md ${materialFilter === f ? 'bg-white shadow font-medium' : 'text-gray-500'}`} onClick={() => setMaterialFilter(f)} data-testid={`filter-${f}`}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                      ))}
                    </div>
                    <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                    <Button size="sm" onClick={() => openMaterialDialog()} className="bg-blue-600 hover:bg-blue-700" data-testid="add-material-btn"><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="materials-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">HSN</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredMaterials.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No materials found</td></tr>
                      ) : filteredMaterials.map((m) => (
                        <tr key={m.material_id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`} data-testid={`material-row-${m.material_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{m.name}</p>{m.description && <p className="text-xs text-gray-400">{m.description}</p>}</td>
                          <td className="px-4 py-2.5"><Badge variant="outline" className="capitalize text-xs">{m.category?.replace(/_/g, ' ')}</Badge></td>
                          <td className="px-4 py-2.5 text-gray-600">{m.unit}</td>
                          <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{m.hsn_code || '-'}</td>
                          <td className="px-4 py-2.5 text-center">{m.is_active !== false ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">Hidden</Badge>}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openMaterialDialog(m)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleMaterial(m)}>{m.is_active !== false ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-green-600" />}</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== LABOURS ==================== */}
          <TabsContent value="labours">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-amber-600" />Labour Contractors ({filteredContractors.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={contractorSearch} onChange={(e) => setContractorSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                    <Button size="sm" onClick={() => openContractorDialog()} className="bg-amber-600 hover:bg-amber-700" data-testid="add-contractor-btn"><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="contractors-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Work Types</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Phone</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Bank</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredContractors.length === 0 ? (
                        <tr><td colSpan="5" className="p-8 text-center text-gray-400">No contractors found</td></tr>
                      ) : filteredContractors.map((c) => (
                        <tr key={c.contractor_id} className="hover:bg-gray-50" data-testid={`contractor-row-${c.contractor_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{c.name}</p>{c.address && <p className="text-xs text-gray-400">{c.address}</p>}</td>
                          <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{(c.work_types || []).slice(0,3).map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}{(c.work_types||[]).length > 3 && <Badge variant="outline" className="text-xs">+{c.work_types.length-3}</Badge>}</div></td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">{c.phone || '-'}</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-gray-500">{c.bank_name || '-'}</td>
                          <td className="px-4 py-2.5"><div className="flex justify-center gap-1"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openContractorDialog(c)}><Edit className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteContractor(c)}><Trash2 className="h-3 w-3" /></Button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== SUPPLIERS ==================== */}
          <TabsContent value="suppliers">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-teal-600" />Suppliers ({filteredVendors.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                    <Button size="sm" onClick={() => openVendorDialog()} className="bg-teal-600 hover:bg-teal-700" data-testid="add-vendor-btn"><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="vendors-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Contact</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Materials</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">GST</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredVendors.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No suppliers found</td></tr>
                      ) : filteredVendors.map((v) => (
                        <tr key={v.vendor_id} className={`hover:bg-gray-50 ${!v.is_active ? 'opacity-50' : ''}`} data-testid={`vendor-row-${v.vendor_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{v.name}</p>{v.address && <p className="text-xs text-gray-400 truncate max-w-[200px]">{v.address}</p>}</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell"><p className="text-xs">{v.contact_person || '-'}</p><p className="text-xs text-gray-400">{v.phone || '-'}</p></td>
                          <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{(v.materials_supplied||[]).slice(0,2).map(id => <Badge key={id} variant="outline" className="text-xs">{getMaterialName(id)}</Badge>)}{(v.materials_supplied||[]).length > 2 && <Badge variant="outline" className="text-xs">+{v.materials_supplied.length-2}</Badge>}</div></td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs">{v.gst_number || '-'}</td>
                          <td className="px-4 py-2.5 text-center">{v.is_active !== false ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">Hidden</Badge>}</td>
                          <td className="px-4 py-2.5"><div className="flex justify-center gap-1"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openVendorDialog(v)}><Edit className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleVendor(v)}>{v.is_active !== false ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-green-600" />}</Button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== ROUGH ESTIMATES ==================== */}
          <TabsContent value="rough_estimates">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-violet-600" />Rough Estimates ({reProjects.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* RE Status Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                  {[
                    { key: 'new', label: 'New Requests', count: reFilteredProjects('new').length, icon: Clock, color: 'amber' },
                    { key: 'in_progress', label: 'In Progress', count: reFilteredProjects('in_progress').length, icon: RefreshCw, color: 'yellow' },
                    { key: 'awaiting', label: 'Awaiting Approval', count: reFilteredProjects('awaiting').length, icon: FileText, color: 'purple' },
                    { key: 'approved', label: 'Approved', count: reFilteredProjects('approved').length, icon: CheckCircle, color: 'green' },
                    { key: 'rejected', label: 'Rejected', count: reFilteredProjects('rejected').length, icon: XCircle, color: 'red' },
                  ].map(s => (
                    <div key={s.key}
                      className={`rounded-lg border p-2.5 text-center cursor-pointer transition-all hover:shadow-md ${reActiveTab === s.key ? 'ring-2 ring-violet-400 ring-offset-1' : ''} bg-${s.color}-50 border-${s.color}-200`}
                      onClick={() => setReActiveTab(s.key)} data-testid={`re-status-${s.key}`}>
                      <s.icon className={`h-5 w-5 mx-auto mb-1 text-${s.color}-600`} />
                      <p className={`text-xl font-bold text-${s.color}-700`}>{s.count}</p>
                      <p className={`text-[10px] text-${s.color}-600`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* RE Projects List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-violet-600" />
                    RE Projects - {reActiveTab === 'new' ? 'New' : reActiveTab === 'in_progress' ? 'In Progress' : reActiveTab === 'awaiting' ? 'Awaiting Approval' : reActiveTab === 'approved' ? 'Approved' : 'Rejected'}
                  </h3>
                  {reFilteredProjects(reActiveTab).length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">No RE projects in this category</div>
                  ) : reFilteredProjects(reActiveTab).map(p => {
                    const cfg = RE_STATUS_CONFIG[p.status] || {};
                    const est = (parseFloat(p.total_area_sqft) || 0) * (parseFloat(p.estimated_rate_per_sqft) || 0);
                    return (
                      <Card key={p.re_project_id} className="border hover:shadow-md transition-shadow" data-testid={`re-project-${p.re_project_id}`}>
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{p.project_name || `RE - ${p.client_name}`}</span>
                                <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label || p.status}</Badge>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                                <div><span className="text-gray-400">Client:</span> {p.client_name}</div>
                                <div><span className="text-gray-400">Location:</span> {p.location || '-'}</div>
                                <div><span className="text-gray-400">Size:</span> {p.total_area_sqft ? `${p.total_area_sqft} sqft` : '-'}</div>
                                <div><span className="text-gray-400">Estimated Total:</span> <span className="font-semibold text-violet-700">{formatCurrency(est)}</span></div>
                              </div>
                              {p.client_phone && <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" /> {p.client_phone}</span>
                                {p.client_email && <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" /> {p.client_email}</span>}
                              </div>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openReEdit(p)} data-testid={`re-edit-${p.re_project_id}`}>
                                <Edit className="h-3 w-3" /> Edit
                              </Button>
                              {typeof generateREPDF === 'function' && (
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => generateREPDF(p)}>
                                  <Download className="h-3 w-3" />
                                </Button>
                              )}
                              {p.status === 're_requested' && (
                                <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => handleReStatusChange(p.re_project_id, 're_in_progress')}>
                                  <RefreshCw className="h-3 w-3" /> Start
                                </Button>
                              )}
                              {p.status === 're_in_progress' && (
                                <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 gap-1" onClick={() => handleReStatusChange(p.re_project_id, 're_submitted')}>
                                  <Send className="h-3 w-3" /> Submit
                                </Button>
                              )}
                              {p.status === 're_submitted' && (
                                <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 gap-1" onClick={() => { setReSelectedProject(p); setReApprovalDialog(true); }}>
                                  <Eye className="h-3 w-3" /> Review
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ==================== DIALOGS ==================== */}
      <Dialog open={stageDialog} onOpenChange={setStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Project Stage</DialogTitle><DialogDescription>Move "{selectedProject?.name}" to a new stage</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Current Stage</Label><div className="mt-1">{getStageBadge(selectedProject?.current_stage || 'yet_to_start')}</div></div>
            <div><Label>Move to</Label><Select value={newStage} onValueChange={setNewStage}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStageDialog(false)}>Cancel</Button><Button onClick={handleUpdateStage} className="bg-indigo-600 hover:bg-indigo-700">Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Payment</DialogTitle></DialogHeader>
          <div className="py-4"><Label>Reason</Label><Input placeholder="Reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-2" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button><Button variant="destructive" onClick={handleRejectPayment}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingMaterial ? 'Edit Material' : 'Add Material'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="Material name" className="mt-1" data-testid="material-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Category</Label><Select value={materialForm.category} onValueChange={(v) => setMaterialForm({ ...materialForm, category: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{MATERIAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Unit</Label><Select value={materialForm.unit} onValueChange={(v) => setMaterialForm({ ...materialForm, unit: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{MATERIAL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Description</Label><Input value={materialForm.description} onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })} placeholder="Optional" className="mt-1" /></div>
            <div><Label>HSN Code</Label><Input value={materialForm.hsn_code} onChange={(e) => setMaterialForm({ ...materialForm, hsn_code: e.target.value })} placeholder="e.g. 2523" className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMaterialDialog(false)}>Cancel</Button><Button onClick={handleSaveMaterial} className="bg-blue-600 hover:bg-blue-700" data-testid="save-material-btn">{editingMaterial ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contractorDialog} onOpenChange={setContractorDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingContractor ? 'Edit Contractor' : 'Add Contractor'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={contractorForm.name} onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })} placeholder="Contractor name" className="mt-1" data-testid="contractor-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={contractorForm.phone} onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>Email</Label><Input value={contractorForm.email} onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Address</Label><Input value={contractorForm.address} onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })} className="mt-1" /></div>
            <div><Label>Work Types</Label><div className="flex flex-wrap gap-2 mt-1">{WORK_TYPES.map(wt => (<button key={wt} type="button" className={`px-2 py-1 text-xs border rounded-md ${contractorForm.work_types.includes(wt) ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-gray-200 text-gray-500'}`} onClick={() => setContractorForm({ ...contractorForm, work_types: contractorForm.work_types.includes(wt) ? contractorForm.work_types.filter(t=>t!==wt) : [...contractorForm.work_types, wt] })}>{wt}</button>))}</div></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Bank</Label><Input value={contractorForm.bank_name} onChange={(e) => setContractorForm({ ...contractorForm, bank_name: e.target.value })} className="mt-1 text-xs" /></div>
              <div><Label className="text-xs">Account No.</Label><Input value={contractorForm.account_number} onChange={(e) => setContractorForm({ ...contractorForm, account_number: e.target.value })} className="mt-1 text-xs" /></div>
              <div><Label className="text-xs">IFSC</Label><Input value={contractorForm.ifsc_code} onChange={(e) => setContractorForm({ ...contractorForm, ifsc_code: e.target.value })} className="mt-1 text-xs" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setContractorDialog(false)}>Cancel</Button><Button onClick={handleSaveContractor} className="bg-amber-600 hover:bg-amber-700" data-testid="save-contractor-btn">{editingContractor ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorDialog} onOpenChange={setVendorDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingVendor ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Company Name *</Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} className="mt-1" data-testid="vendor-name-input" /></div>
              <div><Label>Contact Person</Label><Input value={vendorForm.contact_person} onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>Email</Label><Input value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Address</Label><Input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>GST Number</Label><Input value={vendorForm.gst_number} onChange={(e) => setVendorForm({ ...vendorForm, gst_number: e.target.value })} className="mt-1" /></div>
              <div><Label>Payment Terms</Label><Select value={vendorForm.payment_terms} onValueChange={(v) => setVendorForm({ ...vendorForm, payment_terms: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full">Full</SelectItem><SelectItem value="advance">Advance</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></div>
            </div>
            {vendorForm.payment_terms === 'credit' && <div className="grid grid-cols-2 gap-4"><div><Label>Credit Limit</Label><Input type="number" value={vendorForm.credit_limit} onChange={(e) => setVendorForm({ ...vendorForm, credit_limit: parseFloat(e.target.value)||0 })} className="mt-1" /></div><div><Label>Credit Days</Label><Input type="number" value={vendorForm.credit_days} onChange={(e) => setVendorForm({ ...vendorForm, credit_days: parseInt(e.target.value)||0 })} className="mt-1" /></div></div>}
            <div><Label>Materials Supplied</Label><div className="flex flex-wrap gap-1 mt-1 max-h-28 overflow-y-auto">{materials.filter(m=>m.is_active!==false).map(m => (<button key={m.material_id} type="button" className={`px-2 py-0.5 text-xs border rounded ${vendorForm.materials_supplied.includes(m.material_id) ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-white border-gray-200 text-gray-500'}`} onClick={() => setVendorForm({...vendorForm,materials_supplied:vendorForm.materials_supplied.includes(m.material_id)?vendorForm.materials_supplied.filter(id=>id!==m.material_id):[...vendorForm.materials_supplied,m.material_id]})}>{m.name}</button>))}</div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setVendorDialog(false)}>Cancel</Button><Button onClick={handleSaveVendor} className="bg-teal-600 hover:bg-teal-700" data-testid="save-vendor-btn">{editingVendor ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RE Edit Dialog */}
      <Dialog open={reEditDialog} onOpenChange={setReEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Rough Estimate</DialogTitle><DialogDescription>Update RE project details</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Project Name</Label><Input value={reEditForm.project_name} onChange={(e) => setReEditForm({ ...reEditForm, project_name: e.target.value })} className="mt-1" data-testid="re-edit-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Client Name</Label><Input value={reEditForm.client_name} onChange={(e) => setReEditForm({ ...reEditForm, client_name: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Client Phone</Label><Input value={reEditForm.client_phone} onChange={(e) => setReEditForm({ ...reEditForm, client_phone: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Email</Label><Input value={reEditForm.client_email} onChange={(e) => setReEditForm({ ...reEditForm, client_email: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Location</Label><Input value={reEditForm.location} onChange={(e) => setReEditForm({ ...reEditForm, location: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Total Area (sqft)</Label><Input type="number" value={reEditForm.total_area_sqft} onChange={(e) => setReEditForm({ ...reEditForm, total_area_sqft: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Rate per sqft</Label><Input type="number" value={reEditForm.estimated_rate_per_sqft} onChange={(e) => setReEditForm({ ...reEditForm, estimated_rate_per_sqft: e.target.value })} className="mt-1" /></div>
            </div>
            {reEditForm.total_area_sqft && reEditForm.estimated_rate_per_sqft && (
              <div className="bg-violet-50 rounded-lg p-2 text-center">
                <span className="text-xs text-gray-500">Estimated Total: </span>
                <span className="text-sm font-bold text-violet-700">{formatCurrency(parseFloat(reEditForm.total_area_sqft || 0) * parseFloat(reEditForm.estimated_rate_per_sqft || 0))}</span>
              </div>
            )}
            <div><Label className="text-xs">Notes</Label><Input value={reEditForm.additional_notes} onChange={(e) => setReEditForm({ ...reEditForm, additional_notes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setReEditDialog(false)}>Cancel</Button><Button onClick={handleReSaveEdit} className="bg-violet-600 hover:bg-violet-700" data-testid="re-save-edit-btn"><Save className="h-4 w-4 mr-1" />Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RE Approval Dialog */}
      <Dialog open={reApprovalDialog} onOpenChange={setReApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Review Rough Estimate</DialogTitle><DialogDescription>Approve or reject this RE submission</DialogDescription></DialogHeader>
          {reSelectedProject && (
            <Card className="bg-violet-50 border-violet-200">
              <CardContent className="p-3">
                <p className="font-semibold text-sm">{reSelectedProject.project_name || `RE - ${reSelectedProject.client_name}`}</p>
                <p className="text-xs text-gray-600 mt-1">Client: {reSelectedProject.client_name}</p>
                <p className="text-xs text-gray-600">Area: {reSelectedProject.total_area_sqft} sqft @ {formatCurrency(reSelectedProject.estimated_rate_per_sqft)}/sqft</p>
                <p className="text-lg font-bold text-violet-700 mt-1">{formatCurrency((reSelectedProject.total_area_sqft || 0) * (reSelectedProject.estimated_rate_per_sqft || 0))}</p>
              </CardContent>
            </Card>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReApprovalDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleReApproval(false)} data-testid="re-reject-btn"><XCircle className="h-4 w-4 mr-1" />Reject</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleReApproval(true)} data-testid="re-approve-btn"><CheckCircle className="h-4 w-4 mr-1" />Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
