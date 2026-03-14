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
  ClipboardList, FileText, Clock, CheckCircle, Briefcase,
  Eye, Send, Package, Users, Building2, ArrowRight, Check, X, DollarSign,
  Pencil, Hammer, Home, PaintBucket, Layers, HardHat, KeyRound, Play, Calculator,
  Plus, Search, Trash2, Phone, Mail, Edit, ToggleLeft, ToggleRight, Truck, EyeOff, MapPin
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STAGE_CONFIG = {
  drawing: { icon: Pencil, color: 'from-purple-50 to-purple-100', border: 'border-purple-200', text: 'text-purple-700', bg: 'bg-purple-600' },
  yet_to_start: { icon: Play, color: 'from-gray-50 to-gray-100', border: 'border-gray-200', text: 'text-gray-700', bg: 'bg-gray-600' },
  foundation: { icon: Layers, color: 'from-amber-50 to-amber-100', border: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-600' },
  basement: { icon: Building2, color: 'from-stone-50 to-stone-100', border: 'border-stone-200', text: 'text-stone-700', bg: 'bg-stone-600' },
  brick_work: { icon: HardHat, color: 'from-orange-50 to-orange-100', border: 'border-orange-200', text: 'text-orange-700', bg: 'bg-orange-600' },
  plastering: { icon: PaintBucket, color: 'from-cyan-50 to-cyan-100', border: 'border-cyan-200', text: 'text-cyan-700', bg: 'bg-cyan-600' },
  finishing: { icon: Hammer, color: 'from-blue-50 to-blue-100', border: 'border-blue-200', text: 'text-amber-700', bg: 'bg-secondary' },
  handover: { icon: KeyRound, color: 'from-green-50 to-green-100', border: 'border-green-200', text: 'text-green-700', bg: 'bg-green-600' }
};

const MATERIAL_CATEGORIES = [
  'cement', 'sand', 'steel', 'bricks', 'aggregate', 'tiles',
  'electrical', 'plumbing', 'paint', 'wood', 'hardware', 'other'
];

const MATERIAL_UNITS = ['bag', 'ton', 'kg', 'load', 'nos', 'sqft', 'cft', 'rft', 'litre', 'meter', 'bundle', 'set'];

const WORK_TYPES = [
  'Masonry', 'Plumbing', 'Electrical', 'Carpentry', 'Painting',
  'Flooring', 'Roofing', 'HVAC', 'Civil', 'Finishing', 'Tiling', 'Waterproofing'
];

export default function PlanningBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [projects, setProjects] = useState([]);
  const [stages, setStages] = useState([]);
  const [stageCounts, setStageCounts] = useState({});
  const [activeTab, setActiveTab] = useState('all_projects');

  // Alerts
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [newProjectsFromCRE, setNewProjectsFromCRE] = useState([]);
  const [reProjectsCount, setReProjectsCount] = useState(0);

  // Dialogs
  const [stageDialog, setStageDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newStage, setNewStage] = useState('');
  const [requestsDialog, setRequestsDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
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

  // Labour Contractors
  const [contractors, setContractors] = useState([]);
  const [contractorSearch, setContractorSearch] = useState('');
  const [contractorDialog, setContractorDialog] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const [contractorForm, setContractorForm] = useState({ name: '', work_types: [], phone: '', email: '', address: '', bank_name: '', account_number: '', ifsc_code: '' });

  // Suppliers (Vendors)
  const [vendors, setVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorDialog, setVendorDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0 });

  // Project search
  const [projectSearch, setProjectSearch] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, payReqRes, reRes, newCRERes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/planning/stage-dashboard`),
        axios.get(`${API}/work-orders/payment-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/crm/re-projects?status=re_requested`).catch(() => ({ data: [] })),
        axios.get(`${API}/planning/projects?status=new`).catch(() => ({ data: [] }))
      ]);

      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setStages(dashboardRes.data.stages || []);
      setStageCounts(dashboardRes.data.stage_counts || {});
      setPaymentRequests(payReqRes.data);
      setReProjectsCount(reRes.data?.length || 0);
      setNewProjectsFromCRE(newCRERes.data || []);

      // Fetch projects (all)
      try {
        const projRes = await axios.get(`${API}/planning/projects-by-stage`);
        setProjects(projRes.data);
      } catch { setProjects([]); }
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };

  // Fetch tab-specific data on tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'materials' && materials.length === 0) fetchMaterials();
    if (tab === 'labours' && contractors.length === 0) fetchContractors();
    if (tab === 'suppliers' && vendors.length === 0) fetchVendors();
  };

  const fetchMaterials = async () => {
    try {
      const res = await axios.get(`${API}/materials?active_only=false`);
      setMaterials(res.data);
    } catch { toast.error('Failed to load materials'); }
  };

  const fetchContractors = async () => {
    try {
      const res = await axios.get(`${API}/labour-contractors`);
      setContractors(res.data);
    } catch { toast.error('Failed to load contractors'); }
  };

  const fetchVendors = async () => {
    try {
      const [vendRes, matRes] = await Promise.all([
        axios.get(`${API}/vendor-master?active_only=false`),
        materials.length === 0 ? axios.get(`${API}/materials?active_only=false`) : Promise.resolve({ data: materials })
      ]);
      setVendors(vendRes.data);
      if (materials.length === 0) setMaterials(matRes.data);
    } catch { toast.error('Failed to load suppliers'); }
  };

  // === PROJECT HANDLERS ===
  const handleSubmitForApproval = async (projectId) => {
    try {
      await axios.patch(`${API}/planning/projects/${projectId}/submit-for-approval`);
      toast.success('Submitted for GM approval');
      fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
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
      toast.success('Stage updated');
      setStageDialog(false);
      fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  // === REQUEST/PAYMENT HANDLERS ===
  const fetchPendingRequests = async () => {
    try {
      const [matRes, labRes] = await Promise.all([
        axios.get(`${API}/material-requests?status=requested`).catch(() => ({ data: [] })),
        axios.get(`${API}/labour-expenses?status=requested`).catch(() => ({ data: [] }))
      ]);
      setPendingRequests([
        ...matRes.data.map(r => ({ ...r, type: 'material' })),
        ...labRes.data.map(r => ({ ...r, type: 'labour' }))
      ]);
      setRequestsDialog(true);
    } catch { }
  };

  const handleApproveRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      await axios.patch(ep, null, { params: { action: 'approve' } });
      toast.success('Approved');
      fetchPendingRequests();
      fetchData();
    } catch { toast.error('Failed'); }
  };

  const handleRejectRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      await axios.patch(ep, null, { params: { action: 'reject', reason: 'Rejected by Planning' } });
      toast.success('Rejected');
      fetchPendingRequests();
    } catch { toast.error('Failed'); }
  };

  const handleApprovePayment = async (payment) => {
    try {
      await axios.patch(`${API}/work-orders/${payment.work_order_id}/stages/${payment.stage_id}/approve-payment`);
      toast.success('Payment approved');
      fetchData();
    } catch { toast.error('Failed'); }
  };

  const handleRejectPayment = async () => {
    if (!selectedPayment) return;
    try {
      await axios.patch(`${API}/work-orders/${selectedPayment.work_order_id}/stages/${selectedPayment.stage_id}/reject-payment`, null, { params: { reason: rejectReason || 'Work not verified' } });
      toast.success('Rejected');
      setRejectDialog(false);
      fetchData();
    } catch { toast.error('Failed'); }
  };

  // === MATERIAL HANDLERS ===
  const openMaterialDialog = (mat = null) => {
    if (mat) {
      setEditingMaterial(mat);
      setMaterialForm({ name: mat.name, category: mat.category, unit: mat.unit, description: mat.description || '', hsn_code: mat.hsn_code || '' });
    } else {
      setEditingMaterial(null);
      setMaterialForm({ name: '', category: 'cement', unit: 'bag', description: '', hsn_code: '' });
    }
    setMaterialDialog(true);
  };

  const handleSaveMaterial = async () => {
    if (!materialForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingMaterial) {
        await axios.patch(`${API}/materials/${editingMaterial.material_id}`, materialForm);
        toast.success('Material updated');
      } else {
        await axios.post(`${API}/materials`, materialForm);
        toast.success('Material created');
      }
      setMaterialDialog(false);
      fetchMaterials();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  const handleToggleMaterial = async (mat) => {
    try {
      await axios.patch(`${API}/materials/${mat.material_id}`, { is_active: !mat.is_active });
      toast.success(mat.is_active ? 'Material hidden' : 'Material activated');
      fetchMaterials();
    } catch { toast.error('Failed'); }
  };

  const handleDeleteMaterial = async (mat) => {
    try {
      await axios.delete(`${API}/materials/${mat.material_id}`);
      toast.success('Material deleted');
      fetchMaterials();
    } catch { toast.error('Failed'); }
  };

  // === LABOUR HANDLERS ===
  const openContractorDialog = (c = null) => {
    if (c) {
      setEditingContractor(c);
      setContractorForm({ name: c.name, work_types: c.work_types || [], phone: c.phone || '', email: c.email || '', address: c.address || '', bank_name: c.bank_name || '', account_number: c.account_number || '', ifsc_code: c.ifsc_code || '' });
    } else {
      setEditingContractor(null);
      setContractorForm({ name: '', work_types: [], phone: '', email: '', address: '', bank_name: '', account_number: '', ifsc_code: '' });
    }
    setContractorDialog(true);
  };

  const handleSaveContractor = async () => {
    if (!contractorForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingContractor) {
        await axios.patch(`${API}/labour-contractors/${editingContractor.contractor_id}`, contractorForm);
        toast.success('Contractor updated');
      } else {
        await axios.post(`${API}/labour-contractors`, contractorForm);
        toast.success('Contractor created');
      }
      setContractorDialog(false);
      fetchContractors();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  const handleDeleteContractor = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await axios.delete(`${API}/labour-contractors/${c.contractor_id}`);
      toast.success('Deleted');
      fetchContractors();
    } catch { toast.error('Failed'); }
  };

  // === VENDOR HANDLERS ===
  const openVendorDialog = (v = null) => {
    if (v) {
      setEditingVendor(v);
      setVendorForm({ name: v.name, contact_person: v.contact_person || '', phone: v.phone || '', email: v.email || '', address: v.address || '', gst_number: v.gst_number || '', materials_supplied: v.materials_supplied || [], payment_terms: v.payment_terms || 'full', credit_limit: v.credit_limit || 0, credit_days: v.credit_days || 0 });
    } else {
      setEditingVendor(null);
      setVendorForm({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0 });
    }
    setVendorDialog(true);
  };

  const handleSaveVendor = async () => {
    if (!vendorForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingVendor) {
        await axios.patch(`${API}/vendor-master/${editingVendor.vendor_id}`, vendorForm);
        toast.success('Supplier updated');
      } else {
        await axios.post(`${API}/vendor-master`, vendorForm);
        toast.success('Supplier created');
      }
      setVendorDialog(false);
      fetchVendors();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  const handleToggleVendor = async (v) => {
    try {
      await axios.patch(`${API}/vendor-master/${v.vendor_id}`, { is_active: !v.is_active });
      toast.success(v.is_active ? 'Supplier hidden' : 'Supplier activated');
      fetchVendors();
    } catch { toast.error('Failed'); }
  };

  // === HELPERS ===
  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
      in_planning: { label: 'New from CRE', cls: 'bg-green-100 text-green-700' },
      planning_review: { label: 'In Review', cls: 'bg-amber-100 text-amber-700' },
      planning: { label: 'Planning', cls: 'bg-blue-100 text-blue-700' },
      awaiting_approval: { label: 'Awaiting GM', cls: 'bg-yellow-100 text-yellow-700' },
      gm_approved: { label: 'GM Approved', cls: 'bg-purple-100 text-purple-700' },
      planning_approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
      active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
      completed: { label: 'Completed', cls: 'bg-gray-100 text-gray-700' }
    };
    const c = config[status] || { label: status?.replace(/_/g, ' ') || '-', cls: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>{c.label}</span>;
  };

  const getStageBadge = (stageId) => {
    const stage = stages.find(s => s.id === stageId);
    const config = STAGE_CONFIG[stageId] || STAGE_CONFIG.yet_to_start;
    return <Badge className={`${config.bg} text-white text-xs`}>{stage?.name || stageId?.replace(/_/g, ' ')}</Badge>;
  };

  const getMaterialName = (id) => {
    const m = materials.find(mat => mat.material_id === id);
    return m ? m.name : id;
  };

  const filteredProjects = projects.filter(p => {
    if (!projectSearch) return true;
    const s = projectSearch.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.client_name || '').toLowerCase().includes(s);
  });

  const filteredMaterials = materials.filter(m => {
    const matchSearch = !materialSearch || m.name.toLowerCase().includes(materialSearch.toLowerCase()) || m.category?.toLowerCase().includes(materialSearch.toLowerCase());
    if (materialFilter === 'active') return matchSearch && m.is_active !== false;
    if (materialFilter === 'inactive') return matchSearch && m.is_active === false;
    return matchSearch;
  });

  const filteredContractors = contractors.filter(c => !contractorSearch || c.name.toLowerCase().includes(contractorSearch.toLowerCase()));

  const filteredVendors = vendors.filter(v => !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()) || v.contact_person?.toLowerCase().includes(vendorSearch.toLowerCase()));

  const totalStageProjects = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const alertCount = (dashboard.pending_material_requests || 0) + (dashboard.pending_labour_requests || 0) + paymentRequests.length + reProjectsCount + newProjectsFromCRE.length;

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-4 gap-4 mb-6">{[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-lg border p-4 animate-pulse"><div className="h-4 bg-gray-200 rounded w-20 mb-2" /><div className="h-8 bg-gray-200 rounded w-12" /></div>)}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" data-testid="planning-board">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <Card className="border-l-4 border-l-blue-500" data-testid="card-total-projects">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Projects</p>
              <p className="text-2xl font-bold">{totalStageProjects}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">New from CRE</p>
              <p className="text-2xl font-bold text-green-700">{dashboard.new_projects || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Awaiting GM</p>
              <p className="text-2xl font-bold text-yellow-700">{dashboard.awaiting_approval || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Working</p>
              <p className="text-2xl font-bold text-purple-700">{dashboard.working_projects || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Pending Actions</p>
              <p className="text-2xl font-bold text-orange-700">{alertCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Alert Banners */}
        <div className="space-y-2 mb-4">
          {(dashboard.pending_material_requests > 0 || dashboard.pending_labour_requests > 0) && (
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-orange-600" /><span className="text-orange-800 font-medium">Site Requests:</span><span className="text-orange-600">{dashboard.pending_material_requests || 0} material, {dashboard.pending_labour_requests || 0} labour</span></div>
              <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 h-7" onClick={fetchPendingRequests}>Review</Button>
            </div>
          )}
          {paymentRequests.length > 0 && (
            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm"><DollarSign className="h-4 w-4 text-purple-600" /><span className="text-purple-800 font-medium">{paymentRequests.length} Payment Request(s)</span><span className="text-purple-600">awaiting verification</span></div>
              <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 h-7" onClick={() => setPaymentDialog(true)}>Review</Button>
            </div>
          )}
          {reProjectsCount > 0 && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm"><Calculator className="h-4 w-4 text-indigo-600" /><span className="text-indigo-800 font-medium">{reProjectsCount} RE Request(s)</span><span className="text-indigo-600">waiting for rough estimate</span></div>
              <Button size="sm" variant="outline" className="border-indigo-300 text-indigo-700 h-7" onClick={() => window.location.href = '/crm/re-projects'}>Review</Button>
            </div>
          )}
        </div>

        {/* Construction Stages Mini */}
        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2"><HardHat className="h-4 w-4 text-indigo-600" /><span className="text-sm font-medium">Construction Stages</span></div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {stages.map((stage) => {
                const config = STAGE_CONFIG[stage.id] || STAGE_CONFIG.yet_to_start;
                const Icon = config.icon;
                return (
                  <div key={stage.id} className={`bg-gradient-to-br ${config.color} ${config.border} border rounded-lg p-2 text-center`}>
                    <div className={`${config.bg} w-6 h-6 rounded-full flex items-center justify-center mx-auto mb-1`}><Icon className="h-3 w-3 text-white" /></div>
                    <p className="text-sm font-bold">{stageCounts[stage.id] || 0}</p>
                    <p className="text-xs truncate">{stage.name}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="bg-white border shadow-sm mb-3">
            <TabsTrigger value="all_projects" className="text-xs sm:text-sm" data-testid="tab-all-projects">
              All Projects
            </TabsTrigger>
            <TabsTrigger value="materials" className="text-xs sm:text-sm" data-testid="tab-materials">
              Materials
            </TabsTrigger>
            <TabsTrigger value="labours" className="text-xs sm:text-sm" data-testid="tab-labours">
              Labours
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="text-xs sm:text-sm" data-testid="tab-suppliers">
              Suppliers
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
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.location || '-'}</p>
                          </td>
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

          {/* ==================== MATERIALS ==================== */}
          <TabsContent value="materials">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-blue-600" />Materials</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      {['active', 'inactive', 'all'].map(f => (
                        <button key={f} className={`px-2 py-1 text-xs rounded-md ${materialFilter === f ? 'bg-white shadow font-medium' : 'text-gray-500'}`} onClick={() => setMaterialFilter(f)} data-testid={`filter-${f}`}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search..." value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" />
                    </div>
                    <Button size="sm" onClick={() => openMaterialDialog()} className="bg-blue-600 hover:bg-blue-700" data-testid="add-material-btn"><Plus className="h-4 w-4 mr-1" />Add Material</Button>
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
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400"><Package className="h-8 w-8 mx-auto mb-2 opacity-50" />No materials found</td></tr>
                      ) : filteredMaterials.map((m) => (
                        <tr key={m.material_id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-60' : ''}`} data-testid={`material-row-${m.material_id}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{m.name}</p>
                            {m.description && <p className="text-xs text-gray-400">{m.description}</p>}
                          </td>
                          <td className="px-4 py-2.5"><Badge variant="outline" className="capitalize text-xs">{m.category?.replace(/_/g, ' ')}</Badge></td>
                          <td className="px-4 py-2.5 text-gray-600">{m.unit}</td>
                          <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{m.hsn_code || '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {m.is_active !== false ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">Hidden</Badge>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openMaterialDialog(m)} title="Edit"><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleMaterial(m)} title={m.is_active !== false ? 'Hide' : 'Activate'}>
                                {m.is_active !== false ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-green-600" />}
                              </Button>
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
                  <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-amber-600" />Labour Contractors ({contractors.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search..." value={contractorSearch} onChange={(e) => setContractorSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" />
                    </div>
                    <Button size="sm" onClick={() => openContractorDialog()} className="bg-amber-600 hover:bg-amber-700" data-testid="add-contractor-btn"><Plus className="h-4 w-4 mr-1" />Add Contractor</Button>
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
                        <tr><td colSpan="5" className="p-8 text-center text-gray-400"><Users className="h-8 w-8 mx-auto mb-2 opacity-50" />No contractors found</td></tr>
                      ) : filteredContractors.map((c) => (
                        <tr key={c.contractor_id} className="hover:bg-gray-50" data-testid={`contractor-row-${c.contractor_id}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{c.name}</p>
                            {c.address && <p className="text-xs text-gray-400">{c.address}</p>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">{(c.work_types || []).slice(0, 3).map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}{(c.work_types || []).length > 3 && <Badge variant="outline" className="text-xs">+{c.work_types.length - 3}</Badge>}</div>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">{c.phone || '-'}</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-gray-500">{c.bank_name || '-'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openContractorDialog(c)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteContractor(c)}><Trash2 className="h-3 w-3" /></Button>
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

          {/* ==================== SUPPLIERS ==================== */}
          <TabsContent value="suppliers">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-teal-600" />Suppliers / Vendors ({vendors.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search..." value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" />
                    </div>
                    <Button size="sm" onClick={() => openVendorDialog()} className="bg-teal-600 hover:bg-teal-700" data-testid="add-vendor-btn"><Plus className="h-4 w-4 mr-1" />Add Supplier</Button>
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
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400"><Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />No suppliers found</td></tr>
                      ) : filteredVendors.map((v) => (
                        <tr key={v.vendor_id} className={`hover:bg-gray-50 ${!v.is_active ? 'opacity-60' : ''}`} data-testid={`vendor-row-${v.vendor_id}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{v.name}</p>
                            {v.address && <p className="text-xs text-gray-400 truncate max-w-[200px]">{v.address}</p>}
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <p className="text-xs">{v.contact_person || '-'}</p>
                            <p className="text-xs text-gray-400">{v.phone || '-'}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">{(v.materials_supplied || []).slice(0, 2).map(id => <Badge key={id} variant="outline" className="text-xs">{getMaterialName(id)}</Badge>)}{(v.materials_supplied || []).length > 2 && <Badge variant="outline" className="text-xs">+{v.materials_supplied.length - 2}</Badge>}</div>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs">{v.gst_number || '-'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {v.is_active !== false ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">Hidden</Badge>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openVendorDialog(v)}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleVendor(v)}>{v.is_active !== false ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-green-600" />}</Button>
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
        </Tabs>
      </div>

      {/* ==================== DIALOGS ==================== */}

      {/* Stage Update Dialog */}
      <Dialog open={stageDialog} onOpenChange={setStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Project Stage</DialogTitle><DialogDescription>Move "{selectedProject?.name}" to a new stage</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Current Stage</Label><div className="mt-1">{getStageBadge(selectedProject?.current_stage || 'yet_to_start')}</div></div>
            <div>
              <Label>Move to</Label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateStage} className="bg-indigo-600 hover:bg-indigo-700">Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Requests Dialog */}
      <Dialog open={requestsDialog} onOpenChange={setRequestsDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pending Site Engineer Requests</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {pendingRequests.length === 0 ? <p className="text-center text-gray-500 py-8">No pending requests</p> :
              pendingRequests.map(req => (
                <div key={req.request_id || req.expense_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Badge variant={req.type === 'material' ? 'default' : 'secondary'} className="mb-1">{req.type}</Badge>
                    <p className="font-medium text-sm">{req.material_name || req.labour_type}</p>
                    <p className="text-xs text-gray-500">{req.type === 'material' ? `Qty: ${req.quantity} ${req.unit}` : `Workers: ${req.workers_count}, Days: ${req.days}`} | {req.project_name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7" onClick={() => handleApproveRequest(req)}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="destructive" className="h-7" onClick={() => handleRejectRequest(req)}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Stage Payment Requests</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {paymentRequests.map(p => (
              <div key={p.stage_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{p.stage_name}</p>
                  <p className="text-xs text-gray-500">{p.project_name} | By: {p.requested_by_name}</p>
                  <p className="font-bold text-green-600">{formatCurrency(p.amount)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7" onClick={() => handleApprovePayment(p)}><Check className="h-3 w-3 mr-1" />Approve</Button>
                  <Button size="sm" variant="destructive" className="h-7" onClick={() => { setSelectedPayment(p); setRejectReason(''); setRejectDialog(true); }}><X className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Payment Dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Payment</DialogTitle></DialogHeader>
          <div className="py-4"><Label>Reason</Label><Input placeholder="Reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-2" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectPayment}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Dialog */}
      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingMaterial ? 'Edit Material' : 'Add Material'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="e.g. OPC 53 Grade Cement" className="mt-1" data-testid="material-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={materialForm.category} onValueChange={(v) => setMaterialForm({ ...materialForm, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{MATERIAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={materialForm.unit} onValueChange={(v) => setMaterialForm({ ...materialForm, unit: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{MATERIAL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Input value={materialForm.description} onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })} placeholder="Optional description" className="mt-1" /></div>
            <div><Label>HSN Code</Label><Input value={materialForm.hsn_code} onChange={(e) => setMaterialForm({ ...materialForm, hsn_code: e.target.value })} placeholder="e.g. 2523" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterialDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveMaterial} className="bg-blue-600 hover:bg-blue-700" data-testid="save-material-btn">{editingMaterial ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contractor Dialog */}
      <Dialog open={contractorDialog} onOpenChange={setContractorDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingContractor ? 'Edit Contractor' : 'Add Contractor'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={contractorForm.name} onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })} placeholder="Contractor name" className="mt-1" data-testid="contractor-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={contractorForm.phone} onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })} placeholder="+91..." className="mt-1" /></div>
              <div><Label>Email</Label><Input value={contractorForm.email} onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })} placeholder="email" className="mt-1" /></div>
            </div>
            <div><Label>Address</Label><Input value={contractorForm.address} onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })} placeholder="Address" className="mt-1" /></div>
            <div>
              <Label>Work Types</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {WORK_TYPES.map(wt => (
                  <button key={wt} type="button" className={`px-2 py-1 text-xs border rounded-md ${contractorForm.work_types.includes(wt) ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-gray-200 text-gray-500'}`}
                    onClick={() => setContractorForm({ ...contractorForm, work_types: contractorForm.work_types.includes(wt) ? contractorForm.work_types.filter(t => t !== wt) : [...contractorForm.work_types, wt] })}>
                    {wt}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Bank</Label><Input value={contractorForm.bank_name} onChange={(e) => setContractorForm({ ...contractorForm, bank_name: e.target.value })} placeholder="Bank" className="mt-1 text-xs" /></div>
              <div><Label className="text-xs">Account No.</Label><Input value={contractorForm.account_number} onChange={(e) => setContractorForm({ ...contractorForm, account_number: e.target.value })} placeholder="A/C No." className="mt-1 text-xs" /></div>
              <div><Label className="text-xs">IFSC</Label><Input value={contractorForm.ifsc_code} onChange={(e) => setContractorForm({ ...contractorForm, ifsc_code: e.target.value })} placeholder="IFSC" className="mt-1 text-xs" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractorDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveContractor} className="bg-amber-600 hover:bg-amber-700" data-testid="save-contractor-btn">{editingContractor ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Dialog */}
      <Dialog open={vendorDialog} onOpenChange={setVendorDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingVendor ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Company Name *</Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="Supplier name" className="mt-1" data-testid="vendor-name-input" /></div>
              <div><Label>Contact Person</Label><Input value={vendorForm.contact_person} onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })} placeholder="Contact person" className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="+91..." className="mt-1" /></div>
              <div><Label>Email</Label><Input value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} placeholder="email" className="mt-1" /></div>
            </div>
            <div><Label>Address</Label><Input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} placeholder="Address" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>GST Number</Label><Input value={vendorForm.gst_number} onChange={(e) => setVendorForm({ ...vendorForm, gst_number: e.target.value })} placeholder="GSTIN" className="mt-1" /></div>
              <div>
                <Label>Payment Terms</Label>
                <Select value={vendorForm.payment_terms} onValueChange={(v) => setVendorForm({ ...vendorForm, payment_terms: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Payment</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {vendorForm.payment_terms === 'credit' && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Credit Limit</Label><Input type="number" value={vendorForm.credit_limit} onChange={(e) => setVendorForm({ ...vendorForm, credit_limit: parseFloat(e.target.value) || 0 })} className="mt-1" /></div>
                <div><Label>Credit Days</Label><Input type="number" value={vendorForm.credit_days} onChange={(e) => setVendorForm({ ...vendorForm, credit_days: parseInt(e.target.value) || 0 })} className="mt-1" /></div>
              </div>
            )}
            <div>
              <Label>Materials Supplied</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-28 overflow-y-auto">
                {materials.filter(m => m.is_active !== false).map(m => (
                  <button key={m.material_id} type="button" className={`px-2 py-0.5 text-xs border rounded ${vendorForm.materials_supplied.includes(m.material_id) ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-white border-gray-200 text-gray-500'}`}
                    onClick={() => setVendorForm({ ...vendorForm, materials_supplied: vendorForm.materials_supplied.includes(m.material_id) ? vendorForm.materials_supplied.filter(id => id !== m.material_id) : [...vendorForm.materials_supplied, m.material_id] })}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveVendor} className="bg-teal-600 hover:bg-teal-700" data-testid="save-vendor-btn">{editingVendor ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
