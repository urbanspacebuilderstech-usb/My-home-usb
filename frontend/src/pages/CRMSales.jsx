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
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { MultiPaymentInput } from '../components/MultiPaymentInput';
import { NumericInput } from '../components/NumericInput';
import CreateProspectUserDialog from '../components/CreateProspectUserDialog';
import { 
  Target, LogOut, Search, Phone, PhoneOff, Mail, MapPin, ArrowRight, RefreshCw, Plus, X,
  GripVertical, Eye, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  Building2, Calculator, Download, LayoutGrid, List, Settings, Edit, Calendar, Send,
  MessageSquare, GitBranch, DollarSign, UserCheck, Users, Smartphone, ArrowUpDown
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { DayPicker } from 'react-day-picker';
import { generateREPDF } from '../utils/pdfGenerator';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// --- Contact masking ---
// Phone/email are hidden by default and revealed only on hover.
// Lost leads stay permanently masked (no hover reveal).
const isLeadLost = (l) => {
  const s = l?.current_stage_id || '';
  const st = l?.status || '';
  return s.includes('lost') || st === 'lost' || st === 'closed_lost';
};
const maskPhone = (p) => {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  if (digits.length < 4) return 'xxxxxxxx';
  return `${'x'.repeat(Math.max(0, digits.length - 4))} xxxx`;
};
const maskEmail = (e) => {
  if (!e) return '';
  const [user = '', domain = ''] = String(e).split('@');
  if (!domain) return 'xxxxx@xxxx.xxx';
  return `${'x'.repeat(Math.max(3, user.length))}@${domain}`;
};
const MaskedContact = ({ phone, email, lost, compact = false, withIcons = false }) => {
  const [revealed, setRevealed] = useState(false);
  const showRaw = revealed && !lost;
  return (
    <div
      className="space-y-0 min-w-0 cursor-default select-none"
      onMouseEnter={() => !lost && setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      data-testid="masked-contact"
    >
      {phone && (
        <p
          className={`${withIcons ? 'flex items-center gap-1 ' : ''}text-xs text-gray-600 truncate ${lost ? 'text-gray-400 italic' : ''}`}
          title={lost ? 'Hidden (Lost lead)' : (showRaw ? phone : 'Hover to reveal')}
        >
          {withIcons && <Phone className="h-3 w-3 inline" />} {showRaw ? phone : maskPhone(phone)}
        </p>
      )}
      {email && (
        <p
          className={`${withIcons ? 'flex items-center gap-1 ' : ''}${compact ? 'text-[10px] text-gray-500' : 'text-xs text-gray-600'} truncate ${lost ? 'text-gray-400 italic' : ''}`}
          title={lost ? 'Hidden (Lost lead)' : (showRaw ? email : 'Hover to reveal')}
        >
          {withIcons && <Mail className="h-3 w-3 inline" />} {showRaw ? email : maskEmail(email)}
        </p>
      )}
    </div>
  );
};

const RE_STATUS_CONFIG = {
  re_requested: { label: 'RE Requested', color: 'bg-amber-50 text-amber-700', icon: Clock },
  re_in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700', icon: RefreshCw },
  re_submitted: { label: 'Submitted', color: 'bg-purple-100 text-purple-700', icon: FileText },
  re_approved: { label: 'GM Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  re_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  sent_to_client: { label: 'Sent to Client', color: 'bg-blue-100 text-blue-700', icon: Send },
  client_feedback: { label: 'Client Feedback', color: 'bg-orange-100 text-orange-700', icon: MessageSquare },
  client_approved: { label: 'Client Approved', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  deal_closed: { label: 'Deal Closed', color: 'bg-emerald-100 text-emerald-700', icon: Target },
  converted: { label: 'Converted', color: 'bg-teal-100 text-teal-700', icon: Building2 }
};

export default function CRMSales() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'kanban' or 'list'
  const [sortOrder, setSortOrder] = useState('desc'); // newest first by default
  const [activeStage, setActiveStage] = useState('all');
  
  // Dialogs
  const [viewLeadDialog, setViewLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [reProjectDialog, setReProjectDialog] = useState(false);
  const [selectedREProject, setSelectedREProject] = useState(null);
  const [reRevisions, setReRevisions] = useState([]);
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', alternative_phone: '', source: 'other', address: '', city: '', state: '', pincode: '', notes: '', client_category: '', client_category_value: '', custom_fields: {} });
  const [customFields, setCustomFields] = useState([]);
  const [summary, setSummary] = useState('');
  const [followUpForm, setFollowUpForm] = useState({ date: '', note: '' });
  const [remarkForm, setRemarkForm] = useState('');
  const [detailTab, setDetailTab] = useState('overview');
  const [leadDetail, setLeadDetail] = useState(null);
  const [apptDialog, setApptDialog] = useState(false);
  const [apptForm, setApptForm] = useState({ date: '', time: '', type: '' });
  
  // Rough Estimate dialog
  const [roughEstDialog, setRoughEstDialog] = useState(false);
  const [roughEstForm, setRoughEstForm] = useState('');
  const [roughEstLeadId, setRoughEstLeadId] = useState(null);
  const [roughEstStageId, setRoughEstStageId] = useState(null);

  // Office Visit dialog
  const [officeVisitDialog, setOfficeVisitDialog] = useState(false);
  const [officeVisitForm, setOfficeVisitForm] = useState({ date: '', time: '', location: 'Office', remarks: '' });
  const [officeVisitLeadId, setOfficeVisitLeadId] = useState(null);

  
  // Client feedback dialog
  const [clientFeedbackDialog, setClientFeedbackDialog] = useState(false);
  const [clientFeedbackNotes, setClientFeedbackNotes] = useState('');
  const [clientFeedbackReId, setClientFeedbackReId] = useState(null);
  
  // Project Onboarding
  const [advanceDialog, setAdvanceDialog] = useState(false);
  const [advanceLead, setAdvanceLead] = useState(null);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', payment_mode: 'escrow', payment_reference: '', remarks: '' });
  const [planningDialog, setPlanningDialog] = useState(false);
  const [planningLead, setPlanningLead] = useState(null);
  const [projectDescription, setProjectDescription] = useState('');
  const [salesOverview, setSalesOverview] = useState(null);
  
  // Date Filter
  const [dateFilter, setDateFilter] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');
  
  // Follow-up Move dialog (when moving to Follow-up stage)
  const [followupMoveDialog, setFollowupMoveDialog] = useState(false);
  const [followupMoveLeadId, setFollowupMoveLeadId] = useState(null);
  const [followupMoveForm, setFollowupMoveForm] = useState({ date: '', time: '', remarks: '' });
  
  // Quick Follow-up dialog
  const [quickFollowupDialog, setQuickFollowupDialog] = useState(false);
  const [quickFollowupLeadId, setQuickFollowupLeadId] = useState(null);
  const [quickFollowupForm, setQuickFollowupForm] = useState({ date: '', time: '', remarks: '' });

  // RE-Client stage actions (Approved / Revision)
  const [reClientDialog, setReClientDialog] = useState(false);
  const [reClientAction, setReClientAction] = useState(null); // 'approved' | 'revision'
  const [reClientLead, setReClientLead] = useState(null);
  const [reClientRevisionReason, setReClientRevisionReason] = useState('');
  
  // CRE-style Convert Deal Dialog (triggered on drag to "Project Onboarded")
  const [convertDealDialog, setConvertDealDialog] = useState(false);
  const [convertDeal, setConvertDeal] = useState(null);
  const [convertDealRE, setConvertDealRE] = useState(null);
  const [convertForm, setConvertForm] = useState({ name: '', client_name: '', client_phone: '', client_email: '', location: '', sqft: '', building_type: 'residential', expected_start_date: '' });
  const [convertAdvanceAmount, setConvertAdvanceAmount] = useState('');
  const [convertPaymentEntries, setConvertPaymentEntries] = useState([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
  const [convertAccountantConfirmed, setConvertAccountantConfirmed] = useState(false);
  
  // Site Visit Dialogs
  const [clientLandDialog, setClientLandDialog] = useState(false);
  const [clientLandLead, setClientLandLead] = useState(null);
  const [srEngineers, setSrEngineers] = useState([]);
  const [selectedSrEngineer, setSelectedSrEngineer] = useState('');
  const [svVisitDate, setSvVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [svNotes, setSvNotes] = useState('');
  
  const [ongoingProjectDialog, setOngoingProjectDialog] = useState(false);
  const [ongoingProjectLead, setOngoingProjectLead] = useState(null);
  const [ongoingProjects, setOngoingProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  
  const [draggedLead, setDraggedLead] = useState(null);
  const [onboardingPendingStageId, setOnboardingPendingStageId] = useState(null);
  
  // Follow-up date filter
  // (date filter moved to top)
  const [followupDialog, setFollowupDialog] = useState(false);
  const [followupLeadId, setFollowupLeadId] = useState(null);
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('');
  const [followupNote, setFollowupNote] = useState('');
  const [followupPendingStageId, setFollowupPendingStageId] = useState(null);
  
  // Remarks dialog (Discussion, Deal Closed, RE-To Client, Lost)
  const [remarksDialog, setRemarksDialog] = useState(false);
  // Create-Prospect-Login popup (Move to RE Client mobile flow) — DEPRECATED, kept for old flows only
  const [prospectDialog, setProspectDialog] = useState({ open: false, lead: null });
  // Quote-link state for the currently-open lead (Live / Expired chip + URL)
  const [quoteLink, setQuoteLink] = useState({ status: 'none', link: null });
  const [quoteLinkLoading, setQuoteLinkLoading] = useState(false);
  // Regenerate-RE remarks dialog
  const [regenDialog, setRegenDialog] = useState({ open: false, lead: null });
  // Reassign — change lead owner to another salesperson
  const [reassignDialog, setReassignDialog] = useState({ open: false, lead: null, new_owner: '', reason: '', submitting: false });
  const [reassignOptions, setReassignOptions] = useState([]);

  // Load eligible owners (sales / pre_sales role users) when reassign dialog opens
  useEffect(() => {
    if (!reassignDialog.open) return;
    (async () => {
      try {
        const stageType = reassignDialog.lead?.stage_type || 'sales';
        const res = await axios.get(`${API}/crm/reassign-targets`, { params: { stage_type: stageType } });
        const list = Array.isArray(res.data) ? res.data : (res.data?.users || []);
        const filtered = list
          .filter(u => u.is_active !== false && u.user_id !== reassignDialog.lead?.assigned_to)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setReassignOptions(filtered);
      } catch {
        setReassignOptions([]);
      }
    })();
  }, [reassignDialog.open, reassignDialog.lead?.lead_id, reassignDialog.lead?.assigned_to, reassignDialog.lead?.stage_type]);

  const handleReassignSubmit = async () => {
    if (!reassignDialog.lead?.lead_id || !reassignDialog.new_owner) {
      toast.error('Pick a salesperson to reassign to');
      return;
    }
    setReassignDialog(d => ({ ...d, submitting: true }));
    try {
      await axios.post(`${API}/crm/leads/${reassignDialog.lead.lead_id}/reassign`, {
        new_owner_user_id: reassignDialog.new_owner,
        reason: reassignDialog.reason || null,
      });
      const newName = (reassignOptions.find(u => u.user_id === reassignDialog.new_owner) || {}).name || '';
      toast.success(`Lead reassigned to ${newName}`);
      setReassignDialog({ open: false, lead: null, new_owner: '', reason: '', submitting: false });
      fetchData();
    } catch (e) {
      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to reassign');
      setReassignDialog(d => ({ ...d, submitting: false }));
    }
  };
  const [regenRemarks, setRegenRemarks] = useState('');
  const [remarksLeadId, setRemarksLeadId] = useState(null);
  const [remarksStageId, setRemarksStageId] = useState(null);
  const [remarksStageName, setRemarksStageName] = useState('');
  const [remarksText, setRemarksText] = useState('');
  const [lostReasonText, setLostReasonText] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, dashboardRes, stagesRes, leadsRes, customFieldsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/sales/dashboard`),
        axios.get(`${API}/crm/stages?stage_type=sales`),
        axios.get(`${API}/crm/sales/leads`),
        axios.get(`${API}/crm/custom-fields`)
      ]);
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setStages(stagesRes.data);
      setLeads(leadsRes.data);
      if (customFieldsRes?.data) setCustomFields(customFieldsRes.data);
      
      // Fetch sales overview
      try {
        const overviewRes = await axios.get(`${API}/crm/sales-overview`);
        setSalesOverview(overviewRes.data);
      } catch { /* ignore */ }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        toast.error('Access denied. Sales access required.');
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

  const handleStageChange = async (leadId, newStageId, roughRequirement = null) => {
    try {
      const stage = stages.find(s => s.stage_id === newStageId);
      
      // Intercept: Show rough requirement popup for "RE - Request"
      if (stage?.stage_id === 'stg_re_requested' && !roughRequirement) {
        setRoughEstLeadId(leadId);
        setRoughEstStageId(newStageId);
        setRoughEstForm('');
        setRoughEstDialog(true);
        return;
      }
      
      // Intercept: Show Office Visit dialog
      if (stage?.stage_id === 'stg_sales_office_visit') {
        setOfficeVisitLeadId(leadId);
        setOfficeVisitForm({ date: '', time: '', location: 'Office', remarks: '' });
        setOfficeVisitDialog(true);
        return;
      }
      
      // Intercept: Show CRE-style Convert Deal popup for "Deal Close" (stg_payment_collect)
      // Lead MUST go through this dialog — backend rejects direct stage moves to stg_payment_collect.
      if (stage?.stage_id === 'stg_payment_collect') {
        const lead = leads.find(l => l.lead_id === leadId);
        if (lead) {
          openConvertDealFromSales(lead);
        } else {
          toast.error('Could not find lead. Refresh and try again.');
        }
        return;  // Always block — never let the PATCH happen for Deal Close.
      }
      
      // Intercept: Show follow-up date dialog for "Follow-up"
      if (stage?.stage_id === 'stg_sales_followup') {
        setFollowupLeadId(leadId);
        setFollowupPendingStageId(newStageId);
        setFollowupDate(new Date().toISOString().split('T')[0]);
        setFollowupTime('');
        setFollowupNote('');
        setFollowupDialog(true);
        return;
      }
      
      // Intercept: Show Sr. Engineer assignment popup for "Site Visit (Client Land)"
      if (stage?.stage_id === 'stg_sv_client_land') {
        const lead = leads.find(l => l.lead_id === leadId);
        if (lead) {
          openClientLandVisit(lead);
          return;
        }
      }
      
      // Intercept: Show ongoing projects popup for "Site Visit (Our Projects)"
      if (stage?.stage_id === 'stg_sv_our_projects') {
        const lead = leads.find(l => l.lead_id === leadId);
        if (lead) {
          openOngoingProjectVisit(lead);
          return;
        }
      }
      
      // Intercept: For RE-Client, auto-generate the public quote link
      // (replaces the old prospect-login flow). The backend also moves
      // the lead to "RE Sent to Client" stage.
      if (['stg_re_to_client'].includes(stage?.stage_id)) {
        const lead = leads.find(l => l.lead_id === leadId);
        if (lead) {
          handleGenerateQuoteLink(lead);
          return;
        }
      }
      
      // Intercept: Show lost reason dialog
      if (stage?.stage_id === 'stg_lost') {
        setRemarksLeadId(leadId);
        setRemarksStageId(newStageId);
        setRemarksStageName('Lost');
        setLostReasonText('');
        setRemarksDialog(true);
        return;
      }
      
      // Block manual move to Project Onboarded
      if (stage?.stage_id === 'stg_project_onboarded') {
        toast.error('Project Onboarded is auto-moved after accountant approval');
        return;
      }
      
      // Block manual move to RE - From Planning
      if (stage?.stage_id === 'stg_re_from_planning') {
        toast.error('RE - From Planning is auto-populated when GM approves the RE');
        return;
      }
      
      const payload = { stage_id: newStageId };
      if (roughRequirement) {
        payload.rough_requirement = roughRequirement;
      }
      
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, payload);
      
      if (result.data.re_project_created) {
        toast.success('Rough Estimate Project created! Planning team notified.');
      } else if (result.data.re_already_exists) {
        toast.info('Existing RE updated. Planning team already has the request.');
      } else if (stage?.stage_id === 'stg_payment_collect') {
        toast.success('Deal Close! Sent to CRE for project creation.');
      } else {
        toast.success('Lead stage updated');
      }
      
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update stage');
    }
  };

  const handleSubmitRoughEstimate = async () => {
    if (!roughEstForm.trim()) {
      toast.error('Please enter the rough requirement');
      return;
    }
    setRoughEstDialog(false);
    await handleStageChange(roughEstLeadId, roughEstStageId, roughEstForm);
  };

  const handleOfficeVisitSubmit = async () => {
    if (!officeVisitForm.date) { toast.error('Please select a date'); return; }
    if (!officeVisitForm.time) { toast.error('Please select a time'); return; }
    try {
      await axios.patch(`${API}/crm/leads/${officeVisitLeadId}/stage`, {
        stage_id: 'stg_sales_office_visit',
        office_visit_date: officeVisitForm.date,
        office_visit_time: officeVisitForm.time,
        office_visit_location: officeVisitForm.location,
        office_visit_remarks: officeVisitForm.remarks,
      });
      toast.success('Office visit scheduled');
      setOfficeVisitDialog(false);
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to schedule office visit');
    }
  };

  const handleViewREProject = async (reProjectId) => {
    try {
      const res = await axios.get(`${API}/crm/re-projects/${reProjectId}`);
      setSelectedREProject(res.data);
      setReProjectDialog(true);
      // Load all revisions for this RE number
      if (res.data.parent_re_number) {
        try {
          const revRes = await axios.get(`${API}/crm/re-projects/by-number/${res.data.parent_re_number}`);
          setReRevisions(revRes.data || []);
        } catch { setReRevisions([res.data]); }
      } else {
        setReRevisions([res.data]);
      }
    } catch (error) {
      toast.error('Failed to load RE project');
    }
  };

  // Send RE to client
  const handleSendToClient = async () => {
    if (!selectedREProject) return;
    try {
      await axios.post(`${API}/crm/re-projects/${selectedREProject.re_project_id}/send-to-client`);
      toast.success('RE sent to client');
      setSelectedREProject({ ...selectedREProject, status: 'sent_to_client' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to send');
    }
  };

  // Open client feedback dialog
  const openClientFeedbackDialog = () => {
    setClientFeedbackReId(selectedREProject.re_project_id);
    setClientFeedbackNotes('');
    setClientFeedbackDialog(true);
  };

  // Submit client feedback
  const handleSubmitClientFeedback = async () => {
    try {
      await axios.post(`${API}/crm/re-projects/${clientFeedbackReId}/client-feedback`, {
        feedback_notes: clientFeedbackNotes
      });
      toast.success('Client feedback submitted. Planning will be notified.');
      setClientFeedbackDialog(false);
      setSelectedREProject({ ...selectedREProject, status: 'client_feedback', client_feedback_notes: clientFeedbackNotes });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit feedback');
    }
  };

  // Client approved
  const handleClientApprove = async () => {
    if (!selectedREProject) return;
    try {
      await axios.post(`${API}/crm/re-projects/${selectedREProject.re_project_id}/client-approve`);
      toast.success('RE marked as client-approved!');
      setSelectedREProject({ ...selectedREProject, status: 'client_approved' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to approve');
    }
  };

  // Request Revision
  const handleRequestRevision = async () => {
    if (!selectedREProject) return;
    const reason = window.prompt('Reason for requesting revision (optional):');
    if (reason === null) return; // user cancelled
    try {
      await axios.post(`${API}/crm/re-projects/${selectedREProject.re_project_id}/request-revision`, { reason });
      toast.success('Revision requested. Planning team notified.');
      setSelectedREProject({ ...selectedREProject, revision_requested: true });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request revision');
    }
  };
  
  // Remarks stage move (Discussion, Deal Closed, RE-To Client, Lost)
  const handleRemarksStageMove = async () => {
    if (!remarksLeadId || !remarksStageId) return;
    try {
      const payload = { stage_id: remarksStageId };
      if (remarksStageId === 'stg_lost') {
        if (!lostReasonText.trim()) {
          toast.error('Please enter a reason for marking as Lost');
          return;
        }
        payload.lost_reason = lostReasonText;
      } else {
        payload.remark = remarksText;
      }
      await axios.patch(`${API}/crm/leads/${remarksLeadId}/stage`, payload);
      toast.success(`Lead moved to ${remarksStageName}`);
      setRemarksDialog(false);
      setViewLeadDialog(false);
      setRemarksLeadId(null);
      setRemarksStageId(null);
      setRemarksText('');
      setLostReasonText('');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to move lead');
    }
  };

  // Advance Payment Collection
  const openAdvanceDialog = (lead) => {
    setAdvanceLead(lead);
    setAdvanceForm({ amount: '', payment_mode: 'escrow', payment_reference: '', remarks: '' });
    setAdvanceDialog(true);
  };

  const handleCollectAdvance = async () => {
    if (!advanceLead || !advanceForm.amount) return;
    try {
      // If triggered from drag-and-drop stage change, first move the lead to "Project Onboarded"
      if (onboardingPendingStageId) {
        await axios.patch(`${API}/crm/leads/${advanceLead.lead_id}/stage`, { stage_id: onboardingPendingStageId });
      }
      
      await axios.post(`${API}/crm/leads/${advanceLead.lead_id}/collect-advance`, {
        advance_amount: parseFloat(advanceForm.amount),
        payment_mode: advanceForm.payment_mode,
        payment_reference: advanceForm.payment_reference,
        remarks: advanceForm.remarks
      });
      toast.success(onboardingPendingStageId ? 'Lead moved to Project Onboarded & advance collected!' : 'Advance payment collected!');
      setAdvanceDialog(false);
      setOnboardingPendingStageId(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to collect advance');
    }
  };

  const handleSendToAccountant = async (lead) => {
    try {
      await axios.post(`${API}/crm/leads/${lead.lead_id}/send-to-accountant`);
      toast.success('Sent to accountant for verification');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to send');
    }
  };

  const handleScheduleFollowup = async () => {
    if (!followupLeadId || !followupDate) return;
    try {
      await axios.post(`${API}/crm/leads/${followupLeadId}/follow-ups`, {
        scheduled_date: followupDate,
        scheduled_time: followupTime || null,
        note: followupNote || 'Follow-up scheduled'
      });
      
      // If triggered by stage move, also move the lead
      if (followupPendingStageId) {
        await axios.patch(`${API}/crm/leads/${followupLeadId}/stage`, { stage_id: followupPendingStageId });
        toast.success('Follow-up scheduled & lead moved');
      } else {
        toast.success('Follow-up scheduled');
      }
      
      setFollowupDialog(false);
      setFollowupLeadId(null);
      setFollowupDate('');
      setFollowupTime('');
      setFollowupNote('');
      setFollowupPendingStageId(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to schedule follow-up');
    }
  };

  const handleQuickFollowup = async () => {
    if (!quickFollowupLeadId || !quickFollowupForm.date) {
      toast.error('Please select a date');
      return;
    }
    try {
      await axios.post(`${API}/crm/leads/${quickFollowupLeadId}/follow-ups`, {
        scheduled_date: quickFollowupForm.date,
        scheduled_time: quickFollowupForm.time || null,
        note: quickFollowupForm.remarks || 'Follow-up scheduled'
      });
      toast.success('Follow-up scheduled');
      setQuickFollowupDialog(false);
      setQuickFollowupLeadId(null);
      setQuickFollowupForm({ date: '', time: '', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to schedule follow-up');
    }
  };

  // ----- RE-Client stage actions -----
  const openReClientAction = (lead, action) => {
    setReClientLead(lead);
    setReClientAction(action);
    setReClientRevisionReason('');
    setReClientDialog(true);
  };

  const handleReClientAction = async () => {
    if (!reClientLead || !reClientAction) return;
    try {
      if (reClientAction === 'approved') {
        await axios.post(`${API}/crm/leads/${reClientLead.lead_id}/re-client-approve`);
        toast.success('Client approved RE! Lead moved to Negotiation.');
      } else if (reClientAction === 'revision') {
        if (!reClientRevisionReason.trim()) {
          toast.error('Please enter a revision reason');
          return;
        }
        const res = await axios.post(`${API}/crm/leads/${reClientLead.lead_id}/re-client-revision`, {
          reason: reClientRevisionReason.trim(),
        });
        toast.success(res.data.message || 'Revision created. Lead back to RE-Request.');
      }
      setReClientDialog(false);
      setReClientLead(null);
      setReClientAction(null);
      setReClientRevisionReason('');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Action failed');
    }
  };

  // Site Visit: Client Land - open popup with Sr. Engineers
  const openClientLandVisit = async (lead) => {
    setClientLandLead(lead);
    setSelectedSrEngineer('');
    setSvVisitDate(new Date().toISOString().split('T')[0]);
    setSvNotes('');
    try {
      const res = await axios.get(`${API}/crm/sr-site-engineers`);
      setSrEngineers(res.data);
    } catch { setSrEngineers([]); }
    setClientLandDialog(true);
  };

  const handleAssignClientLandVisit = async () => {
    if (!clientLandLead || !selectedSrEngineer) return;
    try {
      await axios.post(`${API}/crm/leads/${clientLandLead.lead_id}/assign-site-visit`, {
        visit_type: 'client_land',
        sr_engineer_id: selectedSrEngineer,
        visit_date: svVisitDate,
        notes: svNotes
      });
      toast.success('Site visit assigned to Sr. Engineer');
      setClientLandDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to assign');
    }
  };

  // Site Visit: Ongoing Project - open popup with project list
  const openOngoingProjectVisit = async (lead) => {
    setOngoingProjectLead(lead);
    setSelectedProject(null);
    setProjectSearch('');
    setSvVisitDate(new Date().toISOString().split('T')[0]);
    setSvNotes('');
    try {
      const res = await axios.get(`${API}/crm/ongoing-projects`);
      setOngoingProjects(res.data);
    } catch { setOngoingProjects([]); }
    setOngoingProjectDialog(true);
  };

  const handleAssignOngoingProjectVisit = async () => {
    if (!ongoingProjectLead || !selectedProject) return;
    try {
      await axios.post(`${API}/crm/leads/${ongoingProjectLead.lead_id}/assign-site-visit`, {
        visit_type: 'ongoing_project',
        project_id: selectedProject.project_id,
        visit_date: svVisitDate,
        notes: svNotes
      });
      toast.success('Site visit assigned');
      setOngoingProjectDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to assign');
    }
  };

  // CRE-style Convert Deal from Sales (triggered on drag to "Project Onboarded")
  const openConvertDealFromSales = async (lead) => {
    setConvertDeal(lead);
    setConvertAdvanceAmount('');
    setConvertAccountantConfirmed(false);
    setConvertPaymentEntries([{ amount: '', payment_mode: 'bank_transfer', reference: '', cheque_details: [] }]);
    let reData = null;
    if (lead.re_project_id) {
      try { const reRes = await axios.get(`${API}/crm/re-projects/${lead.re_project_id}`); reData = reRes.data; } catch { reData = null; }
    }
    setConvertDealRE(reData);
    setConvertForm({
      name: reData?.project_name || lead.name || '',
      client_name: lead.name || '',
      client_phone: lead.phone || '',
      client_email: lead.email || '',
      location: reData?.location || lead.city || '',
      sqft: reData?.sqft || lead.custom_fields?.sqft || '',
      building_type: reData?.building_type || 'residential',
      expected_start_date: new Date().toISOString().split('T')[0],
    });
    setConvertDealDialog(true);
  };

  const handleConvertDealFromSales = async () => {
    if (!convertDeal) return;
    const projectName = convertForm.name || convertDeal.name;
    const clientName = convertForm.client_name || convertDeal.name;
    const location = convertForm.location || convertDeal.city;
    if (!projectName?.trim()) { toast.error('Project name is required'); return; }
    if (!clientName?.trim()) { toast.error('Client name is required'); return; }
    if (!location?.trim()) { toast.error('Location is required'); return; }
    if (!convertAdvanceAmount || parseFloat(convertAdvanceAmount) <= 0) { toast.error('Please enter advance amount'); return; }
    const totalPayEntries = convertPaymentEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    if (convertPaymentEntries.length === 0 || totalPayEntries <= 0) { toast.error('Add at least one payment entry'); return; }
    if (Math.abs(totalPayEntries - parseFloat(convertAdvanceAmount)) > 1) { toast.error(`Payment entries (₹${totalPayEntries.toLocaleString('en-IN')}) must equal advance amount (₹${parseFloat(convertAdvanceAmount).toLocaleString('en-IN')})`); return; }
    if (!convertAccountantConfirmed) { toast.error('Please confirm accountant verification'); return; }
    try {
      const endpoint = convertDeal.re_project_id
        ? `${API}/cre/convert-re-project/${convertDeal.re_project_id}`
        : `${API}/cre/convert-deal/${convertDeal.lead_id}`;
      await axios.post(endpoint, {
        project_name: projectName, client_name: clientName,
        client_phone: convertForm.client_phone || convertDeal.phone,
        client_email: convertForm.client_email || convertDeal.email,
        location, sqft: convertForm.sqft ? parseFloat(convertForm.sqft) : null,
        building_type: convertForm.building_type, expected_start_date: convertForm.expected_start_date,
        advance_amount: parseFloat(convertAdvanceAmount),
        payment_entries: convertPaymentEntries.map(e => ({
          amount: parseFloat(e.amount) || 0,
          payment_mode: e.payment_mode,
          reference: e.reference || '',
          payment_date: e.payment_date || new Date().toISOString().split('T')[0],
          cheque_details: e.payment_mode === 'cheque' ? e.cheque_details : null
        })),
        payment_mode: convertPaymentEntries[0]?.payment_mode || 'cash',
        payment_reference: convertPaymentEntries[0]?.reference || '',
        accountant_confirmed: convertAccountantConfirmed,
      });
      toast.success('Project created! Goes to Accountant for verification.');
      setConvertDealDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create project');
    }
  };

  const openPlanningDialog = (lead) => {
    setPlanningLead(lead);
    setProjectDescription('');
    setPlanningDialog(true);
  };

  const handleMoveToPlanningSubmit = async () => {
    if (!planningLead || !projectDescription.trim()) return;
    try {
      const res = await axios.post(`${API}/crm/leads/${planningLead.lead_id}/move-to-planning`, {
        project_description: projectDescription
      });
      toast.success(`Project created: ${res.data.project_code}. Moved to Planning!`);
      setPlanningDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to move to planning');
    }
  };

  const openLeadDetail = async (lead) => {
    setSelectedLead(lead);
    setDetailTab('overview');
    setViewLeadDialog(true);
    setQuoteLink({ status: 'none', link: null });
    // Fetch full lead detail
    try {
      const res = await axios.get(`${API}/crm/leads/${lead.lead_id}`);
      setLeadDetail(res.data);
      setSummary(res.data.summary || '');
    } catch {
      setLeadDetail(lead);
      setSummary(lead.summary || '');
    }
    // Fetch the active quote link (for the Live/Expired chip)
    fetchQuoteLink(lead.lead_id);
  };

  const fetchQuoteLink = async (leadId) => {
    try {
      const res = await axios.get(`${API}/leads/${leadId}/quote-link`);
      setQuoteLink(res.data || { status: 'none', link: null });
    } catch {
      setQuoteLink({ status: 'none', link: null });
    }
  };

  const buildPublicQuoteUrl = (token) => `${window.location.origin}/quote/${token}`;

  const handleGenerateQuoteLink = async (lead) => {
    if (!lead) return;
    setQuoteLinkLoading(true);
    try {
      const res = await axios.post(`${API}/leads/${lead.lead_id}/generate-quote-link`, {});
      const url = buildPublicQuoteUrl(res.data.token);
      setQuoteLink({ status: 'live', link: res.data });
      try { await navigator.clipboard.writeText(url); toast.success('RE link generated & copied to clipboard'); }
      catch { toast.success('RE link generated'); }
      // Refresh lead so stage moves to RE-To-Client are reflected
      try {
        const lr = await axios.get(`${API}/crm/leads/${lead.lead_id}`);
        setLeadDetail(lr.data);
        setSelectedLead(lr.data);
      } catch {}
      fetchData(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not generate link');
    } finally {
      setQuoteLinkLoading(false);
    }
  };

  const handleCopyQuoteLink = async () => {
    const token = quoteLink?.link?.token;
    if (!token) return;
    try { await navigator.clipboard.writeText(buildPublicQuoteUrl(token)); toast.success('Link copied'); }
    catch { toast.error('Could not copy'); }
  };

  const handleRegenerateRE = async () => {
    const lead = regenDialog.lead;
    if (!lead) return;
    if (!regenRemarks.trim()) { toast.error('Please add remarks for Planning'); return; }
    try {
      await axios.post(`${API}/leads/${lead.lead_id}/regenerate-re`, { remarks: regenRemarks.trim() });
      toast.success('Regeneration request sent to Planning');
      setRegenDialog({ open: false, lead: null });
      setRegenRemarks('');
      try {
        const lr = await axios.get(`${API}/crm/leads/${lead.lead_id}`);
        setLeadDetail(lr.data);
        setSelectedLead(lr.data);
      } catch {}
      fetchData(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not regenerate RE');
    }
  };

  const openEditDialog = (lead) => {
    setEditForm({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      alternative_phone: lead.alternative_phone || '',
      source: lead.source || 'other',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      pincode: lead.pincode || '',
      notes: lead.notes || '',
      client_category: lead.client_category || '',
      client_category_value: lead.client_category_value || '',
      custom_fields: lead.custom_fields || {}
    });
    setEditDialog(true);
  };

  const handleUpdateLead = async () => {
    if (!editForm.name.trim()) { toast.error('Name is required'); return; }
    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}`, editForm);
      toast.success('Lead updated');
      setEditDialog(false);
      fetchData(false);
      // Refresh detail
      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setLeadDetail(res.data);
      setSelectedLead(res.data);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update');
    }
  };

  const handleSaveSummary = async () => {
    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}`, { summary });
      toast.success('Summary saved');
    } catch (error) {
      toast.error('Failed to save summary');
    }
  };

  const handleAddFollowUp = async () => {
    if (!followUpForm.date) { toast.error('Date is required'); return; }
    try {
      await axios.post(`${API}/crm/leads/${selectedLead.lead_id}/follow-ups`, {
        scheduled_date: followUpForm.date,
        note: followUpForm.note
      });
      toast.success('Follow-up scheduled');
      setFollowUpForm({ date: '', note: '' });
      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setLeadDetail(res.data);
    } catch (error) {
      toast.error('Failed to add follow-up');
    }
  };

  const handleCompleteFollowUp = async (fuId) => {
    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}/follow-ups/${fuId}/complete`);
      toast.success('Follow-up completed');
      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setLeadDetail(res.data);
    } catch (error) {
      toast.error('Failed to complete follow-up');
    }
  };

  const handleAddRemark = async () => {
    if (!remarkForm.trim()) { toast.error('Remark is empty'); return; }
    try {
      await axios.post(`${API}/crm/leads/${selectedLead.lead_id}/remarks`, {
        remark: remarkForm,
        remark_type: 'general'
      });
      toast.success('Remark added');
      setRemarkForm('');
      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setLeadDetail(res.data);
    } catch (error) {
      toast.error('Failed to add remark');
    }
  };

  const openApptDialog = () => {
    const appt = (leadDetail || selectedLead)?.appointment;
    setApptForm({
      date: appt?.appointment_date || '',
      time: appt?.appointment_time || '',
      type: appt?.appointment_type || ''
    });
    setApptDialog(true);
  };

  const handleSaveAppointment = async () => {
    if (!apptForm.date || !apptForm.time || !apptForm.type) {
      toast.error('Please fill all appointment fields');
      return;
    }
    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}/appointment`, {
        appointment_date: apptForm.date,
        appointment_time: apptForm.time,
        appointment_type: apptForm.type
      });
      toast.success('Appointment saved');
      setApptDialog(false);
      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setLeadDetail(res.data);
      setSelectedLead(res.data);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to save appointment');
    }
  };

  // Generate PDF handler
  const handleGenerateREPDF = async () => {
    if (!selectedREProject) return;
    try {
      await generateREPDF(selectedREProject);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    if (draggedLead && draggedLead.current_stage_id !== stageId) {
      await handleStageChange(draggedLead.lead_id, stageId);
    }
    setDraggedLead(null);
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    
    // Date filter
    let matchesDate = true;
    if (dateFilter) {
      let datesToCheck = [];
      if (lead.current_stage_id === 'stg_sales_followup') {
        datesToCheck = (lead.follow_ups || []).map(f => f.scheduled_date).filter(Boolean);
        if (lead.next_followup_date) datesToCheck.push(lead.next_followup_date);
      } else if (lead.current_stage_id === 'stg_sales_office_visit') {
        if (lead.office_visit?.date) datesToCheck.push(lead.office_visit.date);
      } else if (lead.current_stage_id === 'stg_site_visit' || lead.current_stage_id === 'stg_sv_client_land' || lead.current_stage_id === 'stg_sv_our_projects') {
        if (lead.site_visit_data?.visit_date) datesToCheck.push(lead.site_visit_data.visit_date);
      } else {
        if (lead.created_at) datesToCheck.push(lead.created_at.split('T')[0]);
        const lastMove = (lead.stage_history || []).slice(-1)[0];
        if (lastMove?.moved_at) datesToCheck.push(lastMove.moved_at.split('T')[0]);
      }
      if (datesToCheck.length === 0 && lead.created_at) datesToCheck.push(lead.created_at.split('T')[0]);
      
      if (dateFilterEnd) {
        matchesDate = datesToCheck.some(d => d >= dateFilter && d <= dateFilterEnd);
      } else {
        matchesDate = datesToCheck.includes(dateFilter);
      }
    }
    
    return matchesSearch && matchesDate;
  }).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortOrder === 'desc' ? tb - ta : ta - tb;
  });

  const getLeadsByStage = (stageId) => {
    let stageLeads;
    if (stageId === 'revision') {
      stageLeads = filteredLeads.filter(lead => (lead.re_revision_number || 0) > 0 && lead.current_stage_id === 'stg_re_requested');
    } else if (stageId === 'P1' || stageId === 'P2' || stageId === 'P3') {
      stageLeads = filteredLeads.filter(lead => (lead.client_category || '') === stageId);
    } else {
      stageLeads = filteredLeads.filter(lead => lead.current_stage_id === stageId);
    }
    // filteredLeads is already sorted by created_at per sortOrder; preserve that here.
    return stageLeads;
  };

  // Pick the most meaningful "deal amount" for a lead — used in dashboard chip totals
  const parseAmountFromText = (raw) => {
    if (!raw) return 0;
    const s = String(raw).toLowerCase().replace(/[₹,\s]/g, '');
    // Match the first numeric portion (incl. decimals) optionally followed by k / l / lak(h) / c / cr
    const m = s.match(/(\d+(?:\.\d+)?)\s*(cr|crore|crores|l|lak|lakh|lakhs|k|thousand|thousands)?/i);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    if (!isFinite(num) || num <= 0) return 0;
    const unit = (m[2] || '').toLowerCase();
    if (unit.startsWith('cr')) return num * 10000000;
    if (unit.startsWith('l') || unit.startsWith('lak')) return num * 100000;
    if (unit.startsWith('k') || unit.startsWith('thou')) return num * 1000;
    return num;
  };
  const getLeadAmount = (lead) => {
    if (!lead) return 0;
    // 1) Salesperson's free-text "P1/P2/P3 value" — most explicit signal of the deal size
    const fromCategory = parseAmountFromText(lead?.client_category_value);
    if (fromCategory > 0) return fromCategory;
    const advance = Number(lead?.advance_payment?.advance_amount) || 0;
    const re = Number(lead?.re_total_amount) || Number(lead?.quoted_amount) || 0;
    const direct = Number(lead?.amount) || Number(lead?.total_amount) || Number(lead?.deal_amount) || 0;
    // 2) Fallback to budget custom field text ("50L - 1Cr" → 50L)
    const cf = lead?.custom_fields || {};
    const budgetText = cf.budget || cf.Budget || cf.cf_budget || '';
    const fromBudget = parseAmountFromText(budgetText);
    return advance || re || direct || fromBudget || 0;
  };
  const sumAmount = (leads) => leads.reduce((acc, l) => acc + getLeadAmount(l), 0);
  // Short ₹ formatter: 1.2L / 12.5L / 1.05Cr
  const formatINRShort = (n) => {
    const v = Number(n) || 0;
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(v >= 100000000 ? 0 : 2)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(v >= 1000000 ? 1 : 2)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
    return `₹${v.toFixed(0)}`;
  };

  const getStageName = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage?.name || stageId;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (loading && !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-full mx-auto px-4 py-6 sm:px-6">
        {/* All Stages Summary — matches Pre-Sales style, wraps to 2 rows */}
        {stages.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 sm:gap-3" data-testid="sales-stages-summary">
              <button
                onClick={() => setActiveStage('all')}
                data-testid="stage-chip-all"
                className={`flex flex-col items-center justify-center rounded-2xl px-1.5 py-2.5 sm:py-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${activeStage === 'all' ? 'ring-2 ring-emerald-500' : ''}`}
                style={{ backgroundColor: '#10b981', color: '#fff' }}
              >
                <span className="text-[9px] sm:text-[10px] font-medium opacity-90 truncate w-full text-center">All Leads</span>
                <span className="text-base sm:text-xl font-bold mt-0.5 leading-tight">{filteredLeads.length}</span>
              </button>
              {stages.map((stage) => {
                const stageLeads = getLeadsByStage(stage.stage_id);
                const count = stageLeads.length;
                const isActive = activeStage === stage.stage_id;
                return (
                  <button
                    key={stage.stage_id}
                    onClick={() => setActiveStage(stage.stage_id)}
                    data-testid={`stage-chip-${stage.stage_id}`}
                    className={`flex flex-col items-center justify-center rounded-2xl px-1.5 py-2.5 sm:py-3 shadow-sm border transition-all hover:shadow-md hover:-translate-y-0.5 ${isActive ? 'ring-2' : ''}`}
                    style={{
                      backgroundColor: isActive ? stage.color : stage.color + '15',
                      borderColor: stage.color + '30',
                      color: isActive ? '#ffffff' : stage.color,
                      '--tw-ring-color': stage.color,
                    }}
                  >
                    <span className="text-[9px] sm:text-[10px] font-medium text-center leading-tight line-clamp-2 w-full px-0.5">
                      {stage.name}
                    </span>
                    <span className="text-base sm:text-xl font-bold mt-0.5 leading-tight">{count}</span>
                  </button>
                );
              })}

              {/* Revision chip — RE-Requested leads with revision > 0 */}
              {(() => {
                const revLeads = filteredLeads.filter(l => (l.re_revision_number || 0) > 0 && l.current_stage_id === 'stg_re_requested');
                const revCount = revLeads.length;
                const isActive = activeStage === 'revision';
                const color = '#f97316';
                return (
                  <button
                    onClick={() => setActiveStage('revision')}
                    data-testid="stage-chip-revision"
                    className={`flex flex-col items-center justify-center rounded-2xl px-1.5 py-2.5 sm:py-3 shadow-sm border transition-all hover:shadow-md hover:-translate-y-0.5 ${isActive ? 'ring-2' : ''}`}
                    style={{
                      backgroundColor: isActive ? color : color + '15',
                      borderColor: color + '30',
                      color: isActive ? '#ffffff' : color,
                      '--tw-ring-color': color,
                    }}
                  >
                    <span className="text-[9px] sm:text-[10px] font-medium text-center leading-tight line-clamp-2 w-full px-0.5 flex items-center gap-0.5 justify-center">
                      <RefreshCw className="h-3 w-3" /> Revision
                    </span>
                    <span className="text-base sm:text-xl font-bold mt-0.5 leading-tight">{revCount}</span>
                  </button>
                );
              })()}

              {/* Client Category chips — P1 / P2 / P3 priority tiers */}
              {[
                { key: 'P1', color: '#dc2626' },  // red — hottest
                { key: 'P2', color: '#f59e0b' },  // amber — warm
                { key: 'P3', color: '#3b82f6' },  // blue — cold/info
              ].map(({ key, color }) => {
                const catLeads = filteredLeads.filter(l => (l.client_category || '') === key);
                const count = catLeads.length;
                const amount = sumAmount(catLeads);
                const isActive = activeStage === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveStage(key)}
                    data-testid={`stage-chip-${key.toLowerCase()}`}
                    className={`flex flex-col items-center justify-center rounded-2xl px-1.5 py-2.5 sm:py-3 shadow-sm border transition-all hover:shadow-md hover:-translate-y-0.5 ${isActive ? 'ring-2' : ''}`}
                    style={{
                      backgroundColor: isActive ? color : color + '15',
                      borderColor: color + '30',
                      color: isActive ? '#ffffff' : color,
                      '--tw-ring-color': color,
                    }}
                  >
                    <span className="text-[9px] sm:text-[10px] font-medium text-center leading-tight line-clamp-2 w-full px-0.5">
                      {key}
                    </span>
                    <span className="text-base sm:text-xl font-bold mt-0.5 leading-tight">{count}</span>
                    <span className="text-[9px] sm:text-[10px] font-medium opacity-80 mt-0.5">{formatINRShort(amount)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search + Date Filter + View Toggle */}
        <div className="flex gap-3 mb-6 items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-input"
            />
          </div>

          {/* Sort: newest/oldest first */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title={sortOrder === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
            data-testid="sort-order-toggle"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          </Button>
          
          {/* Date Filter - Meta Ads style Calendar */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`h-8 text-xs gap-1.5 rounded-lg shadow-sm ${dateFilter ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                data-testid="sales-date-filter-btn"
              >
                <Calendar className="h-3.5 w-3.5" />
                {dateFilter ? (
                  dateFilterEnd && dateFilter !== dateFilterEnd ? (
                    `${new Date(dateFilter).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})} - ${new Date(dateFilterEnd).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}`
                  ) : (
                    new Date(dateFilter).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                  )
                ) : 'Date'}
                {dateFilter && <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDateFilter(''); setDateFilterEnd(''); }} />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-xl shadow-xl border-0" align="start">
              <div className="flex">
                <div className="w-32 border-r bg-gray-50 p-2 space-y-0.5 rounded-l-xl">
                  {[
                    { label: 'Today', fn: () => { const d = new Date().toISOString().split('T')[0]; setDateFilter(d); setDateFilterEnd(''); } },
                    { label: 'Tomorrow', fn: () => { const d = new Date(); d.setDate(d.getDate()+1); setDateFilter(d.toISOString().split('T')[0]); setDateFilterEnd(''); } },
                    { label: 'This Week', fn: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate()-now.getDay()+1); const sun = new Date(mon); sun.setDate(mon.getDate()+6); setDateFilter(mon.toISOString().split('T')[0]); setDateFilterEnd(sun.toISOString().split('T')[0]); } },
                    { label: 'Next 7 Days', fn: () => { const d = new Date(); const e = new Date(); e.setDate(d.getDate()+7); setDateFilter(d.toISOString().split('T')[0]); setDateFilterEnd(e.toISOString().split('T')[0]); } },
                    { label: 'This Month', fn: () => { const now = new Date(); setDateFilter(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setDateFilterEnd(new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0]); } },
                    { label: 'All Leads', fn: () => { setDateFilter(''); setDateFilterEnd(''); } },
                  ].map(p => (
                    <button key={p.label} onClick={p.fn}
                      className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${p.label === 'All Leads' ? 'text-red-500 hover:bg-red-50 mt-2' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}
                    >{p.label}</button>
                  ))}
                </div>
                <div className="p-3">
                  <DayPicker
                    mode="range"
                    selected={dateFilter ? { from: new Date(dateFilter + 'T00:00:00'), to: dateFilterEnd ? new Date(dateFilterEnd + 'T00:00:00') : new Date(dateFilter + 'T00:00:00') } : undefined}
                    onSelect={(range) => {
                      if (range?.from) {
                        const from = range.from.toLocaleDateString('en-CA');
                        const to = range.to ? range.to.toLocaleDateString('en-CA') : '';
                        setDateFilter(from);
                        setDateFilterEnd(from === to ? '' : to);
                      } else { setDateFilter(''); setDateFilterEnd(''); }
                    }}
                    classNames={{
                      months: 'flex gap-4', month: 'space-y-3',
                      caption: 'flex justify-center relative items-center h-8',
                      caption_label: 'text-sm font-semibold text-gray-800',
                      nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-lg hover:bg-gray-100',
                      table: 'w-full border-collapse', head_row: 'flex',
                      head_cell: 'text-gray-400 rounded-md w-8 font-normal text-[10px] uppercase',
                      row: 'flex w-full mt-1', cell: 'relative p-0 text-center text-sm',
                      day: 'h-8 w-8 p-0 font-normal text-xs rounded-lg hover:bg-blue-50 transition-colors inline-flex items-center justify-center',
                      day_selected: 'bg-blue-600 text-white hover:bg-blue-700 font-medium',
                      day_today: 'bg-gray-100 font-semibold text-blue-600',
                      day_range_middle: 'bg-blue-50 text-blue-700 rounded-none',
                      day_range_start: 'bg-blue-600 text-white rounded-l-lg rounded-r-none',
                      day_range_end: 'bg-blue-600 text-white rounded-r-lg rounded-l-none',
                      day_outside: 'text-gray-300',
                    }}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* View Toggle */}
          {user?.role === 'super_admin' && (
            <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 hover:text-amber-700"
              onClick={() => window.location.href = '/settings/stages?type=sales'}
              data-testid="manage-sales-stages-btn">
              <Settings className="h-3.5 w-3.5" /> Manage Stages
            </Button>
          )}
          <div className="flex items-center border rounded-lg overflow-hidden bg-white ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/crm/re-projects'}
              className="rounded-none px-3 border-r"
              data-testid="re-projects-btn"
            >
              <FileText className="h-4 w-4 mr-1" />
              <span className="text-xs">RE Projects</span>
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none px-3"
              data-testid="kanban-view-btn"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              <span className="text-xs">Kanban</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none px-3"
              data-testid="list-view-btn"
            >
              <List className="h-4 w-4 mr-1" />
              <span className="text-xs">List</span>
            </Button>
          </div>
        </div>

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-lg border shadow-sm">
            {/* Stage Tabs */}
            <div className="border-b overflow-x-auto pb-1.5 crm-scroll-tabs">
              <div className="flex min-w-max">
                <button
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeStage === 'all' 
                      ? 'border-emerald-500 text-emerald-600 bg-emerald-50' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveStage('all')}
                >
                  All ({leads.length})
                </button>
                {stages.map(stage => (
                  <button
                    key={stage.stage_id}
                    className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeStage === stage.stage_id 
                        ? 'border-emerald-500 text-emerald-600 bg-emerald-50' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveStage(stage.stage_id)}
                    style={{ borderBottomColor: activeStage === stage.stage_id ? stage.color : undefined }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }}></span>
                      {stage.name}
                      <span className="text-gray-400">({getLeadsByStage(stage.stage_id).length})</span>
                    </span>
                  </button>
                ))}
                {/* Revision tab */}
                <button
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeStage === 'revision' 
                      ? 'border-orange-500 text-orange-600 bg-orange-50' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveStage('revision')}
                  data-testid="revision-tab"
                >
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" />
                    Revision
                    <span className="text-gray-400">({getLeadsByStage('revision').length})</span>
                  </span>
                </button>
              </div>
            </div>

            {/* List Table */}
            <div className="w-full">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[22%]">Lead</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[22%]">Contact</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[16%]">Stage</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[14%]">RE Status</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[14%]">Created</th>
                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-[12%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(activeStage === 'all' ? filteredLeads : getLeadsByStage(activeStage)).map(lead => (
                    <tr 
                      key={lead.lead_id} 
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => openLeadDetail(lead)}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {lead.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-xs truncate">{lead.name}</p>
                            {lead.custom_fields?.sqft && (
                              <p className="text-[10px] text-gray-500">{lead.custom_fields.sqft} sqft</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <MaskedContact phone={lead.phone} email={lead.email} lost={isLeadLost(lead)} compact />
                      </td>
                      <td className="px-2 py-2">
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 truncate"
                          style={{ borderColor: stages.find(s => s.stage_id === lead.current_stage_id)?.color }}
                        >
                          {getStageName(lead.current_stage_id)?.substring(0, 12)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        {lead.re_project_id ? (
                          <div className="flex items-center gap-1">
                            <Badge 
                              className="bg-purple-100 text-purple-700 text-[10px] px-1.5 cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); handleViewREProject(lead.re_project_id); }}
                            >
                              View RE
                            </Badge>
                            {(lead.re_revision_number || 0) > 0 && (
                              <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5 border border-orange-300">
                                RE{lead.re_revision_number}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-xs text-gray-500">
                          {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {lead.current_stage_id === 'stg_sales_office_visit' && lead.office_visit?.date && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 w-fit" data-testid={`office-visit-next-${lead.lead_id}`}>
                            <Building2 className="h-2.5 w-2.5" />
                            <span>Next: {new Date(lead.office_visit.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{lead.office_visit.time ? ` · ${lead.office_visit.time}` : ''}</span>
                          </div>
                        )}
                        {(() => {
                          // Show next pending follow-up date (works on Followup tab + RE-Request etc.
                          // wherever a follow-up is scheduled but not yet closed)
                          const pendingFup = (lead.follow_ups || [])
                            .filter(f => !f.completed && f.scheduled_date)
                            .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0];
                          const nextDate = pendingFup?.scheduled_date || lead.next_followup_date;
                          if (!nextDate) return null;
                          return (
                            <div className="flex items-center gap-1 mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 w-fit" data-testid={`followup-next-${lead.lead_id}`}>
                              <Calendar className="h-2.5 w-2.5" />
                              <span>Follow-up: {new Date(nextDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {/* Follow-up Record / New buttons */}
                          {lead.current_stage_id === 'stg_sales_followup' && (
                            <>
                              {(lead.follow_ups || []).some(f => !f.completed) ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-1.5 text-[10px] text-green-600 border-green-300 hover:bg-green-50"
                                    data-testid={`record-followup-btn-${lead.lead_id}`}
                                    onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                                  >
                                    Record
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-1.5 text-[10px] text-amber-600 border-amber-300 hover:bg-amber-50"
                                    data-testid={`new-followup-btn-${lead.lead_id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setQuickFollowupLeadId(lead.lead_id);
                                      setQuickFollowupForm({ date: '', time: '', remarks: '' });
                                      setQuickFollowupDialog(true);
                                    }}
                                  >
                                    New
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-1.5 text-[10px] text-amber-600 border-amber-300 hover:bg-amber-50"
                                  data-testid={`followup-btn-${lead.lead_id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickFollowupLeadId(lead.lead_id);
                                    setQuickFollowupForm({ date: '', time: '', remarks: '' });
                                    setQuickFollowupDialog(true);
                                  }}
                                >
                                  <Calendar className="h-3 w-3 mr-0.5" /> Follow-up
                                </Button>
                              )}
                            </>
                          )}
                          {/* RE-Client / RE-Planning stage action buttons */}
                          {['stg_re_to_client', 'stg_re_from_planning'].includes(lead.current_stage_id) && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 text-[10px] text-green-700 border-green-400 hover:bg-green-50 font-medium"
                                data-testid={`re-client-approve-btn-${lead.lead_id}`}
                                onClick={(e) => { e.stopPropagation(); openReClientAction(lead, 'approved'); }}
                              >
                                <CheckCircle className="h-3 w-3 mr-0.5" /> Approved
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 text-[10px] text-orange-700 border-orange-400 hover:bg-orange-50 font-medium"
                                data-testid={`re-client-revision-btn-${lead.lead_id}`}
                                onClick={(e) => { e.stopPropagation(); openReClientAction(lead, 'revision'); }}
                              >
                                <RefreshCw className="h-3 w-3 mr-0.5" /> Revision
                              </Button>
                            </>
                          )}
                          {/* Onboarding status indicators */}
                          {lead.current_stage_id === 'stg_accountant_approval' && (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px]">Awaiting Accountant</Badge>
                          )}
                          {lead.current_stage_id === 'stg_project_onboarded' && (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">Project Onboarded</Badge>
                          )}
                          {lead.onboarding_status === 'moved_to_planning' && (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">In Planning</Badge>
                          )}
                          {/* Quick Reassign — only when lead is still owned by a salesperson and not in terminal/onboarded stage */}
                          {lead.assigned_to && !['stg_project_onboarded', 'stg_lost'].includes(lead.current_stage_id) && lead.onboarding_status !== 'moved_to_planning' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                              onClick={(e) => { e.stopPropagation(); setReassignDialog({ open: true, lead, new_owner: '', reason: '', submitting: false }); }}
                              title={`Reassign (current: ${lead.assigned_to_name || '—'})`}
                              data-testid={`reassign-row-btn-${lead.lead_id}`}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(activeStage === 'all' ? filteredLeads : getLeadsByStage(activeStage)).length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-12 text-center text-gray-500">
                        No leads found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Kanban Board */}
        {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4" style={{height: 'calc(100vh - 220px)'}}>
          <div className="flex gap-4 min-w-max h-full">
            {stages.map(stage => (
              <div 
                key={stage.stage_id}
                className="w-80 flex-shrink-0 flex flex-col h-full"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.stage_id)}
              >
                <div 
                  className="rounded-t-lg px-4 py-3 flex items-center justify-between sticky top-0 z-10"
                  style={{ backgroundColor: stage.color + '20', borderTop: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {getLeadsByStage(stage.stage_id).length}
                    </Badge>
                  </div>
                  {stage.is_final && (
                    <Badge className={stage.name === 'Lost' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} style={{ fontSize: '10px' }}>
                      {stage.name === 'Lost' ? 'End' : 'Final'}
                    </Badge>
                  )}
                </div>
                
                <div className="bg-gray-100 rounded-b-lg p-2 flex-1 space-y-2 overflow-y-auto">
                  {getLeadsByStage(stage.stage_id).map(lead => {
                    const isLocked = ['stg_payment_collect', 'stg_accountant_approval'].includes(lead.current_stage_id);
                    return (
                    <Card
                      key={lead.lead_id}
                      className={isLocked ? "hover:shadow-md transition-all opacity-90" : "cursor-grab active:cursor-grabbing hover:shadow-md transition-all"}
                      draggable={!isLocked}
                      onDragStart={(e) => !isLocked && handleDragStart(e, lead)}
                      data-testid={`lead-card-${lead.lead_id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-gray-300" />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-semibold">
                              {lead.name?.charAt(0)?.toUpperCase()}
                            </div>
                          </div>
                          {lead.re_project_id && (
                            <Badge 
                              className="bg-purple-100 text-purple-700 cursor-pointer text-xs"
                              onClick={() => handleViewREProject(lead.re_project_id)}
                            >
                              <FileText className="h-3 w-3 mr-1" /> RE
                            </Badge>
                          )}
                        </div>
                        
                        <h4 className="font-semibold text-gray-900 mb-1">{lead.name}</h4>
                        
                        {(lead.phone || lead.email) && (
                          <div className="mb-1">
                            <MaskedContact phone={lead.phone} email={lead.email} lost={isLeadLost(lead)} withIcons />
                          </div>
                        )}
                        
                        {lead.custom_fields?.sqft && (
                          <p className="text-xs text-gray-500 mb-1">
                            {lead.custom_fields.sqft} sqft • {lead.custom_fields?.project_type || 'Residential'}
                          </p>
                        )}
                        
                        {lead.transferred_from_lead_id && (
                          <Badge className="bg-indigo-100 text-indigo-700 text-xs mt-1">
                            From Pre-Sales
                          </Badge>
                        )}
                        
                        {/* Payment summary for Payment Collect / Accountant Approval stages */}
                        {isLocked && lead.advance_payment && (
                          <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-amber-700 font-medium">Advance: {formatCurrency(lead.advance_payment.advance_amount)}</span>
                              {lead.current_stage_id === 'stg_accountant_approval' && !lead.advance_payment.verified_at && (
                                <Badge className="bg-orange-100 text-orange-700 text-xs">Pending Verification</Badge>
                              )}
                            </div>
                            {lead.current_stage_id === 'stg_accountant_approval' && ['accountant', 'super_admin'].includes(user?.role) && !lead.advance_payment.verified_at && (
                              <button
                                data-testid={`verify-payment-${lead.lead_id}`}
                                className="mt-2 w-full py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await axios.post(`${API}/crm/leads/${lead.lead_id}/accountant-verify`);
                                    toast.success('Payment verified! Lead moved to Project Onboarded.');
                                    fetchLeads();
                                  } catch (err) {
                                    toast.error(err.response?.data?.detail || 'Verification failed');
                                  }
                                }}
                              >
                                Verify Payment
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* Follow-up info */}
                        {lead.follow_ups?.filter(f => !f.completed).length > 0 && (
                          <div className="mt-1">
                            {lead.follow_ups.filter(f => !f.completed).sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date)).slice(0, 1).map(f => (
                              <div key={f.follow_up_id} className={`flex items-center gap-1 text-xs rounded px-2 py-1 mt-1 ${
                                f.scheduled_date <= new Date().toISOString().split('T')[0] ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                <Calendar className="h-3 w-3" />
                                <span className="font-medium">{new Date(f.scheduled_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                {f.note && <span className="truncate ml-1">- {f.note}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Latest remark (RE-Client) */}
                        {lead.remarks?.length > 0 && ['stg_re_to_client'].includes(lead.current_stage_id) && (
                          <div className="mt-1 px-2 py-1 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700">
                            <MessageSquare className="inline h-3 w-3 mr-1" />
                            <span className="font-medium">{lead.remarks[lead.remarks.length - 1].by_name}:</span>{' '}
                            <span className="truncate">{lead.remarks[lead.remarks.length - 1].text}</span>
                          </div>
                        )}
                        
                        {/* Lost reason */}
                        {lead.current_stage_id === 'stg_lost' && lead.lost_reason && (
                          <div className="mt-1 px-2 py-1 rounded bg-red-50 border border-red-200 text-xs text-red-700" data-testid={`lost-reason-${lead.lead_id}`}>
                            <XCircle className="inline h-3 w-3 mr-1" />
                            {lead.lost_reason}
                          </div>
                        )}
                        
                        {/* Site Visit info */}
                        {lead.site_visit_data && ['stg_sv_client_land', 'stg_sv_our_projects'].includes(lead.current_stage_id) && (
                          <div className="mt-1 p-2 rounded bg-purple-50 border border-purple-200 text-xs">
                            {lead.site_visit_data.sr_engineer_name && (
                              <p className="text-purple-700"><span className="font-medium">Engineer:</span> {lead.site_visit_data.sr_engineer_name}</p>
                            )}
                            {lead.site_visit_data.site_engineer_name && (
                              <p className="text-blue-700"><span className="font-medium">Engineer:</span> {lead.site_visit_data.site_engineer_name}</p>
                            )}
                            {lead.site_visit_data.project_name && (
                              <p className="text-gray-600"><span className="font-medium">Project:</span> {lead.site_visit_data.project_name}</p>
                            )}
                            {lead.site_visit_data.visit_date && (
                              <div className={`flex items-center gap-1 mt-0.5 ${
                                lead.site_visit_data.visit_date <= new Date().toISOString().split('T')[0] ? 'text-red-600 font-medium' : 'text-gray-500'
                              }`}>
                                <Calendar className="h-3 w-3" />
                                {new Date(lead.site_visit_data.visit_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* RE-Client / RE-Planning stage action buttons (Kanban) */}
                        {['stg_re_to_client', 'stg_re_from_planning'].includes(lead.current_stage_id) && (
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 flex-1 text-[11px] bg-green-600 hover:bg-green-700 text-white"
                              onClick={(e) => { e.stopPropagation(); openReClientAction(lead, 'approved'); }}
                              data-testid={`kanban-re-approve-${lead.lead_id}`}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Approved
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 text-[11px] text-orange-700 border-orange-400 hover:bg-orange-50"
                              onClick={(e) => { e.stopPropagation(); openReClientAction(lead, 'revision'); }}
                              data-testid={`kanban-re-revision-${lead.lead_id}`}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" /> Revision
                            </Button>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-400">
                              {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {lead.current_stage_id === 'stg_sales_office_visit' && lead.office_visit?.date && (
                              <div className="flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 w-fit">
                                <Building2 className="h-2.5 w-2.5" />
                                <span>Next: {new Date(lead.office_visit.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{lead.office_visit.time ? ` · ${lead.office_visit.time}` : ''}</span>
                              </div>
                            )}
                            {(() => {
                              const pendingFup = (lead.follow_ups || []).filter(f => !f.completed && f.scheduled_date).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0];
                              const nextDate = pendingFup?.scheduled_date || lead.next_followup_date;
                              if (!nextDate) return null;
                              return (
                                <div className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 w-fit">
                                  <Calendar className="h-2.5 w-2.5" />
                                  <span>Follow-up: {new Date(nextDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-1">
                            {lead.assigned_to && !['stg_project_onboarded', 'stg_lost'].includes(lead.current_stage_id) && lead.onboarding_status !== 'moved_to_planning' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                                onClick={(e) => { e.stopPropagation(); setReassignDialog({ open: true, lead, new_owner: '', reason: '', submitting: false }); }}
                                title={`Reassign (current: ${lead.assigned_to_name || '—'})`}
                                data-testid={`reassign-kanban-btn-${lead.lead_id}`}
                              >
                                <UserCheck className="h-3 w-3" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-6 w-6 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                              onClick={(e) => { e.stopPropagation(); setFollowupLeadId(lead.lead_id); setFollowupDate(''); setFollowupNote(''); setFollowupDialog(true); }}
                              title="Schedule Follow-up"
                              data-testid={`schedule-followup-${lead.lead_id}`}
                            >
                              <Calendar className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openLeadDetail(lead)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                  
                  {getLeadsByStage(stage.stage_id).length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No leads in this stage
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* View Lead Dialog */}
      {/* Lead Detail Dialog */}
      <Dialog open={viewLeadDialog} onOpenChange={setViewLeadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="overflow-y-auto flex-1 px-6 pt-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                {selectedLead?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <span>{selectedLead?.name}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{getStageName(selectedLead?.current_stage_id)}</Badge>
                  {(leadDetail || selectedLead)?.appointment && (
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      {(leadDetail || selectedLead).appointment.appointment_type?.replace('_', ' ')} - {(leadDetail || selectedLead).appointment.appointment_date} {(leadDetail || selectedLead).appointment.appointment_time}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-purple-700 hover:bg-purple-50"
                  onClick={() => setReassignDialog({ open: true, lead: leadDetail || selectedLead, new_owner: '', reason: '', submitting: false })}
                  data-testid="reassign-lead-btn"
                  title="Reassign to another salesperson"
                >
                  <UserCheck className="h-4 w-4" /> Reassign
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(leadDetail || selectedLead)} data-testid="edit-lead-btn">
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">Lead details and actions</DialogDescription>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-4">
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full grid grid-cols-5">
                  <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
                  <TabsTrigger value="timeline" className="text-xs" data-testid="tab-timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="summary" className="text-xs" data-testid="tab-summary">Summary</TabsTrigger>
                  <TabsTrigger value="followups" className="text-xs" data-testid="tab-followups">Follow-ups</TabsTrigger>
                  <TabsTrigger value="remarks" className="text-xs" data-testid="tab-remarks">Remarks</TabsTrigger>
                </TabsList>
                
                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4 mt-3">
                  {/* RE-Client / RE-Planning stage actions (prominent banner) */}
                  {['stg_re_to_client', 'stg_re_from_planning'].includes(selectedLead.current_stage_id) && (
                    <div className="bg-gradient-to-r from-green-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-lg p-3">
                      <div className="flex flex-col gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">RE Sent to Client — Awaiting Decision</p>
                          <p className="text-xs text-gray-600 mt-0.5">Share the public RE link, regenerate if revisions are needed, or record the client decision.</p>
                          {quoteLink?.link?.token && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <Badge className={`${quoteLink.status === 'expired' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} border-0 text-[10px]`} data-testid="quote-link-status-chip">
                                {quoteLink.status === 'expired' ? 'Expired' : 'Live'}
                              </Badge>
                              <code className="text-[10px] bg-white px-2 py-0.5 rounded border max-w-[280px] truncate" data-testid="quote-link-url">
                                {buildPublicQuoteUrl(quoteLink.link.token)}
                              </code>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={handleCopyQuoteLink} data-testid="copy-quote-link-btn">Copy</Button>
                              <span className="text-[10px] text-gray-500">
                                Expires {quoteLink.link.expires_at ? new Date(quoteLink.link.expires_at).toLocaleDateString('en-IN') : '—'} · Opened {quoteLink.link.open_count || 0}×
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <Button
                            size="sm"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleGenerateQuoteLink(selectedLead)}
                            disabled={quoteLinkLoading}
                            data-testid="detail-generate-re-link-btn"
                          >
                            <Send className="h-4 w-4 mr-1" /> {quoteLink?.link ? 'Regenerate Link' : 'Generate RE Link'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-purple-700 border-purple-400 hover:bg-purple-50"
                            onClick={() => { setRegenDialog({ open: true, lead: selectedLead }); setRegenRemarks(''); }}
                            data-testid="detail-regenerate-re-btn"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" /> Regenerate RE
                          </Button>
                          <Button
                            size="sm"
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => openReClientAction(selectedLead, 'approved')}
                            data-testid="detail-re-approve-btn"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Approved
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-orange-700 border-orange-400 hover:bg-orange-50"
                            onClick={() => openReClientAction(selectedLead, 'revision')}
                            data-testid="detail-re-revision-btn"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" /> Revision
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Appointment Section */}
                  {(leadDetail || selectedLead)?.appointment ? (
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-green-700">Appointment Details</p>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-green-700 hover:text-green-900" onClick={openApptDialog} data-testid="edit-appointment-btn">
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div><span className="text-xs text-green-600">Date</span><p className="font-medium">{(leadDetail || selectedLead).appointment.appointment_date}</p></div>
                        <div><span className="text-xs text-green-600">Time</span><p className="font-medium">{(leadDetail || selectedLead).appointment.appointment_time}</p></div>
                        <div><span className="text-xs text-green-600">Type</span><p className="font-medium capitalize">{(leadDetail || selectedLead).appointment.appointment_type?.replace('_', ' ')}</p></div>
                      </div>
                      {/* Site Visit / Our Project Visit details (engineer + project + visit date) */}
                      {['stg_sv_client_land', 'stg_sv_our_projects'].includes((leadDetail || selectedLead).current_stage_id) && (leadDetail || selectedLead).site_visit_data && (
                        <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-2 gap-3 text-sm">
                          {((leadDetail || selectedLead).site_visit_data.sr_engineer_name || (leadDetail || selectedLead).site_visit_data.site_engineer_name) && (
                            <div>
                              <span className="text-xs text-green-600">Site Engineer</span>
                              <p className="font-medium">
                                {(leadDetail || selectedLead).site_visit_data.sr_engineer_name || (leadDetail || selectedLead).site_visit_data.site_engineer_name}
                              </p>
                              {((leadDetail || selectedLead).site_visit_data.sr_engineer_phone || (leadDetail || selectedLead).site_visit_data.site_engineer_phone) && (
                                <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" /> {(leadDetail || selectedLead).site_visit_data.sr_engineer_phone || (leadDetail || selectedLead).site_visit_data.site_engineer_phone}
                                </p>
                              )}
                            </div>
                          )}
                          {(leadDetail || selectedLead).site_visit_data.project_name && (
                            <div>
                              <span className="text-xs text-green-600">
                                {(leadDetail || selectedLead).current_stage_id === 'stg_sv_our_projects' ? 'Project Visit' : 'Site / Project'}
                              </span>
                              <p className="font-medium flex items-center gap-1">
                                <Building2 className="h-3 w-3 text-green-600" /> {(leadDetail || selectedLead).site_visit_data.project_name}
                              </p>
                            </div>
                          )}
                          {(leadDetail || selectedLead).site_visit_data.visit_date && (
                            <div>
                              <span className="text-xs text-green-600">Visit Date</span>
                              <p className="font-medium flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-green-600" />
                                {new Date((leadDetail || selectedLead).site_visit_data.visit_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          )}
                          {(leadDetail || selectedLead).site_visit_data.visit_address && (
                            <div className="col-span-2">
                              <span className="text-xs text-green-600">Visit Address</span>
                              <p className="font-medium flex items-start gap-1"><MapPin className="h-3 w-3 text-green-600 mt-0.5" /> {(leadDetail || selectedLead).site_visit_data.visit_address}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full border-dashed border-green-400 text-green-600 hover:bg-green-50" onClick={openApptDialog} data-testid="add-appointment-btn">
                      <Calendar className="h-4 w-4 mr-2" /> Add Appointment
                    </Button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3">
                    {selectedLead.email && (<div><Label className="text-xs text-gray-500">Email</Label><p className="text-sm flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /> {selectedLead.email}</p></div>)}
                    {selectedLead.phone && (<div><Label className="text-xs text-gray-500">Phone</Label><p className="text-sm flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {selectedLead.phone}</p></div>)}
                    {selectedLead.alternative_phone && (<div><Label className="text-xs text-gray-500">Alt. Phone</Label><p className="text-sm flex items-center gap-1"><Phone className="h-3 w-3 text-gray-300" /> {selectedLead.alternative_phone}</p></div>)}
                    {selectedLead.address && (<div className="col-span-2"><Label className="text-xs text-gray-500">Address</Label><p className="text-sm">{[selectedLead.address, selectedLead.city, selectedLead.location].filter(Boolean).join(', ')}</p></div>)}
                    {selectedLead.sqft && (<div><Label className="text-xs text-gray-500">Area</Label><p className="text-sm">{selectedLead.sqft}</p></div>)}
                    {selectedLead.source && (<div><Label className="text-xs text-gray-500">Source</Label><p className="text-sm">{selectedLead.source}</p></div>)}
                    {selectedLead.assigned_to_name && (<div><Label className="text-xs text-gray-500">Assigned To</Label><p className="text-sm">{selectedLead.assigned_to_name}</p></div>)}
                    {selectedLead.pre_sales_person_name && (<div><Label className="text-xs text-gray-500">Pre-Sales</Label><p className="text-sm">{selectedLead.pre_sales_person_name}</p></div>)}
                    {selectedLead.client_category && (
                      <div data-testid="lead-detail-client-category">
                        <Label className="text-xs text-gray-500">Client Category</Label>
                        <p className="text-sm flex items-center gap-2">
                          <Badge
                            className="text-[10px] font-semibold px-1.5 py-0.5"
                            style={{
                              backgroundColor:
                                selectedLead.client_category === 'P1' ? '#fee2e2' :
                                selectedLead.client_category === 'P2' ? '#fef3c7' :
                                selectedLead.client_category === 'P3' ? '#dbeafe' : '#f3f4f6',
                              color:
                                selectedLead.client_category === 'P1' ? '#dc2626' :
                                selectedLead.client_category === 'P2' ? '#d97706' :
                                selectedLead.client_category === 'P3' ? '#2563eb' : '#374151',
                            }}
                          >
                            {selectedLead.client_category}
                          </Badge>
                          {selectedLead.client_category_value && (
                            <span className="text-gray-700">{selectedLead.client_category_value}</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {Object.keys(selectedLead.custom_fields || {}).length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-500 mb-2 block">Details</Label>
                      <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
                        {Object.entries(selectedLead.custom_fields).map(([key, value]) => (<div key={key}><span className="text-xs text-gray-500 capitalize">{key.replace('_', ' ')}</span><p className="text-sm font-medium">{value || '-'}</p></div>))}
                      </div>
                    </div>
                  )}
                  
                  {selectedLead.re_project_id && (
                    <Badge className="bg-purple-100 text-purple-700 cursor-pointer" onClick={() => { handleViewREProject(selectedLead.re_project_id); setViewLeadDialog(false); }}><FileText className="h-3 w-3 mr-1" /> View RE Project</Badge>
                  )}
                  
                  {['stg_payment_collect', 'stg_accountant_approval'].includes(selectedLead.current_stage_id) && (
                    <div className="border-t pt-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                        {selectedLead.current_stage_id === 'stg_payment_collect' && 'This lead is in Payment Collect stage. It will move automatically after advance is collected.'}
                        {selectedLead.current_stage_id === 'stg_accountant_approval' && 'Waiting for Accountant verification. Lead will move to Project Onboarded automatically after approval.'}
                        {selectedLead.advance_payment && (
                          <div className="mt-2 pt-2 border-t border-amber-200">
                            <p className="font-medium">Advance: {formatCurrency(selectedLead.advance_payment.advance_amount)}</p>
                            {selectedLead.advance_payment.collected_at && <p className="text-xs">Collected: {new Date(selectedLead.advance_payment.collected_at).toLocaleDateString('en-IN')}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>
                

                {/* Timeline Tab */}
                <TabsContent value="timeline" className="space-y-4 mt-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Lead Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="relative">
                        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                        <div className="space-y-3">
                          {(() => {
                            const events = [];
                            if (selectedLead.created_at) {
                              events.push({ type: 'created', ts: selectedLead.created_at });
                            }
                            (selectedLead.stage_history || []).forEach((entry, i) => {
                              events.push({ type: 'stage', ts: entry.moved_at || entry.created_at || 0, data: entry, key: `stg-${i}` });
                            });
                            // Split follow-ups into scheduled (at created_at) and closed (at completed_at)
                            (selectedLead.follow_ups || []).forEach((fup, i) => {
                              const scheduleTs = fup.created_at || fup.scheduled_date;
                              events.push({ type: 'followup_scheduled', ts: scheduleTs, data: fup, key: `fup-sch-${i}` });
                              if (fup.completed && fup.completed_at) {
                                events.push({ type: 'followup_closed', ts: fup.completed_at, data: fup, key: `fup-cls-${i}` });
                              }
                            });
                            (selectedLead.rnr_log || []).forEach((log, i) => {
                              events.push({ type: 'rnr', ts: log.timestamp || 0, data: log, key: `rnr-${i}` });
                            });
                            // Quote-link events from the dedicated state (live + revoked)
                            const ql = quoteLink?.link;
                            if (ql) {
                              events.push({ type: 'quote_link', ts: ql.created_at, data: ql, key: `ql-${ql.quote_id}` });
                            }
                            if (selectedLead.office_visit) {
                              const ov = selectedLead.office_visit;
                              const ovTs = ov.created_at || (ov.date ? `${ov.date}T${ov.time || '00:00'}` : 0);
                              events.push({ type: 'office_visit', ts: ovTs, data: ov });
                            }
                            events.sort((a, b) => {
                              const ta = a.ts ? new Date(a.ts).getTime() : 0;
                              const tb = b.ts ? new Date(b.ts).getTime() : 0;
                              return ta - tb;
                            });
                            return events.map((ev, idx) => {
                              const key = ev.key || `${ev.type}-${idx}`;
                              if (ev.type === 'created') {
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center z-10 shrink-0"><Plus className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-indigo-50 rounded-lg p-2">
                                      <p className="text-xs font-semibold text-indigo-700">Lead Created</p>
                                      <p className="text-[10px] text-gray-500">{new Date(ev.ts).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}</p>
                                      {selectedLead.pre_sales_person_name && <p className="text-[10px] text-gray-500">From Pre-Sales: {selectedLead.pre_sales_person_name}</p>}
                                    </div>
                                  </div>
                                );
                              }
                              if (ev.type === 'stage') {
                                const entry = ev.data;
                                const stageInfo = stages.find(s => s.stage_id === entry.stage_id);
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0" style={{ backgroundColor: stageInfo?.color || '#6b7280' }}><ArrowRight className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-white border rounded-lg p-2">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold" style={{ color: stageInfo?.color || '#374151' }}>{stageInfo?.name || entry.stage_id}</p>
                                        {entry.action && <span className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{entry.action}</span>}
                                      </div>
                                      <p className="text-[10px] text-gray-500">{entry.moved_at ? new Date(entry.moved_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}{entry.moved_by_name ? ` — ${entry.moved_by_name}` : ''}</p>
                                      {entry.remark && <p className="text-[10px] text-gray-600 mt-0.5 italic">"{entry.remark}"</p>}
                                    </div>
                                  </div>
                                );
                              }
                              if (ev.type === 'followup_scheduled') {
                                const fup = ev.data;
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center z-10 shrink-0"><Calendar className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                      <p className="text-xs font-semibold text-amber-700">Follow-up Scheduled{fup.completed ? '' : ' (Pending)'}</p>
                                      <p className="text-[10px] text-gray-500">
                                        {fup.created_at ? new Date(fup.created_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}
                                        {' '}— for {fup.scheduled_date ? new Date(fup.scheduled_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : 'N/A'}
                                        {fup.note ? ` · ${fup.note}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                );
                              }
                              if (ev.type === 'followup_closed') {
                                const fup = ev.data;
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center z-10 shrink-0"><CheckCircle className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-2">
                                      <p className="text-xs font-semibold text-green-700">Follow-up Closed</p>
                                      <p className="text-[10px] text-gray-500">{fup.completed_at ? new Date(fup.completed_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}{fup.closed_by_name ? ` — ${fup.closed_by_name}` : ''}</p>
                                      {fup.closing_remark && <p className="text-[10px] text-green-700 mt-0.5">Remark: {fup.closing_remark}</p>}
                                    </div>
                                  </div>
                                );
                              }
                              if (ev.type === 'rnr') {
                                const log = ev.data;
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center z-10 shrink-0"><PhoneOff className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-2">
                                      <p className="text-xs font-semibold text-red-600">RNR #{log.attempt}</p>
                                      <p className="text-[10px] text-gray-500">{log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}{log.logged_by_name ? ` — ${log.logged_by_name}` : ''}</p>
                                    </div>
                                  </div>
                                );
                              }
                              if (ev.type === 'quote_link') {
                                const q = ev.data;
                                const isExpired = q.expires_at && new Date(q.expires_at) < new Date();
                                const status = q.is_revoked ? 'revoked' : (isExpired ? 'expired' : 'live');
                                const statusClass = status === 'live' ? 'text-emerald-700' : status === 'expired' ? 'text-amber-700' : 'text-gray-500';
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center z-10 shrink-0"><Send className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                                      <p className={`text-xs font-semibold ${statusClass}`}>RE Link {status === 'live' ? 'Generated' : status === 'expired' ? 'Expired' : 'Revoked'}</p>
                                      <p className="text-[10px] text-gray-500">{q.created_at ? new Date(q.created_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}{q.created_by_name ? ` — ${q.created_by_name}` : ''}</p>
                                      <p className="text-[10px] text-gray-600 mt-0.5">Expires {q.expires_at ? new Date(q.expires_at).toLocaleDateString('en-IN') : '—'} · Opened {q.open_count || 0}×</p>
                                    </div>
                                  </div>
                                );
                              }
                              if (ev.type === 'office_visit') {
                                const ov = ev.data;
                                return (
                                  <div key={key} className="flex items-start gap-3 relative">
                                    <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center z-10 shrink-0"><Building2 className="h-3 w-3 text-white" /></div>
                                    <div className="flex-1 bg-sky-50 border border-sky-200 rounded-lg p-2">
                                      <p className="text-xs font-semibold text-sky-700">Schedule Office Visit</p>
                                      <div className="text-[10px] text-gray-600 mt-1 space-y-0.5">
                                        {ov.date && <p><span className="font-medium text-gray-500">Visit Date:</span> {new Date(ov.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                                        {ov.time && <p><span className="font-medium text-gray-500">Visit Time:</span> {ov.time}</p>}
                                        {ov.location && <p><span className="font-medium text-gray-500">Location:</span> {ov.location}</p>}
                                        {ov.remarks && <p><span className="font-medium text-gray-500">Remarks:</span> {ov.remarks}</p>}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            });
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Summary Tab */}
                <TabsContent value="summary" className="space-y-3 mt-3">
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Lead Summary</Label>
                    <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Write a summary about this lead..." className="w-full rounded-md border p-3 text-sm min-h-[120px] resize-y focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" data-testid="lead-summary-input" />
                  </div>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveSummary} data-testid="save-summary-btn">Save Summary</Button>
                  {selectedLead.notes && (<div className="bg-gray-50 rounded-lg p-3"><Label className="text-xs text-gray-500 block mb-1">Notes</Label><p className="text-sm">{selectedLead.notes}</p></div>)}
                </TabsContent>
                
                {/* Follow-ups Tab */}
                <TabsContent value="followups" className="space-y-3 mt-3">
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <Label className="text-xs font-medium">Schedule Follow-up</Label>
                    <div className="flex gap-2">
                      <Input type="date" value={followUpForm.date} onChange={(e) => setFollowUpForm({...followUpForm, date: e.target.value})} className="text-sm flex-1" min={new Date().toISOString().split('T')[0]} data-testid="followup-date" />
                      <Input value={followUpForm.note} onChange={(e) => setFollowUpForm({...followUpForm, note: e.target.value})} placeholder="Note..." className="text-sm flex-[2]" data-testid="followup-note" />
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddFollowUp} data-testid="add-followup-btn">Add</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(leadDetail?.follow_ups || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No follow-ups scheduled</p>}
                    {(leadDetail?.follow_ups || []).map((fu, i) => (
                      <div key={fu.follow_up_id || i} className={`flex items-center justify-between p-3 rounded-lg border ${fu.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                        <div><p className="text-sm font-medium">{fu.scheduled_date}</p><p className="text-xs text-gray-500">{fu.note || 'No note'}</p></div>
                        {fu.status !== 'completed' ? (
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCompleteFollowUp(fu.follow_up_id)}><CheckCircle className="h-3 w-3 mr-1" /> Done</Button>
                        ) : (<Badge className="bg-green-100 text-green-600 text-xs">Completed</Badge>)}
                      </div>
                    ))}
                  </div>
                </TabsContent>
                
                {/* Remarks Tab */}
                <TabsContent value="remarks" className="space-y-3 mt-3">
                  <div className="flex gap-2">
                    <Input value={remarkForm} onChange={(e) => setRemarkForm(e.target.value)} placeholder="Add a remark..." className="text-sm" data-testid="remark-input" />
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddRemark} data-testid="add-remark-btn">Add</Button>
                  </div>
                  <div className="space-y-2">
                    {(leadDetail?.remarks || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No remarks yet</p>}
                    {(leadDetail?.remarks || []).map((r, i) => (
                      <div key={i} className="p-3 rounded-lg bg-gray-50 border"><p className="text-sm">{r.remark}</p><p className="text-xs text-gray-400 mt-1">{r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : ''} {r.created_by_name ? `by ${r.created_by_name}` : ''}</p></div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
          </div>
          
          {/* Sticky Footer - Move to Stage */}
          {selectedLead && (
          <div className="border-t bg-white px-6 py-3 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-500">Move to Stage:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stages.filter(s => !['stg_accountant_approval'].includes(s.stage_id)).map(stage => (
                <Button
                  key={stage.stage_id}
                  variant={selectedLead.current_stage_id === stage.stage_id ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const interceptStages = ['stg_re_to_client', 'stg_lost', 'stg_sales_followup', 'stg_sv_client_land', 'stg_sv_our_projects', 'stg_payment_collect', 'stg_project_onboarded', 'stg_re_from_planning', 'stg_re_requested'];
                    if (!interceptStages.includes(stage.stage_id)) {
                      setViewLeadDialog(false);
                    }
                    handleStageChange(selectedLead.lead_id, stage.stage_id);
                  }}
                  style={selectedLead.current_stage_id === stage.stage_id 
                    ? { backgroundColor: stage.color } 
                    : { borderColor: stage.color, color: stage.color }}
                >
                  {stage.name}
                  {stage.is_final && <ArrowRight className="h-3 w-3 ml-1" />}
                </Button>
              ))}
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update lead details. Custom fields appear below.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="text-sm" data-testid="edit-name" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Source</Label>
              <Select value={editForm.source} onValueChange={(v) => setEditForm({...editForm, source: v})}>
                <SelectTrigger className="text-sm" data-testid="edit-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="seo">SEO</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="text-sm" data-testid="edit-email" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className="text-sm" data-testid="edit-phone" />
            </div>
            <div>
              <Label className="text-xs">Alternative Phone</Label>
              <Input value={editForm.alternative_phone} onChange={(e) => setEditForm({...editForm, alternative_phone: e.target.value})} className="text-sm" placeholder="Optional secondary number" data-testid="edit-alt-phone" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Address</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm({...editForm, address: e.target.value})} className="text-sm" data-testid="edit-address" />
            </div>
            <div>
              <Label className="text-xs">City</Label>
              <Input value={editForm.city} onChange={(e) => setEditForm({...editForm, city: e.target.value})} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input value={editForm.state} onChange={(e) => setEditForm({...editForm, state: e.target.value})} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Pincode</Label>
              <Input value={editForm.pincode} onChange={(e) => setEditForm({...editForm, pincode: e.target.value})} className="text-sm" data-testid="edit-pincode" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className="w-full rounded-md border p-2 text-sm min-h-[60px]" data-testid="edit-notes" />
            </div>

            {/* Client Category — priority tier (P1/P2/P3) + free-text qualifier */}
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 pt-1">
              <div>
                <Label className="text-xs">Client Category</Label>
                <Select
                  value={editForm.client_category || ''}
                  onValueChange={(v) => setEditForm({
                    ...editForm,
                    client_category: v === '__none__' ? '' : v,
                    client_category_value: v === '__none__' ? '' : editForm.client_category_value,
                  })}
                >
                  <SelectTrigger className="text-sm h-9" data-testid="edit-client-category">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    <SelectItem value="P1">P1 (Hot)</SelectItem>
                    <SelectItem value="P2">P2 (Warm)</SelectItem>
                    <SelectItem value="P3">P3 (Cold)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{editForm.client_category ? `${editForm.client_category} Value` : 'Value'}</Label>
                <Input
                  value={editForm.client_category_value}
                  onChange={(e) => setEditForm({...editForm, client_category_value: e.target.value})}
                  placeholder={
                    editForm.client_category === 'P1' ? 'Enter P1 reason / budget / timeline...' :
                    editForm.client_category === 'P2' ? 'Enter P2 reason / budget / timeline...' :
                    editForm.client_category === 'P3' ? 'Enter P3 reason / budget / timeline...' :
                    'Pick a category first to add a value'
                  }
                  disabled={!editForm.client_category}
                  className="text-sm"
                  data-testid="edit-client-category-value"
                />
              </div>
            </div>

            {/* Custom Fields */}
            {customFields.length > 0 && (
              <div className="col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-700">Custom Fields</span>
                </div>
              </div>
            )}
            {customFields.map(field => (
              <div key={field.field_id} className={field.field_type === 'textarea' ? 'col-span-2' : ''}>
                <Label className="text-xs">{field.label} {field.required && '*'}</Label>
                {field.field_type === 'text' && (
                  <Input
                    value={editForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      custom_fields: {...editForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    className="text-sm"
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
                {field.field_type === 'number' && (
                  <NumericInput
                    value={editForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      custom_fields: {...editForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    className="text-sm"
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
                {field.field_type === 'dropdown' && (
                  <Select 
                    value={editForm.custom_fields[field.field_id] || ''} 
                    onValueChange={(v) => setEditForm({
                      ...editForm,
                      custom_fields: {...editForm.custom_fields, [field.field_id]: v}
                    })}
                  >
                    <SelectTrigger className="text-sm" data-testid={`edit-cf-${field.field_id}`}><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.field_type === 'textarea' && (
                  <textarea
                    value={editForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      custom_fields: {...editForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border p-2 text-sm min-h-[60px]"
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
                {field.field_type === 'date' && (
                  <Input
                    type="date"
                    value={editForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditForm({
                      ...editForm,
                      custom_fields: {...editForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    className="text-sm"
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleUpdateLead} data-testid="save-lead-btn">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Dialog */}
      <Dialog open={apptDialog} onOpenChange={setApptDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              {(leadDetail || selectedLead)?.appointment ? 'Edit Appointment' : 'Book Appointment'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Date *</Label>
              <Input type="date" value={apptForm.date} onChange={(e) => setApptForm({...apptForm, date: e.target.value})} min={new Date().toISOString().split('T')[0]} className="mt-1" data-testid="sales-appt-date" />
            </div>
            <div>
              <Label className="text-sm font-medium">Time *</Label>
              <Input type="time" value={apptForm.time} onChange={(e) => setApptForm({...apptForm, time: e.target.value})} className="mt-1" data-testid="sales-appt-time" />
            </div>
            <div>
              <Label className="text-sm font-medium">Visit Type *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { value: 'office_visit', label: 'Office Visit', icon: '🏢' },
                  { value: 'online', label: 'Online', icon: '💻' },
                  { value: 'home_visit', label: 'Home Visit', icon: '🏠' }
                ].map(opt => (
                  <button key={opt.value} type="button" data-testid={`sales-appt-type-${opt.value}`}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm ${apptForm.type === opt.value ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                    onClick={() => setApptForm({...apptForm, type: opt.value})}>
                    <span className="text-xl">{opt.icon}</span>
                    <span className="text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApptDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveAppointment} disabled={!apptForm.date || !apptForm.time || !apptForm.type} data-testid="save-appointment-btn">
              <Calendar className="h-4 w-4 mr-2" /> Save Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RE Project Dialog */}
      <Dialog open={reProjectDialog} onOpenChange={setReProjectDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-600" />
                Rough Estimate Project
              </div>
              <Button 
                onClick={handleGenerateREPDF} 
                className="bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </DialogTitle>
            <DialogDescription>
              URBAN SPACE BUILDERS - Rough Estimate Details
            </DialogDescription>
          </DialogHeader>
          
          {selectedREProject && (
            <div className="space-y-4">
              {/* Revision Tabs */}
              {reRevisions.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap border-b pb-3" data-testid="re-revision-tabs">
                  {reRevisions.map((rev) => {
                    const isActive = rev.re_project_id === selectedREProject.re_project_id;
                    const isApproved = ['client_approved', 're_approved'].includes(rev.status);
                    const isDimmed = !isActive && !isApproved;
                    return (
                      <button
                        key={rev.re_project_id}
                        data-testid={`re-revision-tab-${rev.revision}`}
                        onClick={() => setSelectedREProject(rev)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                          isActive
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : isApproved
                              ? 'bg-green-100 text-green-800 border-green-300 ring-1 ring-green-400'
                              : isDimmed
                                ? 'bg-gray-50 text-gray-400 border-gray-200 opacity-60'
                                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        RE{rev.revision}
                        {isApproved && <CheckCircle className="inline h-3 w-3 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* Status Badge + RE Number */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedREProject.re_number && (
                  <span className="font-mono text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                    {selectedREProject.re_number}
                  </span>
                )}
                <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">
                  <GitBranch className="h-3 w-3 mr-0.5" /> RE{selectedREProject.revision || 0}
                </Badge>
                {RE_STATUS_CONFIG[selectedREProject.status] && (
                  <Badge className={RE_STATUS_CONFIG[selectedREProject.status].color}>
                    {React.createElement(RE_STATUS_CONFIG[selectedREProject.status].icon, { className: "h-3 w-3 mr-1" })}
                    {RE_STATUS_CONFIG[selectedREProject.status].label}
                  </Badge>
                )}
                {selectedREProject.revision_requested && (
                  <Badge className="bg-amber-100 text-amber-700 text-[10px]">Revision Requested</Badge>
                )}
              </div>
              
              {/* Client Info */}
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Client Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <p className="font-medium">{selectedREProject.client_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <p>{selectedREProject.client_phone || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p>{selectedREProject.client_email || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Location:</span>
                      <p>{selectedREProject.location || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Project Info */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-2">Project Details</h4>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Project Name:</span>
                      <p className="font-medium">{selectedREProject.project_name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Square Feet:</span>
                      <p>{selectedREProject.sqft ? `${selectedREProject.sqft} sqft` : '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Building Type:</span>
                      <p className="capitalize">{selectedREProject.building_type || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Handover:</span>
                      <p>{selectedREProject.handover_months ? `${selectedREProject.handover_months} months` : '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Full Scope of Works */}
              <Card className="border-purple-200">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3 text-purple-800">Scope of Works</h4>
                  {selectedREProject.rough_scope_items?.length > 0 ? (
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
                          {selectedREProject.rough_scope_items.map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="p-2 text-center">{idx + 1}</td>
                              <td className="p-2">{item.description || '-'}</td>
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
                              {formatCurrency(selectedREProject.rough_scope_items.reduce((sum, item) => sum + (item.total || 0), 0))}
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
              
              {/* Estimated Total Summary */}
              <Card className="bg-gradient-to-r from-purple-600 to-purple-700">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-100">Estimated Total</p>
                  <p className="text-3xl font-bold text-white">
                    {formatCurrency(selectedREProject.estimated_total || selectedREProject.rough_scope_items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0)}
                  </p>
                  {selectedREProject.handover_months && (
                    <p className="text-sm text-purple-200 mt-1">
                      Project Duration: {selectedREProject.handover_months} months
                    </p>
                  )}
                </CardContent>
              </Card>
              
              {/* Planning Notes */}
              {selectedREProject.planning_notes && (
                <Card className="bg-gray-50">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2 text-gray-700">Planning Notes</h4>
                    <p className="text-sm text-gray-600">{selectedREProject.planning_notes}</p>
                  </CardContent>
                </Card>
              )}
              
              {/* GM Rejection Reason */}
              {selectedREProject.gm_rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <Label className="text-xs text-red-600">Rejection Reason</Label>
                  <p className="text-sm text-red-700">{selectedREProject.gm_rejection_reason}</p>
                </div>
              )}
              
              {/* Client Feedback Notes */}
              {selectedREProject.client_feedback_notes && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <Label className="text-xs text-orange-600">Client Feedback</Label>
                  <p className="text-sm text-orange-700">{selectedREProject.client_feedback_notes}</p>
                </div>
              )}
              
              {/* Previous Client Feedback (on revisions) */}
              {selectedREProject.previous_client_feedback && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Label className="text-xs text-blue-600">Feedback from Previous Revision</Label>
                  <p className="text-sm text-blue-700">{selectedREProject.previous_client_feedback}</p>
                </div>
              )}
              
              {/* Revision Reason */}
              {selectedREProject.revision_reason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <Label className="text-xs text-amber-600">Revision Reason</Label>
                  <p className="text-sm text-amber-700">{selectedREProject.revision_reason}</p>
                </div>
              )}
              
              {/* Timestamps */}
              <div className="text-xs text-gray-400 flex flex-wrap gap-4">
                <span>Created: {new Date(selectedREProject.created_at).toLocaleString()}</span>
                {selectedREProject.prepared_at && (
                  <span>Prepared: {new Date(selectedREProject.prepared_at).toLocaleString()}</span>
                )}
                {selectedREProject.gm_approved_at && (
                  <span>GM Action: {new Date(selectedREProject.gm_approved_at).toLocaleString()}</span>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2 flex-wrap">
            {selectedREProject?.status === 're_approved' && (
              <>
                <Button onClick={handleSendToClient} className="bg-blue-600 hover:bg-blue-700" data-testid="send-to-client-btn">
                  <Send className="h-4 w-4 mr-1" /> Send to Client
                </Button>
                <Button onClick={handleRequestRevision} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" data-testid="request-revision-btn">
                  <GitBranch className="h-4 w-4 mr-1" /> Request Revision
                </Button>
              </>
            )}
            {selectedREProject?.status === 'sent_to_client' && (
              <>
                <Button onClick={openClientFeedbackDialog} variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50" data-testid="client-feedback-btn">
                  <MessageSquare className="h-4 w-4 mr-1" /> Client Feedback
                </Button>
                <Button onClick={handleClientApprove} className="bg-green-600 hover:bg-green-700" data-testid="client-approve-btn">
                  <CheckCircle className="h-4 w-4 mr-1" /> Client Approved
                </Button>
                <Button onClick={handleRequestRevision} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" data-testid="request-revision-sent-btn">
                  <GitBranch className="h-4 w-4 mr-1" /> Request Revision
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setReProjectDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Rough Estimate Requirement Dialog */}
      {/* Office Visit Dialog */}
      <Dialog open={officeVisitDialog} onOpenChange={setOfficeVisitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Schedule Office Visit
            </DialogTitle>
            <DialogDescription>Enter the date, time, and location for the client's office visit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Visit Date *</Label>
              <Input type="date" value={officeVisitForm.date} onChange={(e) => setOfficeVisitForm({...officeVisitForm, date: e.target.value})} className="mt-1" data-testid="office-visit-date" />
            </div>
            <div>
              <Label className="text-sm font-medium">Visit Time *</Label>
              <Input type="time" value={officeVisitForm.time} onChange={(e) => setOfficeVisitForm({...officeVisitForm, time: e.target.value})} className="mt-1" data-testid="office-visit-time" />
            </div>
            <div>
              <Label className="text-sm font-medium">Location</Label>
              <Input value={officeVisitForm.location} onChange={(e) => setOfficeVisitForm({...officeVisitForm, location: e.target.value})} placeholder="Office / Site / Other" className="mt-1" data-testid="office-visit-location" />
            </div>
            <div>
              <Label className="text-sm font-medium">Remarks</Label>
              <Input value={officeVisitForm.remarks} onChange={(e) => setOfficeVisitForm({...officeVisitForm, remarks: e.target.value})} placeholder="Any additional notes..." className="mt-1" data-testid="office-visit-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfficeVisitDialog(false)}>Cancel</Button>
            <Button onClick={handleOfficeVisitSubmit} disabled={!officeVisitForm.date || !officeVisitForm.time} className="bg-blue-600 hover:bg-blue-700" data-testid="office-visit-submit">
              Schedule Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={roughEstDialog} onOpenChange={setRoughEstDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              Rough Requirement for Estimate
            </DialogTitle>
            <DialogDescription>
              Describe the client's requirements. This will be sent to the Planning team for rough estimation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Client Requirement *</Label>
              <Textarea
                value={roughEstForm}
                onChange={(e) => setRoughEstForm(e.target.value)}
                placeholder="Enter the rough requirement details here...&#10;&#10;Example:&#10;- 2 BHK house, ground + 1 floor&#10;- Plot size: 1200 sqft&#10;- Budget range: 30-40 lakhs&#10;- Modern design with car parking&#10;- Timeline: 8-10 months"
                className="min-h-[200px] mt-1.5 text-sm"
                data-testid="rough-requirement-textarea"
              />
            </div>
            <p className="text-xs text-gray-500">
              This requirement will be visible to the Planning team when they prepare the rough estimate.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoughEstDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitRoughEstimate} 
              disabled={!roughEstForm.trim()} 
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="submit-rough-estimate"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Submit & Request Estimate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Feedback Dialog */}
      <Dialog open={clientFeedbackDialog} onOpenChange={setClientFeedbackDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-orange-600" />
              Client Feedback / Suggestions
            </DialogTitle>
            <DialogDescription>
              Enter the client's feedback on the current RE revision. This will notify the Planning team to create a new revision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Client Notes *</Label>
              <Textarea
                value={clientFeedbackNotes}
                onChange={(e) => setClientFeedbackNotes(e.target.value)}
                placeholder="Enter client's feedback, changes, or suggestions..."
                className="min-h-[180px] mt-1.5 text-sm"
                data-testid="client-feedback-textarea"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientFeedbackDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitClientFeedback}
              disabled={!clientFeedbackNotes.trim()}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="submit-client-feedback-btn"
            >
              <Send className="h-4 w-4 mr-1.5" />
              Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance Payment Collection Dialog */}
      <Dialog open={advanceDialog} onOpenChange={(open) => {
        setAdvanceDialog(open);
        if (!open) setOnboardingPendingStageId(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              Advance Payment Collection
            </DialogTitle>
            <DialogDescription>
              Collect advance payment from client: {advanceLead?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={advanceForm.amount}
                onChange={(e) => setAdvanceForm({...advanceForm, amount: e.target.value})}
                placeholder="Enter advance amount"
                data-testid="advance-amount-input"
              />
            </div>
            <div>
              <Label>Payment Mode *</Label>
              <Select value={advanceForm.payment_mode} onValueChange={(v) => setAdvanceForm({...advanceForm, payment_mode: v})}>
                <SelectTrigger data-testid="payment-mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="escrow">Escrow</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="savings_account">Savings A/c</SelectItem>
                  <SelectItem value="direct_transfer">Direct Transfer (DT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Reference / Transaction ID</Label>
              <Input
                value={advanceForm.payment_reference}
                onChange={(e) => setAdvanceForm({...advanceForm, payment_reference: e.target.value})}
                placeholder="UPI ID, Cheque No., NEFT Ref..."
              />
            </div>
            <div>
              <Label>Remarks</Label>
              <Textarea
                value={advanceForm.remarks}
                onChange={(e) => setAdvanceForm({...advanceForm, remarks: e.target.value})}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAdvanceDialog(false); setOnboardingPendingStageId(null); }}>Cancel</Button>
            <Button 
              onClick={handleCollectAdvance}
              disabled={!advanceForm.amount}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="submit-advance-btn"
            >
              <DollarSign className="h-4 w-4 mr-1" />
              Collect Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Planning Dialog */}
      <Dialog open={planningDialog} onOpenChange={setPlanningDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-green-600" />
              Move to Planning
            </DialogTitle>
            <DialogDescription>
              Project for: {planningLead?.name}. Accountant has verified the advance payment. Add a project description for the Planning team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Project Description *</Label>
              <Textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe the project scope, requirements, special instructions for planning team...&#10;&#10;Example:&#10;- 2 floor villa with car parking&#10;- Client wants modern design&#10;- Budget: 55 lakhs&#10;- Timeline: 12 months"
                className="min-h-[200px]"
                data-testid="project-description-textarea"
              />
            </div>
            {planningLead?.advance_payment && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-3 text-sm">
                  <p className="font-medium text-green-800">Advance Collected</p>
                  <p className="text-green-700">₹{planningLead.advance_payment.advance_amount?.toLocaleString('en-IN')} via {planningLead.advance_payment.payment_mode}</p>
                  {planningLead.advance_payment.verified_by_name && (
                    <p className="text-xs text-green-600 mt-1">Verified by: {planningLead.advance_payment.verified_by_name}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanningDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleMoveToPlanningSubmit}
              disabled={!projectDescription.trim()}
              className="bg-green-600 hover:bg-green-700"
              data-testid="submit-planning-btn"
            >
              <ArrowRight className="h-4 w-4 mr-1" />
              Create Project & Move to Planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site Visit (Client Land) - Assign Sr. Engineer Dialog */}
      <Dialog open={clientLandDialog} onOpenChange={setClientLandDialog}>
        <DialogContent className="max-w-lg" style={{ overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-600"><MapPin className="h-5 w-5" />Site Visit - Client Land</DialogTitle>
            <DialogDescription>Assign a Sr. Site Engineer for client land visit</DialogDescription>
          </DialogHeader>
          {clientLandLead && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium">{clientLandLead.name}</p>
                <p className="text-gray-500">{clientLandLead.phone} | {clientLandLead.city || 'No location'}</p>
              </div>
              <div>
                <Label>Sr. Site Engineer *</Label>
                <Select value={selectedSrEngineer} onValueChange={setSelectedSrEngineer}>
                  <SelectTrigger className="mt-1" data-testid="select-sr-engineer"><SelectValue placeholder="Select Sr. Engineer" /></SelectTrigger>
                  <SelectContent>
                    {srEngineers.map(eng => (
                      <SelectItem key={eng.user_id} value={eng.user_id}>
                        {eng.name} {eng.region ? `(${eng.region})` : ''} {eng.phone ? `- ${eng.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visit Date</Label>
                <Input type="date" value={svVisitDate} onChange={(e) => setSvVisitDate(e.target.value)} className="mt-1" data-testid="sv-visit-date" />
              </div>
              <div>
                <Label>Notes</Label>
                <Input placeholder="Any notes for the engineer..." value={svNotes} onChange={(e) => setSvNotes(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setClientLandDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignClientLandVisit} disabled={!selectedSrEngineer} className="bg-purple-600 hover:bg-purple-700" data-testid="confirm-client-land-visit">
              <UserCheck className="h-4 w-4 mr-2" />Assign Engineer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site Visit (Our Ongoing Projects) - Select Project Dialog */}
      <Dialog open={ongoingProjectDialog} onOpenChange={setOngoingProjectDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]" style={{ overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600"><Building2 className="h-5 w-5" />Site Visit - Our Ongoing Projects</DialogTitle>
            <DialogDescription>Select an ongoing project for the client to visit</DialogDescription>
          </DialogHeader>
          {ongoingProjectLead && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium">{ongoingProjectLead.name}</p>
                <p className="text-gray-500">{ongoingProjectLead.phone} | {ongoingProjectLead.city || 'No location'}</p>
              </div>
              <div>
                <Label>Search Projects</Label>
                <Input placeholder="Search by name or location..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="mt-1" data-testid="project-search" />
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {ongoingProjects
                  .filter(p => {
                    if (!projectSearch) return true;
                    const q = projectSearch.toLowerCase();
                    return (p.project_name || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q);
                  })
                  .map(project => (
                    <div
                      key={project.project_id}
                      className={`border rounded-lg p-3 cursor-pointer transition-all ${selectedProject?.project_id === project.project_id ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'hover:border-gray-400'}`}
                      onClick={() => setSelectedProject(project)}
                      data-testid={`project-option-${project.project_id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{project.project_name || 'Unnamed Project'}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{project.location || 'No location'}</p>
                        </div>
                        {selectedProject?.project_id === project.project_id && <CheckCircle className="h-5 w-5 text-blue-600" />}
                      </div>
                      {project.site_engineer && (
                        <div className="mt-2 pt-2 border-t text-xs text-gray-600">
                          <p className="font-medium">{project.site_engineer.name}</p>
                          {project.site_engineer.phone && <p>{project.site_engineer.phone}</p>}
                          {project.site_engineer.email && <p>{project.site_engineer.email}</p>}
                        </div>
                      )}
                    </div>
                  ))
                }
                {ongoingProjects.filter(p => {
                  if (!projectSearch) return true;
                  const q = projectSearch.toLowerCase();
                  return (p.project_name || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q);
                }).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No ongoing projects found</p>
                )}
              </div>
              {selectedProject && selectedProject.site_engineer && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">Site Engineer for this project:</p>
                  <p className="font-semibold">{selectedProject.site_engineer.name}</p>
                  {selectedProject.site_engineer.phone && <p className="text-sm">{selectedProject.site_engineer.phone}</p>}
                  {selectedProject.site_engineer.email && <p className="text-sm text-gray-600">{selectedProject.site_engineer.email}</p>}
                </div>
              )}
              <div>
                <Label>Visit Date</Label>
                <Input type="date" value={svVisitDate} onChange={(e) => setSvVisitDate(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setOngoingProjectDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignOngoingProjectVisit} disabled={!selectedProject} className="bg-blue-600 hover:bg-blue-700" data-testid="confirm-ongoing-project-visit">
              <CheckCircle className="h-4 w-4 mr-2" />Assign Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Follow-up Dialog */}
      <Dialog open={followupDialog} onOpenChange={(open) => { setFollowupDialog(open); if (!open) setFollowupPendingStageId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600"><Calendar className="h-5 w-5" />Schedule Follow-up</DialogTitle>
            {followupPendingStageId && (
              <DialogDescription>Set follow-up date and time before moving to Follow-up stage</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Follow-up Date *</Label>
              <Input type="date" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} className="mt-1" min={new Date().toISOString().split('T')[0]} data-testid="followup-date-input" />
            </div>
            <div>
              <Label className="text-sm font-medium">Time</Label>
              <Input type="time" value={followupTime} onChange={(e) => setFollowupTime(e.target.value)} className="mt-1" data-testid="followup-time-input" />
            </div>
            <div>
              <Label className="text-sm font-medium">Remarks</Label>
              <Input placeholder="Reason for follow-up..." value={followupNote} onChange={(e) => setFollowupNote(e.target.value)} className="mt-1" data-testid="followup-note-input" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setFollowupDialog(false)}>Cancel</Button>
            <Button onClick={handleScheduleFollowup} disabled={!followupDate} className="bg-amber-600 hover:bg-amber-700" data-testid="confirm-followup-btn">
              <Calendar className="h-4 w-4 mr-2" />Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Follow-up Dialog (used by Record/New buttons on Follow-up stage leads) */}
      <Dialog open={quickFollowupDialog} onOpenChange={setQuickFollowupDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" /> Schedule Follow-up
            </DialogTitle>
            <DialogDescription>Set date, time and remarks for next follow-up</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Follow-up Date *</Label>
              <Input type="date" value={quickFollowupForm.date} onChange={(e) => setQuickFollowupForm({...quickFollowupForm, date: e.target.value})} className="mt-1" data-testid="quick-followup-date" />
            </div>
            <div>
              <Label className="text-sm font-medium">Time</Label>
              <Input type="time" value={quickFollowupForm.time} onChange={(e) => setQuickFollowupForm({...quickFollowupForm, time: e.target.value})} className="mt-1" data-testid="quick-followup-time" />
            </div>
            <div>
              <Label className="text-sm font-medium">Remarks</Label>
              <Input value={quickFollowupForm.remarks} onChange={(e) => setQuickFollowupForm({...quickFollowupForm, remarks: e.target.value})} placeholder="Notes about this follow-up..." className="mt-1" data-testid="quick-followup-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickFollowupDialog(false)}>Cancel</Button>
            <Button onClick={handleQuickFollowup} disabled={!quickFollowupForm.date} className="bg-amber-600 hover:bg-amber-700" data-testid="quick-followup-submit">
              <Calendar className="h-4 w-4 mr-2" /> Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* RE-Client Stage Action Dialog */}
      <Dialog open={reClientDialog} onOpenChange={setReClientDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            {reClientAction === 'approved' ? (
              <>
                <DialogTitle className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" /> Client Approved RE
                </DialogTitle>
                <DialogDescription>
                  Confirm that the client has approved the current RE. The lead will be moved to <strong>Negotiation</strong> stage.
                </DialogDescription>
              </>
            ) : (
              <>
                <DialogTitle className="flex items-center gap-2 text-orange-700">
                  <RefreshCw className="h-5 w-5" /> Request Revision
                </DialogTitle>
                <DialogDescription>
                  A new RE revision will be created (next in sequence) with the current data copied over. Lead will go back to <strong>RE-Request</strong> for Planning to edit.
                </DialogDescription>
              </>
            )}
          </DialogHeader>

          {reClientLead && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 border">
              <div className="flex justify-between">
                <span className="text-gray-500">Client:</span>
                <span className="font-semibold">{reClientLead.client_name}</span>
              </div>
              {reClientLead.project_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Project:</span>
                  <span className="font-medium">{reClientLead.project_name}</span>
                </div>
              )}
              {reClientLead.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone:</span>
                  <span>{reClientLead.phone}</span>
                </div>
              )}
            </div>
          )}

          {reClientAction === 'revision' && (
            <div>
              <Label className="text-sm font-medium">Revision Reason / Client Feedback *</Label>
              <Textarea
                value={reClientRevisionReason}
                onChange={(e) => setReClientRevisionReason(e.target.value)}
                placeholder="What changes does the client want? (e.g., reduce cost, change materials, add scope...)"
                className="mt-1 min-h-[80px]"
                data-testid="re-revision-reason-input"
              />
              <p className="text-xs text-gray-500 mt-1">This will be visible to Planning and attached to the new revision.</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReClientDialog(false)}>Cancel</Button>
            {reClientAction === 'approved' ? (
              <Button
                onClick={handleReClientAction}
                className="bg-green-600 hover:bg-green-700"
                data-testid="confirm-re-approve-btn"
              >
                <CheckCircle className="h-4 w-4 mr-2" /> Confirm Approved
              </Button>
            ) : (
              <Button
                onClick={handleReClientAction}
                disabled={!reClientRevisionReason.trim()}
                className="bg-orange-600 hover:bg-orange-700"
                data-testid="confirm-re-revision-btn"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Create Revision
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Remarks / Lost Reason Dialog */}
      <Dialog open={remarksDialog} onOpenChange={(open) => { setRemarksDialog(open); if (!open) { setRemarksLeadId(null); setRemarksStageId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="remarks-dialog-title">
              {remarksStageId === 'stg_lost' ? (
                <><XCircle className="h-5 w-5 text-red-500" /> Mark as Lost</>
              ) : (
                <><MessageSquare className="h-5 w-5 text-blue-500" /> {remarksStageName}</>
              )}
            </DialogTitle>
            <DialogDescription>
              {remarksStageId === 'stg_lost' ? 'Please provide a reason for marking this lead as lost' : `Add remarks before moving to ${remarksStageName}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {remarksStageId === 'stg_lost' ? (
              <div>
                <Label className="text-sm font-medium text-red-600">Reason *</Label>
                <textarea
                  value={lostReasonText}
                  onChange={(e) => setLostReasonText(e.target.value)}
                  placeholder="Why was this lead lost?"
                  className="w-full p-2 border rounded-md text-sm mt-1 min-h-[80px] border-red-200 focus:border-red-400 focus:ring-red-200"
                  data-testid="lost-reason-input"
                />
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium">Remarks</Label>
                <textarea
                  value={remarksText}
                  onChange={(e) => setRemarksText(e.target.value)}
                  placeholder={`Add remarks for ${remarksStageName}...`}
                  className="w-full p-2 border rounded-md text-sm mt-1 min-h-[80px]"
                  data-testid="remarks-input"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemarksDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleRemarksStageMove}
              className={remarksStageId === 'stg_lost' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
              data-testid="confirm-remarks-btn"
            >
              {remarksStageId === 'stg_lost' ? 'Mark as Lost' : `Move to ${remarksStageName}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <MobileBottomNav user={user} />

      {/* CRE-style Convert Deal Dialog (triggered on drag to Project Onboarded) */}
      <Dialog open={convertDealDialog} onOpenChange={setConvertDealDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]" style={{ overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600"><Target className="h-5 w-5" />Create Project from Deal</DialogTitle>
            <DialogDescription>Review and edit project details, then collect advance payment</DialogDescription>
          </DialogHeader>
          {convertDeal && (
            <div className="space-y-6">
              {/* Lead & People Info */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h4 className="font-semibold text-emerald-800 flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" /> Lead & People
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-emerald-600">Lead ID</p>
                    <p className="font-mono text-xs font-medium">{convertDeal.lead_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Client Name</p>
                    <p className="font-semibold">{convertDeal.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Phone</p>
                    <p className="font-medium">{convertDeal.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">City</p>
                    <p className="font-medium">{convertDeal.city || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Pre-Sales Person</p>
                    <p className="font-medium">{convertDeal.pre_sales_person_name || convertDeal.pre_sales_rep_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Sales Person</p>
                    <p className="font-medium">{convertDeal.sales_rep_name || convertDeal.assigned_to_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Source</p>
                    <p className="font-medium">{convertDeal.source || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600">Created</p>
                    <p className="font-medium text-xs">{convertDeal.created_at ? new Date(convertDeal.created_at).toLocaleDateString('en-IN') : '-'}</p>
                  </div>
                </div>
              </div>

              {convertDealRE && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-800 flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Rough Estimate Reference</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div><p className="text-xs text-purple-600">Project</p><p className="font-medium">{convertDealRE.project_name}</p></div>
                    <div><p className="text-xs text-purple-600">Area</p><p className="font-medium">{convertDealRE.sqft?.toLocaleString()} sqft</p></div>
                    <div><p className="text-xs text-purple-600">Timeline</p><p className="font-medium">{convertDealRE.handover_months || 12} months</p></div>
                    <div><p className="text-xs text-purple-600">Value</p><p className="font-bold text-purple-700">{formatCurrency(convertDealRE.estimated_total)}</p></div>
                  </div>
                </div>
              )}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-amber-600" />Project Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><Label>Project Name *</Label><Input value={convertForm.name} onChange={(e) => setConvertForm({ ...convertForm, name: e.target.value })} className="mt-1" data-testid="convert-project-name" /></div>
                  <div><Label>Location *</Label><Input value={convertForm.location} onChange={(e) => setConvertForm({ ...convertForm, location: e.target.value })} className="mt-1" data-testid="convert-location" /></div>
                  <div><Label>Area (sqft)</Label><NumericInput value={convertForm.sqft} onChange={(e) => setConvertForm({ ...convertForm, sqft: e.target.value })} className="mt-1" /></div>
                  <div>
                    <Label>Building Type</Label>
                    <Select value={convertForm.building_type || 'residential'} onValueChange={(v) => setConvertForm({ ...convertForm, building_type: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="residential">Residential</SelectItem><SelectItem value="commercial">Commercial</SelectItem><SelectItem value="industrial">Industrial</SelectItem><SelectItem value="mixed">Mixed Use</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Start Date</Label><Input type="date" value={convertForm.expected_start_date} onChange={(e) => setConvertForm({ ...convertForm, expected_start_date: e.target.value })} className="mt-1" /></div>
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-green-600" />Client Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Client Name *</Label><Input value={convertForm.client_name} onChange={(e) => setConvertForm({ ...convertForm, client_name: e.target.value })} className="mt-1" data-testid="convert-client-name" /></div>
                  <div><Label>Phone</Label><Input value={convertForm.client_phone} onChange={(e) => setConvertForm({ ...convertForm, client_phone: e.target.value })} className="mt-1" /></div>
                  <div className="col-span-2"><Label>Email</Label><Input value={convertForm.client_email} onChange={(e) => setConvertForm({ ...convertForm, client_email: e.target.value })} className="mt-1" /></div>
                </div>
              </div>
              <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4" />Advance Payment</h4>
                <div className="mb-3">
                  <Label className="text-green-700">Total Advance Amount *</Label>
                  <div className="relative mt-1"><span className="absolute left-3 top-2.5 text-gray-500">₹</span><NumericInput placeholder="Amount" value={convertAdvanceAmount} onChange={(e) => {
                    setConvertAdvanceAmount(e.target.value);
                    if (convertPaymentEntries.length === 1) {
                      setConvertPaymentEntries([{ ...convertPaymentEntries[0], amount: e.target.value }]);
                    }
                  }} className="pl-8" data-testid="convert-advance-amount" /></div>
                </div>
                {convertAdvanceAmount && parseFloat(convertAdvanceAmount) > 0 && (
                  <MultiPaymentInput
                    totalAmount={parseFloat(convertAdvanceAmount) || 0}
                    entries={convertPaymentEntries}
                    onChange={setConvertPaymentEntries}
                  />
                )}
                {convertAdvanceAmount && parseFloat(convertAdvanceAmount) > 0 && convertDealRE?.estimated_total && (
                  <div className="mt-3 p-3 bg-white rounded border border-green-300">
                    <div className="flex justify-between text-sm"><span>Estimated Total</span><span>{formatCurrency(convertDealRE.estimated_total)}</span></div>
                    <div className="flex justify-between text-sm text-green-600 mt-1"><span>Advance</span><span>- {formatCurrency(parseFloat(convertAdvanceAmount))}</span></div>
                    <div className="flex justify-between font-semibold mt-2 pt-2 border-t"><span>Balance</span><span className="text-amber-700">{formatCurrency(convertDealRE.estimated_total - parseFloat(convertAdvanceAmount))}</span></div>
                  </div>
                )}
              </div>
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={convertAccountantConfirmed} onChange={(e) => setConvertAccountantConfirmed(e.target.checked)} className="w-5 h-5 rounded border-orange-300 mt-0.5" data-testid="convert-accountant-checkbox" />
                  <div><span className="font-medium text-orange-800">Accountant Verification Required</span><p className="text-sm text-orange-600 mt-1">Payment will be verified by accounts department.</p></div>
                </label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setConvertDealDialog(false)}>Cancel</Button>
            <Button onClick={handleConvertDealFromSales} className="bg-green-600 hover:bg-green-700" disabled={!convertAdvanceAmount || parseFloat(convertAdvanceAmount) <= 0 || convertPaymentEntries.length === 0 || !convertAccountantConfirmed} data-testid="confirm-convert-deal-sales">
              <CheckCircle className="h-4 w-4 mr-2" />Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Prospect Login (Move to RE Client mobile flow) — DEPRECATED, kept for old leads */}
      <CreateProspectUserDialog
        open={prospectDialog.open}
        onOpenChange={(o) => !o && setProspectDialog({ open: false, lead: null })}
        lead={prospectDialog.lead}
        onCreated={() => fetchLeads && fetchLeads()}
      />

      {/* Regenerate RE — sends back to Planning with remarks */}
      <Dialog open={regenDialog.open} onOpenChange={(o) => !o && setRegenDialog({ open: false, lead: null })}>
        <DialogContent className="max-w-md" data-testid="regen-re-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-purple-600" /> Regenerate Rough Estimate</DialogTitle>
            <DialogDescription>
              Send this RE back to Planning for a fresh revision. The current public link stays live until the new RE is GM-approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Remarks for Planning <span className="text-red-500">*</span></Label>
              <Textarea
                value={regenRemarks}
                onChange={(e) => setRegenRemarks(e.target.value)}
                placeholder="What needs to change? e.g. add servant room, lower handover months, swap finishes..."
                rows={4}
                data-testid="regen-remarks-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenDialog({ open: false, lead: null })}>Cancel</Button>
            <Button onClick={handleRegenerateRE} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="regen-submit-btn">
              <RefreshCw className="h-4 w-4 mr-1" /> Send to Planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Lead — change owner to another salesperson */}
      <Dialog open={reassignDialog.open} onOpenChange={(o) => !o && !reassignDialog.submitting && setReassignDialog({ open: false, lead: null, new_owner: '', reason: '', submitting: false })}>
        <DialogContent className="max-w-md" data-testid="reassign-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-purple-600" /> Reassign Lead</DialogTitle>
            <DialogDescription>
              Move this lead to another teammate. Current owner: <b>{reassignDialog.lead?.assigned_to_name || '—'}</b>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">New Salesperson <span className="text-red-500">*</span></Label>
              <Select value={reassignDialog.new_owner} onValueChange={v => setReassignDialog(d => ({ ...d, new_owner: v }))}>
                <SelectTrigger className="h-9 mt-1" data-testid="reassign-owner-select"><SelectValue placeholder="Pick a teammate..." /></SelectTrigger>
                <SelectContent>
                  {reassignOptions.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-400 text-center">No eligible teammates found.</div>
                  ) : reassignOptions.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      <span className="flex items-center gap-2"><span>{u.name}</span><span className="text-[10px] text-gray-400">{u.role}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                rows={3}
                value={reassignDialog.reason}
                onChange={e => setReassignDialog(d => ({ ...d, reason: e.target.value }))}
                placeholder="Why is this being reassigned?"
                data-testid="reassign-reason-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialog({ open: false, lead: null, new_owner: '', reason: '', submitting: false })} disabled={reassignDialog.submitting}>Cancel</Button>
            <Button onClick={handleReassignSubmit} disabled={reassignDialog.submitting || !reassignDialog.new_owner} className="bg-purple-600 hover:bg-purple-700 text-white" data-testid="reassign-submit-btn">
              <UserCheck className="h-4 w-4 mr-1" /> Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
