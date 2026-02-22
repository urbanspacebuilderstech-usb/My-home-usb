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
import { 
  Target, LogOut, Search, Phone, Mail, MapPin, ArrowRight, RefreshCw, 
  GripVertical, Eye, FileText, CheckCircle, XCircle, Clock, TrendingUp,
  Building2, Calculator
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RE_STATUS_CONFIG = {
  re_requested: { label: 'RE Requested', color: 'bg-blue-100 text-blue-700', icon: Clock },
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
  
  // Dialogs
  const [viewLeadDialog, setViewLeadDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [reProjectDialog, setReProjectDialog] = useState(false);
  const [selectedREProject, setSelectedREProject] = useState(null);
  
  const [draggedLead, setDraggedLead] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
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

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const handleStageChange = async (leadId, newStageId) => {
    try {
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, { stage_id: newStageId });
      
      if (result.data.re_project_created) {
        toast.success('Rough Estimate Project created! Planning team notified. 📋');
      } else if (result.data.project_created) {
        toast.success('Deal Closed! Project created successfully! 🎉');
      } else {
        toast.success('Lead stage updated');
      }
      
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update stage');
    }
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-full mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-xl shadow-lg">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">CRM - Sales</h1>
              <p className="text-xs text-gray-500">Deal Management & Conversion</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/crm-pre-sales'}>
              Pre-Sales
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/crm/re-projects'}>
              <FileText className="h-4 w-4 mr-1" /> RE Projects
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
            <CardContent className="p-4">
              <p className="text-emerald-100 text-sm">Total Leads</p>
              <p className="text-3xl font-bold">{dashboard?.total_leads || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-blue-600">RE Requested</span>
              </div>
              <p className="text-2xl font-bold text-blue-700">{dashboard?.re_stats?.requested || 0}</p>
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

        {/* Search */}
        <div className="flex gap-3 mb-6">
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

      {/* View Lead Dialog */}
      <Dialog open={viewLeadDialog} onOpenChange={setViewLeadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                {selectedLead?.name?.charAt(0)?.toUpperCase()}
              </div>
              {selectedLead?.name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getStageName(selectedLead.current_stage_id)}</Badge>
                {selectedLead.re_project_id && (
                  <Badge 
                    className="bg-purple-100 text-purple-700 cursor-pointer"
                    onClick={() => {
                      handleViewREProject(selectedLead.re_project_id);
                      setViewLeadDialog(false);
                    }}
                  >
                    <FileText className="h-3 w-3 mr-1" /> View RE Project
                  </Badge>
                )}
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
              </div>
              
              {Object.keys(selectedLead.custom_fields || {}).length > 0 && (
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Details</Label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
                    {Object.entries(selectedLead.custom_fields).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-xs text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                        <p className="text-sm font-medium">{value || '-'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
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

      {/* RE Project Dialog */}
      <Dialog open={reProjectDialog} onOpenChange={setReProjectDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-purple-600" />
              Rough Estimate Project
            </DialogTitle>
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
                  <div className="grid grid-cols-3 gap-3 text-sm">
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
                  </div>
                </CardContent>
              </Card>
              
              {/* Estimated Costs */}
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3 text-purple-800">Estimated Costs</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-purple-600">Material</p>
                      <p className="text-lg font-bold text-purple-800">{formatCurrency(selectedREProject.estimated_material_cost)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-purple-600">Labour</p>
                      <p className="text-lg font-bold text-purple-800">{formatCurrency(selectedREProject.estimated_labour_cost)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-purple-600">Overhead</p>
                      <p className="text-lg font-bold text-purple-800">{formatCurrency(selectedREProject.estimated_overhead)}</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-2">
                      <p className="text-xs text-purple-600">Total</p>
                      <p className="text-xl font-bold text-purple-900">{formatCurrency(selectedREProject.estimated_total)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Planning Notes */}
              {selectedREProject.planning_notes && (
                <div>
                  <Label className="text-xs text-gray-500">Planning Notes</Label>
                  <p className="bg-gray-50 rounded-lg p-3 text-sm">{selectedREProject.planning_notes}</p>
                </div>
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
    </div>
  );
}
