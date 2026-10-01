import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { DayPicker } from 'react-day-picker';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Users, LogOut, Plus, Search, Upload, Phone, PhoneOff, Mail, MapPin, Calendar, Building2, 
  ArrowRight, RefreshCw, RotateCw, GripVertical, Eye, Clock, User, MessageSquare,
  FileText, History, Send, X, Settings, ChevronDown, Trash2, Edit2,
  LayoutGrid, List, MoreVertical, Bell, CheckCircle, ArrowUpDown, Loader2, ArrowRightLeft
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useIsMobile } from '../hooks/useIsMobile';
import LeadContactActions from '../components/LeadContactActions';
import { NumericInput } from '../components/NumericInput';

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
  const cls = compact ? 'text-[10px] text-gray-500' : 'text-xs text-gray-600';
  return (
    <div
      className="space-y-0 min-w-0 cursor-default select-none"
      onMouseEnter={() => !lost && setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
    >
      {phone && (
        <p
          className={`${withIcons ? 'flex items-center gap-1 ' : ''}${compact ? 'text-xs text-gray-600' : 'text-xs text-gray-600'} truncate ${lost ? 'text-gray-400 italic' : ''}`}
          title={lost ? 'Hidden (Lost lead)' : (showRaw ? phone : 'Hover to reveal')}
        >
          {withIcons && <Phone className="h-3 w-3 inline" />} {showRaw ? phone : maskPhone(phone)}
        </p>
      )}
      {email && (
        <p
          className={`${withIcons ? 'flex items-center gap-1 ' : ''}${cls} truncate ${lost ? 'text-gray-400 italic' : ''}`}
          title={lost ? 'Hidden (Lost lead)' : (showRaw ? email : 'Hover to reveal')}
        >
          {withIcons && <Mail className="h-3 w-3 inline" />} {showRaw ? email : maskEmail(email)}
        </p>
      )}
    </div>
  );
};

// toLocaleDateString/toLocaleTimeString with options build a new Intl
// formatter on every call, which adds up to hundreds of ms per render across
// 1000+ lead rows. Same output, but each formatter is built once.
const IN_DATE_FORMATTERS = new Map();
const formatIN = (value, options) => {
  const d = new Date(value);
  if (isNaN(d)) return 'Invalid Date'; // what toLocaleDateString returns; Intl throws
  const key = JSON.stringify(options);
  let formatter = IN_DATE_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-IN', options);
    IN_DATE_FORMATTERS.set(key, formatter);
  }
  return formatter.format(d);
};

