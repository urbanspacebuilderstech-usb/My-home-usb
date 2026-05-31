import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { DayPicker } from 'react-day-picker';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Building2,
  Plus,
  FileText,
  Clock,
  CheckCircle,
  Send,
  MapPin,
  Package,
  Eye,
  Users,
  ArrowRight,
  Filter,
  Calendar,
  IndianRupee,
  Phone,
  Mail,
  Upload,
  Bell,
  CreditCard,
  Search,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Target,
  Receipt,
  Banknote,
  ClipboardList,
  Copy,
  RefreshCw,
  MessageSquare,
  X,
  KeyRound,
  Trash2
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { MultiPaymentInput } from '../components/MultiPaymentInput';
import { NumericInput } from '../components/NumericInput';
import ChequeListView from '../components/ChequeListView';
import CreateClientPortalDialog from '../components/CreateClientPortalDialog';
import CREPreConstruction from './CREPreConstruction';
import Income from './Income';
import DTBoard from './DTBoard';

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
  { value: 'escrow', label: 'Escrow' },
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
  const [activeTab, setActiveTab] = useState('final_estimate');
  // Global CRE module settings (controlled by Super Admin via Settings → CRE Module)
  // We default to hidden and overwrite from backend once loaded.
  const [showAllProjectsTab, setShowAllProjectsTab] = useState(false);
  const [showIncomeTab, setShowIncomeTab] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API}/settings/cre-module`);
        if (cancelled) return;
        setShowAllProjectsTab(!!r.data?.show_all_projects_tab);
        setShowIncomeTab(!!r.data?.show_income_tab);
      } catch { /* settings not yet seeded → defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t || t === 'new_deals') return;
    // Block hidden optional tabs (controlled globally by Super Admin)
    if (t === 'all_projects' && !showAllProjectsTab) return;
    if (t === 'income' && !showIncomeTab) return;
    setActiveTab(t);
  }, [searchParams, showAllProjectsTab, showIncomeTab]);

  // ─── Global Meta-style Date Range Filter (Sales/Pre-Sales-style popover) ───
  // Persisted in localStorage so the chosen range survives refresh/login.
  // Stored as { from: 'YYYY-MM-DD' | '', to: 'YYYY-MM-DD' | '' }.
  // If user previously cleared the filter ("All Time"), we restore the empty
  // strings (NOT the default this-month range).
  const _loadDate = (k, fallback) => {
    try {
      const v = localStorage.getItem(`cre_${k}`);
      // null means "never set" → use fallback; '' means "explicitly cleared" → keep empty
      return v === null ? fallback : v;
    } catch { return fallback; }
  };
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    return _loadDate('date_from', defaultFrom);
  });
  const [dateTo, setDateTo] = useState(() => {
    const now = new Date();
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return _loadDate('date_to', defaultTo);
  });
  useEffect(() => { try { localStorage.setItem('cre_date_from', dateFrom || ''); } catch (e) { /* ignore quota errors */ } }, [dateFrom]);
  useEffect(() => { try { localStorage.setItem('cre_date_to', dateTo || ''); } catch (e) { /* ignore quota errors */ } }, [dateTo]);
  const dateRange = useMemo(() => ({
    from: dateFrom ? new Date(dateFrom + 'T00:00:00') : null,
    to: dateTo ? new Date(dateTo + 'T23:59:59.999') : (dateFrom ? new Date(dateFrom + 'T23:59:59.999') : null),
  }), [dateFrom, dateTo]);

  const inDateRange = useCallback((dateInput) => {
    if (!dateRange.from && !dateRange.to) return true;
    if (!dateInput) return false;
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return false;
    if (dateRange.from && d < dateRange.from) return false;
    if (dateRange.to && d > dateRange.to) return false;
    return true;
  }, [dateRange]);

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

  // Additional Costs queue (post-GM approval band: awaiting client → CRE approved)
  const [additionalCostsQueue, setAdditionalCostsQueue] = useState([]);
  const [acSubTab, setAcSubTab] = useState('pending_client'); // pending_client | client_approved | all

  // Payment Approvals
  const [pendingApprovals, setPendingApprovals] = useState({ advance_verified: [], pending_income: [] });
  const [feProjects, setFeProjects] = useState([]);
  const [feActiveTab, setFeActiveTab] = useState('awaiting');
  const [reviewDialog, setReviewDialog] = useState({ open: false, project: null, text: '' });
  const [revisionDialog, setRevisionDialog] = useState({ open: false, project: null, description: '', submitting: false });

  // Payment Collected (ledger)
  const [incomeCollected, setIncomeCollected] = useState([]);

  // CRE Payment Schedule tab — month-wise view (mirrors Planning's schedule)
  const todayPS = new Date();
  const [psMonth, setPsMonth] = useState(todayPS.getMonth() + 1);
  const [psYear, setPsYear] = useState(todayPS.getFullYear());
  const [psData, setPsData] = useState({ entries: [], summary: {} });
  const [psLoading, setPsLoading] = useState(false);
  const [psSubTab, setPsSubTab] = useState('pending'); // pending | collected | all

  // Dialogs
  const [createDialog, setCreateDialog] = useState(false);
  const [portalProject, setPortalProject] = useState(null);  // project for which to open Create-Client-Portal dialog
  const [requestREMode, setRequestREMode] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [collectDialog, setCollectDialog] = useState(false);
  const [selectedPaymentStage, setSelectedPaymentStage] = useState(null);
  const [creRejectDialog, setCreRejectDialog] = useState(false);
  const [creRejectReason, setCreRejectReason] = useState('');
  const [collectForm, setCollectForm] = useState({ amount: '', remarks: '' });
  const [collectPaymentEntries, setCollectPaymentEntries] = useState([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
  // Smart Bulk Collect (auto-distribute across multiple pending stages FIFO)
  const [outstandingStages, setOutstandingStages] = useState([]);     // sibling pending stages on the same project
  const [bulkCollectAmount, setBulkCollectAmount] = useState('');     // single client-paid amount

  // Search
  const [projectSearch, setProjectSearch] = useState('');

  // Payment Schedule bulk delete — Set of selected entry/computed IDs +
  // confirm dialog state that requires the user to type "delete" to proceed.
  const [psSelected, setPsSelected] = useState(new Set());
  const [psDeleteDialog, setPsDeleteDialog] = useState({ open: false, typed: '', submitting: false });

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

  // Payment Schedule fetcher (mirrors Planning's monthly schedule)
  const fetchPaymentSchedule = async (m = psMonth, y = psYear) => {
    setPsLoading(true);
    try {
      const r = await axios.get(`${API}/planning/monthly-schedule`, { params: { month: m, year: y } });
      setPsData(r.data || { entries: [], summary: {} });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load payment schedule');
    } finally {
      setPsLoading(false);
    }
  };
  useEffect(() => { fetchPaymentSchedule(psMonth, psYear); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [psMonth, psYear]);

  // ── Bulk delete on CRE Payment Schedule ──────────────────────────────
  // Backend has a per-entry delete that handles three cases:
  //   entry_*     → drop the manual row
  //   computed_<sid> (addition) → drop the payment_stage entirely
  //   computed_<sid> (project)  → insert a hide marker for the month
  // We loop sequentially so a single failure doesn't poison the whole batch.
  const performPsBulkDelete = async () => {
    const ids = Array.from(psSelected);
    if (ids.length === 0) return;
    setPsDeleteDialog(s => ({ ...s, submitting: true }));
    let ok = 0; let fail = 0;
    for (const id of ids) {
      try {
        await axios.delete(`${API}/planning/monthly-schedule/${id}`, { params: { month: psMonth, year: psYear } });
        ok += 1;
      } catch { fail += 1; }
    }
    setPsSelected(new Set());
    setPsDeleteDialog({ open: false, typed: '', submitting: false });
    if (ok) toast.success(`Removed ${ok} entr${ok === 1 ? 'y' : 'ies'}`);
    if (fail) toast.error(`${fail} failed`);
    fetchPaymentSchedule(psMonth, psYear);
  };

  // Reset selection whenever sub-tab or month changes (the visible rows differ).
  useEffect(() => { setPsSelected(new Set()); }, [psSubTab, psMonth, psYear]);

  const shiftPsMonth = (delta) => {
    let m = psMonth + delta;
    let y = psYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setPsMonth(m);
    setPsYear(y);
  };

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

      const [dashboardRes, dealsRes, paymentReqRes, additionalReqRes, incomeRes, approvalsRes, feRes, acQueueRes] = await Promise.allSettled([
        axios.get(`${API}/cre/dashboard`),
        axios.get(`${API}/cre/new-deals`),
        axios.get(`${API}/cre/payment-requests`),
        axios.get(`${API}/cre/additional-payment-requests`),
        axios.get(`${API}/cre/income-collected`),
        axios.get(`${API}/cre/pending-approvals`),
        axios.get(`${API}/cre/final-estimates`),
        axios.get(`${API}/cre/additional-costs`)
      ]);

      if (dashboardRes.status === 'fulfilled') {
        const data = dashboardRes.value.data;
        setDashboard(data);
        setPackages(data.packages || []);
        setProjects(data.recent_projects || []);
        // Dashboard.recent_projects is capped at 20; if there are more, pull
        // the full list (up to 2000) for the All Projects tab so a CRE never
        // "loses" an older project like Mrs. Abinaya.
        if ((data.recent_projects || []).length >= 20) {
          axios.get(`${API}/cre/projects/all`)
            .then(r => { if (Array.isArray(r.data) && r.data.length > (data.recent_projects || []).length) setProjects(r.data); })
            .catch(() => {});
        }
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
      if (acQueueRes.status === 'fulfilled') setAdditionalCostsQueue(acQueueRes.value.data?.rows || []);
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

  const openCollectDialog = async (stage) => {
    setSelectedPaymentStage(stage);
    const balance = (stage.amount || 0) - (stage.amount_received || 0);
    setCollectForm({ amount: balance, mode: 'bank_transfer', reference: '', remarks: '', num_cheques: 1, cheque_details: [] });
    setBulkCollectAmount('');
    setOutstandingStages([]);
    setCollectSelectedStageIds(new Set());
    setCollectDialog(true);
    // Fetch the project's other pending stages — drives the FIFO preview.
    if (stage.project_id) {
      try {
        const res = await axios.get(`${API}/projects/${stage.project_id}/outstanding-stages`);
        setOutstandingStages(res.data?.stages || []);
      } catch {
        // Non-blocking — single-stage popup still works if this fails.
      }
    }
  };

  // Compute FIFO allocation preview for a given total amount.
  // Stages array is already sorted server-side by requested_at ascending.
  // Smart Collect — user may opt to select specific stages to collect against
  // instead of letting FIFO span every pending stage.
  const [collectSelectedStageIds, setCollectSelectedStageIds] = useState(new Set());
  const computeFIFOAllocation = (amount, stages) => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0 || !stages.length) return [];
    let remaining = amt;
    const result = [];
    for (const s of stages) {
      if (remaining <= 0.5) break;
      const take = Math.min(remaining, s.balance);
      if (take > 0) {
        result.push({ ...s, allocated: take, post_balance: Math.max(0, s.balance - take) });
        remaining -= take;
      }
    }
    if (remaining > 0.5 && result.length) {
      // Excess — credit to the last stage (over-collected)
      result[result.length - 1].allocated += remaining;
      result[result.length - 1].excess = remaining;
    }
    return result;
  };

  const handleCollectPayment = async () => {
    if (!selectedPaymentStage) return;
    // Smart Bulk Collect path — used when CRE filled the single "Amount Received from Client"
    // field instead of the legacy per-cheque entries grid.
    const bulkAmt = parseFloat(bulkCollectAmount) || 0;
    if (bulkAmt > 0 && outstandingStages.length > 0) {
      const mode = collectPaymentEntries[0]?.payment_mode || 'bank_transfer';
      const ref = collectPaymentEntries[0]?.reference || '';
      const cheque_details = mode === 'cheque' ? (collectPaymentEntries[0]?.cheque_details || []) : null;
      if (mode === 'cheque' && (!cheque_details || cheque_details.length === 0 || !cheque_details[0]?.cheque_number)) {
        toast.error('Please add at least one cheque number before confirming');
        return;
      }
      try {
        // If CRE picked specific stages, send explicit allocations so the
        // backend only credits those (legacy: empty → FIFO across all pending).
        let manualAllocations = null;
        if (collectSelectedStageIds.size > 0) {
          const scoped = outstandingStages.filter(s => collectSelectedStageIds.has(s.stage_id));
          const plan = computeFIFOAllocation(bulkAmt, scoped);
          manualAllocations = plan.map(p => ({ stage_id: p.stage_id, amount: p.allocated }));
        }
        const res = await axios.post(`${API}/projects/${selectedPaymentStage.project_id}/collect-payment-bulk`, {
          amount: bulkAmt,
          payment_mode: mode,
          payment_reference: ref,
          remarks: collectForm.remarks || null,
          cheque_details,
          ...(manualAllocations ? { allocations: manualAllocations } : {}),
        });
        const lines = res.data?.allocations || [];
        const summary = lines.map(l => `${l.stage_name}: ₹${l.collected.toLocaleString('en-IN')}${l.new_status === 'partial' ? ' (partial)' : ''}`).join(' • ');
        toast.success(`Distributed ₹${bulkAmt.toLocaleString('en-IN')} → ${summary}`);
        setCollectDialog(false);
        setCollectForm({ amount: '', remarks: '' });
        setBulkCollectAmount('');
        setOutstandingStages([]);
        setCollectSelectedStageIds(new Set());
        setCollectPaymentEntries([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
        fetchData(false);
        return;
      } catch (error) {
        toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to collect payment');
        return;
      }
    }

    // Legacy single-stage path
    const totalPayEntries = collectPaymentEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    if (collectPaymentEntries.length === 0 || totalPayEntries <= 0) { toast.error('Add at least one payment entry'); return; }
    const balance = (selectedPaymentStage.amount || 0) - (selectedPaymentStage.amount_received || 0);
    if (totalPayEntries > balance + 1) { toast.error(`Amount exceeds remaining balance of ${formatCurrency(balance)}`); return; }

    // Validate cheque entries: each cheque-mode payment must have cheque details with at least cheque_number
    for (let i = 0; i < collectPaymentEntries.length; i++) {
      const e = collectPaymentEntries[i];
      if (e.payment_mode === 'cheque') {
        const valid = (e.cheque_details || []).filter(c => c && c.cheque_number && String(c.cheque_number).trim());
        if (valid.length === 0) {
          toast.error(`Payment ${i + 1}: Please click "+ Add Cheque" and enter at least one cheque number before confirming`);
          return;
        }
      }
    }

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

  const handleRejectPaymentRequest = async () => {
    if (!selectedPaymentStage) return;
    if (!creRejectReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    try {
      await axios.post(`${API}/payment-stages/${selectedPaymentStage.stage_id}/cre-reject`, { reason: creRejectReason.trim() });
      toast.success('Rejected. Planning has been notified.');
      setCreRejectDialog(false);
      setCollectDialog(false);
      setCreRejectReason('');
      setCollectForm({ amount: '', remarks: '' });
      setCollectPaymentEntries([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to reject request');
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
    if (!inDateRange(p.created_at)) return false;
    if (!projectSearch) return true;
    const s = projectSearch.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || (p.client_name || '').toLowerCase().includes(s) || (p.location || '').toLowerCase().includes(s);
  });

  const projectsInRange = useMemo(() => projects.filter(p => inDateRange(p.created_at)), [projects, inDateRange]);
  const incomeInRange = useMemo(() => incomeCollected.filter(i => inDateRange(i.payment_date || i.created_at)), [incomeCollected, inDateRange]);
  const totalCollected = incomeInRange.reduce((s, i) => s + (i.amount || 0), 0);
  const totalValueInRange = projectsInRange.reduce((s, p) => s + (p.total_value || 0), 0);

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="cre-board-loading">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-lg border p-4 animate-pulse"><div className="h-4 bg-gray-200 rounded w-20 mb-2" /><div className="h-8 bg-gray-200 rounded w-12" /></div>)}
          </div>
          <div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-64" /></div>
        </div>
      </div>
    );
  }

  const pendingCount = (pendingApprovals.advance_verified?.length || 0) + (pendingApprovals.pending_income?.length || 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="cre-board">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        {/* Global Date Range Filter — Meta Ads-style popover (matches Sales/Pre-Sales) */}
        <div className="flex items-center gap-2 mb-4" data-testid="cre-date-range-filter">
          <span className="text-[11px] uppercase font-semibold tracking-wide text-gray-500 mr-1">Date:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`h-9 text-xs gap-1.5 rounded-lg shadow-sm ${dateFrom ? 'bg-amber-50 border-amber-400 text-amber-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                data-testid="cre-date-filter-btn"
              >
                <Calendar className="h-3.5 w-3.5" />
                {dateFrom ? (
                  dateTo && dateFrom !== dateTo ? (
                    `${new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${new Date(dateTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                  ) : (
                    new Date(dateFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  )
                ) : 'All Time'}
                {dateFrom && (
                  <X
                    className="h-3 w-3 ml-1 opacity-50 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setDateFrom(''); setDateTo(''); }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-0" align="start">
              <div className="flex">
                <div className="w-32 border-r bg-gray-50 p-2 space-y-0.5 rounded-l-xl">
                  {[
                    { label: 'Today', fn: () => { const d = new Date().toISOString().split('T')[0]; setDateFrom(d); setDateTo(d); } },
                    { label: 'Yesterday', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().split('T')[0]; setDateFrom(s); setDateTo(s); } },
                    { label: 'Last 7 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 6); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
                    { label: 'Last 30 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 29); setDateFrom(s.toISOString().split('T')[0]); setDateTo(e.toISOString().split('T')[0]); } },
                    { label: 'This Month', fn: () => { const now = new Date(); setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setDateTo(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]); } },
                    { label: 'Last Month', fn: () => { const now = new Date(); setDateFrom(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]); setDateTo(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]); } },
                    { label: 'This Year', fn: () => { const y = new Date().getFullYear(); setDateFrom(new Date(y, 0, 1).toISOString().split('T')[0]); setDateTo(new Date(y, 11, 31).toISOString().split('T')[0]); } },
                    { label: 'All Time', fn: () => { setDateFrom(''); setDateTo(''); } },
                  ].map(p => (
                    <button
                      key={p.label}
                      onClick={p.fn}
                      className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${p.label === 'All Time' ? 'text-red-500 hover:bg-red-50 mt-2' : 'text-gray-700 hover:bg-amber-50 hover:text-amber-700'}`}
                      data-testid={`cre-date-preset-${p.label.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="p-3">
                  <DayPicker
                    mode="range"
                    selected={dateFrom ? { from: new Date(dateFrom + 'T00:00:00'), to: dateTo ? new Date(dateTo + 'T00:00:00') : new Date(dateFrom + 'T00:00:00') } : undefined}
                    onSelect={(range) => {
                      if (range?.from) {
                        const from = range.from.toLocaleDateString('en-CA');
                        const to = range.to ? range.to.toLocaleDateString('en-CA') : '';
                        setDateFrom(from);
                        setDateTo(from === to ? '' : to || from);
                      } else {
                        setDateFrom('');
                        setDateTo('');
                      }
                    }}
                    classNames={{
                      months: 'flex gap-4', month: 'space-y-3',
                      caption: 'flex justify-center relative items-center h-8',
                      caption_label: 'text-sm font-semibold text-gray-800',
                      nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-lg hover:bg-gray-100',
                      table: 'w-full border-collapse', head_row: 'flex',
                      head_cell: 'text-gray-400 rounded-md w-8 font-normal text-[10px] uppercase',
                      row: 'flex w-full mt-1', cell: 'relative p-0 text-center text-sm',
                      day: 'h-8 w-8 p-0 font-normal text-xs rounded-lg hover:bg-amber-50 transition-colors inline-flex items-center justify-center',
                      day_selected: 'bg-amber-600 text-white hover:bg-amber-700 font-medium',
                      day_today: 'bg-gray-100 font-semibold text-amber-600',
                      day_range_middle: 'bg-amber-50 text-amber-700 rounded-none',
                      day_range_start: 'bg-amber-600 text-white rounded-l-lg rounded-r-none',
                      day_range_end: 'bg-amber-600 text-white rounded-r-lg rounded-l-none',
                      day_outside: 'text-gray-300',
                    }}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <TabsList className="bg-white border shadow-sm">
              <TabsTrigger value="payment_schedule" className="text-xs sm:text-sm gap-1.5" data-testid="tab-payment-schedule">
                Payment Schedule {(() => {
                  const c = (paymentRequests || []).filter(r => inDateRange(r.requested_at || r.created_at)).length;
                  return c > 0 ? <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{c}</Badge> : null;
                })()}
              </TabsTrigger>
              <TabsTrigger value="final_estimate" className="text-xs sm:text-sm gap-1.5" data-testid="tab-final-estimate">
                Final Estimate {(() => {
                  const c = feProjects.filter(p => p.fe?.status !== 'approved').length;
                  return c > 0 ? <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{c}</Badge> : null;
                })()}
              </TabsTrigger>
              <TabsTrigger value="pre_construction" className="text-xs sm:text-sm gap-1.5" data-testid="tab-pre-construction">
                Pre-Construction
              </TabsTrigger>
              <TabsTrigger value="cheques" className="text-xs sm:text-sm gap-1.5" data-testid="tab-cheque-management">
                Cheque Management {(chequeEntries || []).length > 0 && (
                  <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{chequeEntries.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="dt_requests" className="text-xs sm:text-sm gap-1.5" data-testid="tab-dt-requests">
                DT Requests {(additionalPaymentRequests || []).length > 0 && (
                  <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{additionalPaymentRequests.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="additional_costs" className="text-xs sm:text-sm gap-1.5" data-testid="tab-additional-costs">
                Additional Costs {(() => {
                  const c = (additionalCostsQueue || []).filter(r => r.client_approval_status === 'pending_client' || (r.client_approval_status === 'client_approved' && !r.cre_approved)).length;
                  return c > 0 ? <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{c}</Badge> : null;
                })()}
              </TabsTrigger>
              {/* Optional tabs — controlled globally by Super Admin via Settings → CRE Module */}
              {showAllProjectsTab && (
                <TabsTrigger value="all_projects" className="text-xs sm:text-sm gap-1.5" data-testid="tab-all-projects">
                  All Projects {projectsInRange.length > 0 && (
                    <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{projectsInRange.length}</Badge>
                  )}
                </TabsTrigger>
              )}
              {showIncomeTab && (
                <TabsTrigger value="income" className="text-xs sm:text-sm gap-1.5" data-testid="tab-income">
                  Income {(incomeCollected || []).length > 0 && (
                    <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 flex items-center justify-center rounded-full">{incomeCollected.length}</Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* TAB 1: NEW DEALS — REMOVED (Feb 2026 workflow: accountant verify auto-routes to Planning Head) */}

          {/* ==================== TAB 1.5: FINAL ESTIMATE ==================== */}
          <TabsContent value="final_estimate">
            {(() => {
              // Apply global date filter against fe.sent_to_cre_at (when set) or created_at
              const feInRange = feProjects.filter(p => {
                const dt = p.fe?.sent_to_cre_at || p.created_at;
                return inDateRange(dt);
              });
              const counts = {
                awaiting: feInRange.filter(p => p.fe?.status === 'pending_cre_review').length,
                in_revision: feInRange.filter(p => p.fe?.status === 'review_pending').length,
                sent_to_client: feInRange.filter(p => ['pending_client_review', 'feedback_received'].includes(p.fe?.status)).length,
                approved: feInRange.filter(p => p.fe?.status === 'approved').length,
                all: feInRange.length,
              };
              const filtered = (() => {
                switch (feActiveTab) {
                  case 'awaiting': return feInRange.filter(p => p.fe?.status === 'pending_cre_review');
                  case 'in_revision': return feInRange.filter(p => p.fe?.status === 'review_pending');
                  case 'sent_to_client': return feInRange.filter(p => ['pending_client_review', 'feedback_received'].includes(p.fe?.status));
                  case 'approved': return feInRange.filter(p => p.fe?.status === 'approved');
                  default: return feInRange;
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

                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
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

          {/* ==================== TAB 1.7: PAYMENT SCHEDULE ==================== */}
          <TabsContent value="payment_schedule">
            {(() => {
              const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const allEntries = psData.entries || [];
              // Apply global date filter to entries (by expected_payment_date)
              const dateFiltered = (dateRange.from || dateRange.to)
                ? allEntries.filter(e => inDateRange(e.expected_payment_date))
                : allEntries;
              // Classify each entry as collected vs pending
              const isCollectedEntry = (e) => {
                const balance = (e.amount || 0) - (e.amount_received || 0);
                const hasPendingApproval = (e.pending_approval_count || 0) > 0;
                return !hasPendingApproval && (e.stage_status === 'paid' || e.stage_status === 'collected' || balance <= 0);
              };
              const pendingEntries = dateFiltered.filter(e => !isCollectedEntry(e));
              const collectedEntries = dateFiltered.filter(e => isCollectedEntry(e));
              const entries = psSubTab === 'pending' ? pendingEntries
                            : psSubTab === 'collected' ? collectedEntries
                            : dateFiltered;
              return (
                <div className="space-y-4">
                  {/* Month nav */}
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <Button size="sm" variant="outline" onClick={() => shiftPsMonth(-1)} data-testid="ps-prev-month">‹ Prev</Button>
                          <div className="text-center min-w-[140px]">
                            <p className="text-lg font-bold text-gray-900" data-testid="ps-current-month">{MONTHS[psMonth - 1]} {psYear}</p>
                            <p className="text-xs text-gray-500">CRE Payment Schedule</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => shiftPsMonth(1)} data-testid="ps-next-month">Next ›</Button>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => fetchPaymentSchedule()} data-testid="ps-refresh">
                          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sub-tabs: Pending | Collected | All + Delete Selected button */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex gap-2 flex-wrap" data-testid="ps-subtabs">
                      {[
                        { key: 'pending', label: 'Pending', count: pendingEntries.length, activeBg: 'bg-amber-600', dot: 'bg-red-500' },
                        { key: 'collected', label: 'Collected', count: collectedEntries.length, activeBg: 'bg-emerald-600', dot: 'bg-red-500' },
                        { key: 'all', label: 'All', count: dateFiltered.length, activeBg: 'bg-slate-700', dot: 'bg-red-500' },
                      ].map(t => (
                        <button
                          key={t.key}
                          onClick={() => setPsSubTab(t.key)}
                          data-testid={`ps-subtab-${t.key}`}
                          className={`px-4 py-1.5 text-sm rounded-full border transition-colors flex items-center gap-1.5 ${
                            psSubTab === t.key
                              ? `${t.activeBg} text-white border-transparent shadow-sm`
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'
                          }`}
                        >
                          {t.label}
                          {t.count > 0 && (
                            <span className={`${psSubTab === t.key ? 'bg-white/25 text-white' : `${t.dot} text-white`} text-[10px] h-5 min-w-[20px] px-1.5 rounded-full inline-flex items-center justify-center font-semibold`}>
                              {t.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {/* Delete Selected — only renders when at least one row is checked. */}
                    {psSelected.size > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50 h-8 text-xs gap-1"
                        onClick={() => setPsDeleteDialog({ open: true, typed: '', submitting: false })}
                        data-testid="ps-delete-selected"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({psSelected.size})
                      </Button>
                    )}
                  </div>

                  {/* Table */}
                  <Card>
                    <CardContent className="p-0">
                      {psLoading ? (
                        <div className="p-8 text-center text-gray-400"><RefreshCw className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm" data-testid="cre-payment-schedule-table">
                            <thead className="bg-gray-50 dark:bg-gray-800/50 border-y">
                              <tr>
                                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                    checked={entries.length > 0 && entries.every(e => psSelected.has(e.entry_id || `computed_${e.stage_id}`))}
                                    onChange={(ev) => {
                                      const all = new Set(psSelected);
                                      if (ev.target.checked) entries.forEach(e => all.add(e.entry_id || `computed_${e.stage_id}`));
                                      else entries.forEach(e => all.delete(e.entry_id || `computed_${e.stage_id}`));
                                      setPsSelected(all);
                                    }}
                                    data-testid="ps-select-all"
                                  />
                                </th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stage</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expected Date</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Received</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {entries.length === 0 ? (
                                <tr><td colSpan="9" className="p-8 text-center text-gray-400">No payments scheduled for {MONTHS[psMonth - 1]} {psYear}.</td></tr>
                              ) : entries.map((e) => {
                                const balance = (e.amount || 0) - (e.amount_received || 0);
                                const pendingApprovalAmt = e.pending_approval_amount || 0;
                                const hasPendingApproval = (e.pending_approval_count || 0) > 0;
                                const isCollected = !hasPendingApproval && (e.stage_status === 'paid' || e.stage_status === 'collected' || balance <= 0);
                                const isPartial = !hasPendingApproval && (e.amount_received || 0) > 0 && balance > 0;
                                let badge;
                                if (hasPendingApproval) badge = <Badge className="bg-orange-100 text-orange-700 text-[11px] whitespace-nowrap">Pending Accountant Approval</Badge>;
                                else if (isCollected) badge = <Badge className="bg-green-100 text-green-700 text-[11px]">Collected</Badge>;
                                else if (isPartial) badge = <Badge className="bg-amber-100 text-amber-700 text-[11px]">Partial</Badge>;
                                else if (e.workflow_status === 'requested') badge = <Badge className="bg-purple-100 text-purple-700 text-[11px]">Planning Requested</Badge>;
                                else badge = <Badge className="bg-gray-100 text-gray-700 text-[11px]">Pending</Badge>;
                                return (
                                  <tr key={e.entry_id || e.stage_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50" data-testid={`ps-row-${e.entry_id || e.stage_id}`}>
                                    <td className="px-3 py-2.5 text-center">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                        checked={psSelected.has(e.entry_id || `computed_${e.stage_id}`)}
                                        onChange={(ev) => {
                                          const key = e.entry_id || `computed_${e.stage_id}`;
                                          const next = new Set(psSelected);
                                          if (ev.target.checked) next.add(key); else next.delete(key);
                                          setPsSelected(next);
                                        }}
                                        data-testid={`ps-select-${e.entry_id || e.stage_id}`}
                                      />
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <p className="font-medium">{e.project_name}</p>
                                      <p className="text-[11px] text-gray-400">{e.client_name || ''}</p>
                                    </td>
                                    <td className="px-4 py-2.5 text-sm">
                                      {e.stage_name}
                                      {e.is_carryover && (
                                        <Badge className="ml-1.5 bg-red-50 text-red-700 border-red-200 text-[10px] align-middle" data-testid="last-month-pending-badge">
                                          🔴 Carried from {e.carry_from_month ? `${new Date(2000, e.carry_from_month - 1, 1).toLocaleString('en-IN', { month: 'short' })} ${e.carry_from_year}` : 'earlier'}{e.days_overdue > 0 ? ` · ${e.days_overdue}d overdue` : ''}
                                        </Badge>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-700">
                                      {e.expected_payment_date ? new Date(e.expected_payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(e.amount)}</td>
                                    <td className="px-4 py-2.5 text-right text-green-600">
                                      {formatCurrency(e.amount_received || 0)}
                                      {pendingApprovalAmt > 0 && (
                                        <p className="text-[10px] text-orange-600">+{formatCurrency(pendingApprovalAmt)} pending</p>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(balance)}</td>
                                    <td className="px-4 py-2.5 text-center">{badge}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      {isCollected ? (
                                        <span className="text-[11px] text-gray-400">—</span>
                                      ) : hasPendingApproval ? (
                                        <span className="text-[11px] text-orange-600 font-medium">Awaiting approval</span>
                                      ) : (
                                        <Button
                                          size="sm"
                                          className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                          onClick={() => openCollectDialog({ ...e, stage_id: e.stage_id })}
                                          data-testid={`ps-collect-${e.entry_id || e.stage_id}`}
                                        >
                                          <IndianRupee className="h-3.5 w-3.5 mr-1" /> Collect
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
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
                    <Button size="sm" onClick={() => { resetForm(); setCreateDialog(true); }} className="bg-amber-600 hover:bg-amber-700 hidden" data-testid="create-project-btn">
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
                      <thead className="bg-gray-50 dark:bg-gray-800/50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Client</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Location</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Portal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredProjects.map((p) => (
                          <tr key={p.project_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50" data-testid={`project-row-${p.project_id}`}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-gray-900">{p.name}</p>
                              <p className="text-xs text-gray-400">{p.project_code || p.project_id}</p>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{p.client_name}</td>
                            <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{p.location || '-'}</td>
                            <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                            <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 text-[11px] gap-1 ${p.client_user_id ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}
                                onClick={() => setPortalProject(p)}
                                data-testid={`create-portal-btn-${p.project_id}`}
                              >
                                <KeyRound className="h-3 w-3" /> {p.client_user_id ? 'Reset' : 'Create'}
                              </Button>
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

          {/* ==================== TAB 7: INCOME ==================== */}
          <TabsContent value="income">
            <Income embedded />
          </TabsContent>

          {/* ==================== TAB 8: DT REQUESTS ==================== */}
          <TabsContent value="dt_requests">
            <DTBoard embedded />
          </TabsContent>

          {/* ==================== TAB 9: ADDITIONAL COSTS ==================== */}
          {/* CRE rolled-up view of all additional_costs that have crossed GM approval.
              Sub-tabs filter by sub-status (pending client / client-approved). Rows
              show the project, work description, amount, status pill and a "View
              Project" CTA that deep-links into the Project Detail Additional Work tab. */}
          <TabsContent value="additional_costs">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Additional Costs Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Sub-tabs */}
                <div className="flex gap-2 flex-wrap mb-3" data-testid="ac-subtabs">
                  {(() => {
                    const inRange = (additionalCostsQueue || []).filter(r => inDateRange(r.client_approval_sent_at || r.created_at));
                    const pendingClient = inRange.filter(r => r.client_approval_status === 'pending_client');
                    const clientApproved = inRange.filter(r => r.client_approval_status === 'client_approved' && !r.cre_approved);
                    const all = inRange;
                    const tabs = [
                      { key: 'pending_client', label: 'Pending Client', count: pendingClient.length, color: 'bg-amber-100 text-amber-700' },
                      { key: 'client_approved', label: 'Client Approved · Need CRE Action', count: clientApproved.length, color: 'bg-emerald-100 text-emerald-700' },
                      { key: 'all', label: 'All', count: all.length, color: 'bg-gray-100 text-gray-700' },
                    ];
                    return tabs.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setAcSubTab(t.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${acSubTab === t.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        data-testid={`ac-subtab-${t.key}`}
                      >
                        {t.label} <span className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] ${acSubTab === t.key ? 'bg-white text-indigo-700' : t.color}`}>{t.count}</span>
                      </button>
                    ));
                  })()}
                </div>
                {/* Rows table */}
                {(() => {
                  const inRange = (additionalCostsQueue || []).filter(r => inDateRange(r.client_approval_sent_at || r.created_at));
                  let rows = inRange;
                  if (acSubTab === 'pending_client') rows = inRange.filter(r => r.client_approval_status === 'pending_client');
                  if (acSubTab === 'client_approved') rows = inRange.filter(r => r.client_approval_status === 'client_approved' && !r.cre_approved);
                  if (rows.length === 0) {
                    return <div className="text-sm text-gray-500 italic py-8 text-center" data-testid="ac-empty">No additional costs in this view.</div>;
                  }
                  // Group by project
                  const grouped = {};
                  rows.forEach(r => {
                    const k = r.project_id;
                    if (!grouped[k]) grouped[k] = { project_name: r.project_name, client_name: r.client_name, project_id: k, items: [] };
                    grouped[k].items.push(r);
                  });
                  return Object.values(grouped).map(g => {
                    const total = g.items.reduce((s, x) => s + (x.estimated_amount || 0), 0);
                    return (
                      <div key={g.project_id} className="mb-4 border border-gray-200 rounded-lg overflow-hidden" data-testid={`ac-project-${g.project_id}`}>
                        <div className="bg-gray-50 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
                            <span className="font-semibold text-sm truncate">{g.project_name || '—'}</span>
                            <span className="text-xs text-gray-500 truncate">· {g.client_name || ''}</span>
                            <Badge variant="outline" className="text-[10px]">{g.items.length} item{g.items.length === 1 ? '' : 's'}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Total: <span className="font-bold text-indigo-700">₹{Number(total).toLocaleString('en-IN')}</span></span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => navigate(`/projects/${g.project_id}?tab=scope`)} data-testid={`ac-view-${g.project_id}`}>
                              <Eye className="h-3 w-3" /> View Project
                            </Button>
                          </div>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-white border-b">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Received</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {g.items.map((c) => (
                              <tr key={c.cost_id} data-testid={`ac-row-${c.cost_id}`}>
                                <td className="px-3 py-2 truncate max-w-[400px]" title={c.description || c.name}>{c.description || c.name || '—'}</td>
                                <td className="px-3 py-2 text-right">₹{Number(c.estimated_amount || 0).toLocaleString('en-IN')}</td>
                                <td className="px-3 py-2 text-right">₹{Number(c.income_received || 0).toLocaleString('en-IN')}</td>
                                <td className="px-3 py-2 text-center">
                                  {c.client_approval_status === 'pending_client' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">Pending Client</span>
                                  )}
                                  {c.client_approval_status === 'client_approved' && !c.cre_approved && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">Client Approved · CRE Action</span>
                                  )}
                                  {c.cre_approved && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">CRE Approved</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>
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
            <DialogTitle className="flex items-center gap-2"><IndianRupee className="h-5 w-5 text-green-600" />Collect Payment</DialogTitle>
            <DialogDescription>{selectedPaymentStage?.project_name} - {selectedPaymentStage?.stage_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg">
              <div><p className="text-xs text-gray-500">Stage Amount</p><p className="font-semibold">{formatCurrency(selectedPaymentStage?.amount)}</p></div>
              <div><p className="text-xs text-gray-500">Already Received</p><p className="font-semibold text-green-600">{formatCurrency(selectedPaymentStage?.amount_received || 0)}</p></div>
              <div><p className="text-xs text-gray-500">Balance</p><p className="font-semibold text-red-600">{formatCurrency((selectedPaymentStage?.amount || 0) - (selectedPaymentStage?.amount_received || 0))}</p></div>
            </div>

            {/* Smart Bulk Collect — auto-distribute FIFO across all pending stages on this project */}
            {outstandingStages.length > 1 && (
              <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-3 space-y-3" data-testid="bulk-collect-section">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Smart Collect — distribute across pending stages</p>
                    <p className="text-[11px] text-amber-700">
                      {outstandingStages.length} stages pending for this project. Total Outstanding: <span className="font-bold">{formatCurrency(outstandingStages.reduce((s, x) => s + x.balance, 0))}</span>
                    </p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Amount Received from Client (₹)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={bulkCollectAmount}
                    onChange={(e) => setBulkCollectAmount(e.target.value)}
                    placeholder={`e.g. ${outstandingStages.reduce((s, x) => s + x.balance, 0)}`}
                    className="mt-1 text-sm"
                    data-testid="bulk-collect-amount-input"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Entering an amount here will auto-distribute it across the pending stages below in Planning's requested order (first-come-first-paid).
                  </p>
                </div>

                {/* Stage picker — when CRE has a specific stage (or set of stages)
                    the client paid for, they can tick them and FIFO will only fill
                    those. Empty selection keeps the legacy "fill all" behavior. */}
                <div className="border-t pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs font-semibold">Select stages to collect against</Label>
                    <span className="text-[10px] text-gray-500">
                      {collectSelectedStageIds.size === 0 ? 'No selection → all stages (FIFO)' : `${collectSelectedStageIds.size} of ${outstandingStages.length} selected`}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-md bg-white divide-y" data-testid="collect-stage-picker">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 sticky top-0">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={outstandingStages.length > 0 && collectSelectedStageIds.size === outstandingStages.length}
                        onChange={(e) => {
                          if (e.target.checked) setCollectSelectedStageIds(new Set(outstandingStages.map(s => s.stage_id)));
                          else setCollectSelectedStageIds(new Set());
                        }}
                        data-testid="collect-stage-select-all"
                      />
                      <span className="text-[11px] text-gray-600">Select all</span>
                    </div>
                    {outstandingStages.map(s => (
                      <label key={s.stage_id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer" data-testid={`collect-stage-pick-${s.stage_id}`}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={collectSelectedStageIds.has(s.stage_id)}
                          onChange={(e) => {
                            const next = new Set(collectSelectedStageIds);
                            if (e.target.checked) next.add(s.stage_id); else next.delete(s.stage_id);
                            setCollectSelectedStageIds(next);
                          }}
                        />
                        <span className="flex-1 text-xs flex items-center gap-1.5 min-w-0">
                          {s.is_addition && <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 px-1 py-0">ADD</Badge>}
                          <span className="truncate">{s.stage_name}</span>
                        </span>
                        <span className="text-xs font-semibold text-red-600 shrink-0">{formatCurrency(s.balance)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* FIFO allocation preview */}
                {parseFloat(bulkCollectAmount) > 0 && (() => {
                  // When the user checks specific stages, restrict FIFO to that subset only.
                  // Empty selection = use all outstanding stages (legacy behavior).
                  const scoped = collectSelectedStageIds.size > 0
                    ? outstandingStages.filter(s => collectSelectedStageIds.has(s.stage_id))
                    : outstandingStages;
                  const plan = computeFIFOAllocation(bulkCollectAmount, scoped);
                  if (!plan.length) return null;
                  const planned = plan.reduce((s, p) => s + p.allocated, 0);
                  return (
                    <div className="rounded-md border border-amber-200 bg-white overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-100/50 text-amber-800">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Stage</th>
                            <th className="px-2 py-1.5 text-right">Pending</th>
                            <th className="px-2 py-1.5 text-right">Allocated</th>
                            <th className="px-2 py-1.5 text-right">Remaining</th>
                            <th className="px-2 py-1.5 text-center">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {plan.map((p, i) => (
                            <tr key={p.stage_id} data-testid={`bulk-collect-row-${i}`}>
                              <td className="px-2 py-1.5 font-medium">
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  {p.is_addition && <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 px-1 py-0">ADD</Badge>}
                                  <span className="truncate">{p.stage_name}</span>
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right text-red-600">{formatCurrency(p.balance)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold text-green-700">{formatCurrency(p.allocated)}</td>
                              <td className="px-2 py-1.5 text-right text-gray-700">{formatCurrency(p.post_balance || 0)}</td>
                              <td className="px-2 py-1.5 text-center">
                                {p.post_balance === 0 ? (
                                  <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px]">Collected</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">Partial</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-amber-50 font-semibold">
                          <tr>
                            <td className="px-2 py-1.5">Total</td>
                            <td className="px-2 py-1.5 text-right text-red-600">{formatCurrency(outstandingStages.reduce((s, x) => s + x.balance, 0))}</td>
                            <td className="px-2 py-1.5 text-right text-green-700">{formatCurrency(planned)}</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Payment mode picker — used by BOTH bulk and single-stage paths */}
            <MultiPaymentInput
              totalAmount={(parseFloat(bulkCollectAmount) > 0)
                ? parseFloat(bulkCollectAmount)
                : (selectedPaymentStage?.amount || 0) - (selectedPaymentStage?.amount_received || 0)}
              entries={collectPaymentEntries}
              onChange={setCollectPaymentEntries}
              allowPartial={true}
            />
            <div><Label>Remarks</Label><Input value={collectForm.remarks} onChange={(e) => setCollectForm({ ...collectForm, remarks: e.target.value })} placeholder="Optional" className="mt-1" /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCollectDialog(false)}>Cancel</Button>
            <Button
              variant="outline"
              onClick={() => { setCreRejectReason(''); setCreRejectDialog(true); }}
              className="text-red-600 border-red-300 hover:bg-red-50"
              data-testid="cre-collect-reject-btn"
            >
              <XCircle className="h-4 w-4 mr-2" />Reject Request
            </Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700" data-testid="cre-collect-confirm-btn">
              <CheckCircle2 className="h-4 w-4 mr-2" />Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== CRE REJECT REQUEST DIALOG ====================
          Mirrors the Accountant's "Reject Income" UI so the CRE flow feels
          consistent across the board. */}
      <Dialog open={creRejectDialog} onOpenChange={(o) => { setCreRejectDialog(o); if (!o) setCreRejectReason(''); }}>
        <DialogContent className="max-w-md" data-testid="cre-reject-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" /> Reject Payment Request
            </DialogTitle>
            <DialogDescription>
              The Planning user will be notified to correct and resubmit this request.
            </DialogDescription>
          </DialogHeader>
          {selectedPaymentStage && (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-3 text-xs space-y-1">
                <p><span className="text-gray-500">Project:</span> <span className="font-semibold">{selectedPaymentStage.project_name}</span></p>
                <p><span className="text-gray-500">Stage:</span> <span className="font-semibold">{selectedPaymentStage.stage_name || selectedPaymentStage.stage_label}</span></p>
                <p><span className="text-gray-500">Requested Amount:</span> <span className="font-bold text-red-700">₹{(selectedPaymentStage.amount || 0).toLocaleString('en-IN')}</span></p>
              </CardContent>
            </Card>
          )}
          <div>
            <Label className="text-sm">Reason for rejection *</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={4}
              value={creRejectReason}
              onChange={(e) => setCreRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              data-testid="cre-reject-reason"
            />
          </div>
          <Button
            onClick={handleRejectPaymentRequest}
            disabled={!creRejectReason.trim()}
            className="w-full bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
            data-testid="cre-reject-confirm-btn"
          >
            Confirm Reject
          </Button>
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

      <CreateClientPortalDialog
        project={portalProject}
        open={!!portalProject}
        onOpenChange={(v) => { if (!v) setPortalProject(null); }}
        onCreated={() => fetchData(false)}
      />

      {/* Payment Schedule — bulk delete confirmation. Mirrors the "type
          DELETE to confirm" UX used elsewhere. Refuses to submit until the
          word matches (case-insensitive). */}
      <Dialog open={psDeleteDialog.open} onOpenChange={(v) => !v && setPsDeleteDialog({ open: false, typed: '', submitting: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-700">Delete {psSelected.size} scheduled {psSelected.size === 1 ? 'entry' : 'entries'}?</DialogTitle>
            <DialogDescription>
              This will remove the selected rows from the monthly Payment Schedule. Addition rows are removed entirely (Planning can re-request later). Regular project stages are hidden from this month only — their underlying schedule is preserved.
              <br /><br />
              Type <span className="font-mono font-bold text-rose-700">delete</span> below to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Type delete here…"
            value={psDeleteDialog.typed}
            onChange={(e) => setPsDeleteDialog(s => ({ ...s, typed: e.target.value }))}
            data-testid="ps-delete-confirm-input"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPsDeleteDialog({ open: false, typed: '', submitting: false })} disabled={psDeleteDialog.submitting}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={psDeleteDialog.typed.trim().toLowerCase() !== 'delete' || psDeleteDialog.submitting}
              onClick={performPsBulkDelete}
              data-testid="ps-delete-confirm-submit"
            >
              {psDeleteDialog.submitting ? 'Deleting…' : `Delete ${psSelected.size}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
