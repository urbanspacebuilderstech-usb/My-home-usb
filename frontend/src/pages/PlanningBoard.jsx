import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Eye, Send, Package, Users, Building2, ArrowRight, Check, X, DollarSign,
  Plus, Search, Trash2, Edit, Truck, EyeOff, ClipboardList, AlertCircle, Calendar, IndianRupee, Download, Filter, FileText, Copy
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useNavigate } from 'react-router-dom';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import REProjectsPage from './REProjectsPage';
import { NumericInput } from '../components/NumericInput';

import { UnitSelect } from '../components/UnitSelect';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MATERIAL_CATEGORIES = ['cement','sand','steel','bricks','aggregate','tiles','electrical','plumbing','paint','wood','hardware','other'];
const WORK_TYPES = ['Masonry','Plumbing','Electrical','Carpentry','Painting','Flooring','Roofing','HVAC','Civil','Finishing','Tiling','Waterproofing'];

export default function PlanningBoard() {
  const navigate = useNavigate();
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

  // Project sub-tabs
  const [projectSubTab, setProjectSubTab] = useState('new');
  const [subTabProjects, setSubTabProjects] = useState([]);
  const [subTabLoading, setSubTabLoading] = useState(false);
  const [projectDateFilter, setProjectDateFilter] = useState({ type: 'all', date: '', dateFrom: '', dateTo: '', month: '', year: '' });

  // Requests (site engineer + payment)
  const [pendingRequests, setPendingRequests] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [newProjectsFromCRE, setNewProjectsFromCRE] = useState([]);
  const [reNewCount, setReNewCount] = useState(0);
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

  // Monthly Payment Schedule
  const [monthlySchedule, setMonthlySchedule] = useState({ entries: [], summary: {} });
  const [scheduleMonth, setScheduleMonth] = useState(new Date().getMonth() + 1);
  const [scheduleYear, setScheduleYear] = useState(new Date().getFullYear());
  const [addStagesDialog, setAddStagesDialog] = useState(false);
  const [availableStages, setAvailableStages] = useState([]);
  const [selectedStageIds, setSelectedStageIds] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [vendorLoading, setVendorLoading] = useState(false);

  // RE Templates
  const [reTemplates, setReTemplates] = useState([]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', sqft: '', scope_items: [] });
  const [templateSearch, setTemplateSearch] = useState('');

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchSubTabProjects('new', projectDateFilter); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);

      const [dashRes, projRes, payReqRes, matReqRes, labReqRes, newCRERes, reProjRes] = await Promise.allSettled([
        axios.get(`${API}/planning/stage-dashboard`),
        axios.get(`${API}/planning/projects-by-stage`),
        axios.get(`${API}/work-orders/payment-requests`),
        axios.get(`${API}/material-requests?status=requested`),
        axios.get(`${API}/labour-expenses?status=requested`),
        axios.get(`${API}/planning/projects?status=new`),
        axios.get(`${API}/crm/re-projects`).catch(() => ({ data: [] }))
      ]);

      if (dashRes.status === 'fulfilled') setStages(dashRes.value.data.stages || []);
      if (projRes.status === 'fulfilled') setProjects(projRes.value.data || []);
      if (payReqRes.status === 'fulfilled') setPaymentRequests(payReqRes.value.data || []);
      if (newCRERes.status === 'fulfilled') setNewProjectsFromCRE(newCRERes.value.data || []);
      const reData = reProjRes.status === 'fulfilled' ? (reProjRes.value?.data || []) : [];
      setReNewCount(reData.filter(p => p.status === 're_requested').length);

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
    if (tab === 'payment_schedule') fetchMonthlySchedule();
    if (tab === 're_templates') fetchTemplates();
    if (tab === 'all_projects') fetchSubTabProjects(projectSubTab, projectDateFilter);
  };

  // Fetch projects by planning lifecycle sub-tab with date filters
  const fetchSubTabProjects = async (status, filter) => {
    setSubTabLoading(true);
    try {
      const params = new URLSearchParams({ planning_status: status });
      if (filter.type === 'date' && filter.date) {
        params.append('date_from', filter.date);
        params.append('date_to', filter.date);
      } else if (filter.type === 'range' && filter.dateFrom) {
        params.append('date_from', filter.dateFrom);
        if (filter.dateTo) params.append('date_to', filter.dateTo);
      } else if (filter.type === 'month' && filter.month && filter.year) {
        params.append('month', filter.month);
        params.append('year', filter.year);
      } else if (filter.type === 'year' && filter.year) {
        params.append('year', filter.year);
      }
      const res = await axios.get(`${API}/planning/projects-filtered?${params.toString()}`);
      setSubTabProjects(res.data || []);
    } catch { toast.error('Failed to load projects'); }
    finally { setSubTabLoading(false); }
  };

  useEffect(() => { if (activeTab === 'all_projects') fetchSubTabProjects(projectSubTab, projectDateFilter); }, [projectSubTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectSubTabChange = (tab) => {
    setProjectSubTab(tab);
    setProjectDateFilter({ type: 'all', date: '', dateFrom: '', dateTo: '', month: '', year: '' });
  };

  const applyProjectDateFilter = () => {
    fetchSubTabProjects(projectSubTab, projectDateFilter);
  };

  const clearProjectDateFilter = () => {
    const cleared = { type: 'all', date: '', dateFrom: '', dateTo: '', month: '', year: '' };
    setProjectDateFilter(cleared);
    fetchSubTabProjects(projectSubTab, cleared);
  };

  const handlePlanningStatusChange = async (projectId, newStatus) => {
    try {
      await axios.patch(`${API}/planning/projects/${projectId}/planning-status`, { planning_status: newStatus });
      toast.success(newStatus === 'active' ? 'Moved to Current Projects' : newStatus === 'delivered' ? 'Marked as Delivered' : 'Status updated');
      fetchSubTabProjects(projectSubTab, projectDateFilter);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update'); }
  };

  const fetchMonthlySchedule = async () => {
    try {
      setScheduleLoading(true);
      const r = await axios.get(`${API}/planning/monthly-schedule?month=${scheduleMonth}&year=${scheduleYear}`);
      setMonthlySchedule(r.data || { entries: [], summary: {} });
    } catch { /* ignore */ } finally { setScheduleLoading(false); }
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
    try { await axios.patch(`${API}/planning/projects/${id}/submit-for-approval`); toast.success('Submitted for GM approval. GM will review & approve.'); fetchData(false); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
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
      const res = await axios.patch(ep, null, { params: { action: 'approve' } });
      if (res.data?.auto_po) {
        toast.success('Approved! PO auto-generated → Goes to Procurement for processing');
      } else {
        toast.success('Approved! Goes to Procurement for vendor assignment');
      }
      fetchData(false);
    } catch { toast.error('Failed'); }
  };
  const handleRejectRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      await axios.patch(ep, null, { params: { action: 'reject', reason: 'Rejected by Planning' } }); toast.success('Rejected. Site Engineer will be notified.'); fetchData(false);
    } catch { toast.error('Failed'); }
  };
  const handleApprovePayment = async (p) => {
    try { await axios.patch(`${API}/work-orders/${p.work_order_id}/stages/${p.stage_id}/approve-payment`); toast.success('Payment approved! Goes to Accountant for release.'); fetchData(false); } catch { toast.error('Failed'); }
  };
  const handleRejectPayment = async () => {
    if (!selectedPayment) return;
    try { await axios.patch(`${API}/work-orders/${selectedPayment.work_order_id}/stages/${selectedPayment.stage_id}/reject-payment`, null, { params: { reason: rejectReason || 'Not verified' } }); toast.success('Rejected. Site Engineer will be notified.'); setRejectDialog(false); fetchData(false); } catch { toast.error('Failed'); }
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

  // === RE TEMPLATE HANDLERS ===
  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API}/crm/re-templates`);
      setReTemplates(res.data || []);
    } catch { toast.error('Failed to load templates'); }
  };

  const openTemplateDialog = (template = null) => {
    setEditingTemplate(template);
    setTemplateForm(template ? {
      name: template.name || '',
      sqft: template.sqft || '',
      scope_items: (template.scope_items || []).map(i => ({ ...i }))
    } : { name: '', sqft: '', scope_items: [] });
    setTemplateDialog(true);
  };

  const addTemplateScopeItem = () => {
    setTemplateForm({
      ...templateForm,
      scope_items: [...templateForm.scope_items, { name: '', quantity: 1, unit: 'nos', rate: 0, total: 0 }]
    });
  };

  const updateTemplateScopeItem = (index, field, value) => {
    const items = [...templateForm.scope_items];
    items[index][field] = value;
    if (field === 'quantity' || field === 'rate') {
      items[index].total = (parseFloat(items[index].quantity) || 0) * (parseFloat(items[index].rate) || 0);
    }
    setTemplateForm({ ...templateForm, scope_items: items });
  };

  const removeTemplateScopeItem = (index) => {
    setTemplateForm({ ...templateForm, scope_items: templateForm.scope_items.filter((_, i) => i !== index) });
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) { toast.error('Template name is required'); return; }
    const payload = {
      name: templateForm.name,
      sqft: parseFloat(templateForm.sqft) || 0,
      scope_items: templateForm.scope_items.map(i => ({
        name: i.name || '',
        quantity: parseFloat(i.quantity) || 0,
        unit: i.unit || 'nos',
        rate: parseFloat(i.rate) || 0,
        total: (parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)
      }))
    };
    try {
      if (editingTemplate) {
        await axios.patch(`${API}/crm/re-templates/${editingTemplate.template_id}`, payload);
        toast.success('Template updated');
      } else {
        await axios.post(`${API}/crm/re-templates`, payload);
        toast.success('Template created');
      }
      setTemplateDialog(false);
      fetchTemplates();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save template'); }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await axios.delete(`${API}/crm/re-templates/${template.template_id}`);
      toast.success('Template deleted');
      fetchTemplates();
    } catch { toast.error('Failed to delete'); }
  };

  const filteredTemplates = reTemplates.filter(t => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()));

  // === HELPERS ===
  const formatCurrency = (a) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);

  // === MONTHLY SCHEDULE HANDLERS ===
  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const handleScheduleMonthChange = (dir) => {
    let m = scheduleMonth + dir;
    let y = scheduleYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setScheduleMonth(m); setScheduleYear(y);
    setTimeout(() => fetchMonthlyScheduleFor(m, y), 100);
  };

  const fetchMonthlyScheduleFor = async (m, y) => {
    try {
      setScheduleLoading(true);
      const r = await axios.get(`${API}/planning/monthly-schedule?month=${m}&year=${y}`);
      setMonthlySchedule(r.data || { entries: [], summary: {} });
    } catch { } finally { setScheduleLoading(false); }
  };

  const openAddStagesDialog = async () => {
    try {
      const r = await axios.get(`${API}/planning/monthly-schedule/available-stages?month=${scheduleMonth}&year=${scheduleYear}`);
      setAvailableStages(r.data || []);
      setSelectedStageIds([]);
      setAddStagesDialog(true);
    } catch { toast.error('Failed to load stages'); }
  };

  const handleAddStagesToSchedule = async () => {
    if (selectedStageIds.length === 0) { toast.error('Select at least one stage'); return; }
    try {
      await axios.post(`${API}/planning/monthly-schedule/add-stages`, { month: scheduleMonth, year: scheduleYear, stage_ids: selectedStageIds });
      toast.success(`Added ${selectedStageIds.length} stages`);
      setAddStagesDialog(false);
      fetchMonthlyScheduleFor(scheduleMonth, scheduleYear);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRemoveScheduleEntry = async (entryId) => {
    if (!confirm('Remove this stage from the schedule?')) return;
    try {
      await axios.delete(`${API}/planning/monthly-schedule/${entryId}`);
      toast.success('Removed');
      fetchMonthlyScheduleFor(scheduleMonth, scheduleYear);
    } catch { toast.error('Failed'); }
  };

  const handleRequestPayment = async (entryId) => {
    try {
      await axios.patch(`${API}/planning/monthly-schedule/${entryId}/request-payment`);
      toast.success('Payment requested! Sent to CRE for processing.');
      fetchMonthlyScheduleFor(scheduleMonth, scheduleYear);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
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
            <TabsTrigger value="packages_link" className="text-xs sm:text-sm bg-amber-50 text-amber-700 hover:bg-amber-100" data-testid="tab-packages" onClick={(e) => { e.preventDefault(); navigate('/packages'); }}>
              <Package className="h-3 w-3 mr-1" />Packages
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
            <TabsTrigger value="re_templates" className="text-xs sm:text-sm" data-testid="tab-re-templates">
              <FileText className="h-3 w-3 mr-1" />RE Templates
            </TabsTrigger>
            <TabsTrigger value="payment_schedule" className="text-xs sm:text-sm" data-testid="tab-payment-schedule">
              <Calendar className="h-3 w-3 mr-1" />Payment Schedule
            </TabsTrigger>
          </TabsList>

          {/* ==================== ALL PROJECTS ==================== */}
          <TabsContent value="all_projects">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-600" />All Projects
                  </CardTitle>
                </div>
                {/* Sub-tabs */}
                <div className="flex gap-1 mt-3 border-b">
                  {[
                    { key: 'new', label: 'New Projects', color: 'blue' },
                    { key: 'active', label: 'Current Projects', color: 'green' },
                    { key: 'delivered', label: 'Delivered Projects', color: 'purple' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => handleProjectSubTabChange(tab.key)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        projectSubTab === tab.key
                          ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                      data-testid={`subtab-${tab.key}`}
                    >
                      {tab.label}
                      {projectSubTab === tab.key && (
                        <Badge variant="outline" className="ml-2 text-xs">{subTabProjects.length}</Badge>
                      )}
                    </button>
                  ))}
                </div>

                {/* Date Filters */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Select value={projectDateFilter.type} onValueChange={(v) => setProjectDateFilter({ ...projectDateFilter, type: v })}>
                    <SelectTrigger className="h-8 w-32 text-xs" data-testid="date-filter-type">
                      <SelectValue placeholder="Filter by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="date">By Date</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                      <SelectItem value="month">By Month</SelectItem>
                      <SelectItem value="year">By Year</SelectItem>
                    </SelectContent>
                  </Select>

                  {projectDateFilter.type === 'date' && (
                    <Input type="date" value={projectDateFilter.date} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, date: e.target.value })} className="h-8 w-40 text-xs" data-testid="date-filter-date" />
                  )}
                  {projectDateFilter.type === 'range' && (
                    <>
                      <Input type="date" value={projectDateFilter.dateFrom} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, dateFrom: e.target.value })} className="h-8 w-36 text-xs" data-testid="date-filter-from" />
                      <span className="text-xs text-gray-400">to</span>
                      <Input type="date" value={projectDateFilter.dateTo} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, dateTo: e.target.value })} className="h-8 w-36 text-xs" data-testid="date-filter-to" />
                    </>
                  )}
                  {projectDateFilter.type === 'month' && (
                    <div className="flex gap-1">
                      <Select value={projectDateFilter.month} onValueChange={(v) => setProjectDateFilter({ ...projectDateFilter, month: v })}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
                        <SelectContent>
                          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                            <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="Year" value={projectDateFilter.year} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, year: e.target.value })} className="h-8 w-20 text-xs" data-testid="date-filter-year" />
                    </div>
                  )}
                  {projectDateFilter.type === 'year' && (
                    <Input type="number" placeholder="Year" value={projectDateFilter.year} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, year: e.target.value })} className="h-8 w-24 text-xs" data-testid="date-filter-year-only" />
                  )}

                  {projectDateFilter.type !== 'all' && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-8 text-xs" onClick={applyProjectDateFilter} data-testid="apply-date-filter">
                        <Filter className="h-3 w-3 mr-1" />Apply
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={clearProjectDateFilter} data-testid="clear-date-filter">
                        <X className="h-3 w-3 mr-1" />Clear
                      </Button>
                    </div>
                  )}

                  <div className="ml-auto relative">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="project-search" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {subTabLoading ? (
                  <div className="p-8 text-center text-gray-500">Loading projects...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="projects-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Stage</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(() => {
                          const filtered = subTabProjects.filter(p =>
                            !projectSearch ||
                            (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) ||
                            (p.client_name || '').toLowerCase().includes(projectSearch.toLowerCase())
                          );
                          if (filtered.length === 0) return (
                            <tr><td colSpan="7" className="p-8 text-center text-gray-400">
                              {projectSubTab === 'new' ? 'No new projects from CRE' : projectSubTab === 'active' ? 'No active construction projects' : 'No delivered projects'}
                            </td></tr>
                          );
                          return filtered.map((p) => (
                            <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`project-row-${p.project_id}`}>
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{p.name}</p>
                                <p className="text-xs text-gray-400">{p.location || p.project_code || '-'}</p>
                              </td>
                              <td className="px-4 py-2.5 text-gray-600">{p.client_name || '-'}</td>
                              <td className="px-4 py-2.5 text-center">{getStageBadge(p.current_stage || 'yet_to_start')}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-green-600">{formatCurrency(p.total_value)}</td>
                              <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">
                                {projectSubTab === 'new' && p.planning_new_date ? new Date(p.planning_new_date).toLocaleDateString('en-IN') :
                                 projectSubTab === 'active' && p.planning_active_date ? new Date(p.planning_active_date).toLocaleDateString('en-IN') :
                                 projectSubTab === 'delivered' && p.planning_delivered_date ? new Date(p.planning_delivered_date).toLocaleDateString('en-IN') :
                                 p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '-'}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex justify-center gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.location.href = `/projects/${p.project_id}`}>
                                    <Eye className="h-3 w-3 mr-1" />View
                                  </Button>
                                  {projectSubTab === 'new' && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                      onClick={() => handlePlanningStatusChange(p.project_id, 'active')}
                                      data-testid={`ready-to-construction-${p.project_id}`}
                                    >
                                      <ArrowRight className="h-3 w-3 mr-1" />Ready to Construction
                                    </Button>
                                  )}
                                  {projectSubTab === 'active' && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                                      onClick={() => handlePlanningStatusChange(p.project_id, 'delivered')}
                                      data-testid={`mark-delivered-${p.project_id}`}
                                    >
                                      <Check className="h-3 w-3 mr-1" />Mark Delivered
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
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
                        <div key={`${req.type}-${req.request_id || req.expense_id}`} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`request-${req.request_id || req.expense_id}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant={req.type === 'material' ? 'default' : 'secondary'} className="text-xs">{req.type}</Badge>
                              <span className="font-medium text-sm">{req.material_name || req.labour_type}</span>
                            </div>
                            <p className="text-xs text-gray-500">{req.type === 'material' ? `Qty: ${req.quantity} ${req.unit}` : `Workers: ${req.workers_count}, Days: ${req.days}`} | {req.project_name}</p>
                            {req.assigned_vendor_name && (
                              <p className="text-xs text-blue-600 font-medium mt-0.5">Vendor: {req.assigned_vendor_name} ({req.assigned_vendor_category})</p>
                            )}
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
            <REProjectsPage embedded />
          </TabsContent>

          {/* ==================== RE TEMPLATES ==================== */}
          <TabsContent value="re_templates">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-600" />
                    RE Templates ({filteredTemplates.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search templates..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="template-search" />
                    </div>
                    <Button size="sm" onClick={() => openTemplateDialog()} data-testid="create-template-btn">
                      <Plus className="h-4 w-4 mr-1" /> Create Template
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No templates yet</p>
                    <p className="text-sm mt-1">Create your first RE template to reuse across projects</p>
                    <Button size="sm" className="mt-4" onClick={() => openTemplateDialog()} data-testid="create-first-template-btn">
                      <Plus className="h-4 w-4 mr-1" /> Create Template
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="templates-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Template Name</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Sq.ft</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Scope Items</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Estimated Total</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredTemplates.map(t => (
                          <tr key={t.template_id} className="hover:bg-gray-50" data-testid={`template-row-${t.template_id}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{t.name}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="outline" className="text-xs">{t.sqft || '-'} sqft</Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className="bg-purple-100 text-purple-700 text-xs">{t.scope_items?.length || 0} items</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(t.estimated_total)}
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{t.created_by_name || '-'}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openTemplateDialog(t)} data-testid={`edit-template-${t.template_id}`}>
                                  <Edit className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t)} data-testid={`delete-template-${t.template_id}`}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== PAYMENT SCHEDULE ==================== */}
          <TabsContent value="payment_schedule">
            {/* Month Navigation */}
            <Card className="mb-4">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="outline" onClick={() => handleScheduleMonthChange(-1)} data-testid="schedule-prev-month">
                      <ArrowRight className="h-4 w-4 rotate-180" />
                    </Button>
                    <div className="text-center min-w-[140px]">
                      <p className="text-lg font-bold text-gray-900" data-testid="schedule-current-month">{MONTH_NAMES[scheduleMonth]} {scheduleYear}</p>
                      <p className="text-xs text-gray-500">Payment Schedule</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleScheduleMonthChange(1)} data-testid="schedule-next-month">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button onClick={openAddStagesDialog} className="bg-amber-600 hover:bg-amber-700" data-testid="add-stages-btn">
                    <Plus className="h-4 w-4 mr-1" /> Add Stages
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Total Planned</p>
                  <p className="text-lg font-bold text-indigo-700">{formatCurrency(monthlySchedule.summary?.total_planned)}</p>
                  <p className="text-[10px] text-gray-400">{monthlySchedule.summary?.total_entries || 0} stages</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Collected</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(monthlySchedule.summary?.total_received)}</p>
                  <p className="text-[10px] text-gray-400">{monthlySchedule.summary?.collected_count || 0} collected</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Balance</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(monthlySchedule.summary?.total_balance)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Carry Over Due</p>
                  <p className="text-lg font-bold text-red-700">{monthlySchedule.summary?.carryover_count || 0}</p>
                  <p className="text-[10px] text-gray-400">from prev months</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-3">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Requested</p>
                  <p className="text-lg font-bold text-blue-700">{monthlySchedule.summary?.requested_count || 0}</p>
                  <p className="text-[10px] text-gray-400">sent to CRE</p>
                </CardContent>
              </Card>
            </div>

            {/* Schedule Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-green-600" />
                  {MONTH_NAMES[scheduleMonth]} {scheduleYear} — Payment Entries ({(monthlySchedule.entries || []).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {scheduleLoading ? (
                  <div className="p-8 text-center text-gray-400">Loading...</div>
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="payment-schedule-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(monthlySchedule.entries || []).length === 0 ? (
                        <tr><td colSpan="7" className="p-8 text-center text-gray-400">No stages scheduled for {MONTH_NAMES[scheduleMonth]} {scheduleYear}. Click "Add Stages" to plan this month's collections.</td></tr>
                      ) : (monthlySchedule.entries || []).map((e) => {
                        const balance = (e.amount || 0) - (e.amount_received || 0);
                        const stageStatusConfig = {
                          pending: { label: 'Not Collected', cls: 'bg-gray-100 text-gray-700' },
                          partial: { label: 'Partially Collected', cls: 'bg-amber-100 text-amber-700' },
                          paid: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
                          collected: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
                        };
                        const wfConfig = {
                          requested: { label: 'Req. Raised', cls: 'bg-blue-100 text-blue-700' },
                          pending_collection: { label: 'Pending Collection', cls: 'bg-indigo-100 text-indigo-700' },
                        };
                        const sc = wfConfig[e.workflow_status] || stageStatusConfig[e.stage_status] || stageStatusConfig.pending;
                        const canRequest = e.stage_status !== 'paid' && e.stage_status !== 'collected' && e.workflow_status !== 'requested' && e.workflow_status !== 'pending_collection';
                        
                        return (
                          <tr key={e.entry_id} className="hover:bg-indigo-50/50 transition-colors" data-testid={`schedule-row-${e.entry_id}`}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-indigo-700 cursor-pointer hover:underline" onClick={() => navigate(`/projects/${e.project_id}`)}>{e.project_name}</p>
                              <p className="text-[10px] text-gray-400">{e.client_name}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-medium">Stage {e.stage_label}</span>
                              <p className="text-xs text-gray-500 max-w-[200px] truncate">{e.stage_name}</p>
                              {e.is_carryover && (
                                <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] mt-0.5">
                                  Due from {MONTH_NAMES[e.carry_from_month]} {e.carry_from_year}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(e.amount)}</td>
                            <td className="px-4 py-2.5 text-right text-green-600 font-medium">{formatCurrency(e.amount_received)}</td>
                            <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatCurrency(balance)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sc.cls}`}>{sc.label}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex justify-center gap-1">
                                {canRequest && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-blue-600 border-blue-200" onClick={() => handleRequestPayment(e.entry_id)} data-testid={`req-payment-${e.entry_id}`}>
                                    <Send className="h-3 w-3 mr-1" />Req Payment
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleRemoveScheduleEntry(e.entry_id)} data-testid={`remove-entry-${e.entry_id}`}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {(monthlySchedule.entries || []).length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2">
                        <tr className="font-bold text-sm">
                          <td colSpan="2" className="px-4 py-2.5 text-right text-gray-600">Total</td>
                          <td className="px-4 py-2.5 text-right">{formatCurrency(monthlySchedule.summary?.total_planned)}</td>
                          <td className="px-4 py-2.5 text-right text-green-600">{formatCurrency(monthlySchedule.summary?.total_received)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(monthlySchedule.summary?.total_balance)}</td>
                          <td colSpan="2"></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                )}
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
              <div><Label>Unit</Label><UnitSelect value={materialForm.unit} onChange={(v) => setMaterialForm({ ...materialForm, unit: v })} className="mt-1" /></div>
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
            {vendorForm.payment_terms === 'credit' && <div className="grid grid-cols-2 gap-4"><div><Label>Credit Limit</Label><NumericInput value={vendorForm.credit_limit} onChange={(e) => setVendorForm({ ...vendorForm, credit_limit: parseFloat(e.target.value)||0 })} className="mt-1" /></div><div><Label>Credit Days</Label><Input value={vendorForm.credit_days} onChange={(e) => setVendorForm({ ...vendorForm, credit_days: parseInt(e.target.value)||0 })} className="mt-1" /></div></div>}
            <div><Label>Materials Supplied</Label><div className="flex flex-wrap gap-1 mt-1 max-h-28 overflow-y-auto">{materials.filter(m=>m.is_active!==false).map(m => (<button key={m.material_id} type="button" className={`px-2 py-0.5 text-xs border rounded ${vendorForm.materials_supplied.includes(m.material_id) ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-white border-gray-200 text-gray-500'}`} onClick={() => setVendorForm({...vendorForm,materials_supplied:vendorForm.materials_supplied.includes(m.material_id)?vendorForm.materials_supplied.filter(id=>id!==m.material_id):[...vendorForm.materials_supplied,m.material_id]})}>{m.name}</button>))}</div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setVendorDialog(false)}>Cancel</Button><Button onClick={handleSaveVendor} className="bg-teal-600 hover:bg-teal-700" data-testid="save-vendor-btn">{editingVendor ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stages to Monthly Schedule Dialog */}
      <Dialog open={addStagesDialog} onOpenChange={setAddStagesDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Stages to {MONTH_NAMES[scheduleMonth]} {scheduleYear} Schedule</DialogTitle>
            <DialogDescription>Select project payment stages to include in this month's collection plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {availableStages.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No available stages. All stages are either fully collected or already scheduled.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{availableStages.length} stages available</span>
                  <Button size="sm" variant="ghost" className="text-xs"
                    onClick={() => setSelectedStageIds(selectedStageIds.length === availableStages.length ? [] : availableStages.map(s => s.stage_id))}>
                    {selectedStageIds.length === availableStages.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                {availableStages.map(s => (
                  <label key={s.stage_id} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer border-t" data-testid={`stage-option-${s.stage_id}`}>
                    <input type="checkbox" checked={selectedStageIds.includes(s.stage_id)} onChange={(e) => {
                      if (e.target.checked) setSelectedStageIds([...selectedStageIds, s.stage_id]);
                      else setSelectedStageIds(selectedStageIds.filter(id => id !== s.stage_id));
                    }} className="w-4 h-4 text-amber-600 rounded" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{s.project_name} <span className="text-gray-500">— {s.client_name}</span></p>
                      <p className="text-xs text-gray-500">{s.stage_name} ({s.stage_label})</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(s.amount)}</p>
                      {(s.amount_received || 0) > 0 && <p className="text-xs text-green-600">Received: {formatCurrency(s.amount_received)}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStagesDialog(false)}>Cancel</Button>
            <Button onClick={handleAddStagesToSchedule} disabled={selectedStageIds.length === 0} className="bg-amber-600 hover:bg-amber-700" data-testid="confirm-add-stages">
              Add {selectedStageIds.length} Stage{selectedStageIds.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== RE TEMPLATE DIALOG ==================== */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="template-dialog-title">
              <FileText className="h-5 w-5 text-purple-600" />
              {editingTemplate ? 'Edit Template' : 'Create RE Template'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update template details and scope items' : 'Define a reusable rough estimate template with scope items'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <Label>Template Name *</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Standard 2BHK, Premium Villa"
                  data-testid="template-name-input"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Sq.ft</Label>
                <NumericInput
                  value={templateForm.sqft}
                  onChange={(e) => setTemplateForm({ ...templateForm, sqft: e.target.value })}
                  placeholder="e.g., 1200"
                  data-testid="template-sqft-input"
                />
              </div>
            </div>

            {/* Scope Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Scope of Work Items</Label>
                <Button variant="outline" size="sm" onClick={addTemplateScopeItem} data-testid="add-scope-item-btn">
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
                    {templateForm.scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                          No scope items added. Click "Add Item" to start.
                        </td>
                      </tr>
                    ) : (
                      templateForm.scope_items.map((item, idx) => (
                        <tr key={idx} data-testid={`scope-item-row-${idx}`}>
                          <td className="px-3 py-2">
                            <Input
                              value={item.name}
                              onChange={(e) => updateTemplateScopeItem(idx, 'name', e.target.value)}
                              placeholder="Item description"
                              className="h-8"
                              data-testid={`scope-item-name-${idx}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumericInput
                              value={item.quantity}
                              onChange={(e) => updateTemplateScopeItem(idx, 'quantity', e.target.value)}
                              className="h-8 text-center"
                              data-testid={`scope-item-qty-${idx}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <UnitSelect
                              value={item.unit}
                              onChange={(v) => updateTemplateScopeItem(idx, 'unit', v)}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumericInput
                              value={item.rate}
                              onChange={(e) => updateTemplateScopeItem(idx, 'rate', e.target.value)}
                              className="h-8 text-right"
                              data-testid={`scope-item-rate-${idx}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatCurrency(item.total)}
                          </td>
                          <td className="px-3 py-2">
                            <Button variant="ghost" size="sm" onClick={() => removeTemplateScopeItem(idx)} data-testid={`remove-scope-item-${idx}`}>
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

            {/* Total */}
            {templateForm.scope_items.length > 0 && (
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-600">Estimated Total</p>
                  <p className="text-2xl font-bold text-purple-800" data-testid="template-estimated-total">
                    {formatCurrency(templateForm.scope_items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)), 0))}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} className="bg-purple-600 hover:bg-purple-700" data-testid="save-template-btn">
              {editingTemplate ? 'Update Template' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
