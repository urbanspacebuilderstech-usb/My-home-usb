import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users, Target, TrendingUp, UserPlus, Settings, RefreshCw,
  Zap, BarChart3, ArrowRight, Phone, Mail, Clock, CheckCircle,
  User, ChevronRight, Filter, Search, Layers, Edit2, Eye, X,
  Calendar, FileText, Building2, MapPin, ChevronDown, ArrowUpRight,
  FileSpreadsheet, Link, Unlink, Plus, Table, Download, AlertCircle, Check
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

// Source colors for badges
const SOURCE_COLORS = {
  meta: 'bg-blue-100 text-blue-700',
  seo: 'bg-green-100 text-green-700',
  referral: 'bg-purple-100 text-purple-700',
  walk_in: 'bg-yellow-100 text-yellow-700',
  website: 'bg-pink-100 text-pink-700',
  csv_import: 'bg-orange-100 text-orange-700',
  google_sheets: 'bg-emerald-100 text-emerald-700',
  other: 'bg-gray-100 text-gray-700'
};

// Standard lead fields for mapping
const STANDARD_FIELDS = [
  { value: 'name', label: 'Lead Name' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'email', label: 'Email' },
  { value: 'city', label: 'Location/City' },
  { value: 'sqft', label: 'Sqft / Area' },
  { value: 'budget', label: 'Budget' },
  { value: 'notes', label: 'Notes/Remarks' },
  { value: 'source', label: 'Lead Source' },
];

// Stage colors
const STAGE_COLORS = {
  stg_new_lead: 'bg-blue-500',
  stg_contacted: 'bg-yellow-500',
  stg_proposal: 'bg-purple-500',
  stg_followup: 'bg-orange-500',
  stg_appt_booked: 'bg-green-500',
  stg_new_appointment: 'bg-blue-500',
  stg_discussion: 'bg-yellow-500',
  stg_site_visit: 'bg-purple-500',
  stg_re_requested: 'bg-orange-500',
  stg_re_shared: 'bg-pink-500',
  stg_negotiation: 'bg-indigo-500',
  stg_deal_closed: 'bg-green-600',
  stg_lost: 'bg-red-500'
};

