import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Building2, Plus, FileText, Clock, CheckCircle, Send,
  MapPin, Package, Eye, Users, ArrowRight, Filter, Calendar, DollarSign,
  Phone, Mail, Upload, Bell, CreditCard, Search, AlertCircle, CheckCircle2, Target,
  Receipt, Banknote, ClipboardList, Copy, RefreshCw, MessageSquare
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { MultiPaymentInput } from '../components/MultiPaymentInput';
import { NumericInput } from '../components/NumericInput';
import ChequeListView from '../components/ChequeListView';
import CREPreConstruction from './CREPreConstruction';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BUILDING_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'villa', label: 'Villa' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'office', label: 'Office' }
];

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'direct_transfer', label: 'Direct Transfer (DT)' }
];

export default function CREBoard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [packages, setPackages] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('new_deals');

  // New Deals
  const [newDeals, setNewDeals] = useState([]);
  const [convertDealDialog, setConvertDealDialog] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [selectedDealRE, setSelectedDealRE] = useState(null);

  // Advance Collection for Deal Conversion
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMode, setAdvanceMode] = useState('');
  const [advanceRef, setAdvanceRef] = useState('');
  const [accountantConfirmed, setAccountantConfirmed] = useState(false);
  const [chequeEntries, setChequeEntries] = useState([]);

  // Payment Requests from Planning
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [additionalPaymentRequests, setAdditionalPaymentRequests] = useState([]);
  const [paymentReqSubTab, setPaymentReqSubTab] = useState('stage');

  // Payment Approvals
  const [pendingApprovals, setPendingApprovals] = useState({ advance_verified: [], pending_income: [] });
  const [feProjects, setFeProjects] = useState([]);
  const [feActiveTab, setFeActiveTab] = useState('awaiting');
  const [reviewDialog, setReviewDialog] = useState({ open: false, project: null, text: '' });
  const [revisionDialog, setRevisionDialog] = useState({ open: false, project: null, description: '', submitting: false });

  // Payment Collected (ledger)
  const [incomeCollected, setIncomeCollected] = useState([]);

  // Dialogs
  const [createDialog, setCreateDialog] = useState(false);
  const [requestREMode, setRequestREMode] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [collectDialog, setCollectDialog] = useState(false);
  const [selectedPaymentStage, setSelectedPaymentStage] = useState(null);
  const [collectForm, setCollectForm] = useState({ amount: '', remarks: '' });
  const [collectPaymentEntries, setCollectPaymentEntries] = useState([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);

  // Search
  const [projectSearch, setProjectSearch] = useState('');

  const [form, setForm] = useState({
    name: '', client_name: '', client_phone: '', client_email: '',
    location: '', sqft: '', building_type: 'residential',
    expected_start_date: new Date().toISOString().split('T')[0],
    package_id: '', advance_date: new Date().toISOString().split('T')[0],
    advance_amount: '', rough_estimate_url: ''
  });
  const [advancePaymentEntries, setAdvancePaymentEntries] = useState([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
  const [selectedPackage, setSelectedPackage] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['cre', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied. Only CRE can access this page.');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);

      const [dashboardRes, dealsRes, paymentReqRes, additionalReqRes, incomeRes, approvalsRes, feRes] = await Promise.allSettled([
        axios.get(`${API}/cre/dashboard`),
        axios.get(`${API}/cre/new-deals`),
        axios.get(`${API}/cre/payment-requests`),
        axios.get(`${API}/cre/additional-payment-requests`),
        axios.get(`${API}/cre/income-collected`),
        axios.get(`${API}/cre/pending-approvals`),
        axios.get(`${API}/cre/final-estimates`)
      ]);

      if (dashboardRes.status === 'fulfilled') {
        const data = dashboardRes.value.data;
        setDashboard(data);
        setPackages(data.packages || []);
        setProjects(data.recent_projects || []);
      }
      if (dealsRes.status === 'fulfilled') {
        setNewDeals(dealsRes.value.data || []);
      } else {
        try {
          const salesRes = await axios.get(`${API}/crm/sales/leads?stage=deal_closed`);
          setNewDeals(salesRes.data?.filter(l => !l.project_created) || []);
        } catch { setNewDeals([]); }
      }
      if (paymentReqRes.status === 'fulfilled') setPaymentRequests(paymentReqRes.value.data || []);
      if (additionalReqRes.status === 'fulfilled') setAdditionalPaymentRequests(additionalReqRes.value.data || []);
      if (incomeRes.status === 'fulfilled') setIncomeCollected(incomeRes.value.data || []);
      if (approvalsRes.status === 'fulfilled') setPendingApprovals(approvalsRes.value.data || { advance_verified: [], pending_income: [] });
      if (feRes.status === 'fulfilled') setFeProjects(feRes.value.data || []);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  // ==================== HANDLERS ====================
  const openConvertDealDialog = async (deal) => {
    setSelectedDeal(deal);
    setAdvanceAmount(''); setAdvanceMode(''); setAdvanceRef('');
    setAccountantConfirmed(false); setChequeEntries([]);
    let reData = deal.re_project || null;
    if (!reData && deal.re_project_id) {
      try { const reRes = await axios.get(`${API}/crm/re-projects/${deal.re_project_id}`); reData = reRes.data; } catch { reData = null; }
    }
    setSelectedDealRE(reData);
    setForm({
      name: deal.project_name || reData?.project_name || deal.name || '',
      client_name: deal.client_name || deal.name || '',
      client_phone: deal.client_phone || deal.phone || '',
      client_email: deal.client_email || deal.email || '',
      location: deal.location || reData?.location || deal.city || '',
      sqft: deal.sqft || reData?.sqft || reData?.area_sqft || '',
      building_type: deal.building_type || reData?.building_type || 'residential',
      expected_start_date: new Date().toISOString().split('T')[0],
      package_id: reData?.package_id || '',
      advance_date: new Date().toISOString().split('T')[0],
      advance_amount: '', advance_payment_mode: '', rough_estimate_url: ''
    });
    setConvertDealDialog(true);
  };

  const handleConvertDeal = async () => {
    if (!selectedDeal) return;
    const projectName = form.name || selectedDeal.project_name || selectedDeal.name;
    const clientName = form.client_name || selectedDeal.client_name || selectedDeal.name;
    const location = form.location || selectedDealRE?.location || selectedDeal.city;
    if (!projectName?.trim()) { toast.error('Project name is required'); return; }
    if (!clientName?.trim()) { toast.error('Client name is required'); return; }
    if (!location?.trim()) { toast.error('Location is required'); return; }
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) { toast.error('Please enter advance amount'); return; }
    const totalPayEntries = advancePaymentEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    if (advancePaymentEntries.length === 0 || totalPayEntries <= 0) { toast.error('Add at least one payment entry'); return; }
    if (Math.abs(totalPayEntries - parseFloat(advanceAmount)) > 1) { toast.error(`Payment entries (₹${totalPayEntries.toLocaleString('en-IN')}) must equal advance amount (₹${parseFloat(advanceAmount).toLocaleString('en-IN')})`); return; }
    if (!accountantConfirmed) { toast.error('Please confirm accountant verification'); return; }
    try {
      const endpoint = selectedDeal.deal_type === 're_project'
        ? `${API}/cre/convert-re-project/${selectedDeal.re_project_id}`
        : `${API}/cre/convert-deal/${selectedDeal.lead_id}`;
      await axios.post(endpoint, {
        project_name: projectName, client_name: clientName,
        client_phone: form.client_phone || selectedDeal.client_phone || selectedDeal.phone,
        client_email: form.client_email || selectedDeal.client_email || selectedDeal.email,
        location, sqft: form.sqft ? parseFloat(form.sqft) : null,
        building_type: form.building_type, expected_start_date: form.expected_start_date,
        package_id: form.package_id, advance_amount: parseFloat(advanceAmount),
        payment_entries: advancePaymentEntries.map(e => ({
          amount: parseFloat(e.amount) || 0,
          payment_mode: e.payment_mode,
          reference: e.reference || '',
          cheque_details: e.payment_mode === 'cheque' ? e.cheque_details : null
        })),
        payment_mode: advancePaymentEntries[0]?.payment_mode || 'cash',
        payment_reference: advancePaymentEntries[0]?.reference || '',
        accountant_confirmed: accountantConfirmed,
      });
      toast.success('Project created! Goes to Planning for setup.');
      setConvertDealDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create project');
    }
  };

  const handleCreateProject = async () => {
    if (!form.name?.trim() || !form.client_name?.trim()) {
      toast.error('Please fill Project Name and Client Name');
      return;
    }
    if (requestREMode) {
      // Request RE from Planning - no advance needed
      try {
        await axios.post(`${API}/cre/projects/request-re`, {
          name: form.name, client_name: form.client_name,
          client_phone: form.client_phone, client_email: form.client_email,
          location: form.location, sqft: form.sqft, building_type: form.building_type
        });
        toast.success('Project created! RE requested from Planning team.');
        setCreateDialog(false); resetForm(); fetchData(false);
      } catch (error) {
        toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create project');
      }
      return;
    }
    if (!form.package_id) { toast.error('Please select a package'); return; }
    if (!form.advance_amount || parseFloat(form.advance_amount) <= 0) { toast.error('Advance amount required'); return; }
    try {
      const payload = { ...form, sqft: parseFloat(form.sqft) || 0, advance_amount: parseFloat(form.advance_amount) || 0 };
      if (form.advance_payment_mode === 'cheque' && form.cheque_details?.length > 0) {
        payload.cheque_details = form.cheque_details.filter(c => c.cheque_number);
      }
      const res = await axios.post(`${API}/cre/projects`, payload);
      toast.success(`Project created! ID: ${res.data.project_id}`);
      setCreateDialog(false); resetForm(); fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create project');
    }
  };

  const handleSubmitForPayment = async (projectId) => {
    try {
      await axios.patch(`${API}/cre/projects/${projectId}/submit`);
      toast.success('Project submitted! Goes to Accountant for payment verification.');
      fetchData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit'); }
  };

  const handleSubmitToPlanning = async (projectId) => {
    try {
      await axios.patch(`${API}/cre/projects/${projectId}/send-to-planning`);
      toast.success('Project sent to Planning Department');
      fetchData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed'); }
  };

  const handleMoveToDrawing = async (projectId) => {
    try {
      await axios.patch(`${API}/cre/projects/${projectId}/move-to-drawing`);
      toast.success('Project moved to Drawing Stage');
      fetchData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed'); }
  };

  // ---------- Final Estimate handlers ----------
  const handleFeApprove = async (project) => {
    if (!window.confirm(`Approve Final Estimate (Rev ${project.fe?.revision || 0}) for "${project.name}"?\n\nThis confirms the scope and total. Planning will be notified.`)) return;
    try {
      await axios.post(`${API}/cre/final-estimates/${project.project_id}/approve`);
      toast.success('Final Estimate approved');
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to approve');
    }
  };

  const handleFeSubmitReview = async () => {
    const text = (reviewDialog.text || '').trim();
    if (!text) {
      toast.error('Please write your review/feedback for Planning');
      return;
    }
    try {
      const r = await axios.post(`${API}/cre/final-estimates/${reviewDialog.project.project_id}/review`, { review: text });
      toast.success(r.data?.message || 'Review sent to Planning');
      setReviewDialog({ open: false, project: null, text: '' });
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send review');
    }
  };

  const handleSubmitRevision = async () => {
    const desc = (revisionDialog.description || '').trim();
    if (!desc) {
      toast.error('Please describe what should change in this revision');
      return;
    }
    setRevisionDialog((d) => ({ ...d, submitting: true }));
    try {
      const r = await axios.post(`${API}/cre/final-estimates/${revisionDialog.project.project_id}/request-revision`, { description: desc });
      toast.success(r.data?.message || 'Revision sent to Planning');
      setRevisionDialog({ open: false, project: null, description: '', submitting: false });
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send revision');
      setRevisionDialog((d) => ({ ...d, submitting: false }));
    }
  };

  const resetForm = () => {
    setForm({
      name: '', client_name: '', client_phone: '', client_email: '',
      location: '', sqft: '', building_type: 'residential',
      expected_start_date: new Date().toISOString().split('T')[0],
      package_id: '', advance_date: new Date().toISOString().split('T')[0],
      advance_amount: '', advance_payment_mode: '', rough_estimate_url: ''
    });
    setSelectedPackage(null);
    setRequestREMode(false);
  };

  const openCollectDialog = (stage) => {
    setSelectedPaymentStage(stage);
    const balance = (stage.amount || 0) - (stage.amount_received || 0);
    setCollectForm({ amount: balance, mode: 'bank_transfer', reference: '', remarks: '', num_cheques: 1, cheque_details: [] });
    setCollectDialog(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedPaymentStage) return;
    const totalPayEntries = collectPaymentEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    if (collectPaymentEntries.length === 0 || totalPayEntries <= 0) { toast.error('Add at least one payment entry'); return; }
    const balance = (selectedPaymentStage.amount || 0) - (selectedPaymentStage.amount_received || 0);
    if (totalPayEntries > balance + 1) { toast.error(`Amount exceeds remaining balance of ${formatCurrency(balance)}`); return; }
    try {
      const payload = {
        amount_received: totalPayEntries,
        payment_entries: collectPaymentEntries.map(e => ({
          amount: parseFloat(e.amount) || 0,
          payment_mode: e.payment_mode,
          reference: e.reference || '',
          cheque_details: e.payment_mode === 'cheque' ? e.cheque_details : null
        })),
        payment_mode: collectPaymentEntries[0]?.payment_mode || 'cash',
        remarks: collectForm.remarks || null
      };
      await axios.post(`${API}/payment-stages/${selectedPaymentStage.stage_id}/collect`, payload);
      toast.success('Payment collected! Accountant will be notified.');
      setCollectDialog(false);
      setCollectForm({ amount: '', remarks: '' });
      setCollectPaymentEntries([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to collect payment');
    }
  };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
      pending_payment: { label: 'Pending Verification', cls: 'bg-orange-100 text-orange-700' },
      payment_received: { label: 'Verified', cls: 'bg-emerald-100 text-emerald-700' },
      payment_verified: { label: 'Verified', cls: 'bg-emerald-100 text-emerald-700' },
      in_planning: { label: 'In Planning', cls: 'bg-amber-100 text-amber-700' },
      planning_review: { label: 'In Planning', cls: 'bg-amber-100 text-amber-700' },
      planning: { label: 'In Planning', cls: 'bg-amber-100 text-amber-700' },
      awaiting_approval: { label: 'Awaiting GM', cls: 'bg-yellow-100 text-yellow-700' },
      gm_approved: { label: 'GM Approved', cls: 'bg-purple-100 text-purple-700' },
      planning_approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
      active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
      in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' }
    };
    const c = config[status] || { label: status?.replace(/_/g, ' ') || '-', cls: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.cls}`}>{c.label}</span>;
  };

  const getProjectAction = (project) => {
    switch (project.status) {
      case 'draft':
        return <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 h-7 text-xs" onClick={() => handleSubmitForPayment(project.project_id)}>Submit for Verification</Button>;
      case 'pending_payment':
        return <Badge variant="outline" className="text-orange-500 text-xs">Awaiting Accountant</Badge>;
      case 'payment_received':
      case 'payment_verified':
        return <Button size="sm" className="bg-amber-600 hover:bg-amber-700 h-7 text-xs" onClick={() => handleSubmitToPlanning(project.project_id)}>Send to Planning</Button>;
      case 'planning_approved':
        return <Button size="sm" className="bg-purple-600 hover:bg-purple-700 h-7 text-xs" onClick={() => handleMoveToDrawing(project.project_id)}>Move to Drawing</Button>;
      default:
        return <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.location.href = `/projects/${project.project_id}`}><Eye className="h-3 w-3 mr-1" />View</Button>;
    }
  };

  const filteredProjects = projects.filter(p => {
    if (!projectSearch) return true;
    const s = projectSearch.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.client_name || '').toLowerCase().includes(s) || (p.location || '').toLowerCase().includes(s);
  });

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="cre-board-loading">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-lg border p-4 animate-pulse"><div className="h-4 bg-gray-200 rounded w-20 mb-2" /><div className="h-8 bg-gray-200 rounded w-12" /></div>)}
          </div>
          <div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-64" /></div>
        </div>
      </div>
    );
  }

  const totalCollected = incomeCollected.reduce((s, i) => s + (i.amount || 0), 0);
  const pendingCount = (pendingApprovals.advance_verified?.length || 0) + (pendingApprovals.pending_income?.length || 0);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="cre-board">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Card className="border-l-4 border-l-amber-500" data-testid="card-total-projects">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Total Projects</p>
              <p className="text-2xl font-bold text-gray-800">{dashboard.total_ongoing || projects.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500" data-testid="card-total-value">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Total Value</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(dashboard.total_project_value)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500" data-testid="card-collected">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Total Collected</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(totalCollected)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500" data-testid="card-pending">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500 mb-1">Pending Actions</p>
              <p className="text-2xl font-bold text-orange-700">{(pendingApprovals.advance_verified?.length || 0) + paymentRequests.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <TabsList className="bg-white border shadow-sm">
              <TabsTrigger value="new_deals" className="text-xs sm:text-sm" data-testid="tab-new-deals">
                New Deals {(pendingApprovals.advance_verified?.length || 0) > 0 && <Badge className="ml-1 bg-yellow-500 text-white text-xs h-5 min-w-5 flex items-center justify-center rounded-full">{pendingApprovals.advance_verified.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="final_estimate" className="text-xs sm:text-sm" data-testid="tab-final-estimate">
                Final Estimate {feProjects.filter(p => p.fe?.status !== 'approved').length > 0 && <Badge className="ml-1 bg-purple-500 text-white text-xs h-5 min-w-5 flex items-center justify-center rounded-full">{feProjects.filter(p => p.fe?.status !== 'approved').length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="pre_construction" className="text-xs sm:text-sm" data-testid="tab-pre-construction">
                Pre-Construction
              </TabsTrigger>
              <TabsTrigger value="all_projects" className="text-xs sm:text-sm" data-testid="tab-all-projects">All Projects</TabsTrigger>
              <TabsTrigger value="payment_req" className="text-xs sm:text-sm" data-testid="tab-payment-req">
                Payment Req {(paymentRequests.length + additionalPaymentRequests.length) > 0 && <Badge className="ml-1 bg-purple-500 text-white text-xs h-5 min-w-5 flex items-center justify-center rounded-full">{paymentRequests.length + additionalPaymentRequests.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="payment_approvals" className="text-xs sm:text-sm" data-testid="tab-payment-approvals">
                Payment Approvals
              </TabsTrigger>
              <TabsTrigger value="payment_collected" className="text-xs sm:text-sm" data-testid="tab-payment-collected">Payment Collected</TabsTrigger>
              <TabsTrigger value="cheques" className="text-xs sm:text-sm" data-testid="tab-cheque-management">
                Cheque Management
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ==================== TAB 1: NEW DEALS ==================== */}
          <TabsContent value="new_deals">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-yellow-600" />New Deals — Advance Verified</CardTitle>
                <p className="text-xs text-gray-500 mt-1">Projects automatically arrive here once Accountant verifies the advance payment. Click "Send to Planning" to hand over.</p>
              </CardHeader>
              <CardContent className="p-0">
                {(!pendingApprovals.advance_verified || pendingApprovals.advance_verified.length === 0) ? (
                  <div className="p-8 text-center text-gray-400">
                    <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No new deals waiting for handover</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {pendingApprovals.advance_verified.map((p) => (
                      <div key={p.project_id} className="p-4 hover:bg-gray-50 transition-colors" data-testid={`deal-card-${p.project_id}`}>
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold truncate">{p.name}</h4>
                              <Badge className="bg-green-100 text-green-700 text-xs shrink-0">Advance Verified</Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.client_phone || '-'}</span>
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.location || '-'}</span>
                              <span className="text-gray-700">Client: <span className="font-medium">{p.client_name}</span></span>
                              {p.advance_amount > 0 && <span className="font-medium text-green-600">Advance: {formatCurrency(p.advance_amount)}</span>}
                            </div>
                          </div>
                          <Button className="bg-amber-600 hover:bg-amber-700 shrink-0" size="sm" onClick={() => handleSubmitToPlanning(p.project_id)} data-testid={`send-to-planning-${p.project_id}`}>
                            <ArrowRight className="h-4 w-4 mr-1" />Convert
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 1.5: FINAL ESTIMATE ==================== */}
          <TabsContent value="final_estimate">
            {(() => {
              const counts = {
                awaiting: feProjects.filter(p => p.fe?.status === 'pending_cre_review').length,
                in_revision: feProjects.filter(p => p.fe?.status === 'review_pending').length,
                sent_to_client: feProjects.filter(p => ['pending_client_review', 'feedback_received'].includes(p.fe?.status)).length,
                approved: feProjects.filter(p => p.fe?.status === 'approved').length,
                all: feProjects.length,
              };
              const filtered = (() => {
                switch (feActiveTab) {
                  case 'awaiting': return feProjects.filter(p => p.fe?.status === 'pending_cre_review');
                  case 'in_revision': return feProjects.filter(p => p.fe?.status === 'review_pending');
                  case 'sent_to_client': return feProjects.filter(p => ['pending_client_review', 'feedback_received'].includes(p.fe?.status));
                  case 'approved': return feProjects.filter(p => p.fe?.status === 'approved');
                  default: return feProjects;
                }
              })();
              const statusBadgeFor = (status) => {
                if (status === 'approved') return { cls: 'bg-green-100 text-green-700 border-green-200', label: 'Approved' };
                if (status === 'review_pending') return { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'In Revision @ Planning' };
                if (status === 'pending_cre_review') return { cls: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Awaiting You' };
                if (status === 'pending_client_review') return { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Sent to Client' };
                if (status === 'feedback_received') return { cls: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Client Feedback' };
                return { cls: 'bg-gray-100 text-gray-700 border-gray-200', label: status || 'Draft' };
              };

              return (
                <div className="space-y-4">
                  {/* Status Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <Card
                      className={`cursor-pointer transition-all ${feActiveTab === 'awaiting' ? 'ring-2 ring-purple-500' : 'hover:shadow-sm'}`}
                      onClick={() => setFeActiveTab('awaiting')}
                      data-testid="fe-status-awaiting"
                    >
                      <CardContent className="p-4 text-center">
                        <Clock className="h-6 w-6 mx-auto mb-1 text-purple-600" />
                        <p className="text-2xl font-bold text-purple-700">{counts.awaiting}</p>
                        <p className="text-xs text-purple-600">Awaiting You</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all ${feActiveTab === 'in_revision' ? 'ring-2 ring-amber-500' : 'hover:shadow-sm'}`}
                      onClick={() => setFeActiveTab('in_revision')}
                      data-testid="fe-status-in-revision"
                    >
                      <CardContent className="p-4 text-center">
                        <RefreshCw className="h-6 w-6 mx-auto mb-1 text-amber-600" />
                        <p className="text-2xl font-bold text-amber-700">{counts.in_revision}</p>
                        <p className="text-xs text-amber-600">In Revision @ Planning</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all ${feActiveTab === 'sent_to_client' ? 'ring-2 ring-blue-500' : 'hover:shadow-sm'}`}
                      onClick={() => setFeActiveTab('sent_to_client')}
                      data-testid="fe-status-sent-to-client"
                    >
                      <CardContent className="p-4 text-center">
                        <Send className="h-6 w-6 mx-auto mb-1 text-blue-600" />
                        <p className="text-2xl font-bold text-blue-700">{counts.sent_to_client}</p>
                        <p className="text-xs text-blue-600">Sent to Client</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all ${feActiveTab === 'approved' ? 'ring-2 ring-green-500' : 'hover:shadow-sm'}`}
                      onClick={() => setFeActiveTab('approved')}
                      data-testid="fe-status-approved"
                    >
                      <CardContent className="p-4 text-center">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-green-600" />
                        <p className="text-2xl font-bold text-green-700">{counts.approved}</p>
                        <p className="text-xs text-green-600">Approved</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all ${feActiveTab === 'all' ? 'ring-2 ring-gray-500' : 'hover:shadow-sm'}`}
                      onClick={() => setFeActiveTab('all')}
                      data-testid="fe-status-all"
                    >
                      <CardContent className="p-4 text-center">
                        <FileText className="h-6 w-6 mx-auto mb-1 text-gray-600" />
                        <p className="text-2xl font-bold text-gray-800">{counts.all}</p>
                        <p className="text-xs text-gray-600">All</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Project Cards List */}
                  <Card>
                    <CardHeader className="border-b pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        Final Estimate — {feActiveTab === 'awaiting' ? 'Awaiting You'
                          : feActiveTab === 'in_revision' ? 'In Revision @ Planning'
                          : feActiveTab === 'sent_to_client' ? 'Sent to Client'
                          : feActiveTab === 'approved' ? 'Approved'
                          : 'All'}
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-1">Planning has prepared the Final Estimate. Approve directly or send a Review back to Planning.</p>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {filtered.length === 0 ? (
                          <div className="p-8 text-center text-gray-400">
                            <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No projects in this category</p>
                          </div>
                        ) : filtered.map((p) => {
                          const fe = p.fe || {};
                          const reviewCount = (fe.reviews || []).length;
                          const sb = statusBadgeFor(fe.status);
                          return (
                            <div
                              key={p.project_id}
                              className={`p-4 hover:bg-gray-50 transition-all ${fe.status === 'approved' ? 'border-l-4 border-l-green-500 bg-green-50/30' : fe.status === 'pending_cre_review' ? 'border-l-4 border-l-purple-400' : fe.status === 'pending_client_review' ? 'border-l-4 border-l-blue-400' : fe.status === 'feedback_received' ? 'border-l-4 border-l-orange-400' : ''}`}
                              data-testid={`fe-project-${p.project_id}`}
                            >
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    <span className="font-mono text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                                      {p.project_code || p.project_id?.slice(0, 8)}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600 border-gray-200">
                                      Rev {fe.revision || 0}
                                    </Badge>
                                    <h4 className="font-semibold text-gray-900">{p.name}</h4>
                                    <Badge className={`text-xs border ${sb.cls}`}>{sb.label}</Badge>
                                    {reviewCount > 0 && (
                                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                        <MessageSquare className="h-3 w-3 mr-0.5" /> {reviewCount} review{reviewCount > 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div>
                                      <span className="text-gray-500">Client:</span>
                                      <p className="font-medium">{p.client_name || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Location:</span>
                                      <p>{p.location || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Sent to CRE:</span>
                                      <p>{fe.sent_to_cre_at ? new Date(fe.sent_to_cre_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">FE Total:</span>
                                      <p className="font-bold text-purple-700">{formatCurrency(p.total_value)}</p>
                                    </div>
                                  </div>

                                  {p.client_phone && (
                                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                      <Phone className="h-3 w-3" /> {p.client_phone}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 ml-auto">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/cre/final-estimate/${p.project_id}`)}
                                    data-testid={`fe-view-${p.project_id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" /> View
                                  </Button>
                                  {fe.status === 'approved' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-purple-400 text-purple-700 hover:bg-purple-50"
                                      onClick={() => setRevisionDialog({ open: true, project: p, description: '', submitting: false })}
                                      data-testid={`fe-request-revision-${p.project_id}`}
                                    >
                                      <RefreshCw className="h-4 w-4 mr-1" /> Revision
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={() => handleFeApprove(p)}
                                    data-testid={`fe-approve-${p.project_id}`}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-amber-400 text-amber-700 hover:bg-amber-50"
                                    onClick={() => setReviewDialog({ open: true, project: p, text: '' })}
                                    data-testid={`fe-review-${p.project_id}`}
                                  >
                                    <MessageSquare className="h-4 w-4 mr-1" /> Review
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </TabsContent>

          {/* ==================== TAB 1.6: PRE-CONSTRUCTION ==================== */}
          <TabsContent value="pre_construction">
            <CREPreConstruction embedded />
          </TabsContent>

          {/* ==================== TAB 2: ALL PROJECTS ==================== */}
          <TabsContent value="all_projects">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-amber-600" />All Projects</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search projects..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="project-search" />
                    </div>
                    <Button size="sm" onClick={() => { resetForm(); setCreateDialog(true); }} className="bg-amber-600 hover:bg-amber-700" data-testid="create-project-btn">
                      <Plus className="h-4 w-4 mr-1" />Create Project
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredProjects.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No projects found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="projects-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Location</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredProjects.map((p) => (
                          <tr key={p.project_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/projects/${p.project_id}`} data-testid={`project-row-${p.project_id}`}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-gray-900">{p.name}</p>
                              <p className="text-xs text-gray-400">{p.project_code || p.project_id}</p>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{p.client_name}</td>
                            <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{p.location || '-'}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(p.total_value)}</td>
                            <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                            <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>{getProjectAction(p)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 3: PAYMENT REQ (FROM PLANNING) ==================== */}
          <TabsContent value="payment_req">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-purple-600" />Payment Requests from Planning</CardTitle>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                    <button className={`px-3 py-1 text-xs rounded-md transition-colors ${paymentReqSubTab === 'stage' ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-500'}`} onClick={() => setPaymentReqSubTab('stage')} data-testid="subtab-stage-payments">
                      Stage Payments ({paymentRequests.length})
                    </button>
                    <button className={`px-3 py-1 text-xs rounded-md transition-colors ${paymentReqSubTab === 'additional' ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-500'}`} onClick={() => setPaymentReqSubTab('additional')} data-testid="subtab-additional-payments">
                      Additional ({additionalPaymentRequests.length})
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {paymentReqSubTab === 'stage' ? (
                  paymentRequests.length === 0 ? (
                    <div className="p-8 text-center text-gray-400"><Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">No stage payment requests</p></div>
                  ) : (
                    <div className="divide-y">
                      {paymentRequests.map((req) => {
                        const balance = (req.amount || 0) - (req.amount_received || 0);
                        return (
                          <div key={req.stage_id} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`stage-req-${req.stage_id}`}>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{req.project_name || req.project_id}</p>
                              <p className="text-xs text-gray-500">{req.stage_label || ''} - {req.stage_name}</p>
                              <div className="flex gap-3 mt-1 text-xs">
                                <span className="text-gray-500">Total: {formatCurrency(req.amount)}</span>
                                <span className="text-green-600">Received: {formatCurrency(req.amount_received || 0)}</span>
                                <span className="font-medium text-purple-700">Balance: {formatCurrency(balance)}</span>
                              </div>
                            </div>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => openCollectDialog(req)}>
                              <DollarSign className="h-3 w-3 mr-1" />Collect
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  additionalPaymentRequests.length === 0 ? (
                    <div className="p-8 text-center text-gray-400"><Banknote className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">No additional payment requests</p></div>
                  ) : (
                    <div className="divide-y">
                      {additionalPaymentRequests.map((req) => (
                        <div key={req.cost_id} className="flex items-center justify-between p-4 hover:bg-gray-50" data-testid={`additional-req-${req.cost_id}`}>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{req.project_name || req.project_id}</p>
                            <p className="text-xs text-gray-500">{req.description}</p>
                            <div className="flex gap-3 mt-1 text-xs">
                              <span className="font-medium text-purple-700">Amount: {formatCurrency(req.estimated_amount || req.actual_amount)}</span>
                              {req.income_received > 0 && <span className="text-green-600">Received: {formatCurrency(req.income_received)}</span>}
                            </div>
                          </div>
                          <Badge className="bg-orange-100 text-orange-700 text-xs">Payment Requested</Badge>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 4: PAYMENT APPROVALS ==================== */}
          <TabsContent value="payment_approvals">
            <Card>
              <CardContent className="p-12 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-3">
                  <CheckCircle2 className="h-6 w-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">No payment approvals pending</p>
                <p className="text-xs text-gray-400 mt-1">Approvals are now handled automatically. Check the New Deals tab for items ready to convert.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 5: PAYMENT COLLECTED ==================== */}
          <TabsContent value="payment_collected">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4 text-green-600" />Payment Collected Ledger</CardTitle>
                  <p className="text-sm font-semibold text-green-700">Total: {formatCurrency(totalCollected)}</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {incomeCollected.length === 0 ? (
                  <div className="p-8 text-center text-gray-400"><Banknote className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">No payments collected yet</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="collected-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Category</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Mode</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {incomeCollected.map((inc) => (
                          <tr key={inc.income_id} className="hover:bg-gray-50" data-testid={`collected-row-${inc.income_id}`}>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{inc.payment_date ? new Date(inc.payment_date).toLocaleDateString('en-IN') : '-'}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-gray-900 text-sm">{inc.project_name || '-'}</p>
                              <p className="text-xs text-gray-400">{inc.stage || inc.description || ''}</p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell capitalize">{inc.category?.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2.5 text-xs hidden sm:table-cell capitalize">{inc.payment_mode?.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(inc.amount)}</td>
                            <td className="px-4 py-2.5 text-center">
                              {inc.status === 'approved' ? <span className="text-xs text-green-600 font-medium">Approved</span> :
                               inc.status === 'pending_approval' ? <span className="text-xs text-orange-600 font-medium">Pending</span> :
                               <span className="text-xs text-gray-500">{inc.status}</span>}
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

          {/* ==================== TAB 6: CHEQUE MANAGEMENT ==================== */}
          <TabsContent value="cheques">
            <ChequeListView scope="cre" userRole={user?.role} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ==================== CREATE PROJECT DIALOG ==================== */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-amber-600" />Create New Project</DialogTitle>
          </DialogHeader>

          {/* Toggle: Full Project vs Request RE */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-4" data-testid="create-mode-toggle">
            <button className={`flex-1 py-2 px-3 text-sm rounded-md transition-colors ${!requestREMode ? 'bg-white shadow font-medium' : 'text-gray-500'}`} onClick={() => setRequestREMode(false)}>
              Full Project + Advance
            </button>
            <button className={`flex-1 py-2 px-3 text-sm rounded-md transition-colors ${requestREMode ? 'bg-white shadow font-medium text-amber-700' : 'text-gray-500'}`} onClick={() => setRequestREMode(true)}>
              Request RE from Planning
            </button>
          </div>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Project Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Project name" data-testid="input-project-name" />
              </div>
              <div>
                <Label>Client Name *</Label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name" data-testid="input-client-name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} placeholder="+91..." />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} placeholder="email@..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" />
              </div>
              <div>
                <Label>Area (sqft)</Label>
                <NumericInput value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Building Type</Label>
                <Select value={form.building_type} onValueChange={(v) => setForm({ ...form, building_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BUILDING_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Start</Label>
                <Input type="date" value={form.expected_start_date} onChange={(e) => setForm({ ...form, expected_start_date: e.target.value })} />
              </div>
            </div>

            {requestREMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800 font-medium flex items-center gap-2"><FileText className="h-4 w-4" />RE will be requested from Planning</p>
                <p className="text-xs text-amber-600 mt-1">Planning team will be notified to prepare a Rough Estimate. Project will be created in "In Planning" status. You can collect advance after GM approves the RE.</p>
              </div>
            )}

            {/* Package + Advance - only when NOT requesting RE */}
            {!requestREMode && (
              <>
                <div>
                  <Label>Package *</Label>
                  <Select value={form.package_id} onValueChange={(v) => { setForm({ ...form, package_id: v }); setSelectedPackage(packages.find(p => p.package_id === v)); }}>
                    <SelectTrigger data-testid="select-package"><SelectValue placeholder="Select package" /></SelectTrigger>
                    <SelectContent>{packages.map((p) => <SelectItem key={p.package_id} value={p.package_id}>{p.name} - {formatCurrency(p.base_rate_per_sqft)}/sqft</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {selectedPackage && form.sqft && (
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-gray-600">{form.sqft} sqft x {formatCurrency(selectedPackage.base_rate_per_sqft)}/sqft</span>
                    <span className="text-lg font-bold text-green-600">{formatCurrency(parseFloat(form.sqft) * (selectedPackage.base_rate_per_sqft || 0))}</span>
                  </div>
                )}

                <Card className="border-green-200 bg-green-50">
                  <CardContent className="p-4 space-y-3">
                    <h4 className="font-medium text-green-800 flex items-center gap-2"><CreditCard className="h-4 w-4" />Advance Payment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Amount *</Label>
                        <NumericInput value={form.advance_amount} onChange={(e) => setForm({ ...form, advance_amount: e.target.value })} placeholder="0" data-testid="input-advance-amount" />
                      </div>
                      <div>
                        <Label className="text-xs">Payment Mode *</Label>
                        <Select value={form.advance_payment_mode} onValueChange={(v) => setForm({ ...form, advance_payment_mode: v, num_cheques: v === 'cheque' ? 1 : 0 })}>
                          <SelectTrigger data-testid="select-payment-mode"><SelectValue placeholder="Select mode" /></SelectTrigger>
                          <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    {form.advance_payment_mode === 'cheque' && (
                      <div className="space-y-2 border-t pt-2">
                        <div className="flex items-center gap-3">
                          <Label className="text-xs whitespace-nowrap">No. of Cheques</Label>
                          <NumericInput value={form.num_cheques || 1} onChange={(e) => {
                            const count = Math.min(20, Math.max(1, parseInt(e.target.value) || 1));
                            const existing = form.cheque_details || [];
                            const cheques = Array.from({ length: count }, (_, i) => existing[i] || { cheque_number: '', bank_name: '', amount: '', cheque_date: new Date().toISOString().split('T')[0] });
                            setForm({ ...form, num_cheques: count, cheque_details: cheques });
                          }} className="w-20" data-testid="input-num-cheques" />
                        </div>
                        {(form.cheque_details || []).map((cheque, idx) => (
                          <div key={idx} className="grid grid-cols-4 gap-2 bg-white p-2 rounded" data-testid={`cheque-entry-${idx}`}>
                            <div><Label className="text-xs">Cheque #{idx + 1}</Label><Input value={cheque.cheque_number} onChange={(e) => { const c = [...(form.cheque_details || [])]; c[idx] = { ...c[idx], cheque_number: e.target.value }; setForm({ ...form, cheque_details: c }); }} placeholder="Number" className="text-xs" /></div>
                            <div><Label className="text-xs">Bank</Label><Input value={cheque.bank_name} onChange={(e) => { const c = [...(form.cheque_details || [])]; c[idx] = { ...c[idx], bank_name: e.target.value }; setForm({ ...form, cheque_details: c }); }} placeholder="Bank" className="text-xs" /></div>
                            <div><Label className="text-xs">Amount</Label><NumericInput value={cheque.amount} onChange={(e) => { const c = [...(form.cheque_details || [])]; c[idx] = { ...c[idx], amount: e.target.value }; setForm({ ...form, cheque_details: c }); }} placeholder="0" className="text-xs" /></div>
                            <div><Label className="text-xs">Date</Label><Input type="date" value={cheque.cheque_date || ''} onChange={(e) => { const c = [...(form.cheque_details || [])]; c[idx] = { ...c[idx], cheque_date: e.target.value }; setForm({ ...form, cheque_details: c }); }} className="text-xs" /></div>
                          </div>
                        ))}
                        {(form.cheque_details || []).length > 0 && <p className="text-xs text-gray-500">Total: {formatCurrency((form.cheque_details || []).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0))}</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div>
                  <Label>Rough Estimate PDF URL</Label>
                  <Input value={form.rough_estimate_url} onChange={(e) => setForm({ ...form, rough_estimate_url: e.target.value })} placeholder="https://..." />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreateProject} className={requestREMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'} data-testid="btn-create-project">
              {requestREMode ? <><FileText className="h-4 w-4 mr-2" />Create & Request RE</> : <><Plus className="h-4 w-4 mr-2" />Create Project</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== COLLECT PAYMENT DIALOG ==================== */}
      <Dialog open={collectDialog} onOpenChange={setCollectDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-green-600" />Collect Payment</DialogTitle>
            <DialogDescription>{selectedPaymentStage?.project_name} - {selectedPaymentStage?.stage_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg">
              <div><p className="text-xs text-gray-500">Stage Amount</p><p className="font-semibold">{formatCurrency(selectedPaymentStage?.amount)}</p></div>
              <div><p className="text-xs text-gray-500">Already Received</p><p className="font-semibold text-green-600">{formatCurrency(selectedPaymentStage?.amount_received || 0)}</p></div>
              <div><p className="text-xs text-gray-500">Balance</p><p className="font-semibold text-red-600">{formatCurrency((selectedPaymentStage?.amount || 0) - (selectedPaymentStage?.amount_received || 0))}</p></div>
            </div>
            <MultiPaymentInput
              totalAmount={(selectedPaymentStage?.amount || 0) - (selectedPaymentStage?.amount_received || 0)}
              entries={collectPaymentEntries}
              onChange={setCollectPaymentEntries}
              allowPartial={true}
            />
            <div><Label>Remarks</Label><Input value={collectForm.remarks} onChange={(e) => setCollectForm({ ...collectForm, remarks: e.target.value })} placeholder="Optional" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectDialog(false)}>Cancel</Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-4 w-4 mr-2" />Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CONVERT DEAL DIALOG ==================== */}
      <Dialog open={convertDealDialog} onOpenChange={setConvertDealDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600"><Target className="h-5 w-5" />Create Project from Deal</DialogTitle>
            <DialogDescription>Review and edit project details, then collect advance payment</DialogDescription>
          </DialogHeader>
          {selectedDeal && (
            <div className="space-y-6">
              {selectedDealRE && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-800 flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Rough Estimate Reference</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div><p className="text-xs text-purple-600">Project</p><p className="font-medium">{selectedDealRE.project_name}</p></div>
                    <div><p className="text-xs text-purple-600">Area</p><p className="font-medium">{selectedDealRE.sqft?.toLocaleString()} sqft</p></div>
                    <div><p className="text-xs text-purple-600">Timeline</p><p className="font-medium">{selectedDealRE.handover_months || 12} months</p></div>
                    <div><p className="text-xs text-purple-600">Value</p><p className="font-bold text-purple-700">{formatCurrency(selectedDealRE.estimated_total)}</p></div>
                  </div>
                </div>
              )}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-amber-600" />Project Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><Label>Project Name *</Label><Input value={form.name || selectedDealRE?.project_name || selectedDeal.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" data-testid="project-name-input" /></div>
                  <div><Label>Location *</Label><Input value={form.location || selectedDealRE?.location || selectedDeal.city || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} className="mt-1" /></div>
                  <div><Label>Area (sqft)</Label><NumericInput value={form.sqft || selectedDealRE?.sqft || ''} onChange={(e) => setForm({ ...form, sqft: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label>Building Type</Label>
                    <Select value={form.building_type || 'residential'} onValueChange={(v) => setForm({ ...form, building_type: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="residential">Residential</SelectItem><SelectItem value="commercial">Commercial</SelectItem><SelectItem value="industrial">Industrial</SelectItem><SelectItem value="mixed">Mixed Use</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Start Date</Label><Input type="date" value={form.expected_start_date} onChange={(e) => setForm({ ...form, expected_start_date: e.target.value })} className="mt-1" /></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-green-600" />Client Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Client Name *</Label><Input value={form.client_name || selectedDeal.name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="mt-1" /></div>
                  <div><Label>Phone</Label><Input value={form.client_phone || selectedDeal.phone || ''} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} className="mt-1" /></div>
                  <div className="col-span-2"><Label>Email</Label><Input value={form.client_email || selectedDeal.email || ''} onChange={(e) => setForm({ ...form, client_email: e.target.value })} className="mt-1" /></div>
                </div>
              </div>
              <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4" />Advance Payment</h4>
                <div className="mb-3">
                  <Label className="text-green-700">Total Advance Amount *</Label>
                  <div className="relative mt-1"><span className="absolute left-3 top-2.5 text-gray-500">₹</span><NumericInput placeholder="Amount" value={advanceAmount} onChange={(e) => {
                    setAdvanceAmount(e.target.value);
                    if (advancePaymentEntries.length === 1) {
                      setAdvancePaymentEntries([{ ...advancePaymentEntries[0], amount: e.target.value }]);
                    }
                  }} className="pl-8" data-testid="advance-amount-input" /></div>
                </div>
                {advanceAmount && parseFloat(advanceAmount) > 0 && (
                  <MultiPaymentInput
                    totalAmount={parseFloat(advanceAmount) || 0}
                    entries={advancePaymentEntries}
                    onChange={setAdvancePaymentEntries}
                  />
                )}
                {advanceAmount && parseFloat(advanceAmount) > 0 && selectedDealRE?.estimated_total && (
                  <div className="mt-3 p-3 bg-white rounded border border-green-300">
                    <div className="flex justify-between text-sm"><span>Estimated Total</span><span>{formatCurrency(selectedDealRE.estimated_total)}</span></div>
                    <div className="flex justify-between text-sm text-green-600 mt-1"><span>Advance</span><span>- {formatCurrency(parseFloat(advanceAmount))}</span></div>
                    <div className="flex justify-between font-semibold mt-2 pt-2 border-t"><span>Balance</span><span className="text-amber-700">{formatCurrency(selectedDealRE.estimated_total - parseFloat(advanceAmount))}</span></div>
                  </div>
                )}
              </div>
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={accountantConfirmed} onChange={(e) => setAccountantConfirmed(e.target.checked)} className="w-5 h-5 rounded border-orange-300 mt-0.5" />
                  <div><span className="font-medium text-orange-800">Accountant Verification Required</span><p className="text-sm text-orange-600 mt-1">Payment will be verified by accounts department.</p></div>
                </label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setConvertDealDialog(false)}>Cancel</Button>
            <Button onClick={handleConvertDeal} className="bg-green-600 hover:bg-green-700" disabled={!advanceAmount || parseFloat(advanceAmount) <= 0 || advancePaymentEntries.length === 0 || !accountantConfirmed} data-testid="confirm-convert-deal">
              <CheckCircle className="h-4 w-4 mr-2" />Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== VIEW PROJECT DIALOG ==================== */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-amber-600" />Project Details</DialogTitle></DialogHeader>
          {selectedProject && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg mb-2">{selectedProject.name}</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Client:</span><p className="font-medium">{selectedProject.client_name}</p></div>
                  <div><span className="text-gray-500">Location:</span><p>{selectedProject.location || '-'}</p></div>
                  <div><span className="text-gray-500">Status:</span><p>{getStatusBadge(selectedProject.status)}</p></div>
                  <div><span className="text-gray-500">Value:</span><p className="font-bold text-green-600">{formatCurrency(selectedProject.total_value)}</p></div>
                </div>
              </div>
              <Button className="w-full" onClick={() => window.location.href = `/projects/${selectedProject.project_id}`}><Eye className="h-4 w-4 mr-2" />View Full Details</Button>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewDialog(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CRE → Review dialog (sent back to Planning Department) */}
      <Dialog open={reviewDialog.open} onOpenChange={(o) => !o && setReviewDialog({ open: false, project: null, text: '' })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-amber-600" />Review for Planning Department</DialogTitle>
            <DialogDescription>Your review will be sent to the Planning Department. They will revise the estimate and resend.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Project</p>
              <p className="font-medium">{reviewDialog.project?.name}</p>
              <p className="text-xs text-gray-500">Rev {reviewDialog.project?.fe?.revision || 0} · Review #{((reviewDialog.project?.fe?.reviews || []).length) + 1}</p>
            </div>
            <div>
              <Textarea
                rows={5}
                placeholder="What needs to change? Example: Reduce flooring cost by ₹50,000 / Add false ceiling for kitchen / Use Asian Paints instead of Berger…"
                value={reviewDialog.text}
                onChange={(e) => setReviewDialog(d => ({ ...d, text: e.target.value }))}
                data-testid="fe-review-textarea"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog({ open: false, project: null, text: '' })}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleFeSubmitReview} data-testid="fe-review-submit">
              <Send className="h-4 w-4 mr-1" /> Send to Planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CRE → Request Revision dialog (post-approval, bumps revision and sends to Planning) */}
      <Dialog open={revisionDialog.open} onOpenChange={(o) => !o && !revisionDialog.submitting && setRevisionDialog({ open: false, project: null, description: '', submitting: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-purple-600" />Request Final Estimate Revision</DialogTitle>
            <DialogDescription>This will bump the revision number and send the Final Estimate back to Planning for changes. Use this only when scope changes are required after approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-purple-50 px-3 py-2.5">
              <p className="text-xs text-gray-500 mb-0.5">Project</p>
              <p className="font-medium text-gray-900">{revisionDialog.project?.name}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className="text-[11px]">Current: FE {String(revisionDialog.project?.fe?.revision || 0).padStart(2, '0')}</Badge>
                <Badge className="bg-purple-100 text-purple-700 text-[11px]">New: FE {String((revisionDialog.project?.fe?.revision || 0) + 1).padStart(2, '0')}</Badge>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Revision Description <span className="text-red-500">*</span></label>
              <Textarea
                rows={5}
                placeholder="What should change in this revision? Example: Client requested premium wood flooring instead of laminate. Add modular kitchen with 8ft tall units. Increase budget for false ceiling…"
                value={revisionDialog.description}
                onChange={(e) => setRevisionDialog(d => ({ ...d, description: e.target.value }))}
                disabled={revisionDialog.submitting}
                data-testid="fe-revision-textarea"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialog({ open: false, project: null, description: '', submitting: false })} disabled={revisionDialog.submitting}>Cancel</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleSubmitRevision} disabled={revisionDialog.submitting} data-testid="fe-revision-submit">
              {revisionDialog.submitting ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Send to Planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
