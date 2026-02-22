import React, { useState, useEffect, useCallback } from 'react';
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
  Users, LogOut, Plus, Search, Filter, Upload, Download, Phone, Mail,
  MapPin, Calendar, ArrowRight, RefreshCw, GripVertical, MoreVertical,
  ChevronRight, Eye, Edit2, Trash2, Tag, Clock, User
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
  const [viewLeadDialog, setViewLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [createStageDialog, setCreateStageDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  
  // Forms
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
  
  const [stageForm, setStageForm] = useState({
    name: '',
    color: '#6366f1'
  });
  
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
      setLeads(dashboardRes.data.recent_leads || []);
      
      // Fetch all leads
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

  const handleCreateLead = async () => {
    if (!leadForm.name) {
      toast.error('Name is required');
      return;
    }

    try {
      await axios.post(`${API}/crm/pre-sales/leads`, leadForm);
      toast.success('Lead created successfully');
      setCreateLeadDialog(false);
      setLeadForm({
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
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create lead');
    }
  };

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
    const matchesStage = activeStage === 'all' || lead.current_stage_id === activeStage;
    const matchesSearch = !searchQuery || 
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    const matchesSource = !selectedSource || lead.source === selectedSource;
    return matchesStage && matchesSearch && matchesSource;
  });

  const getLeadsByStage = (stageId) => {
    return filteredLeads.filter(lead => lead.current_stage_id === stageId);
  };

  const getStageColor = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage?.color || '#6366f1';
  };

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
              <SelectItem value="">All Sources</SelectItem>
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
                        
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-gray-400">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => { setSelectedLead(lead); setViewLeadDialog(true); }}
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
      </div>

      {/* Create Lead Dialog */}
      <Dialog open={createLeadDialog} onOpenChange={setCreateLeadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>Enter lead details. All custom fields are available below.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4">
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

      {/* View Lead Dialog */}
      <Dialog open={viewLeadDialog} onOpenChange={setViewLeadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold">
                {selectedLead?.name?.charAt(0)?.toUpperCase()}
              </div>
              {selectedLead?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={SOURCE_COLORS[selectedLead.source] || SOURCE_COLORS.other}>
                  {selectedLead.source}
                </Badge>
                <Badge variant="outline">{getStageName(selectedLead.current_stage_id)}</Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {selectedLead.email && (
                  <div>
                    <Label className="text-xs text-gray-500">Email</Label>
                    <p className="text-sm flex items-center gap-1">
                      <Mail className="h-4 w-4 text-gray-400" /> {selectedLead.email}
                    </p>
                  </div>
                )}
                {selectedLead.phone && (
                  <div>
                    <Label className="text-xs text-gray-500">Phone</Label>
                    <p className="text-sm flex items-center gap-1">
                      <Phone className="h-4 w-4 text-gray-400" /> {selectedLead.phone}
                    </p>
                  </div>
                )}
                {selectedLead.address && (
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">Address</Label>
                    <p className="text-sm flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      {[selectedLead.address, selectedLead.city, selectedLead.state, selectedLead.pincode].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>
              
              {Object.keys(selectedLead.custom_fields || {}).length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Custom Fields</Label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
                    {Object.entries(selectedLead.custom_fields).map(([key, value]) => {
                      const field = customFields.find(f => f.field_id === key || f.name === key);
                      return (
                        <div key={key}>
                          <span className="text-xs text-gray-500">{field?.label || key}</span>
                          <p className="text-sm font-medium">{value || '-'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {selectedLead.notes && (
                <div>
                  <Label className="text-xs text-gray-500">Notes</Label>
                  <p className="text-sm bg-gray-50 rounded-lg p-3">{selectedLead.notes}</p>
                </div>
              )}
              
              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t">
                <span>Created: {new Date(selectedLead.created_at).toLocaleString()}</span>
                {selectedLead.transferred_to_lead_id && (
                  <Badge className="bg-green-100 text-green-700">Transferred to Sales</Badge>
                )}
              </div>
              
              {/* Stage Change */}
              <div className="border-t pt-4">
                <Label className="text-xs text-gray-500 mb-2 block">Move to Stage</Label>
                <div className="flex flex-wrap gap-2">
                  {stages.map(stage => (
                    <Button
                      key={stage.stage_id}
                      variant={selectedLead.current_stage_id === stage.stage_id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        handleStageChange(selectedLead.lead_id, stage.stage_id);
                        setViewLeadDialog(false);
                      }}
                      style={selectedLead.current_stage_id === stage.stage_id ? { backgroundColor: stage.color } : { borderColor: stage.color, color: stage.color }}
                    >
                      {stage.name}
                      {stage.is_final && <ArrowRight className="h-3 w-3 ml-1" />}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLeadDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Stage Dialog */}
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

      {/* Import Dialog */}
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
            
            <Button variant="outline" className="w-full" onClick={() => window.open(`${API}/crm/import/template`, '_blank')}>
              <Download className="h-4 w-4 mr-2" /> Download CSV Template
            </Button>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