export default function MarketingBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Team Management
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'pre_sales', phone: '' });
  
  // Individual Salesperson View
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personLeads, setPersonLeads] = useState([]);
  const [personFilter, setPersonFilter] = useState({ 
    date_from: '', 
    date_to: '', 
    source: '', 
    stage: '' 
  });
  
  // All Leads
  const [allLeads, setAllLeads] = useState([]);
  const [leadsFilter, setLeadsFilter] = useState({ stage_type: '', assigned_to: '', source: '' });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit Lead
  const [showEditLead, setShowEditLead] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  
  // Google Sheets Integration
  const [showSheetsDialog, setShowSheetsDialog] = useState(false);
  const [sheetsTab, setSheetsTab] = useState('website');
  const [sheetsConfig, setSheetsConfig] = useState(null);
  const [sheetSources, setSheetSources] = useState([]);
  const [sheetPreview, setSheetPreview] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [selectedSheetName, setSelectedSheetName] = useState('');
  const [sourceName, setSourceName] = useState('Website');
  const [columnMapping, setColumnMapping] = useState({});
  const [customFieldsToCreate, setCustomFieldsToCreate] = useState([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      try {
        const res = await axios.get(`${API}/api/auth/me`, { withCredentials: true });
        const currentUser = res.data;
        setUser(currentUser);
        if (currentUser.role !== 'super_admin') {
          toast.error('Super Admin access required');
          window.location.href = '/dashboard';
          return;
        }
        fetchDashboard();
      } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login';
      }
    };
    checkAuthAndFetch();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const [dashRes, settingsRes] = await Promise.all([
        axios.get(`${API}/api/marketing/dashboard`, { withCredentials: true }),
        axios.get(`${API}/api/marketing/distribution-settings`, { withCredentials: true })
      ]);
      setDashboard(dashRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      toast.error('Failed to load marketing dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (leadsFilter.stage_type && leadsFilter.stage_type !== 'all') params.append('stage_type', leadsFilter.stage_type);
      if (leadsFilter.assigned_to && leadsFilter.assigned_to !== 'all') params.append('assigned_to', leadsFilter.assigned_to);
      
      const res = await axios.get(`${API}/api/marketing/all-leads?${params.toString()}`, { withCredentials: true });
      setAllLeads(res.data.leads);
    } catch (error) {
      toast.error('Failed to load leads');
    }
  };

  const fetchPersonLeads = async (userId) => {
    try {
      const params = new URLSearchParams();
      params.append('assigned_to', userId);
      if (personFilter.source && personFilter.source !== 'all') params.append('source', personFilter.source);
      
      const res = await axios.get(`${API}/api/marketing/all-leads?${params.toString()}`, { withCredentials: true });
      
      let leads = res.data.leads || [];
      
      // Apply date filters on frontend
      if (personFilter.date_from) {
        const fromDate = new Date(personFilter.date_from);
        leads = leads.filter(l => new Date(l.created_at) >= fromDate);
      }
      if (personFilter.date_to) {
        const toDate = new Date(personFilter.date_to);
        toDate.setHours(23, 59, 59);
        leads = leads.filter(l => new Date(l.created_at) <= toDate);
      }
      if (personFilter.stage && personFilter.stage !== 'all') {
        leads = leads.filter(l => l.current_stage_id === personFilter.stage);
      }
      
      setPersonLeads(leads);
    } catch (error) {
      toast.error('Failed to load person leads');
    }
  };

  useEffect(() => {
    if (user && activeTab === 'leads') {
      fetchAllLeads();
    }
  }, [user, activeTab, leadsFilter]);

  useEffect(() => {
    if (selectedPerson) {
      fetchPersonLeads(selectedPerson.user_id);
    }
  }, [selectedPerson, personFilter]);

  // Google Sheets Functions
  const fetchSheetsConfig = async () => {
    try {
      const res = await axios.get(`${API}/api/sheets/config`, { withCredentials: true });
      setSheetsConfig(res.data);
      setSheetSources(res.data.sources || []);
    } catch (error) {
      console.error('Failed to fetch sheets config:', error);
    }
  };

  const connectGoogleSheets = async () => {
    try {
      const res = await axios.get(`${API}/api/sheets/oauth/login`, { withCredentials: true });
      if (res.data.auth_url) {
        window.location.href = res.data.auth_url;
      }
    } catch (error) {
      if (error.response?.data?.detail?.includes('credentials not configured')) {
        toast.error('Google Sheets credentials not configured. Please contact admin to set up GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET in the backend.');
      } else {
        toast.error('Failed to start Google Sheets connection');
      }
    }
  };

  const disconnectGoogleSheets = async () => {
    try {
      await axios.post(`${API}/api/sheets/disconnect`, {}, { withCredentials: true });
      toast.success('Google Sheets disconnected');
      setSheetsConfig(prev => ({ ...prev, is_connected: false }));
      setSheetSources([]);
    } catch (error) {
      toast.error('Failed to disconnect');
    }
  };

  const previewSheet = async () => {
    if (!sheetUrl) {
      toast.error('Please enter a Google Sheet URL');
      return;
    }
    setIsPreviewLoading(true);
    try {
      const res = await axios.post(`${API}/api/sheets/preview`, {
        spreadsheet_url: sheetUrl,
        sheet_name: selectedSheetName || null
      }, { withCredentials: true });
      
      setSheetPreview(res.data);
      
      // Auto-populate column mapping from suggestions
      const mapping = {};
      Object.entries(res.data.column_suggestions || {}).forEach(([col, info]) => {
        if (info.suggested) {
          mapping[col] = info.suggested;
        }
      });
      setColumnMapping(mapping);
      
      // Set custom fields detected
      setCustomFieldsToCreate(res.data.custom_fields_detected || []);
      
      toast.success(`Found ${res.data.total_rows} rows`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to preview sheet');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const addSheetSource = async () => {
    if (!sourceName || !sheetPreview) {
      toast.error('Please preview the sheet first');
      return;
    }
    
    try {
      await axios.post(`${API}/api/sheets/sources`, {
        name: sourceName,
        spreadsheet_url: sheetUrl,
        sheet_name: sheetPreview.selected_sheet,
        column_mapping: columnMapping,
        custom_fields: customFieldsToCreate
      }, { withCredentials: true });
      
      toast.success('Sheet source added');
      fetchSheetsConfig();
      
      // Reset form
      setSheetUrl('');
      setSheetPreview(null);
      setColumnMapping({});
      setCustomFieldsToCreate([]);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add source');
    }
  };

  const importLeads = async (sourceId) => {
    setIsImporting(true);
    try {
      const res = await axios.post(`${API}/api/sheets/import`, {
        source_id: sourceId
      }, { withCredentials: true });
      
      toast.success(`Imported ${res.data.imported} leads (${res.data.skipped} skipped)`);
      fetchDashboard();
      fetchSheetsConfig();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to import leads');
    } finally {
      setIsImporting(false);
    }
  };

  const deleteSheetSource = async (sourceId) => {
    try {
      await axios.delete(`${API}/api/sheets/sources/${sourceId}`, { withCredentials: true });
      toast.success('Source removed');
      fetchSheetsConfig();
    } catch (error) {
      toast.error('Failed to delete source');
    }
  };

  // Check for sheets_connected URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sheets_connected') === 'true') {
      toast.success('Google Sheets connected successfully!');
      fetchSheetsConfig();
      // Clean up URL
      window.history.replaceState({}, '', '/marketing-board');
    }
  }, []);

  useEffect(() => {
    if (showSheetsDialog && user) {
      fetchSheetsConfig();
    }
  }, [showSheetsDialog, user]);

  const toggleDistribution = async () => {
    try {
      await axios.patch(`${API}/api/marketing/distribution-settings`, 
        { enabled: !settings.enabled },
        { withCredentials: true }
      );
      setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
      toast.success(`Lead distribution ${settings.enabled ? 'disabled' : 'enabled'}`);
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.email) {
      toast.error('Name and email are required');
      return;
    }
    try {
      await axios.post(`${API}/api/marketing/team-members`, newMember, { withCredentials: true });
      toast.success('Team member added successfully');
      setShowAddMember(false);
      setNewMember({ name: '', email: '', role: 'pre_sales', phone: '' });
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add team member');
    }
  };

  const handleAssignLead = async (leadId, userId) => {
    try {
      await axios.post(`${API}/api/marketing/assign-lead/${leadId}?assigned_to=${userId}`, {}, { withCredentials: true });
      toast.success('Lead reassigned successfully');
      fetchAllLeads();
      fetchDashboard();
      if (selectedPerson) {
        fetchPersonLeads(selectedPerson.user_id);
      }
    } catch (error) {
      toast.error('Failed to assign lead');
    }
  };

  const handleUpdateLead = async () => {
    if (!editingLead) return;
    try {
      await axios.patch(`${API}/api/crm/leads/${editingLead.lead_id}`, {
        name: editingLead.name,
        email: editingLead.email,
        phone: editingLead.phone,
        city: editingLead.city
      }, { withCredentials: true });
      toast.success('Lead updated successfully');
      setShowEditLead(false);
      setEditingLead(null);
      fetchAllLeads();
      if (selectedPerson) {
        fetchPersonLeads(selectedPerson.user_id);
      }
    } catch (error) {
      toast.error('Failed to update lead');
    }
  };

  const filteredLeads = allLeads.filter(lead => {
    if (!searchQuery) return true;
    return (
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery)
    );
  });

  const openPersonView = (person, type) => {
    setSelectedPerson({ ...person, type });
    setPersonFilter({ date_from: '', date_to: '', source: '', stage: '' });
  };

  const getStageStats = (leads) => {
    const stats = {};
    leads.forEach(lead => {
      const stage = lead.current_stage_id || 'unknown';
      stats[stage] = (stats[stage] || 0) + 1;
    });
    return stats;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      maximumFractionDigits: 0 
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Marketing Board</h1>
                <p className="text-sm text-gray-500">Lead Distribution & Team Management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setShowSheetsDialog(true)} className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" data-testid="connect-sheets-btn">
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Connect Google Sheets
              </Button>
              <Button variant="outline" onClick={fetchDashboard}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </Button>
              <Button onClick={() => setShowAddMember(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <UserPlus className="h-4 w-4 mr-2" /> Add Team Member
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Distribution Engine Settings */}
        <Card className="mb-6 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-indigo-600" />
                <div>
                  <CardTitle>Lead Distribution Engine</CardTitle>
                  <CardDescription>Auto-assign leads to team members using round-robin</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="distribution-toggle" className="text-sm font-medium">
                  {settings?.enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="distribution-toggle"
                  checked={settings?.enabled}
                  onCheckedChange={toggleDistribution}
                />
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4">
              <p className="text-blue-100 text-sm">Total Pre-Sales Leads</p>
              <p className="text-3xl font-bold">{dashboard?.total_pre_sales_leads || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <p className="text-green-100 text-sm">Total Sales Appointments</p>
              <p className="text-3xl font-bold">{dashboard?.total_sales_leads || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <p className="text-purple-100 text-sm">Pre-Sales Team</p>
              <p className="text-3xl font-bold">{dashboard?.pre_sales_team?.length || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <p className="text-orange-100 text-sm">Sales Team</p>
              <p className="text-3xl font-bold">{dashboard?.sales_team?.length || 0}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview" className="data-[state=active]:bg-indigo-100">
              <BarChart3 className="h-4 w-4 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-indigo-100">
              <Users className="h-4 w-4 mr-2" /> Sales Team
            </TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-indigo-100">
              <Layers className="h-4 w-4 mr-2" /> All Leads
            </TabsTrigger>
            <TabsTrigger value="sources" className="data-[state=active]:bg-indigo-100">
              <TrendingUp className="h-4 w-4 mr-2" /> Lead Sources
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Pre-Sales Team Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <Users className="h-5 w-5" /> Pre-Sales Team
                  </CardTitle>
                  <CardDescription>Lead qualification and appointment booking</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboard?.pre_sales_team?.map((member, idx) => (
                      <div 
                        key={member.user_id} 
                        className="bg-gray-50 rounded-lg p-4 border hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => openPersonView(member, 'pre_sales')}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold">
                              {member.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-semibold">{member.name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="text-center bg-white rounded p-2">
                            <p className="text-xl font-bold text-blue-600">{member.total_leads}</p>
                            <p className="text-xs text-gray-500">Leads</p>
                          </div>
                          <div className="text-center bg-white rounded p-2">
                            <p className="text-xl font-bold text-green-600">{member.converted}</p>
                            <p className="text-xs text-gray-500">Appt Booked</p>
                          </div>
                          <div className="text-center bg-white rounded p-2">
                            <p className="text-xl font-bold text-purple-600">{member.conversion_rate}%</p>
                            <p className="text-xs text-gray-500">Rate</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!dashboard?.pre_sales_team || dashboard.pre_sales_team.length === 0) && (
                      <p className="text-center text-gray-500 py-8">No Pre-Sales team members yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sales Team Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <Target className="h-5 w-5" /> Sales Team (Post-Sales)
                  </CardTitle>
                  <CardDescription>Deal closure and conversion</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dashboard?.sales_team?.map((member, idx) => (
                      <div 
                        key={member.user_id} 
                        className="bg-gray-50 rounded-lg p-4 border hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => openPersonView(member, 'sales')}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                              {member.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="font-semibold">{member.name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="text-center bg-white rounded p-2">
                            <p className="text-xl font-bold text-green-600">{member.total_appointments}</p>
                            <p className="text-xs text-gray-500">Appointments</p>
                          </div>
                          <div className="text-center bg-white rounded p-2">
                            <p className="text-xl font-bold text-blue-600">{member.deals_closed}</p>
                            <p className="text-xs text-gray-500">Deals Closed</p>
                          </div>
                          <div className="text-center bg-white rounded p-2">
                            <p className="text-xl font-bold text-purple-600">{member.close_rate}%</p>
                            <p className="text-xs text-gray-500">Close Rate</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!dashboard?.sales_team || dashboard.sales_team.length === 0) && (
                      <p className="text-center text-gray-500 py-8">No Sales team members yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-gray-500" /> Recent Lead Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashboard?.recent_leads?.slice(0, 10).map(lead => (
                    <div key={lead.lead_id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${lead.stage_type === 'pre_sales' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                        <span className="font-medium">{lead.name}</span>
                        <Badge className={SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}>
                          {lead.source?.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{lead.assigned_to_name || 'Unassigned'}</span>
                        <span className="text-xs text-gray-400">{new Date(lead.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Management Tab */}
          <TabsContent value="team">
            <div className="space-y-6">
              {/* Pre-Sales Team List */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-blue-700">
                        <Users className="h-5 w-5" /> Pre-Sales Team
                      </CardTitle>
                      <CardDescription>Lead qualification and appointment booking team</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setNewMember({...newMember, role: 'pre_sales'}); setShowAddMember(true); }}>
                      <UserPlus className="h-4 w-4 mr-2" /> Add Pre-Sales
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Name</th>
                          <th className="px-4 py-3 text-left font-semibold">Contact</th>
                          <th className="px-4 py-3 text-center font-semibold">Total Leads</th>
                          <th className="px-4 py-3 text-center font-semibold">Appt Booked</th>
                          <th className="px-4 py-3 text-center font-semibold">Conversion</th>
                          <th className="px-4 py-3 text-center font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dashboard?.pre_sales_team?.map(member => (
                          <tr key={member.user_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                                  {member.name?.charAt(0)}
                                </div>
                                <span className="font-medium">{member.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-600">{member.email}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg font-bold text-blue-600">{member.total_leads}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg font-bold text-green-600">{member.converted}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={member.conversion_rate >= 20 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                                {member.conversion_rate}%
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => openPersonView(member, 'pre_sales')}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Sales Team List */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-green-700">
                        <Target className="h-5 w-5" /> Sales Team (Post-Sales)
                      </CardTitle>
                      <CardDescription>Deal closure and conversion team</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setNewMember({...newMember, role: 'sales'}); setShowAddMember(true); }}>
                      <UserPlus className="h-4 w-4 mr-2" /> Add Sales
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Name</th>
                          <th className="px-4 py-3 text-left font-semibold">Contact</th>
                          <th className="px-4 py-3 text-center font-semibold">Appointments</th>
                          <th className="px-4 py-3 text-center font-semibold">Deals Closed</th>
                          <th className="px-4 py-3 text-center font-semibold">Close Rate</th>
                          <th className="px-4 py-3 text-center font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dashboard?.sales_team?.map(member => (
                          <tr key={member.user_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold text-sm">
                                  {member.name?.charAt(0)}
                                </div>
                                <span className="font-medium">{member.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-600">{member.email}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg font-bold text-green-600">{member.total_appointments}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg font-bold text-blue-600">{member.deals_closed}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={member.close_rate >= 15 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                                {member.close_rate}%
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => openPersonView(member, 'sales')}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* All Leads Tab */}
          <TabsContent value="leads">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <CardTitle>All Leads</CardTitle>
                  <div className="flex flex-wrap gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search leads..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 w-[200px]"
                      />
                    </div>
                    <Select value={leadsFilter.stage_type} onValueChange={(v) => setLeadsFilter(p => ({ ...p, stage_type: v }))}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="pre_sales">Pre-Sales</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={leadsFilter.assigned_to} onValueChange={(v) => setLeadsFilter(p => ({ ...p, assigned_to: v }))}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="All Assignees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Assignees</SelectItem>
                        {dashboard?.pre_sales_team?.map(m => (
                          <SelectItem key={m.user_id} value={m.user_id}>{m.name} (PS)</SelectItem>
                        ))}
                        {dashboard?.sales_team?.map(m => (
                          <SelectItem key={m.user_id} value={m.user_id}>{m.name} (S)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Lead</th>
                        <th className="px-4 py-3 text-left font-semibold">Contact</th>
                        <th className="px-4 py-3 text-left font-semibold">Type</th>
                        <th className="px-4 py-3 text-left font-semibold">Source</th>
                        <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                        <th className="px-4 py-3 text-left font-semibold">Stage</th>
                        <th className="px-4 py-3 text-left font-semibold">Created</th>
                        <th className="px-4 py-3 text-center font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredLeads.map(lead => (
                        <tr key={lead.lead_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {lead.name?.charAt(0)}
                              </div>
                              <span className="font-medium">{lead.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {lead.phone && <p className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</p>}
                              {lead.email && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={lead.stage_type === 'pre_sales' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}>
                              {lead.stage_type === 'pre_sales' ? 'Pre-Sales' : 'Sales'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}>
                              {lead.source?.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Select 
                              value={lead.assigned_to || 'unassigned'} 
                              onValueChange={(v) => v !== 'unassigned' && handleAssignLead(lead.lead_id, v)}
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue>
                                  {lead.assigned_to_name || 'Unassigned'}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {lead.stage_type === 'pre_sales' ? (
                                  dashboard?.pre_sales_team?.map(m => (
                                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                                  ))
                                ) : (
                                  dashboard?.sales_team?.map(m => (
                                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">
                              {lead.current_stage_id?.replace('stg_', '').replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingLead(lead); setShowEditLead(true); }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredLeads.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                            No leads found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lead Sources Tab */}
          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle>Lead Sources Breakdown</CardTitle>
                <CardDescription>Where your leads are coming from</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {dashboard?.leads_by_source?.map(source => (
                    <div key={source._id} className="bg-gray-50 rounded-lg p-4 border text-center hover:shadow-md transition-shadow">
                      <p className="text-3xl font-bold text-indigo-600">{source.count}</p>
                      <p className="text-sm text-gray-600 capitalize mt-1">{source._id?.replace('_', ' ') || 'Unknown'}</p>
                      <Badge className={`mt-2 ${SOURCE_COLORS[source._id] || SOURCE_COLORS.other}`}>
                        {((source.count / dashboard.total_pre_sales_leads) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Individual Person View Dialog */}
      <Dialog open={!!selectedPerson} onOpenChange={(open) => !open && setSelectedPerson(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${selectedPerson?.type === 'pre_sales' ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-gradient-to-br from-green-400 to-green-600'}`}>
                {selectedPerson?.name?.charAt(0)}
              </div>
              <div>
                <p className="text-xl">{selectedPerson?.name}</p>
                <p className="text-sm text-gray-500 font-normal">{selectedPerson?.email}</p>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedPerson && (
            <div className="space-y-6 mt-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-blue-700">
                      {selectedPerson.type === 'pre_sales' ? selectedPerson.total_leads : selectedPerson.total_appointments}
                    </p>
                    <p className="text-xs text-blue-600">Total {selectedPerson.type === 'pre_sales' ? 'Leads' : 'Appointments'}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-green-700">
                      {selectedPerson.type === 'pre_sales' ? selectedPerson.converted : selectedPerson.deals_closed}
                    </p>
                    <p className="text-xs text-green-600">{selectedPerson.type === 'pre_sales' ? 'Appt Booked' : 'Deals Closed'}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-purple-700">
                      {selectedPerson.type === 'pre_sales' ? selectedPerson.conversion_rate : selectedPerson.close_rate}%
                    </p>
                    <p className="text-xs text-purple-600">{selectedPerson.type === 'pre_sales' ? 'Conversion Rate' : 'Close Rate'}</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-orange-700">{personLeads.length}</p>
                    <p className="text-xs text-orange-600">Filtered Results</p>
                  </CardContent>
                </Card>
              </div>

              {/* Stage Breakdown */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lead Stage Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(getStageStats(personLeads)).map(([stage, count]) => (
                      <Badge key={stage} variant="outline" className="text-xs">
                        <span className={`w-2 h-2 rounded-full mr-1.5 ${STAGE_COLORS[stage] || 'bg-gray-500'}`}></span>
                        {stage.replace('stg_', '').replace(/_/g, ' ')}: {count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Filters */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Filter className="h-4 w-4" /> Filters
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">From Date</Label>
                      <Input 
                        type="date" 
                        value={personFilter.date_from}
                        onChange={(e) => setPersonFilter(p => ({ ...p, date_from: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">To Date</Label>
                      <Input 
                        type="date" 
                        value={personFilter.date_to}
                        onChange={(e) => setPersonFilter(p => ({ ...p, date_to: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Source</Label>
                      <Select value={personFilter.source} onValueChange={(v) => setPersonFilter(p => ({ ...p, source: v }))}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="All Sources" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources</SelectItem>
                          <SelectItem value="meta">Meta</SelectItem>
                          <SelectItem value="seo">SEO</SelectItem>
                          <SelectItem value="referral">Referral</SelectItem>
                          <SelectItem value="walk_in">Walk-in</SelectItem>
                          <SelectItem value="website">Website</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Stage</Label>
                      <Select value={personFilter.stage} onValueChange={(v) => setPersonFilter(p => ({ ...p, stage: v }))}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="All Stages" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Stages</SelectItem>
                          {selectedPerson.type === 'pre_sales' ? (
                            <>
                              <SelectItem value="stg_new_lead">New Lead</SelectItem>
                              <SelectItem value="stg_contacted">Contacted</SelectItem>
                              <SelectItem value="stg_proposal">Proposal</SelectItem>
                              <SelectItem value="stg_followup">Follow-up</SelectItem>
                              <SelectItem value="stg_appt_booked">Appt Booked</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="stg_new_appointment">New Appointment</SelectItem>
                              <SelectItem value="stg_discussion">Discussion</SelectItem>
                              <SelectItem value="stg_site_visit">Site Visit</SelectItem>
                              <SelectItem value="stg_re_requested">RE Requested</SelectItem>
                              <SelectItem value="stg_re_shared">RE Shared</SelectItem>
                              <SelectItem value="stg_negotiation">Negotiation</SelectItem>
                              <SelectItem value="stg_deal_closed">Deal Closed</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Leads Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Leads ({personLeads.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Lead</th>
                          <th className="px-3 py-2 text-left font-semibold">Contact</th>
                          <th className="px-3 py-2 text-left font-semibold">Source</th>
                          <th className="px-3 py-2 text-left font-semibold">Stage</th>
                          <th className="px-3 py-2 text-left font-semibold">Date</th>
                          <th className="px-3 py-2 text-center font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {personLeads.map(lead => (
                          <tr key={lead.lead_id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <span className="font-medium">{lead.name}</span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {lead.phone || lead.email || '-'}
                            </td>
                            <td className="px-3 py-2">
                              <Badge className={`text-xs ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                                {lead.source?.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-xs">
                                {lead.current_stage_id?.replace('stg_', '').replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {new Date(lead.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button variant="ghost" size="sm" onClick={() => { setEditingLead(lead); setShowEditLead(true); }}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {personLeads.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                              No leads found with current filters
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Team Member Dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Add a new Pre-Sales or Sales team member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={newMember.name}
                onChange={(e) => setNewMember(p => ({ ...p, name: e.target.value }))}
                placeholder="Enter name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember(p => ({ ...p, email: e.target.value }))}
                placeholder="Enter email"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={newMember.phone}
                onChange={(e) => setNewMember(p => ({ ...p, phone: e.target.value }))}
                placeholder="Enter phone"
              />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={newMember.role} onValueChange={(v) => setNewMember(p => ({ ...p, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_sales">Pre-Sales</SelectItem>
                  <SelectItem value="sales">Sales (Post-Sales)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button variant="outline" onClick={() => setShowAddMember(false)}>Cancel</Button>
              <Button onClick={handleAddMember} className="bg-indigo-600 hover:bg-indigo-700">
                <UserPlus className="h-4 w-4 mr-2" /> Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={showEditLead} onOpenChange={setShowEditLead}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update lead information</DialogDescription>
          </DialogHeader>
          {editingLead && (
            <div className="space-y-4 mt-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={editingLead.name || ''}
                  onChange={(e) => setEditingLead(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingLead.email || ''}
                  onChange={(e) => setEditingLead(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={editingLead.phone || ''}
                  onChange={(e) => setEditingLead(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={editingLead.city || ''}
                  onChange={(e) => setEditingLead(p => ({ ...p, city: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <Button variant="outline" onClick={() => { setShowEditLead(false); setEditingLead(null); }}>Cancel</Button>
                <Button onClick={handleUpdateLead} className="bg-indigo-600 hover:bg-indigo-700">
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Google Sheets Connection Dialog */}
      <Dialog open={showSheetsDialog} onOpenChange={setShowSheetsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              Connect Google Sheets
            </DialogTitle>
            <DialogDescription>Import leads from Google Sheets automatically</DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            {/* Connection Status */}
            <div className="mb-6 p-4 rounded-lg border bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {sheetsConfig?.is_connected ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-emerald-700">Google Sheets Connected</p>
                        <p className="text-sm text-gray-500">You can now import leads from your spreadsheets</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <Unlink className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium">Not Connected</p>
                        <p className="text-sm text-gray-500">Connect your Google account to import leads</p>
                      </div>
                    </>
                  )}
                </div>
                {sheetsConfig?.is_connected ? (
                  <Button variant="outline" size="sm" onClick={disconnectGoogleSheets} className="text-red-600 border-red-300">
                    <Unlink className="h-4 w-4 mr-2" /> Disconnect
                  </Button>
                ) : (
                  <Button onClick={connectGoogleSheets} className="bg-emerald-600 hover:bg-emerald-700" data-testid="connect-google-btn">
                    <Link className="h-4 w-4 mr-2" /> Connect Google Account
                  </Button>
                )}
              </div>
              {!sheetsConfig?.has_credentials && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-800">Setup Required</p>
                      <p className="text-yellow-700">Google Sheets credentials need to be configured in the backend. Add GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET to backend/.env</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs for Sources */}
            {sheetsConfig?.is_connected && (
              <Tabs value={sheetsTab} onValueChange={setSheetsTab} className="mt-4">
                <TabsList className="bg-gray-100">
                  <TabsTrigger value="website" className="data-[state=active]:bg-white">
                    <Building2 className="h-4 w-4 mr-2" /> Website
                  </TabsTrigger>
                  <TabsTrigger value="sources" className="data-[state=active]:bg-white">
                    <Table className="h-4 w-4 mr-2" /> All Sources
                  </TabsTrigger>
                  <TabsTrigger value="add" className="data-[state=active]:bg-white">
                    <Plus className="h-4 w-4 mr-2" /> Add More
                  </TabsTrigger>
                </TabsList>

                {/* Website Tab - Default Source */}
                <TabsContent value="website" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Website Lead Template</CardTitle>
                      <CardDescription>Standard fields for website lead forms</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {STANDARD_FIELDS.slice(0, 6).map(field => (
                          <div key={field.value} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                            <Check className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm">{field.label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <Label>Google Sheet URL</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            value={sheetUrl}
                            onChange={(e) => setSheetUrl(e.target.value)}
                          />
                          <Button onClick={previewSheet} disabled={isPreviewLoading} className="bg-emerald-600 hover:bg-emerald-700">
                            {isPreviewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Preview'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sheet Preview */}
                  {sheetPreview && (
                    <Card className="border-emerald-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Table className="h-5 w-5 text-emerald-600" />
                          Preview: {sheetPreview.selected_sheet}
                          <Badge className="ml-2 bg-emerald-100 text-emerald-700">{sheetPreview.total_rows} rows</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {/* Column Mapping */}
                        <div className="mb-4">
                          <Label className="text-sm font-medium">Column Mapping</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                            {Object.entries(sheetPreview.column_suggestions || {}).map(([col, info]) => (
                              <div key={col} className="p-2 border rounded bg-gray-50">
                                <p className="text-xs text-gray-500">Column {col}: {info.original}</p>
                                <Select
                                  value={columnMapping[col] || ''}
                                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [col]: v }))}
                                >
                                  <SelectTrigger className="h-8 mt-1">
                                    <SelectValue placeholder="Map to..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_skip">Skip</SelectItem>
                                    {STANDARD_FIELDS.map(f => (
                                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Custom Fields Detected */}
                        {customFieldsToCreate.length > 0 && (
                          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                              <div>
                                <p className="font-medium text-yellow-800">Custom Fields Detected</p>
                                <p className="text-sm text-yellow-700 mb-2">These columns don't match standard fields. They will be stored as custom fields:</p>
                                <div className="flex flex-wrap gap-2">
                                  {customFieldsToCreate.map(cf => (
                                    <Badge key={cf} variant="outline" className="bg-white">{cf}</Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Sample Data Preview */}
                        {sheetPreview.sample_data?.length > 0 && (
                          <div className="mb-4">
                            <Label className="text-sm font-medium">Sample Data (First 3 rows)</Label>
                            <div className="overflow-x-auto mt-2 border rounded">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-100">
                                  <tr>
                                    {sheetPreview.headers?.map((h, i) => (
                                      <th key={i} className="px-2 py-1 text-left">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sheetPreview.sample_data.slice(0, 3).map((row, i) => (
                                    <tr key={i} className="border-t">
                                      {row.map((cell, j) => (
                                        <td key={j} className="px-2 py-1">{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Source Name & Save */}
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <Label>Source Name</Label>
                            <Input
                              value={sourceName}
                              onChange={(e) => setSourceName(e.target.value)}
                              placeholder="e.g., Website, Meta Ads"
                            />
                          </div>
                          <Button onClick={addSheetSource} className="bg-emerald-600 hover:bg-emerald-700">
                            <Plus className="h-4 w-4 mr-2" /> Add Source
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* All Sources Tab */}
                <TabsContent value="sources" className="space-y-4 mt-4">
                  {sheetSources.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No sheet sources configured yet</p>
                      <p className="text-sm">Add a source from the "Website" or "Add More" tab</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sheetSources.map(source => (
                        <Card key={source.source_id} className="border-l-4 border-l-emerald-500">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{source.name}</p>
                                <p className="text-sm text-gray-500">
                                  {source.row_count} rows • Last synced: {source.last_synced ? new Date(source.last_synced).toLocaleString() : 'Never'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => importLeads(source.source_id)}
                                  disabled={isImporting}
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  {isImporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                  <span className="ml-1">Import</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteSheetSource(source.source_id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Add More Tab */}
                <TabsContent value="add" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Add New Lead Source</CardTitle>
                      <CardDescription>Connect any Google Sheet as a lead source</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Source Name *</Label>
                        <Input
                          value={sourceName}
                          onChange={(e) => setSourceName(e.target.value)}
                          placeholder="e.g., Meta Ads, Housing.com, 99acres"
                        />
                      </div>
                      <div>
                        <Label>Google Sheet URL *</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            value={sheetUrl}
                            onChange={(e) => setSheetUrl(e.target.value)}
                          />
                          <Button onClick={previewSheet} disabled={isPreviewLoading} className="bg-emerald-600 hover:bg-emerald-700">
                            {isPreviewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Preview'}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Sheet Selection if preview loaded */}
                      {sheetPreview?.sheets?.length > 1 && (
                        <div>
                          <Label>Select Sheet</Label>
                          <Select value={selectedSheetName} onValueChange={setSelectedSheetName}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select sheet" />
                            </SelectTrigger>
                            <SelectContent>
                              {sheetPreview.sheets.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Preview for Add More tab */}
                  {sheetPreview && sheetsTab === 'add' && (
                    <Card className="border-emerald-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Table className="h-5 w-5 text-emerald-600" />
                          Preview: {sheetPreview.selected_sheet}
                          <Badge className="ml-2 bg-emerald-100 text-emerald-700">{sheetPreview.total_rows} rows</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {/* Column Mapping */}
                        <div className="mb-4">
                          <Label className="text-sm font-medium">Map Columns to Lead Fields</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                            {Object.entries(sheetPreview.column_suggestions || {}).map(([col, info]) => (
                              <div key={col} className="p-2 border rounded bg-gray-50">
                                <p className="text-xs text-gray-500">Column {col}: {info.original}</p>
                                <Select
                                  value={columnMapping[col] || ''}
                                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [col]: v }))}
                                >
                                  <SelectTrigger className="h-8 mt-1">
                                    <SelectValue placeholder="Map to..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_skip">Skip</SelectItem>
                                    {STANDARD_FIELDS.map(f => (
                                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Custom Fields */}
                        {customFieldsToCreate.length > 0 && (
                          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                              <div>
                                <p className="font-medium text-yellow-800">New Custom Fields Will Be Created</p>
                                <p className="text-sm text-yellow-700 mb-2">These columns will be stored as custom lead fields:</p>
                                <div className="flex flex-wrap gap-2">
                                  {customFieldsToCreate.map(cf => (
                                    <Badge key={cf} variant="outline" className="bg-white">{cf}</Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Sample Data */}
                        {sheetPreview.sample_data?.length > 0 && (
                          <div className="mb-4">
                            <Label className="text-sm font-medium">Sample Data</Label>
                            <div className="overflow-x-auto mt-2 border rounded">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-100">
                                  <tr>
                                    {sheetPreview.headers?.map((h, i) => (
                                      <th key={i} className="px-2 py-1 text-left">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sheetPreview.sample_data.slice(0, 3).map((row, i) => (
                                    <tr key={i} className="border-t">
                                      {row.map((cell, j) => (
                                        <td key={j} className="px-2 py-1">{cell}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        <Button onClick={addSheetSource} className="w-full bg-emerald-600 hover:bg-emerald-700">
                          <Plus className="h-4 w-4 mr-2" /> Add This Source
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
