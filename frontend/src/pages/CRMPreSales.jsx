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
import { 
  Users, LogOut, Plus, Search, Upload, Phone, Mail, MapPin, Calendar, 
  ArrowRight, RefreshCw, GripVertical, Eye, Clock, User, MessageSquare,
  FileText, History, Send, X, Settings, ChevronDown, Trash2, Edit2
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SOURCE_COLORS = {
  meta: 'bg-blue-100 text-blue-700',
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
  
  // Dialogs
  const [createLeadDialog, setCreateLeadDialog] = useState(false);
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
    address: '',
    city: '',
    state: '',
    notes: ''
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

  const fetchData = async () => {
    try {
      setLoading(true);
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

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
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
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create lead');
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
      toast.error(error.response?.data?.detail || 'Failed to add field');
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
      toast.error(error.response?.data?.detail || 'Failed to delete field');
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
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create stage');
    }
  };

  const handleStageChange = async (leadId, newStageId) => {
    try {
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, { stage_id: newStageId });
      
      if (result.data.transferred_to_sales) {
        toast.success('Lead transferred to Sales CRM! 🎉');
      } else {
        toast.success('Lead stage updated');
      }
      
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update stage');
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
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      notes: lead.notes || ''
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
      fetchData();
      // Also refresh the detail dialog if open
      if (leadDetailDialog) {
        const updatedLead = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
        setSelectedLead(updatedLead.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update lead');
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
    return matchesStage && matchesSearch && matchesSource;
  });

  const getLeadsByStage = (stageId) => filteredLeads.filter(lead => lead.current_stage_id === stageId);
  
  const getStageName = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage?.name || stageId;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-full mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-lg">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">CRM - Pre Sales</h1>
              <p className="text-xs text-gray-500">Lead Qualification & Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="outline" size="sm" onClick={() => setImportDialog(true)} data-testid="import-btn">
              <Upload className="h-4 w-4 mr-1" /> Import
            </Button>
            <Button size="sm" onClick={() => setCreateLeadDialog(true)} data-testid="create-lead-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Lead
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreateStageDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Stage
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-gray-500 uppercase">{user?.role?.replace('_', ' ')}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-full mx-auto px-4 py-6 sm:px-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-0">
            <CardContent className="p-4">
              <p className="text-indigo-100 text-sm">Total Leads</p>
              <p className="text-3xl font-bold">{dashboard?.total_leads || 0}</p>
            </CardContent>
          </Card>
          
          {stages.slice(0, 5).map(stage => (
            <Card 
              key={stage.stage_id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setActiveStage(stage.stage_id)}
              style={{ borderLeftColor: stage.color, borderLeftWidth: '4px' }}
            >
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 truncate">{stage.name}</p>
                <p className="text-2xl font-bold" style={{ color: stage.color }}>
                  {dashboard?.stages?.find(s => s.stage_id === stage.stage_id)?.lead_count || 0}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
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
          
          <Button 
            variant={activeStage === 'all' ? 'default' : 'outline'} 
            onClick={() => setActiveStage('all')}
          >
            All Stages
          </Button>
        </div>

        {/* Kanban Board */}
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
                    <Badge className="bg-green-100 text-green-700 text-xs">Final</Badge>
                  )}
                </div>
                
                <div className="bg-gray-100 rounded-b-lg p-2 min-h-[400px] space-y-2">
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
                        
                        {/* Show if has remarks or follow-ups */}
                        {(lead.remarks?.length > 0 || lead.follow_ups?.length > 0) && (
                          <div className="flex gap-1 mt-2">
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
                        
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-gray-400">
                            {new Date(lead.created_at).toLocaleDateString()}
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
                  <Input
                    type="number"
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
            <DialogTitle className="flex items-center gap-3">
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
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
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
    </div>
  );
}
