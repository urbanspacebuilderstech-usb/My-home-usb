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
import { 
  Target, LogOut, Search, Phone, Mail, MapPin, ArrowRight, RefreshCw, 
  GripVertical, Eye, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  Building2, Calculator, Download, LayoutGrid, List, Settings, Edit, Calendar, Send
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { generateREPDF } from '../utils/pdfGenerator';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RE_STATUS_CONFIG = {
  re_requested: { label: 'RE Requested', color: 'bg-amber-50 text-amber-700', icon: Clock },
  re_in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700', icon: RefreshCw },
  re_submitted: { label: 'Submitted', color: 'bg-purple-100 text-purple-700', icon: FileText },
  re_approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  re_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
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
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'list'
  const [activeStage, setActiveStage] = useState('all');
  
  // Dialogs
  const [viewLeadDialog, setViewLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [reProjectDialog, setReProjectDialog] = useState(false);
  const [selectedREProject, setSelectedREProject] = useState(null);
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '', notes: '' });
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
  
  const [draggedLead, setDraggedLead] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, dashboardRes, stagesRes, leadsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/crm/sales/dashboard`),
        axios.get(`${API}/crm/stages?stage_type=sales`),
        axios.get(`${API}/crm/sales/leads`)
      ]);
      
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setStages(stagesRes.data);
      setLeads(leadsRes.data);
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
      
      // Intercept: Show rough requirement popup for "Rough Estimate Requested"
      if (stage?.name === 'Rough Estimate Requested' && !roughRequirement) {
        setRoughEstLeadId(leadId);
        setRoughEstStageId(newStageId);
        setRoughEstForm('');
        setRoughEstDialog(true);
        return;
      }
      
      const payload = { stage_id: newStageId };
      if (roughRequirement) {
        payload.rough_requirement = roughRequirement;
      }
      
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, payload);
      
      if (result.data.re_project_created) {
        toast.success('Rough Estimate Project created! Planning team notified.');
      } else if (stage?.name === 'Deal Closed') {
        toast.success('Deal Closed! Sent to CRE for project creation.');
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
  const handleViewREProject = async (reProjectId) => {
    try {
      const res = await axios.get(`${API}/crm/re-projects/${reProjectId}`);
      setSelectedREProject(res.data);
      setReProjectDialog(true);
    } catch (error) {
      toast.error('Failed to load RE project');
    }
  };

  const openLeadDetail = async (lead) => {
    setSelectedLead(lead);
    setDetailTab('overview');
    setViewLeadDialog(true);
    // Fetch full lead detail
    try {
      const res = await axios.get(`${API}/crm/leads/${lead.lead_id}`);
      setLeadDetail(res.data);
      setSummary(res.data.summary || '');
    } catch {
      setLeadDetail(lead);
      setSummary(lead.summary || '');
    }
  };

  const openEditDialog = (lead) => {
    setEditForm({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      notes: lead.notes || ''
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
    return matchesSearch;
  });

  const getLeadsByStage = (stageId) => {
    return filteredLeads.filter(lead => lead.current_stage_id === stageId);
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
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
            <CardContent className="p-4">
              <p className="text-emerald-100 text-sm">Total Leads</p>
              <p className="text-3xl font-bold">{dashboard?.total_leads || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-amber-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-xs text-amber-600">RE Requested</span>
              </div>
              <p className="text-2xl font-bold text-amber-700">{dashboard?.re_stats?.requested || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="h-4 w-4 text-yellow-600" />
                <span className="text-xs text-yellow-600">RE In Progress</span>
              </div>
              <p className="text-2xl font-bold text-yellow-700">{dashboard?.re_stats?.in_progress || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-600">RE Approved</span>
              </div>
              <p className="text-2xl font-bold text-green-700">{dashboard?.re_stats?.approved || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-teal-600" />
                <span className="text-xs text-teal-600">Converted</span>
              </div>
              <p className="text-2xl font-bold text-teal-700">{dashboard?.re_stats?.converted || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + View Toggle */}
        <div className="flex gap-3 mb-6 items-center">
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
            <div className="border-b overflow-x-auto">
              <div className="flex">
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
                          <Badge 
                            className="bg-purple-100 text-purple-700 text-[10px] px-1.5 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); handleViewREProject(lead.re_project_id); }}
                          >
                            View RE
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
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
                          onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                        >
                          <Eye className="h-4 w-4" />
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
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map(stage => (
              <div 
                key={stage.stage_id}
                className="w-80 flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.stage_id)}
              >
                <div 
                  className="rounded-t-lg px-4 py-3 flex items-center justify-between"
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
                
                <div className="bg-gray-100 rounded-b-lg p-2 min-h-[400px] space-y-2">
                  {getLeadsByStage(stage.stage_id).map(lead => (
                    <Card
                      key={lead.lead_id}
                      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all"
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
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
                        
                        {lead.phone && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </p>
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
                        
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-gray-400">
                            {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openLeadDetail(lead)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
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

      {/* View Lead Dialog */}
      {/* Lead Detail Dialog */}
      <Dialog open={viewLeadDialog} onOpenChange={setViewLeadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => openEditDialog(leadDetail || selectedLead)} data-testid="edit-lead-btn">
                <Edit className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-4">
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full grid grid-cols-4">
                  <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
                  <TabsTrigger value="summary" className="text-xs" data-testid="tab-summary">Summary</TabsTrigger>
                  <TabsTrigger value="followups" className="text-xs" data-testid="tab-followups">Follow-ups</TabsTrigger>
                  <TabsTrigger value="remarks" className="text-xs" data-testid="tab-remarks">Remarks</TabsTrigger>
                </TabsList>
                
                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4 mt-3">
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
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full border-dashed border-green-400 text-green-600 hover:bg-green-50" onClick={openApptDialog} data-testid="add-appointment-btn">
                      <Calendar className="h-4 w-4 mr-2" /> Add Appointment
                    </Button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3">
                    {selectedLead.email && (<div><Label className="text-xs text-gray-500">Email</Label><p className="text-sm flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /> {selectedLead.email}</p></div>)}
                    {selectedLead.phone && (<div><Label className="text-xs text-gray-500">Phone</Label><p className="text-sm flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {selectedLead.phone}</p></div>)}
                    {selectedLead.address && (<div className="col-span-2"><Label className="text-xs text-gray-500">Address</Label><p className="text-sm">{selectedLead.address}{selectedLead.city ? `, ${selectedLead.city}` : ''}</p></div>)}
                    {selectedLead.source && (<div><Label className="text-xs text-gray-500">Source</Label><p className="text-sm">{selectedLead.source}</p></div>)}
                    {selectedLead.assigned_to_name && (<div><Label className="text-xs text-gray-500">Assigned To</Label><p className="text-sm">{selectedLead.assigned_to_name}</p></div>)}
                    {selectedLead.pre_sales_person_name && (<div><Label className="text-xs text-gray-500">Pre-Sales</Label><p className="text-sm">{selectedLead.pre_sales_person_name}</p></div>)}
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
                  
                  <div className="border-t pt-3">
                    <Label className="text-xs text-gray-500 mb-2 block">Move to Stage</Label>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <Button key={stage.stage_id} variant={selectedLead.current_stage_id === stage.stage_id ? 'default' : 'outline'} size="sm" className="text-xs"
                          onClick={() => { handleStageChange(selectedLead.lead_id, stage.stage_id); setViewLeadDialog(false); }}
                          style={selectedLead.current_stage_id === stage.stage_id ? { backgroundColor: stage.color } : { borderColor: stage.color, color: stage.color }}>
                          {stage.name}
                        </Button>
                      ))}
                    </div>
                  </div>
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
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLeadDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name *</Label><Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="text-sm" data-testid="edit-name" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Email</Label><Input value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="text-sm" data-testid="edit-email" /></div>
              <div><Label className="text-xs">Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} className="text-sm" data-testid="edit-phone" /></div>
            </div>
            <div><Label className="text-xs">Address</Label><Input value={editForm.address} onChange={(e) => setEditForm({...editForm, address: e.target.value})} className="text-sm" data-testid="edit-address" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">City</Label><Input value={editForm.city} onChange={(e) => setEditForm({...editForm, city: e.target.value})} className="text-sm" /></div>
              <div><Label className="text-xs">State</Label><Input value={editForm.state} onChange={(e) => setEditForm({...editForm, state: e.target.value})} className="text-sm" /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><textarea value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className="w-full rounded-md border p-2 text-sm min-h-[60px]" data-testid="edit-notes" /></div>
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
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {RE_STATUS_CONFIG[selectedREProject.status] && (
                  <Badge className={RE_STATUS_CONFIG[selectedREProject.status].color}>
                    {React.createElement(RE_STATUS_CONFIG[selectedREProject.status].icon, { className: "h-3 w-3 mr-1" })}
                    {RE_STATUS_CONFIG[selectedREProject.status].label}
                  </Badge>
                )}
                <span className="text-xs text-gray-400">Ref: {selectedREProject.re_project_id}</span>
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
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReProjectDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Rough Estimate Requirement Dialog */}
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

      <MobileBottomNav user={user} />
    </div>
  );
}
