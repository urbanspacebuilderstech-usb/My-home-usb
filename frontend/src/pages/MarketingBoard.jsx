import React, { useState, useEffect } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
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
  FileSpreadsheet, Link, Unlink, Plus, Table, Download, AlertCircle, Check, Trash2, ArrowUpDown
} from 'lucide-react';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { NumericInput } from '../components/NumericInput';

const API = process.env.REACT_APP_BACKEND_URL;

// Source colors for badges
const SOURCE_COLORS = {
  meta: 'bg-amber-50 text-amber-700',
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
  stg_new_lead: 'bg-amber-500',
  stg_contacted: 'bg-yellow-500',
  stg_proposal: 'bg-purple-500',
  stg_followup: 'bg-orange-500',
  stg_appt_booked: 'bg-green-500',
  stg_new_appointment: 'bg-amber-500',
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
  const [sortOrder, setSortOrder] = useState('desc'); // newest first by default
  const [leadSources, setLeadSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState('all');
  
  // Bulk Select & Delete
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set());
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  
  // Edit Lead
  const [showEditLead, setShowEditLead] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  
  // Lead Detail View
  const [showLeadDetail, setShowLeadDetail] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');
  
  // Delete Lead
  const [showDeleteLead, setShowDeleteLead] = useState(false);
  const [deletingLead, setDeletingLead] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Add New Lead
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'other',
    city: '',
    sqft: '',
    budget: '',
    notes: '',
    stage_type: 'pre_sales',
    assigned_to: ''
  });
  
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
  
  // Export & Auto-Sync
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportUrl, setExportUrl] = useState('');
  const [exportSheetName, setExportSheetName] = useState('CRM Export');
  const [exportFilters, setExportFilters] = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const [autoSyncConfig, setAutoSyncConfig] = useState({ enabled: false, interval_hours: 1 });
  const [isSyncing, setIsSyncing] = useState(false);

  // Zapier-style sheet import flow
  const [zapSheetUrl, setZapSheetUrl] = useState('');
  const [zapLoading, setZapLoading] = useState(false);
  const [zapPreview, setZapPreview] = useState(null); // {spreadsheet_name, tabs: [...]}
  const [zapStep, setZapStep] = useState('url'); // url | mapping | importing | done
  const [zapTabMappings, setZapTabMappings] = useState({}); // {tabName: {colLetter: fieldName}}
  const [zapNewFields, setZapNewFields] = useState({}); // {tabName: [{header, field_name}]}
  const [zapImportResult, setZapImportResult] = useState(null);
  const [connectedSheets, setConnectedSheets] = useState([]);
  const [syncingSheet, setSyncingSheet] = useState(false);

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
        fetchDashboard(false);
      } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login';
      }
    };
    checkAuthAndFetch();
  }, []);

  const fetchDashboard = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
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
  useAutoRefresh(fetchDashboard, 15000);

  const fetchAllLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (leadsFilter.stage_type && leadsFilter.stage_type !== 'all') params.append('stage_type', leadsFilter.stage_type);
      if (leadsFilter.assigned_to && leadsFilter.assigned_to !== 'all') params.append('assigned_to', leadsFilter.assigned_to);
      if (selectedSource && selectedSource !== 'all') params.append('source', selectedSource);
      
      const res = await axios.get(`${API}/api/marketing/all-leads?${params.toString()}`, { withCredentials: true });
      // Sort by created_at descending (newest first)
      const sortedLeads = (res.data.leads || []).sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setAllLeads(sortedLeads);
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
    if (user && activeTab === 'google_sheets') {
      fetchSheetsConfig();
      fetchAutoSyncConfig();
      fetchConnectedSheets();
    }
  }, [user, activeTab, leadsFilter, selectedSource]);

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
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to preview sheet');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const addSheetSource = async () => {
    if (!sourceName || !sheetPreview) {
      toast.error('Please preview the sheet first');
      return;
    }
    
    // Filter out "_skip" values from column mapping
    const filteredMapping = Object.fromEntries(
      Object.entries(columnMapping).filter(([_, v]) => v && v !== '_skip')
    );
    
    try {
      await axios.post(`${API}/api/sheets/sources`, {
        name: sourceName,
        spreadsheet_url: sheetUrl,
        sheet_name: sheetPreview.selected_sheet,
        column_mapping: filteredMapping,
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
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add source');
    }
  };

  // Import all sheets/tabs from the spreadsheet - each tab becomes a source
  const importAllSheets = async () => {
    if (!sheetPreview) {
      toast.error('Please preview the sheet first');
      return;
    }
    
    // Filter out "_skip" values from column mapping
    const filteredMapping = Object.fromEntries(
      Object.entries(columnMapping).filter(([_, v]) => v && v !== '_skip')
    );
    
    if (Object.keys(filteredMapping).length === 0) {
      toast.error('Please map at least one column');
      return;
    }
    
    setIsImporting(true);
    try {
      const res = await axios.post(`${API}/api/sheets/import-all`, {
        spreadsheet_url: sheetUrl,
        column_mapping: filteredMapping
      }, { withCredentials: true });
      
      const sourcesMsg = res.data.sources?.map(s => `${s.name}: ${s.imported}`).join(', ') || '';
      toast.success(`Imported ${res.data.imported} leads from ${res.data.sources?.length || 0} tabs! ${sourcesMsg}`);
      
      fetchDashboard(false);
      fetchLeadSources();
      setShowSheetsDialog(false);
      
      // Reset form
      setSheetUrl('');
      setSheetPreview(null);
      setColumnMapping({});
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to import leads');
    } finally {
      setIsImporting(false);
    }
  };

  // Fetch unique lead sources for tabs  
  const fetchLeadSources = async () => {
    try {
      const res = await axios.get(`${API}/api/leads/sources`, { withCredentials: true });
      setLeadSources(res.data.sources || []);
    } catch (error) {
      console.error('Failed to fetch lead sources:', error);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'leads') {
      fetchLeadSources();
    }
  }, [user, activeTab]);

  const importLeads = async (sourceId) => {
    setIsImporting(true);
    try {
      const res = await axios.post(`${API}/api/sheets/import`, {
        source_id: sourceId
      }, { withCredentials: true });
      
      toast.success(`Imported ${res.data.imported} leads (${res.data.skipped} skipped)`);
      fetchDashboard(false);
      fetchSheetsConfig();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to import leads');
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

  // Export leads to Google Sheets
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await axios.post(`${API}/api/sheets/export`, {
        spreadsheet_url: exportUrl || undefined,
        sheet_name: exportSheetName,
        filters: exportFilters
      }, { withCredentials: true });
      
      toast.success(`Exported ${res.data.exported} leads!`);
      if (res.data.sheet_url) {
        window.open(res.data.sheet_url, '_blank');
      }
      setShowExportDialog(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to export leads');
    } finally {
      setIsExporting(false);
    }
  };

  // Auto-sync functions
  const fetchAutoSyncConfig = async () => {
    try {
      const res = await axios.get(`${API}/api/sheets/auto-sync/config`, { withCredentials: true });
      if (res.data) setAutoSyncConfig(res.data);
    } catch {}
  };

  const saveAutoSyncConfig = async (config) => {
    try {
      await axios.post(`${API}/api/sheets/auto-sync/config`, config, { withCredentials: true });
      setAutoSyncConfig(config);
      toast.success(`Auto-sync ${config.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to save auto-sync config');
    }
  };

  const runManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await axios.post(`${API}/api/sheets/auto-sync/run`, {}, { withCredentials: true });
      toast.success(`Synced ${res.data.imported || 0} leads from ${res.data.sources?.length || 0} tabs`);
      fetchDashboard(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // Zapier-style: Fetch all tabs from sheet URL
  const zapFetchTabs = async () => {
    if (!zapSheetUrl) { toast.error('Please paste a Google Sheet URL'); return; }
    setZapLoading(true);
    try {
      const res = await axios.post(`${API}/api/sheets/preview-all-tabs`, { spreadsheet_url: zapSheetUrl }, { withCredentials: true });
      setZapPreview(res.data);
      // Initialize mappings from auto-detected
      const mappings = {};
      const newFields = {};
      res.data.tabs.forEach(tab => {
        if (tab.is_empty) return;
        const tabMapping = {};
        Object.entries(tab.column_mapping).forEach(([col, info]) => {
          tabMapping[col] = info.mapped_to || '_skip';
        });
        mappings[tab.tab_name] = tabMapping;
        newFields[tab.tab_name] = [];
      });
      setZapTabMappings(mappings);
      setZapNewFields(newFields);
      setZapStep('mapping');
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to read spreadsheet');
    } finally {
      setZapLoading(false);
    }
  };

  // Zapier-style: Add unmapped column as custom field for a tab
  const zapAddCustomField = (tabName, colLetter, header) => {
    const fieldName = header.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    setZapTabMappings(prev => ({
      ...prev,
      [tabName]: { ...prev[tabName], [colLetter]: fieldName }
    }));
    setZapNewFields(prev => ({
      ...prev,
      [tabName]: [...(prev[tabName] || []), { header, field_name: fieldName, display_name: header }]
    }));
    toast.success(`"${header}" will be added as custom field`);
  };

  // Zapier-style: Import all tabs with mappings
  const zapImportAll = async () => {
    setZapLoading(true);
    try {
      const tabConfigs = zapPreview.tabs.filter(t => !t.is_empty).map(tab => ({
        tab_name: tab.tab_name,
        column_mapping: zapTabMappings[tab.tab_name] || {},
        new_custom_fields: zapNewFields[tab.tab_name] || []
      }));
      const res = await axios.post(`${API}/api/sheets/import-all-tabs`, {
        spreadsheet_url: zapSheetUrl,
        tab_configs: tabConfigs
      }, { withCredentials: true });
      setZapImportResult(res.data);
      setZapStep('done');
      toast.success(`Imported ${res.data.imported} leads from ${res.data.sources?.length || 0} tabs!`);
      fetchDashboard(false);
      fetchConnectedSheets();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Import failed');
    } finally {
      setZapLoading(false);
    }
  };

  // Fetch connected sheets
  const fetchConnectedSheets = async () => {
    try {
      const res = await axios.get(`${API}/api/sheets/connected`, { withCredentials: true });
      setConnectedSheets(res.data.sheets || []);
    } catch (error) {
      console.error('Failed to fetch connected sheets', error);
    }
  };

  // Sync now - check for new rows
  const syncConnectedSheets = async () => {
    setSyncingSheet(true);
    try {
      const res = await axios.post(`${API}/api/sheets/auto-sync/run`, {}, { withCredentials: true });
      if (res.data.new_leads > 0) {
        toast.success(`${res.data.new_leads} new lead(s) synced!`);
        fetchDashboard(false);
      } else {
        toast.info('No new leads found in connected sheets');
      }
      fetchConnectedSheets();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Sync failed');
    } finally {
      setSyncingSheet(false);
    }
  };

  // Disconnect a sheet
  const disconnectConnectedSheet = async (spreadsheetId) => {
    try {
      await axios.delete(`${API}/api/sheets/connected/${spreadsheetId}`, { withCredentials: true });
      toast.success('Sheet disconnected');
      fetchConnectedSheets();
    } catch (error) {
      toast.error('Failed to disconnect sheet');
    }
  };

  useEffect(() => {
    if (user && sheetsConfig?.is_connected) fetchAutoSyncConfig();
  }, [user, sheetsConfig]);

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

  // Add New Lead Function
  const handleAddNewLead = async () => {
    if (!newLeadForm.name) {
      toast.error('Lead name is required');
      return;
    }
    if (!newLeadForm.phone && !newLeadForm.email) {
      toast.error('Phone or email is required');
      return;
    }
    
    try {
      await axios.post(`${API}/api/crm/leads`, {
        name: newLeadForm.name,
        email: newLeadForm.email || '',
        phone: newLeadForm.phone || '',
        source: newLeadForm.source,
        city: newLeadForm.city || '',
        sqft: newLeadForm.sqft ? parseInt(newLeadForm.sqft) : null,
        budget: newLeadForm.budget ? parseInt(newLeadForm.budget) : null,
        notes: newLeadForm.notes || '',
        stage_type: newLeadForm.stage_type,
        assigned_to: newLeadForm.assigned_to || null
      }, { withCredentials: true });
      
      toast.success('Lead created successfully');
      setShowAddLead(false);
      setNewLeadForm({
        name: '',
        email: '',
        phone: '',
        source: 'other',
        city: '',
        sqft: '',
        budget: '',
        notes: '',
        stage_type: 'pre_sales',
        assigned_to: ''
      });
      fetchAllLeads();
      fetchDashboard(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create lead');
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
      fetchDashboard(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add team member');
    }
  };

  const handleAssignLead = async (leadId, userId) => {
    try {
      await axios.post(`${API}/api/marketing/assign-lead/${leadId}?assigned_to=${userId}`, {}, { withCredentials: true });
      toast.success('Lead reassigned successfully');
      fetchAllLeads();
      fetchDashboard(false);
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
      fetchLeadSources();
      if (selectedPerson) {
        fetchPersonLeads(selectedPerson.user_id);
      }
    } catch (error) {
      toast.error('Failed to update lead');
    }
  };

  const handleDeleteLead = async () => {
    if (!deletingLead || deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    try {
      await axios.delete(`${API}/api/marketing/leads/${deletingLead.lead_id}`, { withCredentials: true });
      toast.success('Lead deleted successfully');
      setShowDeleteLead(false);
      setDeletingLead(null);
      setDeleteConfirmText('');
      fetchAllLeads();
      fetchDashboard(false);
      fetchLeadSources();
      if (showLeadDetail) {
        setShowLeadDetail(false);
        setSelectedLead(null);
      }
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete lead');
    }
  };

  const openLeadDetail = (lead) => {
    setSelectedLead(lead);
    setDetailTab('overview');
    setShowLeadDetail(true);
  };

  const openEditLead = (lead) => {
    setEditingLead({ ...lead });
    setShowEditLead(true);
  };

  const openDeleteLead = (lead) => {
    setDeletingLead(lead);
    setDeleteConfirmText('');
    setShowDeleteLead(true);
  };

  const filteredLeads = allLeads.filter(lead => {
    if (!searchQuery) return true;
    return (
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery)
    );
  }).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortOrder === 'desc' ? tb - ta : ta - tb;
  });


  const toggleSelectLead = (leadId) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };
  
  const toggleSelectAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map(l => l.lead_id)));
    }
  };
  
  const handleBulkDelete = async () => {
    if (bulkDeleteConfirm !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    try {
      const res = await axios.post(`${API}/api/marketing/leads/bulk-delete`, { lead_ids: Array.from(selectedLeadIds) }, { withCredentials: true });
      toast.success(`Deleted ${res.data.deleted} leads`);
      setSelectedLeadIds(new Set());
      setBulkDeleteDialog(false);
      setBulkDeleteConfirm('');
      fetchAllLeads();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete leads');
    }
  };


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

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50">
      {/* Header */}
      <AppHeader user={user} />

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
          <Card className="bg-gradient-to-br from-gray-700 to-gray-800 text-white">
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
            <TabsTrigger value="google_sheets" className="data-[state=active]:bg-emerald-100" data-testid="google-sheets-tab">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Google Sheets
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Pre-Sales Team Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-700">
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
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold">
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
                            <p className="text-xl font-bold text-amber-600">{member.total_leads}</p>
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
                            <p className="text-xl font-bold text-amber-600">{member.deals_closed}</p>
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
                        <div className={`w-2 h-2 rounded-full ${lead.stage_type === 'pre_sales' ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                        <span className="font-medium">{lead.name}</span>
                        <Badge className={SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}>
                          {lead.source?.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{lead.assigned_to_name || 'Unassigned'}</span>
                        <span className="text-xs text-gray-400">{new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
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
                      <CardTitle className="flex items-center gap-2 text-amber-700">
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
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm">
                                  {member.name?.charAt(0)}
                                </div>
                                <span className="font-medium">{member.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-gray-600">{member.email}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-lg font-bold text-amber-600">{member.total_leads}</span>
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
                              <span className="text-lg font-bold text-amber-600">{member.deals_closed}</span>
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
                    <Button onClick={() => setShowAddLead(true)} className="bg-green-600 hover:bg-green-700" data-testid="add-new-lead-btn">
                      <Plus className="h-4 w-4 mr-2" /> Add New Lead
                    </Button>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search leads..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 w-[200px]"
                      />
                    </div>
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
                
                {/* Source Filter Tabs */}
                <div className="flex flex-wrap gap-2 mt-4 border-b pb-3">
                  <Button 
                    variant={selectedSource === 'all' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setSelectedSource('all')}
                    className={selectedSource === 'all' ? 'bg-indigo-600' : ''}
                  >
                    All Sources
                    <Badge className="ml-2 bg-white/20 text-inherit">{allLeads.length}</Badge>
                  </Button>
                  {leadSources.map(source => (
                    <Button 
                      key={source.id} 
                      variant={selectedSource === source.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedSource(source.id)}
                      className={selectedSource === source.id ? 'bg-indigo-600' : ''}
                    >
                      {source.display || source.id}
                      <Badge className="ml-2 bg-white/20 text-inherit">{source.count}</Badge>
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <div className="w-full">
                  <table className="w-full text-sm table-fixed">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-2 py-2 text-center w-[4%]">
                          <input 
                            type="checkbox" 
                            checked={selectedLeadIds.size > 0 && selectedLeadIds.size === filteredLeads.length}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300"
                            data-testid="select-all-leads"
                          />
                        </th>
                        <th className="px-2 py-2 text-left font-semibold w-[14%]">Lead</th>
                        <th className="px-2 py-2 text-left font-semibold w-[16%]">Contact</th>
                        <th className="px-2 py-2 text-left font-semibold w-[7%]">Type</th>
                        <th className="px-2 py-2 text-left font-semibold w-[9%]">Source</th>
                        <th className="px-2 py-2 text-left font-semibold w-[14%]">Assigned To</th>
                        <th className="px-2 py-2 text-left font-semibold w-[10%]">Stage</th>
                        <th className="px-2 py-2 text-left font-semibold w-[10%]">Created</th>
                        <th className="px-2 py-2 text-center font-semibold w-[12%]">Actions</th>
                      </tr>
                      {selectedLeadIds.size > 0 && (
                        <tr className="bg-red-50">
                          <td colSpan="9" className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-red-700">{selectedLeadIds.size} lead(s) selected</span>
                              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setBulkDeleteConfirm(''); setBulkDeleteDialog(true); }} data-testid="bulk-delete-btn">
                                Delete Selected
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedLeadIds(new Set())}>
                                Clear Selection
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y">
                      {filteredLeads.map(lead => (
                        <tr key={lead.lead_id} className={`hover:bg-gray-50 ${selectedLeadIds.has(lead.lead_id) ? 'bg-red-50' : ''}`}>
                          <td className="px-2 py-2 text-center">
                            <input 
                              type="checkbox"
                              checked={selectedLeadIds.has(lead.lead_id)}
                              onChange={() => toggleSelectLead(lead.lead_id)}
                              className="rounded border-gray-300"
                              data-testid={`select-lead-${lead.lead_id}`}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {lead.name?.charAt(0)}
                              </div>
                              <span className="font-medium text-xs truncate">{lead.name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="space-y-0">
                              {lead.phone && <p className="text-xs truncate">{lead.phone}</p>}
                              {lead.email && <p className="text-xs text-gray-500 truncate">{lead.email}</p>}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <Badge className={`text-[10px] px-1.5 ${lead.stage_type === 'pre_sales' ? 'bg-amber-50 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {lead.stage_type === 'pre_sales' ? 'PS' : 'S'}
                            </Badge>
                          </td>
                          <td className="px-2 py-2">
                            <Badge className={`text-[10px] px-1.5 truncate ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                              {(lead.source_display || lead.source)?.substring(0, 8)}
                            </Badge>
                          </td>
                          <td className="px-2 py-2">
                            <Select 
                              value={lead.assigned_to || 'unassigned'} 
                              onValueChange={(v) => v !== 'unassigned' && handleAssignLead(lead.lead_id, v)}
                            >
                              <SelectTrigger className="h-7 text-[10px] w-full">
                                <SelectValue>
                                  <span className="truncate">{lead.assigned_to_name?.split(' ')[0] || 'Unassigned'}</span>
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
                          <td className="px-2 py-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 truncate">
                              {lead.current_stage_id?.replace('stg_', '').replace(/_/g, ' ').substring(0, 10)}
                            </Badge>
                          </td>
                          <td className="px-2 py-2 text-[10px] text-gray-500">
                            {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                            <span className="text-gray-400">{new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openLeadDetail(lead)} title="View">
                                <Eye className="h-3.5 w-3.5 text-amber-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditLead(lead)} title="Edit">
                                <Edit2 className="h-3.5 w-3.5 text-amber-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openDeleteLead(lead)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            </div>
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
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lead Sources Breakdown</CardTitle>
                    <CardDescription>Where your leads are coming from</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowSheetsDialog(true)}
                      className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      data-testid="open-google-sheets-btn"
                    >
                      <FileSpreadsheet className="h-4 w-4" /> Google Sheets
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowExportDialog(true)}
                      className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      data-testid="export-sheets-btn"
                    >
                      <Download className="h-4 w-4" /> Export to Sheets
                    </Button>
                  </div>
                </div>
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

          {/* Google Sheets Tab */}
          <TabsContent value="google_sheets">
            <div className="space-y-6">
              {/* Connection Status */}
              <Card className="border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                      <div>
                        <CardTitle>Google Sheets Integration</CardTitle>
                        <CardDescription>Paste a sheet URL → each tab becomes a lead source</CardDescription>
                      </div>
                    </div>
                    {sheetsConfig?.is_connected ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-100 text-emerald-700 gap-1"><Check className="h-3 w-3" /> Connected</Badge>
                        <Button variant="outline" size="sm" onClick={disconnectGoogleSheets} className="text-red-600 border-red-300 hover:bg-red-50 gap-1">
                          <Unlink className="h-3.5 w-3.5" /> Disconnect
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={connectGoogleSheets} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" data-testid="connect-google-sheets-btn">
                        <Link className="h-4 w-4" /> Connect Google Sheets
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>

              {sheetsConfig?.is_connected && (
                <>
                  {/* STEP 1: Paste URL */}
                  {zapStep === 'url' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                          Paste Google Sheet URL
                        </CardTitle>
                        <CardDescription>Each tab in the sheet will become a separate lead source in your CRM</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-3">
                          <Input
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            value={zapSheetUrl}
                            onChange={(e) => setZapSheetUrl(e.target.value)}
                            className="flex-1"
                            data-testid="zap-sheet-url"
                          />
                          <Button onClick={zapFetchTabs} disabled={zapLoading} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 whitespace-nowrap" data-testid="zap-fetch-btn">
                            {zapLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            {zapLoading ? 'Reading...' : 'Fetch Tabs'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* STEP 2: Column Mapping per Tab */}
                  {zapStep === 'mapping' && zapPreview && (
                    <div className="space-y-4">
                      <Card className="bg-gray-50">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-lg">{zapPreview.spreadsheet_name}</p>
                              <p className="text-sm text-gray-500">{zapPreview.total_tabs} tab(s) found — each tab = lead source</p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => { setZapStep('url'); setZapPreview(null); }}>
                                <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1" /> Back
                              </Button>
                              <Button onClick={zapImportAll} disabled={zapLoading} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" data-testid="zap-import-btn">
                                {zapLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                {zapLoading ? 'Importing...' : `Import All ${zapPreview.tabs.filter(t => !t.is_empty).length} Tabs`}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {zapPreview.tabs.map((tab) => (
                        <Card key={tab.tab_name} className={tab.is_empty ? 'opacity-50' : ''}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                                <div>
                                  <CardTitle className="text-sm">{tab.tab_name}</CardTitle>
                                  <CardDescription className="text-xs">
                                    {tab.is_empty ? 'Empty tab — will be skipped' : `${tab.total_rows} rows → Source: "${tab.source_name}"`}
                                  </CardDescription>
                                </div>
                              </div>
                              {!tab.is_empty && (
                                <Badge className="bg-emerald-50 text-emerald-700">{tab.total_rows} leads</Badge>
                              )}
                            </div>
                          </CardHeader>
                          {!tab.is_empty && (
                            <CardContent className="pt-0">
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-1/4">Sheet Column</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-1/4">Maps To</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-1/4">Sample Data</th>
                                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-1/4">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {Object.entries(tab.column_mapping).map(([col, info]) => {
                                      const currentMapping = zapTabMappings[tab.tab_name]?.[col] || '_skip';
                                      const isStandard = info.is_standard;
                                      const isMapped = currentMapping && currentMapping !== '_skip';
                                      const colIdx = col.length === 1 ? col.charCodeAt(0) - 65 : 26 + col.charCodeAt(1) - 65;
                                      const sampleVal = tab.sample_data?.[0]?.[colIdx] || '';
                                      
                                      return (
                                        <tr key={col} className={isMapped ? 'bg-emerald-50/50' : 'bg-amber-50/30'}>
                                          <td className="px-3 py-2">
                                            <span className="font-mono text-xs text-gray-400 mr-1.5">{col}</span>
                                            <span className="font-medium">{info.original}</span>
                                          </td>
                                          <td className="px-3 py-2">
                                            <Select
                                              value={currentMapping}
                                              onValueChange={(val) => setZapTabMappings(prev => ({
                                                ...prev,
                                                [tab.tab_name]: { ...prev[tab.tab_name], [col]: val }
                                              }))}
                                            >
                                              <SelectTrigger className="h-8 text-xs w-40">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="_skip">— Skip —</SelectItem>
                                                <SelectItem value="name">Name</SelectItem>
                                                <SelectItem value="phone">Phone</SelectItem>
                                                <SelectItem value="email">Email</SelectItem>
                                                <SelectItem value="city">City</SelectItem>
                                                <SelectItem value="sqft">Sqft</SelectItem>
                                                <SelectItem value="budget">Budget</SelectItem>
                                                <SelectItem value="notes">Notes</SelectItem>
                                                <SelectItem value="address">Address</SelectItem>
                                                <SelectItem value="state">State</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </td>
                                          <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[150px]">{sampleVal}</td>
                                          <td className="px-3 py-2">
                                            {!isStandard && !isMapped && (
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                                onClick={() => zapAddCustomField(tab.tab_name, col, info.original)}
                                                data-testid={`add-field-${tab.tab_name}-${col}`}
                                              >
                                                <Plus className="h-3 w-3" /> Add as Field
                                              </Button>
                                            )}
                                            {isStandard && <Badge className="bg-emerald-100 text-emerald-700 text-xs">Auto-matched</Badge>}
                                            {!isStandard && isMapped && <Badge className="bg-amber-100 text-amber-700 text-xs">Custom Field</Badge>}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      ))}

                      {/* Bottom Import Button */}
                      <div className="flex justify-end">
                        <Button onClick={zapImportAll} disabled={zapLoading} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" size="lg">
                          {zapLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {zapLoading ? 'Importing...' : `Import All ${zapPreview.tabs.filter(t => !t.is_empty).length} Tabs`}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Import Complete */}
                  {zapStep === 'done' && zapImportResult && (
                    <Card className="border-2 border-emerald-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-emerald-700">
                          <Check className="h-5 w-5" /> Import Complete
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-emerald-50 rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold text-emerald-700">{zapImportResult.imported}</p>
                            <p className="text-sm text-emerald-600">Leads Imported</p>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold text-amber-700">{zapImportResult.skipped}</p>
                            <p className="text-sm text-amber-600">Duplicates Skipped</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-4 text-center">
                            <p className="text-3xl font-bold text-blue-700">{zapImportResult.sources?.length || 0}</p>
                            <p className="text-sm text-blue-600">Sources Created</p>
                          </div>
                        </div>

                        {zapImportResult.sources?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-700">Source Breakdown:</p>
                            {zapImportResult.sources.map((src, i) => (
                              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border">
                                <div className="flex items-center gap-2">
                                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                                  <span className="font-medium">{src.tab}</span>
                                  <span className="text-xs text-gray-400">→ {src.source}</span>
                                </div>
                                <div className="flex gap-2">
                                  <Badge className="bg-emerald-100 text-emerald-700">{src.imported} imported</Badge>
                                  {src.skipped > 0 && <Badge className="bg-amber-100 text-amber-700">{src.skipped} skipped</Badge>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {zapImportResult.custom_fields_created?.length > 0 && (
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                            <p className="text-sm font-medium text-blue-700">New Custom Fields Created:</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {zapImportResult.custom_fields_created.map((f, i) => (
                                <Badge key={i} className="bg-blue-100 text-blue-700">{f}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <Button variant="outline" onClick={() => { setZapStep('url'); setZapPreview(null); setZapImportResult(null); setZapSheetUrl(''); }} className="gap-1.5">
                          <Plus className="h-4 w-4" /> Import Another Sheet
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Export & Auto-Sync section */}
                  {connectedSheets.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <FileSpreadsheet className="h-5 w-5 text-emerald-500" /> Connected Sheets
                            </CardTitle>
                            <CardDescription>New rows added to these sheets are auto-synced as leads</CardDescription>
                          </div>
                          <Button onClick={syncConnectedSheets} disabled={syncingSheet} variant="outline" size="sm" className="gap-1.5" data-testid="sync-now-btn">
                            <RefreshCw className={`h-3.5 w-3.5 ${syncingSheet ? 'animate-spin' : ''}`} />
                            {syncingSheet ? 'Syncing...' : 'Sync Now'}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {connectedSheets.map((sheet, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 border">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                                  <span className="font-medium text-sm">{sheet.spreadsheet_name || 'Sheet'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {sheet.last_synced && (
                                    <span className="text-xs text-gray-400">
                                      Last sync: {new Date(sheet.last_synced).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                      {' '}{new Date(sheet.last_synced).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                  )}
                                  <Button variant="ghost" size="sm" onClick={() => disconnectConnectedSheet(sheet.spreadsheet_id)} className="h-7 text-red-500 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {sheet.tab_configs?.map((tc, ti) => (
                                  <Badge key={ti} variant="outline" className="text-xs gap-1">
                                    {tc.tab_name}
                                    <span className="text-gray-400">({sheet.tab_row_counts?.[tc.tab_name] || 0} rows)</span>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-100" onClick={() => setShowExportDialog(true)} data-testid="export-to-sheets-card">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                          <Download className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm">Export to Sheets</h3>
                          <p className="text-xs text-gray-500">Export CRM leads to a Google Sheet</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-purple-100">
                      <CardContent className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                            <RefreshCw className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">Auto-Sync</h3>
                            <p className="text-xs text-gray-500">{autoSyncConfig?.enabled ? 'Every 1 min (background)' : 'Disabled'}</p>
                          </div>
                        </div>
                        <Switch
                          checked={autoSyncConfig?.enabled}
                          onCheckedChange={(checked) => {
                            const newConfig = { ...autoSyncConfig, enabled: checked };
                            setAutoSyncConfig(newConfig);
                            saveAutoSyncConfig(newConfig);
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Individual Person View Dialog */}
      <Dialog open={!!selectedPerson} onOpenChange={(open) => !open && setSelectedPerson(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${selectedPerson?.type === 'pre_sales' ? 'bg-gradient-to-br from-amber-400 to-amber-600' : 'bg-gradient-to-br from-green-400 to-green-600'}`}>
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
                <Card className="bg-amber-50 border-blue-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-amber-700">
                      {selectedPerson.type === 'pre_sales' ? selectedPerson.total_leads : selectedPerson.total_appointments}
                    </p>
                    <p className="text-xs text-amber-600">Total {selectedPerson.type === 'pre_sales' ? 'Leads' : 'Appointments'}</p>
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
                              {new Date(lead.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
                              <span className="text-gray-400">{new Date(lead.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
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

      {/* Lead Detail Dialog */}
      <Dialog open={showLeadDetail} onOpenChange={setShowLeadDetail}>
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
                      {selectedLead?.source_display || selectedLead?.source}
                    </Badge>
                    <Badge variant="outline">{selectedLead?.current_stage_id?.replace('stg_', '').replace(/_/g, ' ')}</Badge>
                    <Badge className={selectedLead?.stage_type === 'pre_sales' ? 'bg-amber-50 text-amber-700' : 'bg-green-100 text-green-700'}>
                      {selectedLead?.stage_type === 'pre_sales' ? 'Pre-Sales' : 'Sales'}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setShowLeadDetail(false); openEditLead(selectedLead); }}
                  className="text-amber-600 border-blue-200 hover:bg-amber-50"
                >
                  <Edit2 className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { setShowLeadDetail(false); openDeleteLead(selectedLead); }}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedLead && (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-4">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="assignment">Assignment</TabsTrigger>
              </TabsList>
              
              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Contact Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    {selectedLead.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{selectedLead.phone}</span>
                      </div>
                    )}
                    {selectedLead.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{selectedLead.email}</span>
                      </div>
                    )}
                    {selectedLead.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{selectedLead.city}</span>
                      </div>
                    )}
                    {selectedLead.sqft && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span>{selectedLead.sqft} sqft</span>
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
                      {Object.entries(selectedLead.custom_fields).map(([key, value]) => (
                        <div key={key} className="bg-gray-50 rounded-lg p-3">
                          <span className="text-xs text-gray-500">{key}</span>
                          <p className="font-medium">{value || '-'}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                
                {/* Lead Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Lead Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500">Lead ID</span>
                      <p className="font-mono text-sm">{selectedLead.lead_id}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500">Created</span>
                      <p className="font-medium">{new Date(selectedLead.created_at).toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500">Source</span>
                      <p className="font-medium">{selectedLead.source_display || selectedLead.source}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500">Current Stage</span>
                      <p className="font-medium">{selectedLead.current_stage_id?.replace('stg_', '').replace(/_/g, ' ')}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              {/* Assignment Tab */}
              <TabsContent value="assignment" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Current Assignment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedLead.assigned_to ? (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold">
                          {selectedLead.assigned_to_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{selectedLead.assigned_to_name}</p>
                          <p className="text-sm text-gray-500">{selectedLead.stage_type === 'pre_sales' ? 'Pre-Sales Team' : 'Sales Team'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">Not assigned</p>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Reassign Lead</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Label>Select Team Member</Label>
                      <Select 
                        value={selectedLead.assigned_to || 'unassigned'} 
                        onValueChange={(v) => {
                          if (v !== 'unassigned') {
                            handleAssignLead(selectedLead.lead_id, v);
                            // Update local state
                            const assignee = selectedLead.stage_type === 'pre_sales' 
                              ? dashboard?.pre_sales_team?.find(m => m.user_id === v)
                              : dashboard?.sales_team?.find(m => m.user_id === v);
                            setSelectedLead(prev => ({
                              ...prev,
                              assigned_to: v,
                              assigned_to_name: assignee?.name || 'Unknown'
                            }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned" disabled>Select team member</SelectItem>
                          {selectedLead.stage_type === 'pre_sales' ? (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">Pre-Sales Team</div>
                              {dashboard?.pre_sales_team?.map(m => (
                                <SelectItem key={m.user_id} value={m.user_id}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold">
                                      {m.name?.charAt(0)}
                                    </div>
                                    {m.name} - {m.stats?.leads_count || 0} leads
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          ) : (
                            <>
                              <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">Sales Team</div>
                              {dashboard?.sales_team?.map(m => (
                                <SelectItem key={m.user_id} value={m.user_id}>
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs font-bold">
                                      {m.name?.charAt(0)}
                                    </div>
                                    {m.name} - {m.stats?.appointments_count || 0} appointments
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => setShowLeadDetail(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Lead Confirmation Dialog */}
      <Dialog open={showDeleteLead} onOpenChange={setShowDeleteLead}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Lead
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the lead and all associated data.
            </DialogDescription>
          </DialogHeader>
          
          {deletingLead && (
            <div className="space-y-4 mt-4">
              {/* Lead Preview */}
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                    {deletingLead.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-red-800">{deletingLead.name}</p>
                    <p className="text-sm text-red-600">{deletingLead.phone} • {deletingLead.email}</p>
                  </div>
                </div>
              </div>
              
              {/* Confirmation Input */}
              <div>
                <Label className="text-red-600">Type DELETE to confirm</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="mt-2 border-red-300 focus:border-red-500"
                />
              </div>
              
              <div className="flex gap-3 justify-end mt-6">
                <Button variant="outline" onClick={() => { setShowDeleteLead(false); setDeletingLead(null); setDeleteConfirmText(''); }}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleDeleteLead} 
                  disabled={deleteConfirmText !== 'DELETE'}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Lead
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialog} onOpenChange={(open) => { if (!open) { setBulkDeleteDialog(false); setBulkDeleteConfirm(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete {selectedLeadIds.size} Leads
            </DialogTitle>
            <DialogDescription>This action cannot be undone. All selected leads will be permanently deleted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700 font-medium">{selectedLeadIds.size} leads selected for deletion</p>
            </div>
            <div>
              <Label className="text-red-600">Type DELETE to confirm</Label>
              <Input
                value={bulkDeleteConfirm}
                onChange={(e) => setBulkDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="mt-2 border-red-300 focus:border-red-500"
                data-testid="bulk-delete-confirm-input"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setBulkDeleteDialog(false); setBulkDeleteConfirm(''); }}>Cancel</Button>
              <Button 
                onClick={handleBulkDelete}
                disabled={bulkDeleteConfirm !== 'DELETE'}
                className="bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                data-testid="bulk-delete-confirm-btn"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete {selectedLeadIds.size} Leads
              </Button>
            </div>
          </div>
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
                                  value={columnMapping[col] || '_skip'}
                                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [col]: v === '_skip' ? '' : v }))}
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
                        <div className="flex flex-col gap-4">
                          {/* Info about importing all tabs */}
                          {sheetPreview.sheets?.length > 1 && (
                            <div className="p-3 bg-amber-50 border border-blue-200 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Layers className="h-5 w-5 text-amber-600 mt-0.5" />
                                <div>
                                  <p className="font-medium text-amber-800">Multiple Sheets Detected</p>
                                  <p className="text-sm text-amber-700">Found {sheetPreview.sheets.length} tabs: {sheetPreview.sheets.join(', ')}</p>
                                  <p className="text-sm text-amber-600 mt-1">Click "Import All Tabs" to import leads from all sheets. Each tab name will become the lead source.</p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          <div className="flex items-end gap-3 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                              <Label>Source Name (for single sheet)</Label>
                              <Input
                                value={sourceName}
                                onChange={(e) => setSourceName(e.target.value)}
                                placeholder="e.g., Website, Meta Ads"
                              />
                            </div>
                            <Button onClick={addSheetSource} variant="outline">
                              <Plus className="h-4 w-4 mr-2" /> Add Single Source
                            </Button>
                            <Button 
                              onClick={importAllSheets} 
                              disabled={isImporting}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              {isImporting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                              Import All Tabs ({sheetPreview.sheets?.length || 1})
                            </Button>
                          </div>
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
                                  value={columnMapping[col] || '_skip'}
                                  onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [col]: v === '_skip' ? '' : v }))}
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

            {/* Auto-Sync Configuration */}
            {sheetsConfig?.is_connected && (
              <div className="mt-6 p-4 rounded-lg border bg-amber-50 border-amber-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-amber-600" />
                    <h3 className="font-semibold text-amber-800">Auto-Sync</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSyncConfig.enabled}
                      onChange={(e) => saveAutoSyncConfig({ ...autoSyncConfig, enabled: e.target.checked })}
                      className="sr-only peer"
                      data-testid="auto-sync-toggle"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
                {autoSyncConfig.enabled && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-amber-700">Sync every</span>
                      <select
                        value={autoSyncConfig.interval_hours}
                        onChange={(e) => saveAutoSyncConfig({ ...autoSyncConfig, interval_hours: parseInt(e.target.value) })}
                        className="border rounded px-2 py-1 text-sm"
                        data-testid="sync-interval-select"
                      >
                        <option value={1}>1 hour</option>
                        <option value={3}>3 hours</option>
                        <option value={6}>6 hours</option>
                        <option value={12}>12 hours</option>
                        <option value={24}>24 hours</option>
                      </select>
                    </div>
                    {autoSyncConfig.last_synced && (
                      <p className="text-xs text-amber-600">Last synced: {new Date(autoSyncConfig.last_synced).toLocaleString('en-IN')}</p>
                    )}
                    <Button size="sm" variant="outline" onClick={runManualSync} disabled={isSyncing} className="mt-2" data-testid="manual-sync-btn">
                      <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Export to Google Sheets Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-amber-600" />
              Export Leads to Google Sheets
            </DialogTitle>
            <DialogDescription>Export your CRM leads to a new or existing Google Sheet</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Spreadsheet URL (optional)</label>
              <input
                type="text"
                placeholder="Leave empty to create a new sheet"
                value={exportUrl}
                onChange={(e) => setExportUrl(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                data-testid="export-url-input"
              />
              <p className="text-xs text-gray-500 mt-1">Paste an existing Google Sheet URL or leave empty to create new</p>
            </div>
            
            <div>
              <label className="text-sm font-medium">Sheet Tab Name</label>
              <input
                type="text"
                value={exportSheetName}
                onChange={(e) => setExportSheetName(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                data-testid="export-sheet-name-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Filter by Source</label>
              <select
                value={exportFilters.source || ''}
                onChange={(e) => setExportFilters(prev => ({ ...prev, source: e.target.value || undefined }))}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                data-testid="export-source-filter"
              >
                <option value="">All Sources</option>
                <option value="meta">Meta Ads</option>
                <option value="google">Google Ads</option>
                <option value="seo">SEO</option>
                <option value="referral">Referral</option>
                <option value="walk_in">Walk-in</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Filter by Stage</label>
              <select
                value={exportFilters.stage_type || ''}
                onChange={(e) => setExportFilters(prev => ({ ...prev, stage_type: e.target.value || undefined }))}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                data-testid="export-stage-filter"
              >
                <option value="">All Stages</option>
                <option value="pre_sales">Pre-Sales</option>
                <option value="sales">Sales</option>
              </select>
            </div>
          </div>
          
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleExport} 
              disabled={isExporting}
              className="bg-secondary hover:bg-secondary/90"
              data-testid="export-submit-btn"
            >
              {isExporting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {isExporting ? 'Exporting...' : 'Export Leads'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Lead Dialog */}
      <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              Add New Lead
            </DialogTitle>
            <DialogDescription>
              Create a new lead and assign to a team member
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Lead Name *</Label>
                <Input
                  value={newLeadForm.name}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Enter lead name"
                  data-testid="new-lead-name"
                />
              </div>
              
              <div>
                <Label>Phone *</Label>
                <Input
                  value={newLeadForm.phone}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone number"
                  data-testid="new-lead-phone"
                />
              </div>
              
              <div>
                <Label>Email</Label>
                <Input
                  value={newLeadForm.email}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="Email address"
                  type="email"
                />
              </div>
              
              <div>
                <Label>Source</Label>
                <Select value={newLeadForm.source} onValueChange={(v) => setNewLeadForm(p => ({ ...p, source: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta">Meta (Facebook/Instagram)</SelectItem>
                    <SelectItem value="seo">SEO (Google)</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>City/Location</Label>
                <Input
                  value={newLeadForm.city}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, city: e.target.value }))}
                  placeholder="City"
                />
              </div>
              
              <div>
                <Label>Area (Sqft)</Label>
                <NumericInput
                  value={newLeadForm.sqft}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, sqft: e.target.value }))}
                  placeholder="e.g. 1500"
                  
                />
              </div>
              
              <div>
                <Label>Budget (₹)</Label>
                <NumericInput
                  value={newLeadForm.budget}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, budget: e.target.value }))}
                  placeholder="e.g. 5000000"
                  
                />
              </div>
              
              <div>
                <Label>Assign To</Label>
                <Select value={newLeadForm.stage_type} onValueChange={(v) => setNewLeadForm(p => ({ ...p, stage_type: v, assigned_to: '' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_sales">Pre-Sales Team</SelectItem>
                    <SelectItem value="sales">Sales Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Team Member</Label>
                <Select value={newLeadForm.assigned_to || "auto"} onValueChange={(v) => setNewLeadForm(p => ({ ...p, assigned_to: v === "auto" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-assign or select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-assign (Round Robin)</SelectItem>
                    {newLeadForm.stage_type === 'pre_sales' && dashboard?.pre_sales_team?.map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                    ))}
                    {newLeadForm.stage_type === 'sales' && dashboard?.sales_team?.map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input
                  value={newLeadForm.notes}
                  onChange={(e) => setNewLeadForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLead(false)}>Cancel</Button>
            <Button onClick={handleAddNewLead} className="bg-green-600 hover:bg-green-700" data-testid="submit-new-lead">
              <Plus className="h-4 w-4 mr-2" /> Create Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