// Next pending follow-up (amber today, red overdue, blue upcoming), else the
// last completed one. Shared by the desktop table and the phone cards.
const FollowUpChip = ({ followUps }) => {
  const pending = (followUps || []).filter(f => !f.completed);
  const last = (followUps || []).slice(-1)[0];
  const next = pending.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))[0];
  if (next) {
    const today = new Date().toISOString().split('T')[0];
    const isToday = next.scheduled_date === today;
    const isPast = next.scheduled_date < today;
    return (
      <div className={`text-[10px] px-1.5 py-0.5 rounded inline-block ${isToday ? 'bg-amber-100 text-amber-700 font-semibold' : isPast ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
        {formatIN(next.scheduled_date, { day: '2-digit', month: 'short' })}
        {next.scheduled_time && ` ${next.scheduled_time}`}
      </div>
    );
  }
  if (last?.completed) {
    return (
      <div className="text-[10px] px-1.5 py-0.5 rounded inline-block bg-green-50 text-green-600">
        Last: {formatIN(last.scheduled_date, { day: '2-digit', month: 'short' })}
      </div>
    );
  }
  return <span className="text-[10px] text-gray-400">—</span>;
};

// Phones get cards instead of the table, built this many at a time.
const MOBILE_PAGE_SIZE = 40;

// `tel:` target for a stored number. Meta sheet imports can carry a "p:"
// prefix and spaces/dashes; keep only digits and a leading +.
const telHref = (phone) => String(phone || '').replace(/^p:/i, '').replace(/[^\d+]/g, '');

// Custom-field keys without a defined label ("created_time", "adset_id" from
// Meta lead ads) read as "Created time", "Adset id".
const humanizeFieldKey = (key) => {
  const s = String(key).replace(/^cf_/, '').replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Custom-field values: ISO timestamps as a readable date/time, lists joined,
// booleans as Yes/No, objects as JSON (rendering an object would crash React).
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const formatFieldValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ') || '-';
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  if (ISO_DATETIME.test(s)) {
    const shown = formatIN(s, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return shown === 'Invalid Date' ? s : shown;
  }
  return s;
};

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

// Sep 29 2026 — The Delete and Transfer lead dialogs keep their own state and
// are opened through a ref: ref.current.open(lead, stageName). CRMPreSales
// renders every lead row (2000+), so any state change on the page redraws all
// of them — which made these dialogs slow to open and laggy to type in. Held
// here, opening, typing and picking an executive only redraw the dialog.
const DeleteLeadDialog = forwardRef(function DeleteLeadDialog({ onDeleted }, ref) {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState(null);
  const [stageName, setStageName] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({
    open: (nextLead, nextStageName) => {
      setLead(nextLead);
      setStageName(nextStageName || '');
      setConfirmText('');
      setSubmitting(false);
      setOpen(true);
    },
  }), []);

  const handleDelete = async () => {
    if (!lead || confirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }
    setSubmitting(true);
    try {
      await axios.delete(`${API}/crm/leads/${lead.lead_id}`);
      toast.success('Lead deleted successfully');
      setOpen(false);
      onDeleted(lead.lead_id);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) setOpen(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-5 w-5" />
            Delete Lead
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The lead and its remarks and follow-ups will be permanently removed.
          </DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="font-medium text-red-800">{lead.name}</p>
              <p className="text-xs text-red-600">
                {stageName}
                {lead.assigned_to_name ? ` • ${lead.assigned_to_name}` : ''}
              </p>
            </div>

            <div>
              <Label className="text-gray-700">
                Type <span className="font-bold text-red-600">DELETE</span> to confirm
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="mt-1"
                data-testid="delete-lead-confirm-input"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting || confirmText !== 'DELETE'}
            data-testid="confirm-delete-lead-btn"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

const TransferLeadDialog = forwardRef(function TransferLeadDialog({ onTransferred }, ref) {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState(null);
  const [stageName, setStageName] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Active Pre-Sales executives: loaded as soon as the page mounts the dialog,
  // so the list is ready on the first click, then refreshed quietly on each open.
  const [executives, setExecutives] = useState(null);

  const loadExecutives = async () => {
    try {
      const res = await axios.get(`${API}/crm/reassign-targets`, { params: { stage_type: 'pre_sales' } });
      setExecutives((res.data || []).filter(u => u.role === 'pre_sales'));
    } catch {
      setExecutives(prev => prev || []);
    }
  };
  useEffect(() => { loadExecutives(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    open: (nextLead, nextStageName) => {
      setLead(nextLead);
      setStageName(nextStageName || '');
      setNewOwner('');
      setReason('');
      setSubmitting(false);
      setOpen(true);
      loadExecutives();
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = (executives || []).filter(u => u.user_id !== lead?.assigned_to);

  const handleTransfer = async () => {
    if (!lead || !newOwner) {
      toast.error('Pick a Pre-Sales executive to transfer to');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/crm/leads/${lead.lead_id}/reassign`, {
        new_owner_user_id: newOwner,
        reason: reason.trim() || null,
      });
      const newName = res.data?.new_owner || options.find(u => u.user_id === newOwner)?.name || '';
      toast.success(`Lead transferred to ${newName}`);
      setOpen(false);
      onTransferred(lead.lead_id, newOwner, newName);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to transfer lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) setOpen(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            Transfer Lead
          </DialogTitle>
          <DialogDescription>
            Move this lead to another Pre-Sales executive. Both executives are notified.
          </DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="font-medium text-gray-900">{lead.name}</p>
              <p className="text-xs text-gray-600">
                {stageName} • Currently with{' '}
                <span className="font-medium">{lead.assigned_to_name || 'Unassigned'}</span>
              </p>
            </div>

            <div>
              <Label className="text-gray-700">Transfer to</Label>
              <Select value={newOwner} onValueChange={setNewOwner} disabled={options.length === 0}>
                <SelectTrigger className="mt-1" data-testid="transfer-lead-select">
                  <SelectValue placeholder={
                    executives === null ? 'Loading executives…'
                      : options.length === 0 ? 'No other Pre-Sales executives'
                      : 'Select Pre-Sales executive'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {options.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-700">Reason <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this lead being transferred?"
                className="mt-1"
                rows={2}
                data-testid="transfer-lead-reason"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={submitting || !newOwner}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            data-testid="confirm-transfer-lead-btn"
          >
            {submitting
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <ArrowRightLeft className="h-4 w-4 mr-1" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

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
  const [sortOrder, setSortOrder] = useState('desc');
  const [packageLinkDialog, setPackageLinkDialog] = useState({ open: false, leadId: null, link: null }); // newest first by default
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
  // Quick Follow-up dialog
  const [quickFollowupDialog, setQuickFollowupDialog] = useState(false);
  const [quickFollowupLeadId, setQuickFollowupLeadId] = useState(null);
  const [quickFollowupForm, setQuickFollowupForm] = useState({ date: '', time: '', remarks: '' });

  // Follow-up Move dialog (when moving to Follow-up stage)
  const [followupMoveDialog, setFollowupMoveDialog] = useState(false);
  const [followupMoveLeadId, setFollowupMoveLeadId] = useState(null);
  const [followupMoveForm, setFollowupMoveForm] = useState({ date: '', time: '', remarks: '' });

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
  
  // Edit Lead Form
  const [editLeadForm, setEditLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    alternative_phone: '',
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

  // Sep 29 2026 — Phones (< 768px) get a card list instead of the 10-column
  // table. The page holds 1000+ leads, so cards are built MOBILE_PAGE_SIZE at
  // a time with a "Show more" button, starting over when the filters change.
  const isMobile = useIsMobile();
  const [mobileVisible, setMobileVisible] = useState(MOBILE_PAGE_SIZE);
  useEffect(() => {
    setMobileVisible(MOBILE_PAGE_SIZE);
  }, [activeStage, searchQuery, selectedSource, dateFilter, dateFilterEnd, followUpFilter, sortOrder]);

  useEffect(() => {
    fetchData();
  }, []);

  // Aug 29 2026 — deep-link from Sales Masterview's row drill-down
  // (?lead=<id>) straight into that lead's detail dialog. openLeadDetail
  // only strictly needs lead_id — it fetches the full record itself.
  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search).get('lead');
    if (leadId) openLeadDetail({ lead_id: leadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // The 15s auto-refresh usually gets back exactly what is on screen.
      // Keep the current state then: any re-render redraws every lead row
      // (1000+), which stalled the page, typing in dialogs included, on
      // every refresh.
      // An unchanged response is now the very same object (lib/etagCache.js),
      // so check identity before paying for two JSON.stringify calls.
      const keepIfSame = (next) => (prev) => (prev === next || JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      setUser(keepIfSame(userRes.data));
      setDashboard(keepIfSame(dashboardRes.data));
      setStages(keepIfSame(stagesRes.data));
      setCustomFields(keepIfSame(fieldsRes.data));

      const leadsRes = await axios.get(`${API}/crm/pre-sales/leads`);
      setLeads(keepIfSame(leadsRes.data));
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

  // Same silent reload the 15s auto-refresh does, on demand
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData(false);
    } finally {
      setRefreshing(false);
    }
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

  // ============ DELETE LEAD / LEAD TRANSFER ============
  // Pre-Sales staff only ever see their own leads here; the backend enforces
  // that too. Every deletion shows on the Priority Board's Deleted Leads timeline.
  const canDeleteLead = ['super_admin', 'sales_head', 'pre_sales'].includes(user?.role);
  // Sep 29 2026 — Lead Transfer column (list view): hand a lead to another
  // Pre-Sales executive.
  const canTransferLead = ['super_admin', 'sales_head'].includes(user?.role);
  const deleteDialogRef = useRef(null);
  const transferDialogRef = useRef(null);

  const handleLeadDeleted = (leadId) => {
    setLeads(prev => prev.filter(l => l.lead_id !== leadId));
    // Deleting from the lead popup (phones) — don't leave it open on a lead that's gone.
    setLeadDetailDialog(false);
    fetchData(false);
  };

  const handleLeadTransferred = (leadId, ownerId, ownerName) => {
    setLeads(prev => prev.map(l => (l.lead_id === leadId ? { ...l, assigned_to: ownerId, assigned_to_name: ownerName } : l)));
    fetchData(false);
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

  const handleStageChange = async (leadId, newStageId, appointmentData = null, followupData = null) => {
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
      
      // Intercept: Moving to Follow-up stage — ask for date/time first
      if (newStageId === 'stg_follow_up' && !followupData) {
        setFollowupMoveLeadId(leadId);
        setFollowupMoveForm({ date: '', time: '', remarks: '' });
        setFollowupMoveDialog(true);
        return;
      }

      // Intercept: Moving to Package Details Send — auto-generate the public link
      // and open the share popup so the sales user can review greeting + share.
      if (newStageId === 'stg_package_send') {
        try {
          const r = await axios.post(`${API}/leads/${leadId}/generate-package-link`, {});
          setPackageLinkDialog({ open: true, leadId, link: r.data });
          fetchData && fetchData(false);
        } catch (e) {
          toast.error(e?.response?.data?.detail || 'Could not generate package link');
        }
        return;
      }
      
      const payload = { stage_id: newStageId };
      if (appointmentData) {
        payload.appointment_date = appointmentData.date;
        payload.appointment_time = appointmentData.time;
        payload.appointment_type = appointmentData.type;
      }
      
      const result = await axios.patch(`${API}/crm/leads/${leadId}/stage`, payload);
      
      // If moving to follow-up, also create the follow-up entry
      if (newStageId === 'stg_follow_up' && followupData) {
        await axios.post(`${API}/crm/leads/${leadId}/follow-ups`, {
          scheduled_date: followupData.date,
          scheduled_time: followupData.time,
          note: followupData.remarks
        });
      }
      
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
      // Was `fetchLeads()`, which doesn't exist here: the ReferenceError landed
      // in the catch below, so a saved appointment reported "Failed to update".
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update appointment');
    }
  };

  // ============ LEAD DETAILS & REMARKS ============
  const openLeadDetail = async (lead) => {
    setSelectedLead(lead);
    setLeadSummary(lead.summary || '');
    setDetailTab('overview');
    setLeadDetailDialog(true);
    // Auto-fetch active package link so the "Share Link" button is always
    // available in the lead detail, regardless of stage.
    try {
      const r = await axios.get(`${API}/leads/${lead.lead_id}/package-link`);
      setSelectedLead(prev => ({ ...(prev || lead), _package_link: r.data?.link || null }));
    } catch {}
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
  // Apply ALL filters EXCEPT activeStage — used by stage tab counts so they
  // always show the right number regardless of which tab is currently active.
  const leadsAfterNonStageFilters = leads.filter(lead => {
    const matchesSearch = !searchQuery || 
      lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery);
    const matchesSource = !selectedSource || selectedSource === 'all' || lead.source === selectedSource;

    if (followUpFilter) {
      const today = new Date().toISOString().split('T')[0];
      const pendingFollowups = (lead.follow_ups || []).filter(f => !f.completed);
      const hasToday = pendingFollowups.some(f => f.scheduled_date === today) || lead.next_followup_date === today;
      if (!hasToday) return false;
    }

    let matchesDate = true;
    if (dateFilter) {
      let datesToCheck = [];
      if (lead.current_stage_id === 'stg_follow_up') {
        datesToCheck = (lead.follow_ups || []).map(f => f.scheduled_date).filter(Boolean);
        if (lead.next_followup_date) datesToCheck.push(lead.next_followup_date);
      } else if (lead.current_stage_id === 'stg_appointment') {
        if (lead.appointment_date) datesToCheck.push(lead.appointment_date.split('T')[0]);
      } else {
        if (lead.created_at) datesToCheck.push(lead.created_at.split('T')[0]);
        const lastMove = (lead.stage_history || []).slice(-1)[0];
        if (lastMove?.moved_at) datesToCheck.push(lastMove.moved_at.split('T')[0]);
      }
      if (datesToCheck.length === 0 && lead.created_at) datesToCheck.push(lead.created_at.split('T')[0]);
      matchesDate = dateFilterEnd
        ? datesToCheck.some(d => d >= dateFilter && d <= dateFilterEnd)
        : datesToCheck.includes(dateFilter);
    }

    return matchesSearch && matchesSource && matchesDate;
  });

  const filteredLeads = leadsAfterNonStageFilters.filter(lead => {
    const matchesStage = activeStage === 'all' || lead.current_stage_id === activeStage;
    return matchesStage;
  }).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortOrder === 'desc' ? tb - ta : ta - tb;
  });

  const getLeadsByStage = (stageId) => {
    // Use the list filtered by everything EXCEPT the active stage tab,
    // so tab counts stay accurate when switching between tabs.
    return leadsAfterNonStageFilters.filter(lead => lead.current_stage_id === stageId);
  };
  
  const getStageName = (stageId) => {
    const stage = stages.find(s => s.stage_id === stageId);
    return stage?.name || stageId;
  };

  const handleQuickFollowup = async () => {
    if (!quickFollowupForm.date) { toast.error('Please select a date'); return; }
    try {
      await axios.post(`${API}/crm/leads/${quickFollowupLeadId}/follow-ups`, {
        scheduled_date: quickFollowupForm.date,
        scheduled_time: quickFollowupForm.time,
        note: quickFollowupForm.remarks
      });
      toast.success('Follow-up scheduled');
      setQuickFollowupDialog(false);
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add follow-up');
    }
  };


  if (loading && !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const listLeads = activeStage === 'all' ? filteredLeads : getLeadsByStage(activeStage);
  // Sep 30 2026 — The table's Follow-up column only on All and Follow-up;
  // on the other stage tabs it was an empty or stale column.
  const showFollowupCol = activeStage === 'all' || activeStage === 'stg_follow_up';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-full mx-auto px-2 py-2 sm:px-6 sm:py-3">
        {/* Stats Cards (clickable to filter the list). Phones: an even 5-column
            grid (Total + 9 stages = two full rows) that lines up with the
            filters below; wider screens: a single row.
            overflow-x-auto clips on every side, so pad the row enough for the
            active ring (2px + 1px offset) and the hover lift, and cancel the
            padding with negative margins so the cards stay aligned. */}
        <div className="grid grid-cols-5 auto-rows-fr gap-1.5 sm:flex sm:gap-3 mb-3 sm:overflow-x-auto -mx-1 -mt-1.5 px-1 pt-1.5 pb-1">
          <button
            type="button"
            onClick={() => { setActiveStage('all'); setViewMode('list'); }}
            className={`min-w-0 sm:flex-1 flex flex-col items-center justify-center bg-emerald-500 text-white rounded-xl sm:rounded-2xl px-1 sm:px-2 py-2 sm:py-5 shadow-sm transition-transform hover:-translate-y-0.5 ${activeStage === 'all' ? 'ring-2 ring-emerald-700 ring-offset-1' : ''}`}
            data-testid="filter-tile-all"
          >
            <span className="text-[9px] sm:text-xs font-medium opacity-90 text-center leading-tight">Total Leads</span>
            <span className="text-lg sm:text-3xl font-bold mt-0.5">{dashboard?.total_leads || 0}</span>
          </button>
          {stages.map(stage => {
            const count = dashboard?.stages?.find(s => s.stage_id === stage.stage_id)?.lead_count || 0;
            const active = activeStage === stage.stage_id;
            return (
            <button
              type="button"
              key={stage.stage_id}
              onClick={() => { setActiveStage(stage.stage_id); setViewMode('list'); }}
              className={`min-w-0 sm:flex-1 flex flex-col items-center justify-center rounded-xl sm:rounded-2xl px-0.5 sm:px-1 py-2 sm:py-5 shadow-sm border transition-transform hover:-translate-y-0.5 ${active ? 'ring-2 ring-offset-1' : ''}`}
              style={{ 
                backgroundColor: stage.color + '15',
                borderColor: stage.color + '30',
                ...(active ? { '--tw-ring-color': stage.color } : {})
              }}
              data-testid={`stage-count-${stage.stage_id}`}
            >
              <span className="text-[9px] sm:text-[11px] font-medium text-center leading-tight line-clamp-2 sm:truncate w-full px-0.5" style={{ color: stage.color }}>{stage.name}</span>
              <span className="text-lg sm:text-3xl font-bold mt-0.5" style={{ color: stage.color }}>{count}</span>
            </button>
            );
          })}
        </div>

        {/* Search & Filters + View Toggle. Phones: search on its own row, then
            sort / date / source as three equal columns, then the actions row —
            every row spans the full width. */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3 mb-3 sm:mb-6 items-center">
          <div className="relative col-span-3 sm:basis-0 flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search leads by name, email, phone..."
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
            className="h-9 w-full sm:w-auto min-w-0 gap-1.5 text-xs px-2 sm:px-3"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title={sortOrder === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
            data-testid="sort-order-toggle"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          </Button>
          
          {/* Date Filter - Meta Ads style */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`h-9 sm:h-8 w-full sm:w-auto min-w-0 px-2 sm:px-4 text-xs gap-1.5 rounded-lg shadow-sm ${dateFilter ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                data-testid="presales-date-filter-btn"
              >
                <Calendar className="h-3.5 w-3.5" />
                {/* truncate: a date range can be wider than a third of a phone. */}
                <span className="truncate">
                {dateFilter ? (
                  dateFilterEnd && dateFilter !== dateFilterEnd ? (
                    `${new Date(dateFilter).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})} - ${new Date(dateFilterEnd).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}`
                  ) : (
                    new Date(dateFilter).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})
                  )
                ) : 'Date'}
                </span>
                {dateFilter && <X className="h-3 w-3 ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDateFilter(''); setDateFilterEnd(''); }} />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0 rounded-xl shadow-xl border-0" align="start" collisionPadding={8}>
              {/* Phones: presets become a row of chips above the calendar, since
                  sidebar + calendar (~410px) is wider than the screen. */}
              <div className="flex flex-col sm:flex-row">
                {/* Quick Presets - Left sidebar */}
                <div className="flex flex-wrap gap-1 sm:block sm:w-32 border-b sm:border-b-0 sm:border-r bg-gray-50 p-2 sm:space-y-0.5 rounded-t-xl sm:rounded-tr-none sm:rounded-l-xl">
                  {[
                    { label: 'Today', fn: () => { const d = new Date().toISOString().split('T')[0]; setDateFilter(d); setDateFilterEnd(''); } },
                    { label: 'Tomorrow', fn: () => { const d = new Date(); d.setDate(d.getDate()+1); setDateFilter(d.toISOString().split('T')[0]); setDateFilterEnd(''); } },
                    { label: 'This Week', fn: () => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate()-now.getDay()+1); const sun = new Date(mon); sun.setDate(mon.getDate()+6); setDateFilter(mon.toISOString().split('T')[0]); setDateFilterEnd(sun.toISOString().split('T')[0]); } },
                    { label: 'Next 7 Days', fn: () => { const d = new Date(); const e = new Date(); e.setDate(d.getDate()+7); setDateFilter(d.toISOString().split('T')[0]); setDateFilterEnd(e.toISOString().split('T')[0]); } },
                    { label: 'This Month', fn: () => { const now = new Date(); setDateFilter(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setDateFilterEnd(new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0]); } },
                    { label: 'Last 30 Days', fn: () => { const e = new Date(); const s = new Date(); s.setDate(e.getDate()-30); setDateFilter(s.toISOString().split('T')[0]); setDateFilterEnd(e.toISOString().split('T')[0]); } },
                    { label: 'Clear', fn: () => { setDateFilter(''); setDateFilterEnd(''); } },
                    { label: 'All Leads', fn: () => { setDateFilter(''); setDateFilterEnd(''); } },
                  ].map(p => (
                    <button
                      key={p.label}
                      onClick={p.fn}
                      className={`sm:w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${p.label === 'Clear' ? 'text-red-500 hover:bg-red-50 sm:mt-2' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {/* Calendar - Right side */}
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
                      } else {
                        setDateFilter('');
                        setDateFilterEnd('');
                      }
                    }}
                    classNames={{
                      months: 'flex gap-4',
                      month: 'space-y-3',
                      caption: 'flex justify-center relative items-center h-8',
                      caption_label: 'text-sm font-semibold text-gray-800',
                      nav: 'flex items-center gap-1',
                      nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-lg hover:bg-gray-100',
                      table: 'w-full border-collapse',
                      head_row: 'flex',
                      head_cell: 'text-gray-400 rounded-md w-8 font-normal text-[10px] uppercase',
                      row: 'flex w-full mt-1',
                      cell: 'relative p-0 text-center text-sm focus-within:relative',
                      day: 'h-8 w-8 p-0 font-normal text-xs rounded-lg hover:bg-blue-50 transition-colors inline-flex items-center justify-center',
                      day_selected: 'bg-blue-600 text-white hover:bg-blue-700 font-medium',
                      day_today: 'bg-gray-100 font-semibold text-blue-600',
                      day_range_middle: 'bg-blue-50 text-blue-700 rounded-none',
                      day_range_start: 'bg-blue-600 text-white rounded-l-lg rounded-r-none',
                      day_range_end: 'bg-blue-600 text-white rounded-r-lg rounded-l-none',
                      day_outside: 'text-gray-300',
                      day_disabled: 'text-gray-300',
                    }}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Source Filter */}
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="w-full sm:w-[150px] h-9 min-w-0 px-2 sm:px-3 text-xs sm:text-sm">
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
            <Button variant="outline" size="sm" className="col-span-3 gap-1.5 text-gray-600 hover:text-amber-700"
              onClick={() => window.location.href = '/settings/stages?type=pre_sales'}
              data-testid="manage-presales-stages-btn">
              <Settings className="h-3.5 w-3.5" /> Manage Stages
            </Button>
          )}

          {/* View Toggle */}
          {/* On phones Refresh / Sync Sheets / Kanban / List show icons only,
              so the whole group fits on one row next to Create Lead, which
              stretches to fill it. */}
          <div className="col-span-3 flex sm:flex-wrap items-center gap-2 sm:ml-auto">
            <Button
              size="sm"
              onClick={() => setCreateLeadDialog(true)}
              className="flex-1 sm:flex-initial gap-1.5 bg-indigo-600 hover:bg-indigo-700"
              data-testid="create-lead-btn"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Lead
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5 text-gray-700 px-2.5 sm:px-3"
              title="Refresh"
              data-testid="refresh-page-btn"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncSheets}
              disabled={syncingSheets}
              className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 px-2.5 sm:px-3"
              title="Sync Sheets"
              data-testid="sync-sheets-btn"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingSheets ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncingSheets ? 'Syncing...' : 'Sync Sheets'}</span>
            </Button>
            <div className="flex items-center border rounded-lg overflow-hidden bg-white">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none px-2.5 sm:px-3"
              title="Kanban"
              data-testid="kanban-view-btn"
            >
              <LayoutGrid className="h-4 w-4 sm:mr-1" />
              <span className="text-xs hidden sm:inline">Kanban</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none px-2.5 sm:px-3"
              title="List"
              data-testid="list-view-btn"
            >
              <List className="h-4 w-4 sm:mr-1" />
              <span className="text-xs hidden sm:inline">List</span>
            </Button>
          </div>
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
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-50' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveStage('all')}
                >
                  All ({leadsAfterNonStageFilters.length})
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

            {isMobile ? (
              /* Phone card list — one card per lead; tap opens the lead. */
              <div className="divide-y divide-gray-100" data-testid="presales-mobile-list">
                {listLeads.slice(0, mobileVisible).map(lead => {
                  const stageColor = stages.find(s => s.stage_id === lead.current_stage_id)?.color;
                  const clientVisit = (lead.tags || []).includes('client_office_visit');
                  const showFollowupBtn = lead.current_stage_id === 'stg_follow_up' && !(lead.follow_ups || []).some(f => !f.completed);
                  // Lost leads keep their number hidden, so no call/WhatsApp either.
                  const showContactBtns = !!lead.phone && !isLeadLost(lead);
                  const showAppointment = lead.current_stage_id === 'stg_appointment' && !!lead.appointment_date;
                  // Skip the chips/buttons row entirely when it would be empty.
                  const hasExtrasRow = (lead.follow_ups || []).length > 0 || showAppointment || clientVisit || showFollowupBtn || canTransferLead;
                  return (
                    <div
                      key={lead.lead_id}
                      className={`px-3 py-3 active:bg-gray-50 ${clientVisit ? 'bg-emerald-50/80' : ''}`}
                      onClick={() => openLeadDetail(lead)}
                      data-testid={`presales-mobile-card-${lead.lead_id}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                          {lead.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm truncate">{lead.name}</p>
                          {/* Date sits right under the name; source and assignee
                              stay off the phone card. */}
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500 min-w-0">
                            <span className="flex-shrink-0 tabular-nums">
                              {formatIN(lead.created_at, { day: '2-digit', month: 'short' })}
                            </span>
                            {lead.city && <span className="truncate">· {lead.city}</span>}
                          </div>
                          {/* Tap the number to reveal it without opening the lead. */}
                          <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                            <MaskedContact phone={lead.phone} email={lead.email} lost={isLeadLost(lead)} compact />
                          </div>
                        </div>
                        {/* Stage on top, Call/WhatsApp right under it, so the
                            buttons don't need a row of their own. */}
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <Badge variant="outline" className="text-[10px] px-1.5 whitespace-nowrap" style={{ borderColor: stageColor }}>
                            {getStageName(lead.current_stage_id)}
                          </Badge>
                          {showContactBtns && (
                            <div className="flex items-center gap-2">
                              <LeadContactActions phone={lead.phone} />
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Full card width so the buttons line up under Call/WhatsApp;
                          indented to start under the name. */}
                      {hasExtrasRow && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 pl-[46px]">
                          {(lead.follow_ups || []).length > 0 && <FollowUpChip followUps={lead.follow_ups} />}
                          {showAppointment && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {formatIN(lead.appointment_date, { day: '2-digit', month: 'short' })}{lead.appointment_time ? ` · ${lead.appointment_time}` : ''}
                            </span>
                          )}
                          {clientVisit && (
                            <Badge className="bg-emerald-500 text-white border-0 text-[9px] px-1 py-0 h-4">★ Client Visit</Badge>
                          )}
                          {/* ml-auto + the row's flex-wrap move these to their own
                              line only when needed. Delete lives in the lead popup. */}
                          {(showFollowupBtn || canTransferLead) && (
                            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                              {showFollowupBtn && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 px-2.5 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickFollowupLeadId(lead.lead_id);
                                    setQuickFollowupForm({ date: '', time: '', remarks: '' });
                                    setQuickFollowupDialog(true);
                                  }}
                                >
                                  <Calendar className="h-3.5 w-3.5 mr-1" /> Follow-up
                                </Button>
                              )}
                              {canTransferLead && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 px-2.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                  data-testid={`transfer-lead-card-btn-${lead.lead_id}`}
                                  onClick={(e) => { e.stopPropagation(); transferDialogRef.current?.open(lead, getStageName(lead.current_stage_id)); }}
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transfer
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {listLeads.length === 0 && (
                  <p className="px-4 py-12 text-center text-sm text-gray-500">No leads found</p>
                )}
                {listLeads.length > mobileVisible && (
                  <button
                    type="button"
                    onClick={() => setMobileVisible(v => v + MOBILE_PAGE_SIZE)}
                    className="w-full py-3 text-sm font-medium text-indigo-600 active:bg-indigo-50"
                    data-testid="presales-mobile-show-more"
                  >
                    Show {Math.min(MOBILE_PAGE_SIZE, listLeads.length - mobileVisible)} more · {listLeads.length - mobileVisible} left
                  </button>
                )}
              </div>
            ) : (
            /* List Table */
            <div className="w-full">
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[4%]">S.No</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[14%]">Lead</th>
                    {/* Transfer column (Sales Head / Super Admin) takes its width from Contact, Source, Follow-up, Created and Actions */}
                    <th className={`px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${canTransferLead ? 'w-[11%]' : 'w-[12%]'}`}>Contact</th>
                    <th className={`px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${canTransferLead ? 'w-[8%]' : 'w-[9%]'}`}>Source</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[12%]">Assigned</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[11%]">Stage</th>
                    {showFollowupCol && (
                      <th className={`px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${canTransferLead ? 'w-[11%]' : 'w-[15%]'}`}>Follow-up</th>
                    )}
                    <th className={`px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${canTransferLead ? 'w-[8%]' : 'w-[11%]'}`}>Created</th>
                    {canTransferLead && (
                      <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[10%]">Lead Transfer</th>
                    )}
                    <th className={`px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider ${canTransferLead ? 'w-[11%]' : 'w-[12%]'}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listLeads.map((lead, idx) => (
                    <tr 
                      key={lead.lead_id} 
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${(lead.tags || []).includes('client_office_visit') ? 'bg-emerald-50/80 ring-1 ring-emerald-200' : ''}`}
                      onClick={() => openLeadDetail(lead)}
                      data-testid={(lead.tags || []).includes('client_office_visit') ? 'client-office-visit-lead-row' : undefined}
                    >
                      <td className="px-2 py-2 text-xs text-gray-500 tabular-nums">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                            {lead.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-xs truncate flex items-center gap-1">
                              {lead.name}
                              {(lead.tags || []).includes('client_office_visit') && (
                                <Badge className="bg-emerald-500 text-white border-0 text-[9px] px-1 py-0 h-4" title="Client booked an office visit">★ Client Visit</Badge>
                              )}
                            </p>
                            {lead.city && <p className="text-[10px] text-gray-500 truncate">{lead.city}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <MaskedContact phone={lead.phone} email={lead.email} lost={isLeadLost(lead)} compact />
                      </td>
                      <td className="px-2 py-2">
                        <Badge className={`text-[10px] px-1.5 truncate ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                          {lead.source?.replace('_', ' ').substring(0, 10)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2" data-testid={`lead-assignee-${lead.lead_id}`}>
                        {lead.assigned_to_name ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" title={lead.assigned_to_name}>
                              {lead.assigned_to_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[11px] text-gray-700 truncate" title={lead.assigned_to_name}>{lead.assigned_to_name}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Badge 
                          variant="outline" 
                          className="text-[10px] px-1.5 truncate"
                          style={{ borderColor: stages.find(s => s.stage_id === lead.current_stage_id)?.color }}
                        >
                          {getStageName(lead.current_stage_id)?.substring(0, 12)}
                        </Badge>
                        {lead.current_stage_id === 'stg_appointment' && lead.appointment_date && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 w-fit" data-testid={`appt-date-list-${lead.lead_id}`}>
                            <Calendar className="h-2.5 w-2.5" />
                            <span>{formatIN(lead.appointment_date, { day: '2-digit', month: 'short' })}{lead.appointment_time ? ` · ${lead.appointment_time}` : ''}</span>
                          </div>
                        )}
                      </td>
                      {showFollowupCol && (
                        <td className="px-2 py-2">
                          <div className="space-y-0.5">
                            <FollowUpChip followUps={lead.follow_ups} />
                          </div>
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <span className="text-xs text-gray-500">
                          {formatIN(lead.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      </td>
                      {canTransferLead && (
                        <td className="px-2 py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px] text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                            title={`Transfer to another Pre-Sales executive (current: ${lead.assigned_to_name || 'Unassigned'})`}
                            data-testid={`transfer-lead-btn-${lead.lead_id}`}
                            onClick={(e) => { e.stopPropagation(); transferDialogRef.current?.open(lead, getStageName(lead.current_stage_id)); }}
                          >
                            <ArrowRightLeft className="h-3 w-3 mr-1" /> Transfer
                          </Button>
                        </td>
                      )}
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Sep 29 2026 — Record / New buttons removed from the row
                              (Record only opened the lead, same as the eye). */}
                          {lead.current_stage_id === 'stg_follow_up' && !(lead.follow_ups || []).some(f => !f.completed) && (
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
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); openLeadDetail(lead); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canDeleteLead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Delete lead"
                              data-testid={`delete-lead-btn-${lead.lead_id}`}
                              onClick={(e) => { e.stopPropagation(); deleteDialogRef.current?.open(lead, getStageName(lead.current_stage_id)); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {listLeads.length === 0 && (
                    <tr>
                      <td colSpan={(canTransferLead ? 10 : 9) - (showFollowupCol ? 0 : 1)} className="px-4 py-12 text-center text-gray-500">
                        No leads found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}
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
                        
                        <MaskedContact phone={lead.phone} email={lead.email} lost={isLeadLost(lead)} withIcons />
                        {isMobile && lead.phone && !isLeadLost(lead) && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <LeadContactActions phone={lead.phone} />
                          </div>
                        )}

                        {/* Appointment date — show on Appointment Booked stage */}
                        {lead.current_stage_id === 'stg_appointment' && lead.appointment_date && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 w-fit" data-testid={`appt-date-kanban-${lead.lead_id}`}>
                            <Calendar className="h-2.5 w-2.5" />
                            <span>{formatIN(lead.appointment_date, { day: '2-digit', month: 'short', year: 'numeric' })}{lead.appointment_time ? ` · ${lead.appointment_time}` : ''}</span>
                          </div>
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
                                    <span>{formatIN(log.timestamp, {day:'2-digit',month:'2-digit'})} {formatIN(log.timestamp, {hour:'2-digit',minute:'2-digit'})}</span>
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
                              <Badge variant="outline" className={`text-xs ${
                                (() => {
                                  const next = (lead.follow_ups || []).filter(f => !f.completed).sort((a,b) => (a.scheduled_date||'').localeCompare(b.scheduled_date||''))[0];
                                  if (!next) return 'text-green-600 border-green-300 bg-green-50';
                                  const today = new Date().toISOString().split('T')[0];
                                  if (next.scheduled_date === today) return 'text-amber-700 border-amber-400 bg-amber-50 font-semibold';
                                  if (next.scheduled_date < today) return 'text-red-600 border-red-300 bg-red-50';
                                  return 'text-orange-600 border-orange-300';
                                })()
                              }`}>
                                <Calendar className="h-3 w-3 mr-1" />
                                {(() => {
                                  const next = (lead.follow_ups || []).filter(f => !f.completed).sort((a,b) => (a.scheduled_date||'').localeCompare(b.scheduled_date||''))[0];
                                  if (!next) return 'Done';
                                  return formatIN(next.scheduled_date, {day:'2-digit', month:'short'});
                                })()}
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
                            {formatIN(lead.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })} {formatIN(lead.created_at, { hour: '2-digit', minute: '2-digit' })}
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
                            {/* Phones delete from the lead popup instead. */}
                            {canDeleteLead && !isMobile && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                title="Delete lead"
                                data-testid={`delete-lead-card-btn-${lead.lead_id}`}
                                onClick={(e) => { e.stopPropagation(); deleteDialogRef.current?.open(lead, getStageName(lead.current_stage_id)); }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
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
      <CreateLeadDialog
        open={createLeadDialog}
        onOpenChange={setCreateLeadDialog}
        customFields={customFields}
        onAddField={() => setAddFieldDialog(true)}
        onManageFields={() => setManageFieldsDialog(true)}
        onCreated={() => fetchData(false)}
      />

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
        {/* Oct 1 2026 — Phones: a popup like on desktop, not full screen: a
            12px margin each side, rounded, at most 90dvh tall (dvh, so the
            browser's URL bar doesn't hide the bottom). The header stays fixed
            above the scrolling tabs so the close (X) never floats over content. */}
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-3xl max-h-[90dvh] sm:max-h-[90vh] rounded-xl sm:rounded-lg overflow-hidden flex flex-col gap-0 p-0">
          <div className="shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-2 border-b sm:border-b-0">
          <DialogHeader>
            {/* pr-8 keeps the Edit button clear of the dialog's close (X) button. */}
            <DialogTitle className="flex items-center justify-between gap-2 pr-8 text-left">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-lg sm:text-xl font-bold flex-shrink-0">
                  {selectedLead?.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-xl font-bold break-words">{selectedLead?.name}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                    <Badge className={SOURCE_COLORS[selectedLead?.source] || SOURCE_COLORS.other}>
                      {selectedLead?.source}
                    </Badge>
                    <Badge variant="outline">{getStageName(selectedLead?.current_stage_id)}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Phones: Edit is icon only (like the Sales CRM popup), so the
                    name keeps its width in the popup instead of breaking mid-word. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setLeadDetailDialog(false); openEditLead(selectedLead); }}
                  aria-label="Edit lead"
                  className="h-8 w-8 p-0 sm:w-auto sm:px-3 text-amber-600 border-blue-200 hover:bg-amber-50 flex-shrink-0"
                >
                  <Edit2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Edit</span>
                </Button>
                {/* Phones: Delete sits here instead of on every lead card. */}
                {isMobile && canDeleteLead && selectedLead && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 border-red-200 hover:text-red-700 hover:bg-red-50"
                    aria-label="Delete lead"
                    data-testid="delete-lead-popup-btn"
                    onClick={() => deleteDialogRef.current?.open(selectedLead, getStageName(selectedLead.current_stage_id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-4 sm:px-6">
          {selectedLead && (
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              {/* Package Link CTA — always visible when the lead has an active link */}
              {selectedLead._package_link && (
                <div className="flex items-center justify-between gap-2 mt-3 sm:mt-2 p-2.5 bg-gradient-to-r from-amber-50 to-emerald-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0">📦</div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-amber-800">Package Link Active</p>
                      <p className="text-[10px] text-gray-600 font-mono truncate">/package/{selectedLead._package_link.token?.slice(0, 14)}…</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-1 shrink-0"
                    onClick={() => setPackageLinkDialog({ open: true, leadId: selectedLead.lead_id, link: selectedLead._package_link })}
                    data-testid="lead-detail-share-pkg-btn"
                  >
                    <Send className="h-3.5 w-3.5" /> Share
                  </Button>
                </div>
              )}
              {/* Phones: six tabs don't fit in six columns, so scroll them sideways.
                  The white wrapper is pinned to the top of the scroll area (it
                  carries the top spacing, so nothing shows above the tabs) and
                  switching tabs never needs a scroll back up. */}
              <div className="sticky top-0 z-10 bg-white pt-3 sm:pt-2 pb-1 -mx-4 px-4 sm:-mx-6 sm:px-6">
              <TabsList className="flex w-full justify-start overflow-x-auto sm:grid sm:grid-cols-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="history" data-testid="lead-detail-history-tab">History</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="remarks">Remarks</TabsTrigger>
                <TabsTrigger value="followup">Follow-up</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              </div>
              
              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Contact Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Contact Information</CardTitle>
                  </CardHeader>
                  {/* Phones: one column, long emails wrap, numbers are tap-to-call. */}
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {selectedLead.email && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm [overflow-wrap:anywhere]">{selectedLead.email}</span>
                      </div>
                    )}
                    {selectedLead.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <a href={`tel:${telHref(selectedLead.phone)}`} className="text-sm text-indigo-700 underline-offset-2 hover:underline">{selectedLead.phone}</a>
                      </div>
                    )}
                    {selectedLead.alternative_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-300 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          <a href={`tel:${telHref(selectedLead.alternative_phone)}`} className="underline-offset-2 hover:underline">{selectedLead.alternative_phone}</a>
                          <span className="text-[10px] text-gray-400 ml-1">(alt)</span>
                        </span>
                      </div>
                    )}
                    {(selectedLead.address || selectedLead.city || selectedLead.location) && (
                      <div className="flex items-center gap-2 sm:col-span-2 min-w-0">
                        <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm [overflow-wrap:anywhere]">{[selectedLead.address, selectedLead.city, selectedLead.state, selectedLead.location].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {selectedLead.sqft && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm">{selectedLead.sqft}</span>
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
                      <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <div className="bg-green-50 rounded-lg p-2 sm:p-3 min-w-0">
                          <span className="text-xs text-green-600">Date</span>
                          <p className="text-sm sm:text-base font-medium [overflow-wrap:anywhere]">{selectedLead.appointment.appointment_date}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2 sm:p-3 min-w-0">
                          <span className="text-xs text-green-600">Time</span>
                          <p className="text-sm sm:text-base font-medium">{selectedLead.appointment.appointment_time}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2 sm:p-3 min-w-0">
                          <span className="text-xs text-green-600">Type</span>
                          <p className="text-sm sm:text-base font-medium capitalize [overflow-wrap:anywhere]">{selectedLead.appointment.appointment_type?.replace('_', ' ')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Custom Fields — Sep 29 2026: the only Additional Details card now; a
                    second copy listing raw keys ("cf budget", "cf c2ab89a6") was removed. */}
                {Object.keys(selectedLead.custom_fields || {}).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-600">Additional Details</CardTitle>
                    </CardHeader>
                    {/* Phones: a compact label / value list (Meta ad fields carry
                        long IDs and timestamps); sm+: the two-column tiles. */}
                    <CardContent className="divide-y divide-gray-100 sm:divide-y-0 sm:grid sm:grid-cols-2 sm:gap-3">
                      {Object.entries(selectedLead.custom_fields).map(([key, value]) => {
                        const field = customFields.find(f => f.field_id === key || f.name === key);
                        const shown = formatFieldValue(value);
                        return (
                          <div key={key} className="flex items-baseline justify-between gap-3 py-2 sm:block sm:bg-gray-50 sm:rounded-lg sm:p-3 min-w-0">
                            <span className="text-xs text-gray-500 shrink-0 max-w-[45%] sm:max-w-none">{field?.label || humanizeFieldKey(key)}</span>
                            <p className="text-sm sm:text-base font-medium text-gray-900 text-right sm:text-left min-w-0 [overflow-wrap:anywhere]" title={shown !== String(value ?? '') ? String(value) : undefined}>
                              {shown}
                            </p>
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
                
                {/* Stage Change - MOVED TO FOOTER */}

              </TabsContent>

              {/* ====== History Tab — unified Remarks + Follow-up notes + Stage moves ====== */}
              <TabsContent value="history" className="space-y-3 mt-4">
                {(() => {
                  const items = [];
                  const sHistory = (selectedLead?.stage_history) || [];
                  const remarks = (selectedLead?.remarks) || [];
                  const followUps = (selectedLead?.follow_ups) || [];
                  const stageName = (sid) => {
                    if (!sid) return 'Unknown';
                    const match = stages.find(x => x.stage_id === sid);
                    return match?.name || sid;
                  };
                  // Stage history entries with remarks/notes/lost_reason
                  sHistory.forEach((s, i) => {
                    if (s.remark || s.lost_reason || s.notes) {
                      items.push({
                        kind: 'stage',
                        at: s.moved_at || s.date,
                        icon: 'stage',
                        title: `Moved to ${stageName(s.stage_id)}`,
                        body: s.remark || s.lost_reason || s.notes,
                        by: s.moved_by,
                        key: `stg_${i}`,
                      });
                    }
                  });
                  // Standalone remarks
                  remarks.forEach((r, i) => {
                    items.push({
                      kind: 'remark',
                      at: r.date || r.created_at,
                      icon: 'remark',
                      title: 'Remark',
                      body: r.text || r.note || r.remark,
                      by: r.by_name || r.by,
                      key: `rmk_${i}`,
                    });
                  });
                  // Follow-up entries — schedule + completion both
                  followUps.forEach((f, i) => {
                    if (f.notes || f.note) {
                      items.push({
                        kind: 'followup',
                        at: f.scheduled_at || f.created_at || f.date,
                        icon: 'followup',
                        title: f.completed ? 'Follow-up Completed' : `Follow-up Scheduled${f.followup_date ? ` for ${f.followup_date}` : ''}${f.followup_time ? ` ${f.followup_time}` : ''}`,
                        body: f.notes || f.note,
                        by: f.created_by_name || f.completed_by_name,
                        key: `fu_${i}`,
                      });
                    }
                  });
                  // Lead's own initial summary/notes
                  if (selectedLead?.summary) {
                    items.push({ kind: 'summary', at: selectedLead.created_at, icon: 'remark', title: 'Initial Summary', body: selectedLead.summary, key: 'summary' });
                  }
                  // Sort newest first
                  items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

                  if (items.length === 0) {
                    return (
                      <Card><CardContent className="py-8 text-center text-sm text-gray-400">No remarks, follow-ups, or notes yet.</CardContent></Card>
                    );
                  }

                  const ICON_MAP = {
                    stage: { Icon: ArrowUpDown, bg: 'bg-indigo-100', color: 'text-indigo-600', label: 'STAGE' },
                    remark: { Icon: MessageSquare, bg: 'bg-amber-100', color: 'text-amber-600', label: 'REMARK' },
                    followup: { Icon: Calendar, bg: 'bg-emerald-100', color: 'text-emerald-600', label: 'FOLLOW-UP' },
                  };

                  return (
                    <div className="space-y-2.5" data-testid="lead-history-list">
                      <div className="text-xs text-gray-500 mb-1">{items.length} entr{items.length === 1 ? 'y' : 'ies'} · newest first</div>
                      {items.map(it => {
                        const meta = ICON_MAP[it.icon] || ICON_MAP.remark;
                        const I = meta.Icon;
                        return (
                          <div key={it.key} className="flex gap-3 p-3 rounded-lg border bg-white shadow-sm" data-testid={`history-item-${it.key}`}>
                            <div className={`w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center shrink-0`}>
                              <I className={`h-4 w-4 ${meta.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-gray-900">{it.title}</p>
                                <span className={`text-[10px] uppercase tracking-wide font-medium ${meta.color}`}>{meta.label}</span>
                              </div>
                              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{it.body}</p>
                              <div className="mt-1.5 text-[11px] text-gray-400 flex items-center gap-2">
                                {it.at && <span>{new Date(it.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                                {it.by && <span>· by {it.by}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
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
                        {(() => {
                          const events = [];
                          // Lead Created
                          if (selectedLead.created_at) {
                            events.push({ type: 'created', ts: selectedLead.created_at, data: selectedLead });
                          }
                          // Stage History
                          (selectedLead.stage_history || []).forEach((entry, i) => {
                            events.push({ type: 'stage', ts: entry.moved_at || entry.created_at || 0, data: entry, key: `stg-${i}` });
                          });
                          // Follow-ups: split into "scheduled" (at created_at) and "closed" (at completed_at) if completed
                          (selectedLead.follow_ups || []).forEach((fup, i) => {
                            const scheduleTs = fup.created_at || fup.scheduled_date;
                            events.push({ type: 'followup_scheduled', ts: scheduleTs, data: fup, key: `fup-sch-${i}` });
                            if (fup.completed && fup.completed_at) {
                              events.push({ type: 'followup_closed', ts: fup.completed_at, data: fup, key: `fup-cls-${i}` });
                            }
                          });
                          // RNR Log
                          (selectedLead.rnr_log || []).forEach((log, i) => {
                            events.push({ type: 'rnr', ts: log.timestamp || 0, data: log, key: `rnr-${i}` });
                          });
                          // Office Visit
                          if (selectedLead.office_visit) {
                            const ov = selectedLead.office_visit;
                            const ovTs = ov.created_at || (ov.date ? `${ov.date}T${ov.time || '00:00'}` : 0);
                            events.push({ type: 'office_visit', ts: ovTs, data: ov });
                          }
                          // Sort ascending by timestamp
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
                                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center z-10 shrink-0">
                                    <Plus className="h-3 w-3 text-white" />
                                  </div>
                                  <div className="flex-1 bg-indigo-50 rounded-lg p-2">
                                    <p className="text-xs font-semibold text-indigo-700">Lead Created</p>
                                    <p className="text-[10px] text-gray-500">
                                      {new Date(ev.ts).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            if (ev.type === 'stage') {
                              const entry = ev.data;
                              const stageInfo = stages.find(s => s.stage_id === entry.stage_id);
                              return (
                                <div key={key} className="flex items-start gap-3 relative">
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
                            }
                            if (ev.type === 'followup_scheduled') {
                              const fup = ev.data;
                              return (
                                <div key={key} className="flex items-start gap-3 relative">
                                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center z-10 shrink-0">
                                    <Calendar className="h-3 w-3 text-white" />
                                  </div>
                                  <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                    <p className="text-xs font-semibold text-amber-700">
                                      Follow-up Scheduled{fup.completed ? '' : ' (Pending)'}
                                    </p>
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
                                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center z-10 shrink-0">
                                    <CheckCircle className="h-3 w-3 text-white" />
                                  </div>
                                  <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-2">
                                    <p className="text-xs font-semibold text-green-700">Follow-up Closed</p>
                                    <p className="text-[10px] text-gray-500">
                                      {fup.completed_at ? new Date(fup.completed_at).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''}
                                      {fup.closed_by_name ? ` — ${fup.closed_by_name}` : ''}
                                    </p>
                                    {fup.closing_remark && <p className="text-[10px] text-green-700 mt-0.5">Remark: {fup.closing_remark}</p>}
                                  </div>
                                </div>
                              );
                            }
                            if (ev.type === 'rnr') {
                              const log = ev.data;
                              return (
                                <div key={key} className="flex items-start gap-3 relative">
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
                              );
                            }
                            if (ev.type === 'office_visit') {
                              const ov = ev.data;
                              return (
                                <div key={key} className="flex items-start gap-3 relative">
                                  <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center z-10 shrink-0">
                                    <Building2 className="h-3 w-3 text-white" />
                                  </div>
                                  <div className="flex-1 bg-sky-50 border border-sky-200 rounded-lg p-2">
                                    <p className="text-xs font-semibold text-sky-700">Office Visit Scheduled</p>
                                    <p className="text-[10px] text-gray-500">
                                      {ov.date} at {ov.time} — {ov.location}
                                    </p>
                                    {ov.remarks && <p className="text-[10px] text-gray-600 italic">"{ov.remarks}"</p>}
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
                      <Card key={idx} className={fu.completed ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Calendar className={`h-4 w-4 ${fu.completed ? 'text-green-600' : 'text-orange-600'}`} />
                              <span className="font-medium text-sm">
                                {new Date(fu.scheduled_date).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}
                                {fu.scheduled_time && ` at ${fu.scheduled_time}`}
                              </span>
                            </div>
                            <Badge className={fu.completed ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}>
                              {fu.completed ? 'Closed' : 'Pending'}
                            </Badge>
                          </div>
                          {fu.note && <p className="text-xs mt-1.5 text-gray-600">{fu.note}</p>}
                          {fu.closing_remark && (
                            <div className="mt-1.5 bg-green-100 rounded px-2 py-1">
                              <p className="text-[10px] text-green-800 font-medium">Closing Remark:</p>
                              <p className="text-xs text-green-700">{fu.closing_remark}</p>
                            </div>
                          )}
                          {!fu.completed && (
                            <div className="mt-2">
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Add closing remark..."
                                  className="text-xs h-8 flex-1"
                                  data-testid={`close-remark-input-${idx}`}
                                  id={`close-remark-${idx}`}
                                />
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-green-600 hover:bg-green-700"
                                  data-testid={`close-followup-btn-${idx}`}
                                  onClick={async () => {
                                    const remark = document.getElementById(`close-remark-${idx}`)?.value;
                                    if (!remark?.trim()) { toast.error('Please add a closing remark'); return; }
                                    try {
                                      await axios.patch(`${API}/crm/leads/${selectedLead.lead_id}/follow-up/${idx}/close`, { closing_remark: remark });
                                      toast.success('Follow-up closed');
                                      const res = await axios.get(`${API}/crm/leads/${selectedLead.lead_id}`);
                                      setSelectedLead(res.data);
                                      fetchData(false);
                                    } catch (err) {
                                      toast.error(err.response?.data?.detail || 'Failed to close follow-up');
                                    }
                                  }}
                                >
                                  Close
                                </Button>
                              </div>
                            </div>
                          )}
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
          </div>
          
          {/* Sticky Footer - Move to Stage */}
          {selectedLead && (
          <div className="border-t bg-white px-4 sm:px-6 pt-2.5 sm:pt-3 pb-2.5 sm:pb-3 shrink-0">
            <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
              <span className="text-xs font-medium text-gray-500">Move to Stage:</span>
              {selectedLead.current_stage_id === 'stg_rnr' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-red-600 border-red-300 hover:bg-red-50"
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
                  <PhoneOff className="h-3 w-3 mr-1" /> Log RNR
                </Button>
              )}
            </div>
            {/* Phones: one row that scrolls sideways (wrapped, the nine stages
                took four rows, a quarter of the screen); sm+: wrap as before. */}
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap sm:overflow-visible">
              {stages.map(stage => (
                <Button
                  key={stage.stage_id}
                  variant={selectedLead.current_stage_id === stage.stage_id ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 sm:h-7 text-xs shrink-0"
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
          </div>
          )}
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

            <div>
              <Label>Alternative Phone</Label>
              <Input
                value={editLeadForm.alternative_phone}
                onChange={(e) => setEditLeadForm({...editLeadForm, alternative_phone: e.target.value})}
                placeholder="Optional secondary number"
                data-testid="edit-lead-alt-phone"
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

      {/* Delete / Transfer lead dialogs hold their own state (components above
          CRMPreSales), so opening and typing in them doesn't redraw the lead rows. */}
      {canDeleteLead && <DeleteLeadDialog ref={deleteDialogRef} onDeleted={handleLeadDeleted} />}
      {canTransferLead && <TransferLeadDialog ref={transferDialogRef} onTransferred={handleLeadTransferred} />}

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

      {/* Follow-up Move Dialog (when moving to Follow-up stage) */}
      <Dialog open={followupMoveDialog} onOpenChange={setFollowupMoveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-600" /> Schedule Follow-up
            </DialogTitle>
            <DialogDescription>Set follow-up date and time before moving to Follow-up stage</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Follow-up Date *</Label>
              <Input type="date" value={followupMoveForm.date} onChange={(e) => setFollowupMoveForm({...followupMoveForm, date: e.target.value})} className="mt-1" data-testid="followup-move-date" />
            </div>
            <div>
              <Label className="text-sm font-medium">Time *</Label>
              <Input type="time" value={followupMoveForm.time} onChange={(e) => setFollowupMoveForm({...followupMoveForm, time: e.target.value})} className="mt-1" data-testid="followup-move-time" />
            </div>
            <div>
              <Label className="text-sm font-medium">Remarks</Label>
              <Input value={followupMoveForm.remarks} onChange={(e) => setFollowupMoveForm({...followupMoveForm, remarks: e.target.value})} placeholder="Notes..." className="mt-1" data-testid="followup-move-remarks" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowupMoveDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (!followupMoveForm.date) { toast.error('Please select a date'); return; }
                if (!followupMoveForm.time) { toast.error('Please select a time'); return; }
                setFollowupMoveDialog(false);
                handleStageChange(followupMoveLeadId, 'stg_follow_up', null, followupMoveForm);
              }}
              disabled={!followupMoveForm.date || !followupMoveForm.time}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="followup-move-submit"
            >
              Move to Follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Follow-up Dialog */}
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
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PackageLinkShareDialog
        state={packageLinkDialog}
        onClose={() => setPackageLinkDialog({ open: false, leadId: null, link: null })}
        currentStageId={selectedLead?.lead_id === packageLinkDialog.leadId ? selectedLead?.current_stage_id : leads.find(l => l.lead_id === packageLinkDialog.leadId)?.current_stage_id}
        onMoveToPackageStage={async (leadId) => {
          try {
            await axios.patch(`${API}/crm/leads/${leadId}/stage`, { stage_id: 'stg_package_send' });
            toast.success('Lead moved to Package Details Send');
            fetchData(false);
            setPackageLinkDialog({ open: false, leadId: null, link: null });
          } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not move stage');
          }
        }}
      />

      <MobileBottomNav user={user} />
    </div>
  );
}

// ================== Package Link Share Dialog ==================
// Sep 18 2026 — the greeting used to save per-lead only, so customizing it
// for one lead never carried over to the next (every new lead started from
// a blank box). Now one shared template (GET/PATCH /package-link/greeting-
// template) with a literal "{lead name}" token substituted per-lead only
// for preview/copy/WhatsApp — the raw template (token intact) is what's
// edited and saved, so it stays reusable for every future lead.
const DEFAULT_PACKAGE_GREETING_TEMPLATE = "Hi {lead name}, here's your Urban Space package details 👇";

function PackageLinkShareDialog({ state, onClose, currentStageId, onMoveToPackageStage }) {
  const [greeting, setGreeting] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    axios.get(`${API}/package-link/greeting-template`)
      .then(r => setGreeting(r.data?.template || DEFAULT_PACKAGE_GREETING_TEMPLATE))
      .catch(() => setGreeting(state.link?.greeting || DEFAULT_PACKAGE_GREETING_TEMPLATE));
  }, [state.open]);

  if (!state.open || !state.link) return null;
  const url = `${window.location.origin}/package/${state.link.token}`;
  const clientName = state.link.client_name || '';
  const clientPhone = state.link.client_phone || '';
  const firstName = clientName.split(' ')[0] || 'there';
  const substitutedGreeting = greeting.replace(/\{lead name\}/gi, firstName);
  const fullMessage = `${substitutedGreeting}\n\n${url}`;

  const saveGreeting = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API}/package-link/greeting-template`, { template: greeting });
      toast.success('Greeting saved — used for every lead from now on');
    } catch { toast.error('Failed to save greeting'); }
    finally { setSaving(false); }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(fullMessage);
      toast.success('Copied! Paste in WhatsApp or SMS.');
    } catch { toast.error('Copy failed'); }
  };

  const openWhatsApp = async () => {
    await saveGreeting();
    const phone = (clientPhone || '').replace(/[^0-9]/g, '');
    const waPhone = phone.length === 10 ? `91${phone}` : phone;
    const wa = `https://wa.me/${waPhone}?text=${encodeURIComponent(fullMessage)}`;
    window.open(wa, '_blank');
  };

  const downloadPdf = async () => {
    try {
      const res = await axios.get(`${API}/public/package/${state.link.token}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `urbanspace-packages-${(clientName || 'client').split(' ')[0].toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl" data-testid="pkg-share-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🎁 Share Package Link</DialogTitle>
          <p className="text-xs text-gray-500">Customize the greeting, then copy the full message or open WhatsApp.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-emerald-50 rounded-lg p-3">
            <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-base font-bold">
              {(clientName?.[0] || '?').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{clientName || '(no name)'}</p>
              <p className="text-xs text-gray-600">{clientPhone || '—'}</p>
            </div>
          </div>

          <div>
            <Label className="text-xs">Greeting message (customizable)</Label>
            <Textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              rows={3}
              placeholder={`Hi ${clientName?.split(' ')[0] || 'there'}, here's your package details 👇`}
              data-testid="pkg-greeting-input"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Tip: <code className="bg-gray-100 px-1 rounded text-[9px]">{'{lead name}'}</code> is already auto-filled.</p>
          </div>

          <div>
            <Label className="text-xs">Public Package URL</Label>
            <div className="flex gap-1 mt-1 min-w-0">
              <Input value={url} readOnly className="flex-1 min-w-0 font-mono text-[11px] bg-gray-50" data-testid="pkg-url-input" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success('URL copied'); }}>Copy</Button>
            </div>
          </div>

          <div className="bg-amber-50 rounded-lg p-3 overflow-hidden">
            <p className="text-[10px] uppercase text-amber-700 font-semibold mb-1">Preview (the message you'll send)</p>
            <pre className="text-xs text-gray-800 whitespace-pre-wrap break-all font-sans">{fullMessage}</pre>
          </div>

          {currentStageId && currentStageId !== 'stg_package_send' && onMoveToPackageStage && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 flex items-start gap-3">
              <div className="text-violet-600 text-xl leading-none">📦</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-900">Lead is still in an earlier stage</p>
                <p className="text-[11px] text-violet-700 mt-0.5">Now that you're sharing the package, move the lead to <span className="font-semibold">Package Details Send</span> so the board reflects it.</p>
              </div>
              <Button
                size="sm"
                onClick={() => onMoveToPackageStage(state.leadId)}
                className="bg-violet-600 hover:bg-violet-700 text-white whitespace-nowrap"
                data-testid="pkg-move-stage-btn"
              >
                Move to Package Details Send →
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={downloadPdf} className="gap-1" data-testid="pkg-download-pdf-btn">
            📄 Download PDF
          </Button>
          <Button variant="outline" onClick={() => { saveGreeting(); copyMessage(); }} className="gap-1" data-testid="pkg-copy-btn">
            📋 Copy Message
          </Button>
          <Button onClick={openWhatsApp} className="bg-green-600 hover:bg-green-700 text-white gap-1" disabled={saving || !clientPhone} data-testid="pkg-whatsapp-btn">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '💬'} WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ================== Create Lead Dialog ==================
// The form state lives here, not in CRMPreSales, so each keystroke
// re-renders only this dialog instead of the page's whole (unpaginated)
// lead list, which made typing lag.
const EMPTY_LEAD_FORM = {
  name: '', email: '', phone: '', alternative_phone: '', source: 'other',
  address: '', city: '', state: '', pincode: '', notes: '', custom_fields: {}
};

function CreateLeadDialog({ open, onOpenChange, customFields, onAddField, onManageFields, onCreated }) {
  const [leadForm, setLeadForm] = useState(EMPTY_LEAD_FORM);

  const handleCreateLead = async () => {
    if (!leadForm.name) {
      toast.error('Name is required');
      return;
    }

    try {
      await axios.post(`${API}/crm/pre-sales/leads`, leadForm);
      toast.success('Lead created successfully');
      onOpenChange(false);
      setLeadForm(EMPTY_LEAD_FORM);
      onCreated();
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create lead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Add New Lead</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onAddField}
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

          <div>
            <Label>Alternative Phone</Label>
            <Input
              value={leadForm.alternative_phone}
              onChange={(e) => setLeadForm({...leadForm, alternative_phone: e.target.value})}
              placeholder="Optional secondary number"
              data-testid="lead-alt-phone"
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
                  onClick={onManageFields}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreateLead} data-testid="submit-lead">
            <Plus className="h-4 w-4 mr-1" /> Create Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
