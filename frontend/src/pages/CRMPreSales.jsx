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
  Users, LogOut, Plus, Search, Upload, Phone, PhoneOff, Mail, MapPin, Calendar, Building2, 
  ArrowRight, RefreshCw, GripVertical, Eye, Clock, User, MessageSquare,
  FileText, History, Send, X, Settings, ChevronDown, Trash2, Edit2,
  LayoutGrid, List, MoreVertical, Bell
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SOURCE_COLORS = {
  meta: 'bg-amber-50 text-amber-700',
  seo: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-700',
  referral: 'bg-purple-100 text-purple-700',
  walk_in: 'bg-amber-100 text-amber-700',
  website: 'bg-cyan-100 text-cyan-700',
  csv_import: 'bg-pink-100 text-pink-700',
  google_sheets: 'bg-red-100 text-red-700'
};

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'checkbox', label: 'Checkbox' },
];

export default function CRMPreSales() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [activeStage, setActiveStage] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'kanban' or 'list'
  const [syncingSheets, setSyncingSheets] = useState(false);
  
  // Dialogs
  const [createLeadDialog, setCreateLeadDialog] = useState(false);
  
  // Date filter
  const [dateFilter, setDateFilter] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState(false);
  const [leadDetailDialog, setLeadDetailDialog] = useState(false);
  const [editLeadDialog, setEditLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [createStageDialog, setCreateStageDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [addFieldDialog, setAddFieldDialog] = useState(false);
  const [manageFieldsDialog, setManageFieldsDialog] = useState(false);
  const [deleteFieldDialog, setDeleteFieldDialog] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Appointment booking
  const [appointmentDialog, setAppointmentDialog] = useState(false);
  const [appointmentLeadId, setAppointmentLeadId] = useState(null);
  const [appointmentForm, setAppointmentForm] = useState({
    date: '',
    time: '',
    type: ''
  });
  // Appointment edit
  const [apptEditDialog, setApptEditDialog] = useState(false);
  const [apptEditForm, setApptEditForm] = useState({ date: '', time: '', type: '' });
  
  // Lead Form
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'other',
    address: '',
    city: '',
    state: '',
    pincode: '',
    notes: '',
    custom_fields: {}
  });

  // Edit Lead Form
  const [editLeadForm, setEditLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'other',
    address: '',
    city: '',
    state: '',
    pincode: '',
    notes: '',
    custom_fields: {}
  });
  
  // New Field Form (Notion-style inline)
  const [newFieldForm, setNewFieldForm] = useState({
    name: '',
    label: '',
    field_type: 'text',
    options: []
  });
  const [newFieldOption, setNewFieldOption] = useState('');
  
  // Stage Form
  const [stageForm, setStageForm] = useState({ name: '', color: '#6366f1' });
  
  // Lead Detail State
  const [newRemark, setNewRemark] = useState('');
  const [leadSummary, setLeadSummary] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [detailTab, setDetailTab] = useState('overview');
  
  const [draggedLead, setDraggedLead] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, dashboardRes, stagesRes, fieldsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/pre-sales/dashboard`),
        axios.get(`${API}/crm/stages?stage_type=pre_sales`),
        axios.get(`${API}/crm/custom-fields`)
      ]);
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setStages(stagesRes.data);
      setCustomFields(fieldsRes.data);
      
      const leadsRes = await axios.get(`${API}/crm/pre-sales/leads`);
      setLeads(leadsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      } else if (error.response?.status === 403) {
        toast.error('Access denied. Pre-Sales access required.');
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

  // ============ SYNC GOOGLE SHEETS ============
  const handleSyncSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await axios.post(`${API}/sheets/auto-sync/run`, {}, { withCredentials: true });
      if (res.data.new_leads > 0) {
        toast.success(`${res.data.new_leads} new lead(s) synced from Google Sheets!`);
        fetchData(false);
      } else {
        toast.info('No new leads found in connected sheets');
      }
    } catch (error) {
      const msg = error.response?.data?.detail || 'Sync failed';
      if (msg.includes('No sheets connected')) {
        toast.error('No Google Sheets connected. Ask admin to connect a sheet from Marketing Board.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSyncingSheets(false);
    }
  };

  // ============ CREATE LEAD ============
  const handleCreateLead = async () => {
    if (!leadForm.name) {
      toast.error('Name is required');
      return;
    }

    try {
      await axios.post(`${API}/crm/pre-sales/leads`, leadForm);
      toast.success('Lead created successfully');
      setCreateLeadDialog(false);
      resetLeadForm();
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create lead');
    }
  };

  const resetLeadForm = () => {
    setLeadForm({
      name: '', email: '', phone: '', source: 'other',
      address: '', city: '', state: '', pincode: '', notes: '', custom_fields: {}
    });
  };

  // ============ INLINE ADD FIELD (NOTION STYLE) ============
  const handleAddNewField = async () => {
    if (!newFieldForm.name || !newFieldForm.label) {
      toast.error('Field name and label are required');
      return;
    }
    
    const fieldName = newFieldForm.name.toLowerCase().replace(/\s+/g, '_');
    
    try {
      await axios.post(`${API}/crm/custom-fields`, {
        name: fieldName,
        label: newFieldForm.label,
        field_type: newFieldForm.field_type,
        options: newFieldForm.options,
        required: false
      });
      toast.success('Custom field added');
      setAddFieldDialog(false);
      setNewFieldForm({ name: '', label: '', field_type: 'text', options: [] });
      
      // Refresh custom fields
      const fieldsRes = await axios.get(`${API}/crm/custom-fields`);
      setCustomFields(fieldsRes.data);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add field');
    }
  };

  // ============ DELETE CUSTOM FIELD ============
  const openDeleteFieldDialog = (field) => {
    setFieldToDelete(field);
    setDeleteConfirmText('');
    setDeleteFieldDialog(true);
  };

  const handleDeleteField = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    
    try {
      await axios.delete(`${API}/crm/custom-fields/${fieldToDelete.field_id}`);
      toast.success('Custom field deleted');
      setDeleteFieldDialog(false);
      setFieldToDelete(null);
      setDeleteConfirmText('');
      
      // Refresh custom fields
      const fieldsRes = await axios.get(`${API}/crm/custom-fields`);
      setCustomFields(fieldsRes.data);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete field');
    }
  };

  // ============ LEAD STAGES ============
  const handleCreateStage = async () => {
    if (!stageForm.name) {
      toast.error('Stage name is required');
      return;
    }

    try {
      await axios.post(`${API}/crm/stages`, {
        name: stageForm.name,
        stage_type: 'pre_sales',
        color: stageForm.color
      });
      toast.success('Stage created');
      setCreateStageDialog(false);
      setStageForm({ name: '', color: '#6366f1' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create stage');
    }
  };

  const handleStageChange = async (leadId, newStageId, appointmentData = null) => {
    try {
      // Check if the target stage is a final stage (triggers transfer)
      const targetStage = stages.find(s => s.stage_id === newStageId);
      if (targetStage?.is_final && !appointmentData) {
        // Show appointment booking dialog
        setAppointmentLeadId(leadId);
        setAppointmentForm({ date: '', time: '', type: '' });
        setAppointmentDialog(true);
        return;
      }
      
      const payload = { stage_id: newStageId };
      if (appointmentData) {
        payload.appointment_date = appointmentData.date;
        payload.appointment_time = appointmentData.time;
        payload.appointment_type = appointmentData.type;
      }
      
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, payload);
      
      if (result.data.transferred_to_sales) {
        toast.success('Appointment booked & lead transferred to Sales!');
      } else {
        toast.success('Lead stage updated');
      }
      
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update stage');
    }
  };
  
  const handleBookAppointment = async () => {
    if (!appointmentForm.date || !appointmentForm.time || !appointmentForm.type) {
      toast.error('Please fill all appointment details');
      return;
    }
    
    // Get the final stage id
    const finalStage = stages.find(s => s.is_final);
    if (!finalStage) {
      toast.error('No final stage found');
      return;
    }
    
    setAppointmentDialog(false);
    await handleStageChange(appointmentLeadId, finalStage.stage_id, appointmentForm);
  };

  const openApptEdit = () => {
    const appt = selectedLead?.appointment;
    setApptEditForm({
      date: appt?.appointment_date || '',
      time: appt?.appointment_time || '',
      type: appt?.appointment_type || ''
    });
    setApptEditDialog(true);
  };

  const handleSaveApptEdit = async () => {
    if (!apptEditForm.date || !apptEditForm.time || !apptEditForm.type) {
      toast.error('Please fill all appointment fields');
      return;
    }
    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}/appointment`, {
        appointment_date: apptEditForm.date,
        appointment_time: apptEditForm.time,
        appointment_type: apptEditForm.type
      });
      toast.success('Appointment updated');
      setApptEditDialog(false);
      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setSelectedLead(res.data);
      fetchLeads();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update appointment');
    }
  };

  // ============ LEAD DETAILS & REMARKS ============
  const openLeadDetail = (lead) => {
    setSelectedLead(lead);
    setLeadSummary(lead.summary || '');
    setDetailTab('overview');
    setLeadDetailDialog(true);
  };

  const openEditLead = (lead) => {
    setSelectedLead(lead);
    setEditLeadForm({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source || 'other',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      pincode: lead.pincode || '',
      notes: lead.notes || '',
      custom_fields: lead.custom_fields || {}
    });
    setEditLeadDialog(true);
  };

  const handleUpdateLead = async () => {
    if (!editLeadForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}`, editLeadForm);
      toast.success('Lead updated successfully');
      setEditLeadDialog(false);
      fetchData(false);
      // Also refresh the detail dialog if open
      if (leadDetailDialog) {
        const updatedLead = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
        setSelectedLead(updatedLead.data);
      }
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update lead');
    }
  };

  const handleAddRemark = async () => {
    if (!newRemark.trim()) return;
    
    try {
      await axios.post(`${API}/crm/leads/${selectedLead.lead_id}/remarks`, {
        remark: newRemark,
        remark_type: 'general'
      });
      toast.success('Remark added');
      setNewRemark('');
      
      // Refresh lead data
      const leadRes = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setSelectedLead(leadRes.data);
    } catch (error) {
      toast.error('Failed to add remark');
    }
  };

  const handleSaveSummary = async () => {
    try {
      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}`, {
        summary: leadSummary
      });
      toast.success('Summary saved');
    } catch (error) {
      toast.error('Failed to save summary');
    }
  };

  const handleScheduleFollowUp = async () => {
    if (!followUpDate) {
      toast.error('Please select a follow-up date');
      return;
    }
    
    try {
      await axios.post(`${API}/crm/leads/${selectedLead.lead_id}/follow-ups`, {
        scheduled_date: followUpDate,
        note: followUpNote
      });
      toast.success('Follow-up scheduled');
      setFollowUpDate('');
      setFollowUpNote('');
      
      // Refresh lead data
      const leadRes = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
      setSelectedLead(leadRes.data);
    } catch (error) {
      toast.error('Failed to schedule follow-up');
    }
  };

  // ============ DRAG & DROP ============
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

  // ============ FILTERS ============
  const filteredLeads = leads.filter(lead => {
    const matchesStage = activeStage === 'all' || lead.current_stage_id === activeStage;
    const matchesSearch = !searchQuery || 
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    const matchesSource = !selectedSource || selectedSource === 'all' || lead.source === selectedSource;
    
    // Follow-up filter: show only leads with today's follow-up
    if (followUpFilter) {
      const today = new Date().toISOString().split('T')[0];
      const pendingFollowups = (lead.follow_ups || []).filter(f => !f.completed);
      const hasToday = pendingFollowups.some(f => f.scheduled_date === today) || lead.next_followup_date === today;
      if (!hasToday) return false;
    }
    
    // Date filter — matches against: created_at, stage_history dates, follow-up dates
    let matchesDate = true;
    if (dateFilter) {
      const leadDate = lead.created_at ? lead.created_at.split('T')[0] : '';
      const followupDates = (lead.follow_ups || []).filter(f => !f.completed).map(f => f.scheduled_date);
      const nextFollowup = lead.next_followup_date || '';
      // Stage history dates (timeline)
      const timelineDates = (lead.stage_history || []).map(h => h.moved_at ? h.moved_at.split('T')[0] : '').filter(Boolean);
      const allDates = [leadDate, nextFollowup, ...followupDates, ...timelineDates];
      
      if (dateFilterEnd) {
        const inRange = (d) => d >= dateFilter && d <= dateFilterEnd;
        matchesDate = allDates.some(d => inRange(d));
      } else {
        matchesDate = allDates.includes(dateFilter);
      }
    }
    
    return matchesStage && matchesSearch && matchesSource && matchesDate;
  }).sort((a, b) => {
    const getDate = (lead) => {
      const fup = lead.next_followup_date || (lead.follow_ups || []).filter(f => !f.completed).map(f => f.scheduled_date).sort()[0];
      return fup || lead.created_at?.split('T')[0] || '9999';
    };
    return getDate(a).localeCompare(getDate(b));
  });

  const getLeadsByStage = (stageId) => {
    return filteredLeads.filter(lead => lead.current_stage_id === stageId);
  };
  
  const getStageName = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage?.name || stageId;
  };

  if (loading && !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-full mx-auto px-4 py-3 sm:px-6">
        {/* Compact Stats - Single Row */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg px-4 py-2 shrink-0">
            <span className="text-xs font-medium opacity-80">Total</span>
            <span className="text-xl font-bold">{dashboard?.total_leads || 0}</span>
          </div>
          {stages.map(stage => {
            const count = dashboard?.stages?.find(s => s.stage_id === stage.stage_id)?.lead_count || 0;
            return (
            <div 
              key={stage.stage_id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 shrink-0 ${stage.stage_id === 'stg_new_rnr' ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-200'}`}
              data-testid={`stage-count-${stage.stage_id}`}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }}></div>
              <span className="text-xs text-gray-600 whitespace-nowrap">{stage.name}</span>
              <span className="text-sm font-bold" style={{ color: stage.color }}>{count}</span>
            </div>
            );
          })}
        </div>

        {/* Search & Filters + View Toggle */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search leads by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-input"
            />
          </div>
          
          {/* Date Filter */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <Calendar className="h-4 w-4 text-amber-600" />
            <span className="text-xs text-amber-700 font-medium whitespace-nowrap">Date:</span>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-7 text-xs w-36 border-amber-300"
              data-testid="presales-date-filter"
            />
            <span className="text-xs text-amber-500">to</span>
            <Input
              type="date"
              value={dateFilterEnd}
              onChange={(e) => setDateFilterEnd(e.target.value)}
              className="h-7 text-xs w-36 border-amber-300"
              data-testid="presales-date-end-filter"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-100"
              onClick={() => { setDateFilter(new Date().toISOString().split('T')[0]); setDateFilterEnd(''); }}
              data-testid="presales-today-btn"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-500 hover:bg-gray-100"
              onClick={() => { setDateFilter(''); setDateFilterEnd(''); }}
              data-testid="presales-clear-date-btn"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Daily Follow-up Filter */}
          <Button
            variant={followUpFilter ? "default" : "outline"}
            size="sm"
            className={followUpFilter ? "bg-amber-500 hover:bg-amber-600 text-white h-8 text-xs" : "border-amber-300 text-amber-700 hover:bg-amber-50 h-8 text-xs"}
            onClick={() => setFollowUpFilter(!followUpFilter)}
            data-testid="presales-followup-filter-btn"
          >
            <Bell className="h-3.5 w-3.5 mr-1" />
            Daily Follow-up
            {followUpFilter && ` (${filteredLeads.length})`}
          </Button>
          
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="seo">SEO</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="walk_in">Walk-in</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          
          {user?.role === 'super_admin' && (
            <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 hover:text-amber-700"
              onClick={() => window.location.href = '/settings/stages?type=pre_sales'}
              data-testid="manage-presales-stages-btn">
              <Settings className="h-3.5 w-3.5" /> Manage Stages
            </Button>
          )}

          {/* View Toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              onClick={() => setCreateLeadDialog(true)}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
              data-testid="create-lead-btn"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Lead
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncSheets}
              disabled={syncingSheets}
              className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              data-testid="sync-sheets-btn"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingSheets ? 'animate-spin' : ''}`} />
              {syncingSheets ? 'Syncing...' : 'Sync Sheets'}
            </Button>
            <div className="flex items-center border rounded-lg overflow-hidden bg-white">
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
        </div>

        {/* List View */}
        {viewMode === 'list' && (
          <div className="bg-white rounded-lg border shadow-sm">
            {/* Stage Tabs */}
            <div className="border-b overflow-x-auto">
              <div className="flex">
                <button
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeStage === 'all' 
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50' 
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
                        ? 'border-indigo-500 text-indigo-600 bg-indigo-50' 
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
              </div>
            </div>

            {/* List Table */}
            <div className="w-full">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[22%]">Lead</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[22%]">Contact</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[14%]">Source</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[16%]">Stage</th>
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
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {lead.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-xs truncate">{lead.name}</p>
                            {lead.city && <p className="text-[10px] text-gray-500 truncate">{lead.city}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="space-y-0 min-w-0">
                          {lead.phone && (
                            <p className="text-xs text-gray-600 truncate">{lead.phone}</p>
                          )}
                          {lead.email && (
                            <p className="text-[10px] text-gray-500 truncate">{lead.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge className={`text-[10px] px-1.5 truncate ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                          {lead.source?.replace('_', ' ').substring(0, 10)}
                        </Badge>
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
                        <span className="text-xs text-gray-500">
                          {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
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
                    <Badge className="bg-green-100 text-green-700 text-xs">Final</Badge>
                  )}
                </div>
                
                <div className="bg-gray-100 rounded-b-lg p-2 flex-1 space-y-2 overflow-y-auto">
                  {getLeadsByStage(stage.stage_id).map(lead => (
                    <Card
                      key={lead.lead_id}
                      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all"
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onClick={() => openLeadDetail(lead)}
                      data-testid={`lead-card-${lead.lead_id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-gray-300" />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                              {lead.name?.charAt(0)?.toUpperCase()}
                            </div>
                          </div>
                          <Badge className={SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}>
                            {lead.source}
                          </Badge>
                        </div>
                        
                        <h4 className="font-semibold text-gray-900 mb-1">{lead.name}</h4>
                        
                        {lead.phone && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </p>
                        )}
                        {lead.email && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </p>
                        )}
                        
                        {/* RNR Button + Log (only in RNR stage) */}
                        {lead.current_stage_id === 'stg_rnr' && (
                          <div className="mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs text-red-600 border-red-300 hover:bg-red-50 mb-1"
                              data-testid={`rnr-btn-${lead.lead_id}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await axios.post(`${API}/crm/leads/${lead.lead_id}/rnr-log`);
                                  toast.success(`RNR #${(lead.rnr_count || 0) + 1} logged`);
                                  fetchData(false);
                                } catch (err) {
                                  toast.error(err.response?.data?.detail || 'Failed to log RNR');
                                }
                              }}
                            >
                              <PhoneOff className="h-3 w-3 mr-1" /> RNR (Ring Again)
                            </Button>
                            {lead.rnr_log?.length > 0 && (
                              <div className="space-y-0.5 max-h-20 overflow-y-auto">
                                {lead.rnr_log.slice(-5).map((log, i) => (
                                  <div key={i} className="text-[10px] text-gray-500 flex justify-between px-1">
                                    <span className="text-red-500 font-medium">RNR {log.attempt}</span>
                                    <span>{new Date(log.timestamp).toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit'})} {new Date(log.timestamp).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Show if has remarks or follow-ups */}
                        {(lead.remarks?.length > 0 || lead.follow_ups?.length > 0 || lead.rnr_count > 0) && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {lead.rnr_count > 0 && (
                              <Badge variant="outline" className="text-xs text-red-600 border-red-300 bg-red-50" data-testid={`rnr-count-${lead.lead_id}`}>
                                <PhoneOff className="h-3 w-3 mr-1" /> RNR: {lead.rnr_count}
                              </Badge>
                            )}
                            {lead.remarks?.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <MessageSquare className="h-3 w-3 mr-1" /> {lead.remarks.length}
                              </Badge>
                            )}
                            {lead.follow_ups?.length > 0 && (
                              <Badge variant="outline" className="text-xs text-orange-600">
                                <Calendar className="h-3 w-3 mr-1" /> Follow-up
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        {/* RNR Redistributed info */}
                        {lead.rnr_redistributed && lead.current_stage_id === 'stg_new_rnr' && (
                          <div className="mt-1.5 px-2 py-1 rounded bg-red-50 border border-red-200 text-xs text-red-600" data-testid={`rnr-redistributed-${lead.lead_id}`}>
                            <RefreshCw className="inline h-3 w-3 mr-1" />
                            Redistributed {lead.assigned_to_name ? `to ${lead.assigned_to_name}` : ''}
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-gray-400">
                            {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openEditLead(lead); }}
                              data-testid={`edit-lead-btn-${lead.lead_id}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
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

      {/* ============ CREATE LEAD DIALOG ============ */}
      <Dialog open={createLeadDialog} onOpenChange={setCreateLeadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Add New Lead</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setAddFieldDialog(true)}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Field
              </Button>
            </DialogTitle>
            <DialogDescription>Enter lead details. Custom fields appear below.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Standard Fields */}
            <div className="col-span-2 sm:col-span-1">
              <Label>Name *</Label>
              <Input
                value={leadForm.name}
                onChange={(e) => setLeadForm({...leadForm, name: e.target.value})}
                placeholder="Full name"
                data-testid="input-name"
              />
            </div>
            
            <div className="col-span-2 sm:col-span-1">
              <Label>Source</Label>
              <Select value={leadForm.source} onValueChange={(v) => setLeadForm({...leadForm, source: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Label>Email</Label>
              <Input
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm({...leadForm, email: e.target.value})}
                placeholder="email@example.com"
              />
            </div>
            
            <div>
              <Label>Phone</Label>
              <Input
                value={leadForm.phone}
                onChange={(e) => setLeadForm({...leadForm, phone: e.target.value})}
                placeholder="+91 9876543210"
              />
            </div>
            
            <div className="col-span-2">
              <Label>Address</Label>
              <Input
                value={leadForm.address}
                onChange={(e) => setLeadForm({...leadForm, address: e.target.value})}
                placeholder="Street address"
              />
            </div>
            
            <div>
              <Label>City</Label>
              <Input
                value={leadForm.city}
                onChange={(e) => setLeadForm({...leadForm, city: e.target.value})}
                placeholder="City"
              />
            </div>
            
            <div>
              <Label>State</Label>
              <Input
                value={leadForm.state}
                onChange={(e) => setLeadForm({...leadForm, state: e.target.value})}
                placeholder="State"
              />
            </div>
            
            {/* Divider for Custom Fields */}
            {customFields.length > 0 && (
              <div className="col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-medium text-gray-700">Custom Fields</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setManageFieldsDialog(true)}
                    className="text-xs text-gray-500 hover:text-red-600"
                  >
                    <Edit2 className="h-3 w-3 mr-1" /> Manage
                  </Button>
                </div>
              </div>
            )}
            
            {/* Custom Fields */}
            {customFields.map(field => (
              <div key={field.field_id} className={field.field_type === 'textarea' ? 'col-span-2' : ''}>
                <Label>{field.label} {field.required && '*'}</Label>
                {field.field_type === 'text' && (
                  <Input
                    value={leadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setLeadForm({
                      ...leadForm,
                      custom_fields: {...leadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                  />
                )}
                {field.field_type === 'number' && (
                  <NumericInput
                    
                    value={leadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setLeadForm({
                      ...leadForm,
                      custom_fields: {...leadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                  />
                )}
                {field.field_type === 'dropdown' && (
                  <Select 
                    value={leadForm.custom_fields[field.field_id] || ''} 
                    onValueChange={(v) => setLeadForm({
                      ...leadForm,
                      custom_fields: {...leadForm.custom_fields, [field.field_id]: v}
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.field_type === 'textarea' && (
                  <Textarea
                    value={leadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setLeadForm({
                      ...leadForm,
                      custom_fields: {...leadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    rows={3}
                  />
                )}
                {field.field_type === 'date' && (
                  <Input
                    type="date"
                    value={leadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setLeadForm({
                      ...leadForm,
                      custom_fields: {...leadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                  />
                )}
              </div>
            ))}
            
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={leadForm.notes}
                onChange={(e) => setLeadForm({...leadForm, notes: e.target.value})}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateLeadDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateLead} data-testid="submit-lead">
              <Plus className="h-4 w-4 mr-1" /> Create Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ ADD FIELD DIALOG (NOTION STYLE) ============ */}
      <Dialog open={addFieldDialog} onOpenChange={setAddFieldDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              Add Custom Field
            </DialogTitle>
            <DialogDescription>Create a new field for all leads</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Field Name (ID)</Label>
              <Input
                value={newFieldForm.name}
                onChange={(e) => setNewFieldForm({...newFieldForm, name: e.target.value})}
                placeholder="e.g., company_size"
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase, no spaces</p>
            </div>
            
            <div>
              <Label>Display Label</Label>
              <Input
                value={newFieldForm.label}
                onChange={(e) => setNewFieldForm({...newFieldForm, label: e.target.value})}
                placeholder="e.g., Company Size"
              />
            </div>
            
            <div>
              <Label>Field Type</Label>
              <Select value={newFieldForm.field_type} onValueChange={(v) => setNewFieldForm({...newFieldForm, field_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Options for dropdown */}
            {newFieldForm.field_type === 'dropdown' && (
              <div>
                <Label>Options</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newFieldOption}
                    onChange={(e) => setNewFieldOption(e.target.value)}
                    placeholder="Add option..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newFieldOption) {
                        setNewFieldForm({...newFieldForm, options: [...newFieldForm.options, newFieldOption]});
                        setNewFieldOption('');
                      }
                    }}
                  />
                  <Button 
                    type="button" 
                    size="sm"
                    onClick={() => {
                      if (newFieldOption) {
                        setNewFieldForm({...newFieldForm, options: [...newFieldForm.options, newFieldOption]});
                        setNewFieldOption('');
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {newFieldForm.options.map((opt, idx) => (
                    <Badge key={idx} variant="secondary" className="py-1 px-2">
                      {opt}
                      <button
                        type="button"
                        onClick={() => setNewFieldForm({
                          ...newFieldForm,
                          options: newFieldForm.options.filter((_, i) => i !== idx)
                        })}
                        className="ml-2 hover:text-red-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldDialog(false)}>Cancel</Button>
            <Button onClick={handleAddNewField}>
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ LEAD DETAIL DIALOG ============ */}
      <Dialog open={leadDetailDialog} onOpenChange={setLeadDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold">
                  {selectedLead?.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold">{selectedLead?.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={SOURCE_COLORS[selectedLead?.source] || SOURCE_COLORS.other}>
                      {selectedLead?.source}
                    </Badge>
                    <Badge variant="outline">{getStageName(selectedLead?.current_stage_id)}</Badge>
                  </div>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setLeadDetailDialog(false); openEditLead(selectedLead); }}
                className="text-amber-600 border-blue-200 hover:bg-amber-50"
              >
                <Edit2 className="h-4 w-4 mr-1" /> Edit
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="remarks">Remarks</TabsTrigger>
                <TabsTrigger value="followup">Follow-up</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              
              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Contact Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    {selectedLead.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{selectedLead.email}</span>
                      </div>
                    )}
                    {selectedLead.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{selectedLead.phone}</span>
                      </div>
                    )}
                    {selectedLead.address && (
                      <div className="flex items-center gap-2 col-span-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{[selectedLead.address, selectedLead.city, selectedLead.state].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                {/* Appointment Info - only for leads in Appointment Booked (final) stage */}
                {stages.find(s => s.is_final && s.stage_id === selectedLead.current_stage_id) && selectedLead.appointment && Object.keys(selectedLead.appointment).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-600 flex items-center justify-between">
                        <span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Appointment</span>
                        <Button variant="outline" size="sm" onClick={openApptEdit} data-testid="edit-appointment-btn">
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-green-50 rounded-lg p-3">
                          <span className="text-xs text-green-600">Date</span>
                          <p className="font-medium">{selectedLead.appointment.appointment_date}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                          <span className="text-xs text-green-600">Time</span>
                          <p className="font-medium">{selectedLead.appointment.appointment_time}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                          <span className="text-xs text-green-600">Type</span>
                          <p className="font-medium capitalize">{selectedLead.appointment.appointment_type?.replace('_', ' ')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Custom Fields */}
                {Object.keys(selectedLead.custom_fields || {}).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-600">Additional Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                      {Object.entries(selectedLead.custom_fields).map(([key, value]) => {
                        const field = customFields.find(f => f.field_id === key || f.name === key);
                        return (
                          <div key={key} className="bg-gray-50 rounded-lg p-3">
                            <span className="text-xs text-gray-500">{field?.label || key}</span>
                            <p className="font-medium">{value || '-'}</p>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
                
                {/* Lead Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Lead Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={leadSummary}
                      onChange={(e) => setLeadSummary(e.target.value)}
                      placeholder="Write a summary about this lead... (requirements, preferences, key notes)"
                      rows={4}
                      className="mb-2"
                    />
                    <Button size="sm" onClick={handleSaveSummary}>
                      Save Summary
                    </Button>
                  </CardContent>
                </Card>
                
                {/* Stage Change */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Move to Stage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <Button
                          key={stage.stage_id}
                          variant={selectedLead.current_stage_id === stage.stage_id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            handleStageChange(selectedLead.lead_id, stage.stage_id);
                            setLeadDetailDialog(false);
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
                  </CardContent>
                </Card>

                {/* RNR History */}
                {selectedLead.rnr_log?.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-2">
                      <PhoneOff className="h-4 w-4" /> RNR History ({selectedLead.rnr_count || 0} attempts)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedLead.rnr_log.map((log, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-red-50 rounded text-sm border border-red-100">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-red-600">RNR {log.attempt}</span>
                            <span className="text-gray-500 text-xs">by {log.logged_by_name || 'System'}</span>
                          </div>
                          <span className="text-gray-600 text-xs">
                            {new Date(log.timestamp).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})} {new Date(log.timestamp).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      ))}
                    </div>
                    {selectedLead.current_stage_id === 'stg_rnr' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3 text-red-600 border-red-300 hover:bg-red-50"
                        data-testid="rnr-log-popup-btn"
                        onClick={async () => {
                          try {
                            await axios.post(`${API}/crm/leads/${selectedLead.lead_id}/rnr-log`);
                            toast.success(`RNR #${(selectedLead.rnr_count || 0) + 1} logged`);
                            const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
                            setSelectedLead(res.data);
                            fetchData(false);
                          } catch (err) {
                            toast.error(err.response?.data?.detail || 'Failed to log RNR');
                          }
                        }}
                      >
                        <PhoneOff className="h-3 w-3 mr-1" /> Log RNR Attempt
                      </Button>
                    )}
                  </CardContent>
                </Card>
                )}

              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="space-y-4 mt-4">
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
                        {/* Created */}
                        <div className="flex items-start gap-3 relative">
                          <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center z-10 shrink-0">
                            <Plus className="h-3 w-3 text-white" />
                          </div>
                          <div className="flex-1 bg-indigo-50 rounded-lg p-2">
                            <p className="text-xs font-semibold text-indigo-700">Lead Created</p>
                            <p className="text-[10px] text-gray-500">
                              {selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'N/A'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Stage History */}
                        {(selectedLead.stage_history || []).map((entry, i) => {
                          const stageInfo = stages.find(s => s.stage_id === entry.stage_id);
                          return (
                          <div key={i} className="flex items-start gap-3 relative">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0" style={{ backgroundColor: stageInfo?.color || '#6b7280' }}>
                              <ArrowRight className="h-3 w-3 text-white" />
                            </div>
                            <div className="flex-1 bg-white border rounded-lg p-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold" style={{ color: stageInfo?.color || '#374151' }}>
                                  {stageInfo?.name || entry.stage_id}
                                </p>
                                {entry.action && <span className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{entry.action}</span>}
                              </div>
                              <p className="text-[10px] text-gray-500">
                                {entry.moved_at ? new Date(entry.moved_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}
                                {entry.moved_by_name ? ` — ${entry.moved_by_name}` : ''}
                              </p>
                              {entry.remark && <p className="text-[10px] text-gray-600 mt-0.5 italic">"{entry.remark}"</p>}
                            </div>
                          </div>
                          );
                        })}

                        {/* Follow-up dates */}
                        {(selectedLead.follow_ups || []).map((fup, i) => (
                          <div key={`fup-${i}`} className="flex items-start gap-3 relative">
                            <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center z-10 shrink-0">
                              <Calendar className="h-3 w-3 text-white" />
                            </div>
                            <div className={`flex-1 rounded-lg p-2 ${fup.completed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                              <p className="text-xs font-semibold text-amber-700">
                                Follow-up {fup.completed ? '(Done)' : '(Pending)'}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                {fup.scheduled_date ? new Date(fup.scheduled_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : ''}
                                {fup.note ? ` — ${fup.note}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}

                        {/* RNR Log */}
                        {(selectedLead.rnr_log || []).map((log, i) => (
                          <div key={`rnr-${i}`} className="flex items-start gap-3 relative">
                            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center z-10 shrink-0">
                              <PhoneOff className="h-3 w-3 text-white" />
                            </div>
                            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-2">
                              <p className="text-xs font-semibold text-red-600">RNR #{log.attempt}</p>
                              <p className="text-[10px] text-gray-500">
                                {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}
                                {log.logged_by_name ? ` — ${log.logged_by_name}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}

                        {/* Office Visit */}
                        {selectedLead.office_visit && (
                          <div className="flex items-start gap-3 relative">
                            <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center z-10 shrink-0">
                              <Building2 className="h-3 w-3 text-white" />
                            </div>
                            <div className="flex-1 bg-sky-50 border border-sky-200 rounded-lg p-2">
                              <p className="text-xs font-semibold text-sky-700">Office Visit Scheduled</p>
                              <p className="text-[10px] text-gray-500">
                                {selectedLead.office_visit.date} at {selectedLead.office_visit.time} — {selectedLead.office_visit.location}
                              </p>
                              {selectedLead.office_visit.remarks && <p className="text-[10px] text-gray-600 italic">"{selectedLead.office_visit.remarks}"</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Remarks Tab */}
              <TabsContent value="remarks" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" /> Add Remark
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Textarea
                        value={newRemark}
                        onChange={(e) => setNewRemark(e.target.value)}
                        placeholder="Add a remark or note about this lead..."
                        rows={2}
                        className="flex-1"
                      />
                      <Button onClick={handleAddRemark} className="self-end">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Remarks List */}
                <div className="space-y-2">
                  {(selectedLead.remarks || []).length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-center text-gray-500">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        No remarks yet. Add the first one!
                      </CardContent>
                    </Card>
                  ) : (
                    selectedLead.remarks.slice().reverse().map((remark, idx) => (
                      <Card key={idx} className="bg-gray-50">
                        <CardContent className="p-3">
                          <p className="text-sm">{remark.text}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            <User className="h-3 w-3" />
                            <span>{remark.added_by_name || 'User'}</span>
                            <span>•</span>
                            <Clock className="h-3 w-3" />
                            <span>{new Date(remark.created_at).toLocaleString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
              
              {/* Follow-up Tab */}
              <TabsContent value="followup" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Schedule Follow-up
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Follow-up Date</Label>
                      <Input
                        type="datetime-local"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Note</Label>
                      <Textarea
                        value={followUpNote}
                        onChange={(e) => setFollowUpNote(e.target.value)}
                        placeholder="What to discuss in the follow-up..."
                        rows={2}
                      />
                    </div>
                    <Button onClick={handleScheduleFollowUp}>
                      <Calendar className="h-4 w-4 mr-1" /> Schedule
                    </Button>
                  </CardContent>
                </Card>
                
                {/* Follow-ups List */}
                <div className="space-y-2">
                  {(selectedLead.follow_ups || []).length === 0 ? (
                    <Card>
                      <CardContent className="p-6 text-center text-gray-500">
                        <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        No follow-ups scheduled
                      </CardContent>
                    </Card>
                  ) : (
                    selectedLead.follow_ups.map((fu, idx) => (
                      <Card key={idx} className={fu.completed ? 'bg-green-50' : 'bg-orange-50'}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Calendar className={`h-4 w-4 ${fu.completed ? 'text-green-600' : 'text-orange-600'}`} />
                              <span className="font-medium">
                                {new Date(fu.scheduled_date).toLocaleString()}
                              </span>
                            </div>
                            <Badge className={fu.completed ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}>
                              {fu.completed ? 'Completed' : 'Pending'}
                            </Badge>
                          </div>
                          {fu.note && <p className="text-sm mt-2 text-gray-600">{fu.note}</p>}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
              
              {/* Activity Tab */}
              <TabsContent value="activity" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <History className="h-4 w-4" /> Activity Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Stage History */}
                      {(selectedLead.stage_history || []).slice().reverse().map((history, idx) => (
                        <div key={idx} className="flex items-start gap-3 pb-3 border-b last:border-0">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                            <ArrowRight className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm">
                              Moved to <span className="font-medium">{getStageName(history.stage_id)}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(history.moved_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                      
                      {/* Created */}
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <Plus className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm">Lead created</p>
                          <p className="text-xs text-gray-500">
                            {new Date(selectedLead.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDetailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ EDIT LEAD DIALOG ============ */}
      <Dialog open={editLeadDialog} onOpenChange={setEditLeadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-amber-600" />
              Edit Lead
            </DialogTitle>
            <DialogDescription>Update lead details. Custom fields appear below.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Standard Fields */}
            <div className="col-span-2 sm:col-span-1">
              <Label>Name *</Label>
              <Input
                value={editLeadForm.name}
                onChange={(e) => setEditLeadForm({...editLeadForm, name: e.target.value})}
                placeholder="Full name"
                data-testid="edit-lead-name"
              />
            </div>
            
            <div className="col-span-2 sm:col-span-1">
              <Label>Source</Label>
              <Select value={editLeadForm.source} onValueChange={(v) => setEditLeadForm({...editLeadForm, source: v})}>
                <SelectTrigger data-testid="edit-lead-source"><SelectValue /></SelectTrigger>
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
              <Label>Email</Label>
              <Input
                type="email"
                value={editLeadForm.email}
                onChange={(e) => setEditLeadForm({...editLeadForm, email: e.target.value})}
                placeholder="email@example.com"
                data-testid="edit-lead-email"
              />
            </div>
            
            <div>
              <Label>Phone</Label>
              <Input
                value={editLeadForm.phone}
                onChange={(e) => setEditLeadForm({...editLeadForm, phone: e.target.value})}
                placeholder="+91 9876543210"
                data-testid="edit-lead-phone"
              />
            </div>
            
            <div className="col-span-2">
              <Label>Address</Label>
              <Input
                value={editLeadForm.address}
                onChange={(e) => setEditLeadForm({...editLeadForm, address: e.target.value})}
                placeholder="Street address"
                data-testid="edit-lead-address"
              />
            </div>
            
            <div>
              <Label>City</Label>
              <Input
                value={editLeadForm.city}
                onChange={(e) => setEditLeadForm({...editLeadForm, city: e.target.value})}
                placeholder="City"
                data-testid="edit-lead-city"
              />
            </div>
            
            <div>
              <Label>State</Label>
              <Input
                value={editLeadForm.state}
                onChange={(e) => setEditLeadForm({...editLeadForm, state: e.target.value})}
                placeholder="State"
                data-testid="edit-lead-state"
              />
            </div>

            <div>
              <Label>Pincode</Label>
              <Input
                value={editLeadForm.pincode}
                onChange={(e) => setEditLeadForm({...editLeadForm, pincode: e.target.value})}
                placeholder="Pincode"
                data-testid="edit-lead-pincode"
              />
            </div>
            
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={editLeadForm.notes}
                onChange={(e) => setEditLeadForm({...editLeadForm, notes: e.target.value})}
                placeholder="Additional notes about the lead..."
                rows={3}
                data-testid="edit-lead-notes"
              />
            </div>

            {/* Divider for Custom Fields */}
            {customFields.length > 0 && (
              <div className="col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-700">Custom Fields</span>
                </div>
              </div>
            )}
            
            {/* Custom Fields */}
            {customFields.map(field => (
              <div key={field.field_id} className={field.field_type === 'textarea' ? 'col-span-2' : ''}>
                <Label>{field.label} {field.required && '*'}</Label>
                {field.field_type === 'text' && (
                  <Input
                    value={editLeadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditLeadForm({
                      ...editLeadForm,
                      custom_fields: {...editLeadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
                {field.field_type === 'number' && (
                  <NumericInput
                    value={editLeadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditLeadForm({
                      ...editLeadForm,
                      custom_fields: {...editLeadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
                {field.field_type === 'dropdown' && (
                  <Select 
                    value={editLeadForm.custom_fields[field.field_id] || ''} 
                    onValueChange={(v) => setEditLeadForm({
                      ...editLeadForm,
                      custom_fields: {...editLeadForm.custom_fields, [field.field_id]: v}
                    })}
                  >
                    <SelectTrigger data-testid={`edit-cf-${field.field_id}`}><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.field_type === 'textarea' && (
                  <Textarea
                    value={editLeadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditLeadForm({
                      ...editLeadForm,
                      custom_fields: {...editLeadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    placeholder={field.placeholder}
                    rows={3}
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
                {field.field_type === 'date' && (
                  <Input
                    type="date"
                    value={editLeadForm.custom_fields[field.field_id] || ''}
                    onChange={(e) => setEditLeadForm({
                      ...editLeadForm,
                      custom_fields: {...editLeadForm.custom_fields, [field.field_id]: e.target.value}
                    })}
                    data-testid={`edit-cf-${field.field_id}`}
                  />
                )}
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLeadDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateLead} data-testid="save-edit-lead">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ CREATE STAGE DIALOG ============ */}
      <Dialog open={createStageDialog} onOpenChange={setCreateStageDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add New Stage</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Stage Name</Label>
              <Input
                value={stageForm.name}
                onChange={(e) => setStageForm({...stageForm, name: e.target.value})}
                placeholder="e.g., Qualified"
              />
            </div>
            
            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'].map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 ${stageForm.color === color ? 'border-gray-900' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setStageForm({...stageForm, color})}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateStageDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateStage}>Create Stage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ IMPORT DIALOG ============ */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Leads</DialogTitle>
            <DialogDescription>Import leads from CSV or connect Google Sheets</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Card className="cursor-pointer hover:bg-gray-50" onClick={() => window.location.href = '/crm/import-csv'}>
              <CardContent className="p-4 flex items-center gap-3">
                <Upload className="h-8 w-8 text-indigo-600" />
                <div>
                  <p className="font-semibold">CSV Import</p>
                  <p className="text-xs text-gray-500">Upload a CSV file with leads</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="cursor-pointer hover:bg-gray-50" onClick={() => window.location.href = '/crm/google-sheets'}>
              <CardContent className="p-4 flex items-center gap-3">
                <svg className="h-8 w-8" viewBox="0 0 24 24">
                  <path fill="#0F9D58" d="M14.5 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7.5L14.5 2z"/>
                  <path fill="#87CEAC" d="M14.5 2v5.5H20L14.5 2z"/>
                  <rect fill="#fff" x="8" y="12" width="8" height="1"/>
                  <rect fill="#fff" x="8" y="14" width="8" height="1"/>
                  <rect fill="#fff" x="8" y="16" width="8" height="1"/>
                </svg>
                <div>
                  <p className="font-semibold">Google Sheets</p>
                  <p className="text-xs text-gray-500">Sync leads from Google Sheets</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MANAGE FIELDS DIALOG ============ */}
      <Dialog open={manageFieldsDialog} onOpenChange={setManageFieldsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-indigo-600" />
              Manage Custom Fields
            </DialogTitle>
            <DialogDescription>View and delete custom fields</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {customFields.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Settings className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                No custom fields created yet
              </div>
            ) : (
              customFields.map(field => (
                <div 
                  key={field.field_id} 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                >
                  <div>
                    <p className="font-medium text-gray-900">{field.label}</p>
                    <p className="text-xs text-gray-500">Type: {field.field_type} • ID: {field.name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => openDeleteFieldDialog(field)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageFieldsDialog(false)}>Close</Button>
            <Button onClick={() => { setManageFieldsDialog(false); setAddFieldDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE FIELD CONFIRMATION DIALOG ============ */}
      <Dialog open={deleteFieldDialog} onOpenChange={setDeleteFieldDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Custom Field
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. All data in this field will be lost.
            </DialogDescription>
          </DialogHeader>
          
          {fieldToDelete && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="font-medium text-red-800">{fieldToDelete.label}</p>
                <p className="text-xs text-red-600">Type: {fieldToDelete.field_type}</p>
              </div>
              
              <div>
                <Label className="text-gray-700">
                  Type <span className="font-bold text-red-600">DELETE</span> to confirm
                </Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="mt-1"
                  data-testid="delete-confirm-input"
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDeleteFieldDialog(false);
                setFieldToDelete(null);
                setDeleteConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteField}
              disabled={deleteConfirmText !== 'DELETE'}
              data-testid="confirm-delete-btn"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Edit Dialog */}
      <Dialog open={apptEditDialog} onOpenChange={setApptEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              {selectedLead?.appointment ? 'Edit Appointment' : 'Book Appointment'}
            </DialogTitle>
            <DialogDescription>
              Update the appointment details for this lead
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Appointment Date *</Label>
              <Input 
                type="date"
                value={apptEditForm.date}
                onChange={(e) => setApptEditForm({...apptEditForm, date: e.target.value})}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1"
                data-testid="edit-appt-date"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Appointment Time *</Label>
              <Input 
                type="time"
                value={apptEditForm.time}
                onChange={(e) => setApptEditForm({...apptEditForm, time: e.target.value})}
                className="mt-1"
                data-testid="edit-appt-time"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Visit Type *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { value: 'office_visit', label: 'Office Visit', icon: '🏢' },
                  { value: 'online', label: 'Online', icon: '💻' },
                  { value: 'home_visit', label: 'Home Visit', icon: '🏠' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`edit-appt-type-${opt.value}`}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm ${
                      apptEditForm.type === opt.value 
                        ? 'border-green-500 bg-green-50 text-green-700 font-medium' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                    onClick={() => setApptEditForm({...apptEditForm, type: opt.value})}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span className="text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApptEditDialog(false)}>Cancel</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={handleSaveApptEdit}
              disabled={!apptEditForm.date || !apptEditForm.time || !apptEditForm.type}
              data-testid="save-appointment-edit-btn"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Save Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Booking Dialog */}
      <Dialog open={appointmentDialog} onOpenChange={setAppointmentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Book an Appointment
            </DialogTitle>
            <DialogDescription>
              Fill in the appointment details to transfer this lead to the Sales team
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Appointment Date *</Label>
              <Input 
                type="date"
                value={appointmentForm.date}
                onChange={(e) => setAppointmentForm({...appointmentForm, date: e.target.value})}
                min={new Date().toISOString().split('T')[0]}
                className="mt-1"
                data-testid="appointment-date"
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium">Appointment Time *</Label>
              <Input 
                type="time"
                value={appointmentForm.time}
                onChange={(e) => setAppointmentForm({...appointmentForm, time: e.target.value})}
                className="mt-1"
                data-testid="appointment-time"
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium">Visit Type *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { value: 'office_visit', label: 'Office Visit', icon: '🏢' },
                  { value: 'online', label: 'Online', icon: '💻' },
                  { value: 'home_visit', label: 'Home Visit', icon: '🏠' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`appointment-type-${opt.value}`}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-sm ${
                      appointmentForm.type === opt.value 
                        ? 'border-green-500 bg-green-50 text-green-700 font-medium' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                    onClick={() => setAppointmentForm({...appointmentForm, type: opt.value})}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <span className="text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAppointmentDialog(false)}>Cancel</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={handleBookAppointment}
              disabled={!appointmentForm.date || !appointmentForm.time || !appointmentForm.type}
              data-testid="book-appointment-btn"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Book an Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
