import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Eye, Send, Package, Users, Building2, ArrowRight, Check, X, DollarSign,
  Plus, Search, Trash2, Edit, Truck, EyeOff, ClipboardList, AlertCircle, Calendar, IndianRupee, Download, Filter, FileText, Copy, CreditCard, ChevronRight, ChevronDown, MapPin, Radio, Lock, Unlock, Briefcase
} from 'lucide-react';
import { SortableList, SortableTableRow, DragHandle, arrayMove } from '../components/SortableList';
import { AppHeader } from '../components/AppHeader';
import PlanningRequestsTab from '../components/PlanningRequestsTab';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet default marker fix
const defaultIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = defaultIcon;
const seIcon = L.divIcon({
  className: '',
  html: '<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.3)"></div>',
  iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10]
});
const seOutIcon = L.divIcon({
  className: '',
  html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(239,68,68,0.5);animation:pulse 1.5s infinite"></div>',
  iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10]
});
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import REProjectsPage from './REProjectsPage';
import { NumericInput } from '../components/NumericInput';

import { UnitSelect } from '../components/UnitSelect';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MATERIAL_CATEGORIES = ['cement','sand','steel','bricks','aggregate','tiles','electrical','plumbing','paint','wood','hardware','other'];
const WORK_TYPES = ['Masonry','Plumbing','Electrical','Carpentry','Painting','Flooring','Roofing','HVAC','Civil','Finishing','Tiling','Waterproofing'];

function LiveMapSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchLive = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/attendance/live-locations`);
      setData(res.data);
    } catch { setData(null); }
    setLoading(false);
  };

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const allPoints = [];
  if (data) {
    (data.projects || []).forEach(p => { if (p.latitude && p.longitude) allPoints.push([p.latitude, p.longitude]); });
    (data.active_engineers || []).forEach(e => { if (e.latitude && e.longitude) allPoints.push([e.latitude, e.longitude]); });
  }
  const center = allPoints.length > 0 ? allPoints[0] : [13.08, 80.27];

  return (
    <Card data-testid="live-map-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4 text-green-500" /> Live Site Engineer Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs" data-testid="active-count">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block mr-1 animate-pulse"></span>
              {data?.total_active || 0} Active
            </Badge>
            {(data?.active_engineers || []).some(e => e.is_out_of_range) && (
              <Badge className="bg-red-100 text-red-700 text-xs animate-pulse" data-testid="out-of-range-count">
                {(data?.active_engineers || []).filter(e => e.is_out_of_range).length} Out of Range
              </Badge>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchLive} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {loading && !data ? (
          <div className="text-center py-12 text-gray-400">Loading map...</div>
        ) : (
          <div className="space-y-3">
            {/* Map */}
            <div className="rounded-lg overflow-hidden border" style={{ height: '400px' }} data-testid="live-map-container">
              <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/* Project markers with 5km radius */}
                {(data?.projects || []).map(p => (
                  <React.Fragment key={p.project_id}>
                    <Marker position={[p.latitude, p.longitude]}>
                      <Popup>
                        <div className="text-xs min-w-[140px]">
                          <p className="font-bold">{p.name}</p>
                          <p className="text-gray-500">{p.location}</p>
                          <p className="text-[10px] text-gray-400">5km geo-fence radius</p>
                        </div>
                      </Popup>
                    </Marker>
                    <Circle center={[p.latitude, p.longitude]} radius={5000} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.05, weight: 1, dashArray: '5,5' }} />
                  </React.Fragment>
                ))}
                {/* Active SE markers */}
                {(data?.active_engineers || []).filter(e => e.latitude && e.longitude).map(e => (
                  <Marker key={e.user_id} position={[e.latitude, e.longitude]} icon={e.is_out_of_range ? seOutIcon : seIcon}>
                    <Popup>
                      <div className="text-xs min-w-[140px]">
                        <p className={`font-bold ${e.is_out_of_range ? 'text-red-700' : 'text-green-700'}`}>{e.user_name}</p>
                        <p>{e.project_name}</p>
                        <p className="text-gray-500">Login: {e.login_time}</p>
                        {e.distance_km != null && (
                          <p className={`font-medium ${e.is_out_of_range ? 'text-red-600' : 'text-green-600'}`}>
                            {e.distance_km}km from site {e.is_out_of_range ? '(OUT OF RANGE!)' : ''}
                          </p>
                        )}
                        {e.last_ping && <p className="text-[10px] text-gray-400">Last ping: {new Date(e.last_ping).toLocaleTimeString()}</p>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            {/* Active Engineers List */}
            {(data?.active_engineers || []).length > 0 ? (
              <div className="border rounded-lg overflow-hidden" data-testid="active-se-list">
                <div className="bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Currently Active Site Engineers
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Engineer</th>
                      <th className="px-3 py-2 text-left font-medium">Project Site</th>
                      <th className="px-3 py-2 text-center font-medium">Login Time</th>
                      <th className="px-3 py-2 text-center font-medium">Distance</th>
                      <th className="px-3 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.active_engineers || []).map(e => (
                      <tr key={e.user_id} className={`hover:bg-gray-50 ${e.is_out_of_range ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 font-medium">{e.user_name}</td>
                        <td className="px-3 py-2">{e.project_name}</td>
                        <td className="px-3 py-2 text-center">{e.login_time}</td>
                        <td className="px-3 py-2 text-center">
                          {e.distance_km != null ? (
                            <span className={e.is_out_of_range ? 'text-red-600 font-bold' : 'text-green-600'}>{e.distance_km}km</span>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {e.is_out_of_range ? (
                            <Badge className="bg-red-100 text-red-700 text-[10px]">OUT OF RANGE</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">On Site</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400 text-xs">
                No site engineers currently active. They will appear here when they log in to a project site.
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-gray-500 flex-wrap">
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm opacity-80"></span> Project (5km fence)</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-full"></span> On Site</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-full"></span> Out of Range</div>
              <div className="text-gray-400">Auto-refreshes every 30s</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlanningBoard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Read ?tab=... from URL so deep links from other pages (e.g. ProjectDetail
  // back-nav) land on the correct module tab.
  const initialTab = (() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      const valid = ['dashboard', 'packages', 'material_vendors', 'labour_contractors', 're_templates', 'live_map'];
      return t && valid.includes(t) ? t : 'dashboard';
    } catch { return 'dashboard'; }
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dashSubTab, setDashSubTab] = useState('all_projects');
  const [requestSubTab, setRequestSubTab] = useState('site_eng_req');

  // Projects
  const [projects, setProjects] = useState([]);
  const [liveMapData, setLiveMapData] = useState(null);
  const [liveMapLoading, setLiveMapLoading] = useState(false);
  const [stages, setStages] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [stageDialog, setStageDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [newStage, setNewStage] = useState('');

  // Project sub-tabs
  const [projectSubTab, setProjectSubTab] = useState('new');
  const [subTabProjects, setSubTabProjects] = useState([]);
  const [subTabLoading, setSubTabLoading] = useState(false);
  const [projectDateFilter, setProjectDateFilter] = useState({ type: 'all', date: '', dateFrom: '', dateTo: '', month: '', year: '' });
  // Counts shown on every sub-tab badge regardless of which tab is active
  const [subTabCounts, setSubTabCounts] = useState({ new: 0, active: 0, delivered: 0, archived: 0 });

  // Requests (site engineer + payment)
  const [pendingRequests, setPendingRequests] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [newProjectsFromCRE, setNewProjectsFromCRE] = useState([]);
  const [reNewCount, setReNewCount] = useState(0);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Materials
  const [materials, setMaterials] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialFilter, setMaterialFilter] = useState('active');
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialForm, setMaterialForm] = useState({ name: '', category: 'cement', unit: 'bag', description: '', hsn_code: '' });
  const [materialPackageFilter, setMaterialPackageFilter] = useState('all');

  // Labours
  const [contractors, setContractors] = useState([]);
  const [contractorSearch, setContractorSearch] = useState('');
  const [contractorDialog, setContractorDialog] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const [contractorForm, setContractorForm] = useState({ name: '', work_types: [], phone: '', email: '', address: '', bank_name: '', account_number: '', ifsc_code: '', daily_rate_skilled: '', daily_rate_semi_skilled: '', daily_rate_unskilled: '', is_locked: false });
  // Contractor Types tab
  const [contractorSubTab, setContractorSubTab] = useState('contractors');
  const [contractorTypes, setContractorTypes] = useState([]);
  const [typeDialog, setTypeDialog] = useState({ open: false, editing: null, name: '', description: '' });
  const [typeViewDialog, setTypeViewDialog] = useState({ open: false, type: null, contractors: [], loading: false });
  // Tabbed Add/Edit Contractor dialog
  const [contractorTabIdx, setContractorTabIdx] = useState('basic');
  const [contractorPaymentSummary, setContractorPaymentSummary] = useState(null);
  const [contractorPaymentLoading, setContractorPaymentLoading] = useState(false);

  // Suppliers
  const [vendors, setVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorDialog, setVendorDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '', materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0, bank_name: '', account_number: '', ifsc_code: '' });
  // Sub-tab inside the Material Vendors view: 'vendors' (default) or 'materials'
  const [materialSubTab, setMaterialSubTab] = useState('vendors');
  const [vendorTabIdx, setVendorTabIdx] = useState('basic');

  // Monthly Payment Schedule
  const [monthlySchedule, setMonthlySchedule] = useState({ entries: [], summary: {} });
  const [scheduleMonth, setScheduleMonth] = useState(new Date().getMonth() + 1);
  const [scheduleYear, setScheduleYear] = useState(new Date().getFullYear());
  const [addStagesDialog, setAddStagesDialog] = useState(false);
  const [availableStages, setAvailableStages] = useState([]);
  const [selectedStageIds, setSelectedStageIds] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [vendorLoading, setVendorLoading] = useState(false);

  // RE Templates
  const [reTemplates, setReTemplates] = useState([]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', sqft: '', scope_items: [] });
  const [templateSearch, setTemplateSearch] = useState('');

  // Packages
  const [packages, setPackages] = useState([]);
  const [packageDialog, setPackageDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [packageForm, setPackageForm] = useState({ name: '', description: '', base_rate_per_sqft: '', scope_items: [], material_items: [] });
  const [packageSearch, setPackageSearch] = useState('');
  const [materialNames, setMaterialNames] = useState([]);
  const [brandsByMaterial, setBrandsByMaterial] = useState({});
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [addingMaterialFor, setAddingMaterialFor] = useState(null); // index
  const [addingBrandFor, setAddingBrandFor] = useState(null); // index
  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchSubTabProjects('new', projectDateFilter); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Trigger tab-specific fetches whenever activeTab changes (including initial
  // mount if the URL includes ?tab=...). Without this, deep-linking to
  // /planning-board?tab=labour_contractors leaves the page empty until the
  // user clicks the tab again.
  useEffect(() => {
    if (activeTab === 'material_vendors') { fetchVendors(); fetchMaterials(); }
    if (activeTab === 'labour_contractors') { fetchContractors(); fetchContractorTypes(); }
    if (activeTab === 're_templates') fetchTemplates();
    if (activeTab === 'packages') fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);

      const [dashRes, projRes, payReqRes, matReqRes, labReqRes, newCRERes, reProjRes] = await Promise.allSettled([
        axios.get(`${API}/planning/stage-dashboard`),
        axios.get(`${API}/planning/projects-by-stage`),
        axios.get(`${API}/work-orders/payment-requests`),
        axios.get(`${API}/material-requests?status=requested`),
        axios.get(`${API}/labour-expenses?status=requested`),
        axios.get(`${API}/planning/projects?status=new`),
        axios.get(`${API}/crm/re-projects`).catch(() => ({ data: [] }))
      ]);

      if (dashRes.status === 'fulfilled') setStages(dashRes.value.data.stages || []);
      if (projRes.status === 'fulfilled') setProjects(projRes.value.data || []);
      if (payReqRes.status === 'fulfilled') setPaymentRequests(payReqRes.value.data || []);
      if (newCRERes.status === 'fulfilled') setNewProjectsFromCRE(newCRERes.value.data || []);
      const reData = reProjRes.status === 'fulfilled' ? (reProjRes.value?.data || []) : [];
      setReNewCount(reData.filter(p => p.status === 're_requested').length);

      const allReqs = [];
      if (matReqRes.status === 'fulfilled') allReqs.push(...(matReqRes.value.data || []).map(r => ({ ...r, type: 'material' })));
      if (labReqRes.status === 'fulfilled') allReqs.push(...(labReqRes.value.data || []).map(r => ({ ...r, type: 'labour' })));
      setPendingRequests(allReqs);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 60000);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'dashboard') {
      handleDashSubTabChange(dashSubTab);
    }
    // Always re-fetch on tab switch — checking length===0 created stale state
    // (e.g. user creates a contractor in another tab/session, returns here,
    // and the page still shows "0" because the cached empty array suppresses
    // the fetch). Re-fetching is cheap and gives the most accurate view.
    if (tab === 'material_vendors') { fetchVendors(); fetchMaterials(); }
    if (tab === 'labour_contractors') { fetchContractors(); fetchContractorTypes(); }
    if (tab === 're_templates') fetchTemplates();
    if (tab === 'packages') fetchPackages();
  };

  const handleDashSubTabChange = (sub) => {
    setDashSubTab(sub);
    if (sub === 'all_projects') fetchSubTabProjects(projectSubTab, projectDateFilter);
    if (sub === 'requests') {
      if (materials.length === 0) fetchMaterials();
      if (packages.length === 0) fetchPackages();
    }
    if (sub === 'payment_schedule') fetchMonthlySchedule();
  };

  // Fetch projects by planning lifecycle sub-tab with date filters
  const subTabFetchRef = React.useRef(0);
  const fetchSubTabProjects = async (status, filter) => {
    const myFetchId = ++subTabFetchRef.current;
    setSubTabLoading(true);
    try {
      const params = new URLSearchParams({ planning_status: status });
      if (filter.type === 'date' && filter.date) {
        params.append('date_from', filter.date);
        params.append('date_to', filter.date);
      } else if (filter.type === 'range' && filter.dateFrom) {
        params.append('date_from', filter.dateFrom);
        if (filter.dateTo) params.append('date_to', filter.dateTo);
      } else if (filter.type === 'month' && filter.month && filter.year) {
        params.append('month', filter.month);
        params.append('year', filter.year);
      } else if (filter.type === 'year' && filter.year) {
        params.append('year', filter.year);
      }
      const res = await axios.get(`${API}/planning/projects-filtered?${params.toString()}`);
      // Ignore stale responses — only the latest fetch is allowed to write to state
      if (myFetchId !== subTabFetchRef.current) return;
      setSubTabProjects(res.data || []);
      // Also refresh counts so the OTHER tab badges stay current after this fetch.
      fetchSubTabCounts(filter);
    } catch (err) {
      // Silently swallow transient network blips & cancelled/stale requests.
      // Auto-refresh will retry; toasting here is just noise (the data is
      // already on screen from the previous successful fetch).
      if (err?.response?.status === 401) window.location.href = '/login';
    }
    finally {
      if (myFetchId === subTabFetchRef.current) setSubTabLoading(false);
    }
  };

  // Fetch counts for ALL 4 sub-tabs in parallel so each badge always shows
  // its number even when the tab isn't the active one.
  const fetchSubTabCounts = async (filter) => {
    const buildParams = (status) => {
      const p = new URLSearchParams({ planning_status: status });
      if (filter.type === 'date' && filter.date) {
        p.append('date_from', filter.date);
        p.append('date_to', filter.date);
      } else if (filter.type === 'range' && filter.dateFrom) {
        p.append('date_from', filter.dateFrom);
        if (filter.dateTo) p.append('date_to', filter.dateTo);
      } else if (filter.type === 'month' && filter.month && filter.year) {
        p.append('month', filter.month);
        p.append('year', filter.year);
      } else if (filter.type === 'year' && filter.year) {
        p.append('year', filter.year);
      }
      return p;
    };
    try {
      const statuses = ['new', 'active', 'delivered', 'archived'];
      const results = await Promise.all(
        statuses.map(s => axios.get(`${API}/planning/projects-filtered?${buildParams(s).toString()}`).catch(() => ({ data: [] })))
      );
      setSubTabCounts({
        new: (results[0].data || []).length,
        active: (results[1].data || []).length,
        delivered: (results[2].data || []).length,
        archived: (results[3].data || []).length,
      });
    } catch { /* silent */ }
  };

  useEffect(() => { if (dashSubTab === 'all_projects') fetchSubTabProjects(projectSubTab, projectDateFilter); }, [projectSubTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectSubTabChange = (tab) => {
    setProjectSubTab(tab);
    setProjectDateFilter({ type: 'all', date: '', dateFrom: '', dateTo: '', month: '', year: '' });
  };

  const applyProjectDateFilter = () => {
    fetchSubTabProjects(projectSubTab, projectDateFilter);
  };

  const clearProjectDateFilter = () => {
    const cleared = { type: 'all', date: '', dateFrom: '', dateTo: '', month: '', year: '' };
    setProjectDateFilter(cleared);
    fetchSubTabProjects(projectSubTab, cleared);
  };

  const handlePlanningStatusChange = async (projectId, newStatus) => {
    try {
      await axios.patch(`${API}/planning/projects/${projectId}/planning-status`, { planning_status: newStatus });
      toast.success(newStatus === 'active' ? 'Moved to Current Projects' : newStatus === 'delivered' ? 'Marked as Delivered' : 'Status updated');
      fetchSubTabProjects(projectSubTab, projectDateFilter);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update'); }
  };

  // Archive (Super Admin only) — requires email OTP. We show a small modal that
  // POSTs /archive/send-otp on open, then collects the 6-digit code and submits
  // it to /archive (which validates and flips the flag in one shot).
  const [archiveDialog, setArchiveDialog] = useState({ open: false, projectId: '', projectName: '', otp: '', sending: false, submitting: false, sentMsg: '' });

  const openArchiveDialog = async (projectId, projectName) => {
    setArchiveDialog({ open: true, projectId, projectName, otp: '', sending: true, submitting: false, sentMsg: '' });
    try {
      const r = await axios.post(`${API}/projects/${projectId}/archive/send-otp`);
      setArchiveDialog(d => ({ ...d, sending: false, sentMsg: r.data?.message || 'OTP sent to your email' }));
    } catch (e) {
      const detail = e.response?.data?.detail || 'Failed to send OTP';
      toast.error(detail);
      setArchiveDialog(d => ({ ...d, open: false, sending: false }));
    }
  };

  const submitArchiveOtp = async () => {
    if (!archiveDialog.otp || archiveDialog.otp.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }
    setArchiveDialog(d => ({ ...d, submitting: true }));
    try {
      await axios.post(`${API}/projects/${archiveDialog.projectId}/archive`, { otp: archiveDialog.otp });
      toast.success('Project archived');
      setArchiveDialog({ open: false, projectId: '', projectName: '', otp: '', sending: false, submitting: false, sentMsg: '' });
      fetchSubTabProjects(projectSubTab, projectDateFilter);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Invalid or expired OTP');
      setArchiveDialog(d => ({ ...d, submitting: false }));
    }
  };

  const resendArchiveOtp = async () => {
    setArchiveDialog(d => ({ ...d, sending: true, sentMsg: '' }));
    try {
      const r = await axios.post(`${API}/projects/${archiveDialog.projectId}/archive/send-otp`);
      setArchiveDialog(d => ({ ...d, sending: false, otp: '', sentMsg: r.data?.message || 'OTP re-sent' }));
      toast.success('OTP re-sent');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to resend OTP');
      setArchiveDialog(d => ({ ...d, sending: false }));
    }
  };

  const handleUnarchiveProject = async (projectId, projectName) => {
    if (!window.confirm(`Restore project "${projectName}"? It will move back to its original tab.`)) return;
    try {
      await axios.post(`${API}/projects/${projectId}/unarchive`);
      toast.success('Project restored');
      fetchSubTabProjects(projectSubTab, projectDateFilter);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to restore'); }
  };

  const handleDeleteArchivedProject = async (projectId, projectName) => {
    // First try a permanent (hard) delete — backend rejects with 409 if any
    // financial records exist for this project, in which case we offer the
    // user a soft delete instead.
    if (!window.confirm(`Delete archived project "${projectName}"?\n\n• If the project has NO income/expense records → permanently deleted.\n• If it has any financial history → it will be hidden but accounting records preserved.`)) return;
    try {
      const r = await axios.delete(`${API}/projects/${projectId}?hard=true`);
      toast.success(r.data?.message || 'Project permanently deleted');
      fetchSubTabProjects(projectSubTab, projectDateFilter);
      return;
    } catch (e) {
      const status = e?.response?.status;
      if (status === 409 || status === 403) {
        // Either has finance (409) or hard delete not allowed for this role (403)
        // — fall back to soft delete after confirming
        if (!window.confirm(`Permanent delete not possible (${status === 409 ? 'has financial history' : 'permission limited'}). Soft-delete instead?\n\nThe project will disappear from all boards but income/expenses stay in the books.`)) return;
        try {
          const r2 = await axios.delete(`${API}/projects/${projectId}`);
          toast.success(r2.data?.message || 'Project hidden (finance preserved)');
          fetchSubTabProjects(projectSubTab, projectDateFilter);
        } catch (err) {
          toast.error(err?.response?.data?.detail || 'Failed to hide project');
        }
      } else {
        toast.error(e?.response?.data?.detail || 'Failed to delete');
      }
    }
  };

  const fetchMonthlySchedule = async () => {
    try {
      setScheduleLoading(true);
      const r = await axios.get(`${API}/planning/monthly-schedule?month=${scheduleMonth}&year=${scheduleYear}`);
      setMonthlySchedule(r.data || { entries: [], summary: {} });
    } catch { /* ignore */ } finally { setScheduleLoading(false); }
  };

  const fetchMaterials = async () => { try { const r = await axios.get(`${API}/materials?active_only=false`); setMaterials(r.data); } catch {} };
  const fetchContractors = async () => {
    try {
      const r = await axios.get(`${API}/labour-contractors`);
      setContractors(r.data || []);
    } catch (err) {
      // Silently log — don't toast spam, but at least surface the issue in console
      console.error('fetchContractors failed', err?.response?.status, err?.message);
    }
  };
  const fetchContractorTypes = async () => { try { const r = await axios.get(`${API}/contractor-types`); setContractorTypes(r.data); } catch {} };
  const handleSaveType = async () => {
    const name = (typeDialog.name || '').trim();
    if (!name) { toast.error('Name required'); return; }
    try {
      if (typeDialog.editing) {
        await axios.patch(`${API}/contractor-types/${typeDialog.editing.type_id}`, { name, description: typeDialog.description });
        toast.success('Updated');
      } else {
        await axios.post(`${API}/contractor-types`, { name, description: typeDialog.description });
        toast.success('Created');
      }
      setTypeDialog({ open: false, editing: null, name: '', description: '' });
      fetchContractorTypes();
      fetchContractors();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    }
  };
  const handleDeleteType = async (t) => {
    if (!window.confirm(`Delete contractor type "${t.name}"? It will be removed from ${t.contractor_count || 0} contractor(s).`)) return;
    try {
      await axios.delete(`${API}/contractor-types/${t.type_id}`);
      toast.success('Deleted');
      fetchContractorTypes();
      fetchContractors();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    }
  };
  const openTypeView = async (t) => {
    setTypeViewDialog({ open: true, type: t, contractors: [], loading: true });
    try {
      const r = await axios.get(`${API}/contractor-types/${t.type_id}/contractors`);
      setTypeViewDialog({ open: true, type: t, contractors: r.data?.contractors || [], loading: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load contractors');
      setTypeViewDialog({ open: true, type: t, contractors: [], loading: false });
    }
  };
  const fetchContractorPaymentSummary = async (contractor_id) => {
    if (!contractor_id) { setContractorPaymentSummary(null); return; }
    setContractorPaymentLoading(true);
    try {
      const r = await axios.get(`${API}/labour-contractors/${contractor_id}/payment-summary`);
      setContractorPaymentSummary(r.data);
    } catch {
      setContractorPaymentSummary(null);
    } finally { setContractorPaymentLoading(false); }
  };
  const fetchVendors = async () => {
    if (vendorLoading) return;
    setVendorLoading(true);
    try {
      const [v, m] = await Promise.all([
        axios.get(`${API}/vendor-master?active_only=false`),
        materials.length === 0 ? axios.get(`${API}/materials?active_only=false`) : Promise.resolve({ data: materials })
      ]);
      setVendors(v.data); if (materials.length === 0) setMaterials(m.data);
    } catch {} finally { setVendorLoading(false); }
  };

  // === PROJECT HANDLERS ===
  const handleSubmitForApproval = async (id) => {
    try { await axios.patch(`${API}/planning/projects/${id}/submit-for-approval`); toast.success('Submitted for GM approval. GM will review & approve.'); fetchData(false); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const openStageDialog = (p) => { setSelectedProject(p); setNewStage(p.current_stage || 'yet_to_start'); setStageDialog(true); };
  const handleUpdateStage = async () => {
    if (!selectedProject || !newStage) return;
    try { await axios.patch(`${API}/planning/projects/${selectedProject.project_id}/update-stage?stage=${newStage}`); toast.success('Stage updated'); setStageDialog(false); fetchData(false); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  // === REQUEST HANDLERS ===
  const handleApproveRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      const res = await axios.patch(ep, null, { params: { action: 'approve' } });
      if (res.data?.auto_po) {
        toast.success('Approved! PO auto-generated → Goes to Procurement for processing');
      } else {
        toast.success('Approved! Goes to Procurement for vendor assignment');
      }
      fetchData(false);
    } catch { toast.error('Failed'); }
  };
  const handleRejectRequest = async (req) => {
    try {
      const ep = req.type === 'material' ? `${API}/material-requests/${req.request_id}/planning-action` : `${API}/labour-expenses/${req.expense_id}/planning-action`;
      await axios.patch(ep, null, { params: { action: 'reject', reason: 'Rejected by Planning' } }); toast.success('Rejected. Site Engineer will be notified.'); fetchData(false);
    } catch { toast.error('Failed'); }
  };
  const handleApprovePayment = async (p) => {
    try { await axios.patch(`${API}/work-orders/${p.work_order_id}/stages/${p.stage_id}/approve-payment`); toast.success('Payment approved! Goes to Accountant for release.'); fetchData(false); } catch { toast.error('Failed'); }
  };
  const handleRejectPayment = async () => {
    if (!selectedPayment) return;
    try { await axios.patch(`${API}/work-orders/${selectedPayment.work_order_id}/stages/${selectedPayment.stage_id}/reject-payment`, null, { params: { reason: rejectReason || 'Not verified' } }); toast.success('Rejected. Site Engineer will be notified.'); setRejectDialog(false); fetchData(false); } catch { toast.error('Failed'); }
  };

  // === MATERIAL HANDLERS ===
  const openMaterialDialog = (m = null) => {
    setEditingMaterial(m);
    setMaterialForm(m ? { name: m.name, category: m.category, unit: m.unit, description: m.description || '', hsn_code: m.hsn_code || '' } : { name: '', category: 'cement', unit: 'bag', description: '', hsn_code: '' });
    setMaterialDialog(true);
  };
  const handleSaveMaterial = async () => {
    if (!materialForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingMaterial) { await axios.patch(`${API}/materials/${editingMaterial.material_id}`, materialForm); toast.success('Updated'); }
      else { await axios.post(`${API}/materials`, materialForm); toast.success('Created'); }
      setMaterialDialog(false); fetchMaterials();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleToggleMaterial = async (m) => {
    try { await axios.patch(`${API}/materials/${m.material_id}`, { is_active: !m.is_active }); toast.success(m.is_active ? 'Hidden' : 'Activated'); fetchMaterials(); } catch { toast.error('Failed'); }
  };

  // === CONTRACTOR HANDLERS ===
  const openContractorDialog = (c = null) => {
    setEditingContractor(c);
    setContractorForm(c ? {
      name: c.name,
      work_types: c.work_types || [],
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      bank_name: c.bank_name || '',
      account_number: c.account_number || '',
      ifsc_code: c.ifsc_code || '',
      daily_rate_skilled: c.daily_rate_skilled ?? '',
      daily_rate_semi_skilled: c.daily_rate_semi_skilled ?? '',
      daily_rate_unskilled: c.daily_rate_unskilled ?? '',
      is_locked: c.is_locked || false,
    } : { name: '', work_types: [], phone: '', email: '', address: '', bank_name: '', account_number: '', ifsc_code: '', daily_rate_skilled: '', daily_rate_semi_skilled: '', daily_rate_unskilled: '', is_locked: false });
    setContractorTabIdx('basic');
    setContractorPaymentSummary(null);
    setContractorDialog(true);
    if (c?.contractor_id) fetchContractorPaymentSummary(c.contractor_id);
  };
  const handleSaveContractor = async () => {
    if (!contractorForm.name.trim()) { toast.error('Name required'); return; }
    try {
      const payload = {
        ...contractorForm,
        daily_rate_skilled: contractorForm.daily_rate_skilled ? parseFloat(contractorForm.daily_rate_skilled) : null,
        daily_rate_semi_skilled: contractorForm.daily_rate_semi_skilled ? parseFloat(contractorForm.daily_rate_semi_skilled) : null,
        daily_rate_unskilled: contractorForm.daily_rate_unskilled ? parseFloat(contractorForm.daily_rate_unskilled) : null,
      };
      if (editingContractor) { await axios.patch(`${API}/labour-contractors/${editingContractor.contractor_id}`, payload); toast.success('Updated'); }
      else { await axios.post(`${API}/labour-contractors`, payload); toast.success('Created'); }
      setContractorDialog(false); fetchContractors();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleToggleLockContractor = async (c) => {
    try {
      await axios.patch(`${API}/labour-contractors/${c.contractor_id}`, { is_locked: !c.is_locked });
      toast.success(c.is_locked ? 'Unlocked' : 'Locked');
      fetchContractors();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleDeleteContractor = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try { await axios.delete(`${API}/labour-contractors/${c.contractor_id}`); toast.success('Deleted'); fetchContractors(); } catch { toast.error('Failed'); }
  };

  // === VENDOR HANDLERS ===
  const openVendorDialog = (v = null) => {
    setEditingVendor(v);
    setVendorTabIdx('basic');
    setVendorForm(v ? {
      name: v.name,
      contact_person: v.contact_person || '',
      phone: v.phone || '',
      email: v.email || '',
      address: v.address || '',
      gst_number: v.gst_number || '',
      materials_supplied: v.materials_supplied || [],
      payment_terms: v.payment_terms || 'full',
      credit_limit: v.credit_limit || 0,
      credit_days: v.credit_days || 0,
      bank_name: v.bank_name || '',
      account_number: v.account_number || '',
      ifsc_code: v.ifsc_code || '',
    } : {
      name: '', contact_person: '', phone: '', email: '', address: '', gst_number: '',
      materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0,
      bank_name: '', account_number: '', ifsc_code: '',
    });
    setVendorDialog(true);
  };
  const handleSaveVendor = async () => {
    if (!vendorForm.name.trim()) { toast.error('Name required'); return; }
    try {
      if (editingVendor) { await axios.patch(`${API}/vendor-master/${editingVendor.vendor_id}`, vendorForm); toast.success('Updated'); }
      else { await axios.post(`${API}/vendor-master`, vendorForm); toast.success('Created'); }
      setVendorDialog(false); fetchVendors();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const handleToggleVendor = async (v) => {
    try { await axios.patch(`${API}/vendor-master/${v.vendor_id}`, { is_active: !v.is_active }); toast.success(v.is_active ? 'Hidden' : 'Activated'); fetchVendors(); } catch { toast.error('Failed'); }
  };

  // === RE TEMPLATE HANDLERS ===
  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API}/crm/re-templates`);
      setReTemplates(res.data || []);
    } catch { toast.error('Failed to load templates'); }
  };

  const openTemplateDialog = (template = null) => {
    setEditingTemplate(template);
    setTemplateForm(template ? {
      name: template.name || '',
      sqft: template.sqft || '',
      scope_items: (template.scope_items || []).map(i => ({ ...i }))
    } : { name: '', sqft: '', scope_items: [] });
    setTemplateDialog(true);
  };

  const addTemplateScopeItem = () => {
    setTemplateForm({
      ...templateForm,
      scope_items: [...templateForm.scope_items, { name: '', quantity: 1, unit: 'nos', rate: 0, total: 0 }]
    });
  };

  const updateTemplateScopeItem = (index, field, value) => {
    const items = [...templateForm.scope_items];
    items[index][field] = value;
    if (field === 'quantity' || field === 'rate') {
      items[index].total = (parseFloat(items[index].quantity) || 0) * (parseFloat(items[index].rate) || 0);
    }
    setTemplateForm({ ...templateForm, scope_items: items });
  };

  const removeTemplateScopeItem = (index) => {
    setTemplateForm({ ...templateForm, scope_items: templateForm.scope_items.filter((_, i) => i !== index) });
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) { toast.error('Template name is required'); return; }
    const payload = {
      name: templateForm.name,
      sqft: parseFloat(templateForm.sqft) || 0,
      scope_items: templateForm.scope_items.map(i => ({
        name: i.name || '',
        quantity: parseFloat(i.quantity) || 0,
        unit: i.unit || 'nos',
        rate: parseFloat(i.rate) || 0,
        total: (parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)
      }))
    };
    try {
      if (editingTemplate) {
        await axios.patch(`${API}/crm/re-templates/${editingTemplate.template_id}`, payload);
        toast.success('Template updated');
      } else {
        await axios.post(`${API}/crm/re-templates`, payload);
        toast.success('Template created');
      }
      setTemplateDialog(false);
      fetchTemplates();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save template'); }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await axios.delete(`${API}/crm/re-templates/${template.template_id}`);
      toast.success('Template deleted');
      fetchTemplates();
    } catch { toast.error('Failed to delete'); }
  };

  const filteredTemplates = reTemplates.filter(t => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()));

  // === PACKAGES HANDLERS ===
  const fetchPackages = async () => {
    try {
      const res = await axios.get(`${API}/packages`);
      setPackages(res.data || []);
    } catch { toast.error('Failed to load packages'); }
  };

  const fetchMaterialNames = async () => {
    try {
      const res = await axios.get(`${API}/material-names`);
      setMaterialNames(res.data || []);
    } catch { setMaterialNames([]); }
  };

  const fetchBrandsForMaterial = async (materialName) => {
    if (!materialName) return;
    try {
      const res = await axios.get(`${API}/brands?category=${encodeURIComponent(materialName)}`);
      setBrandsByMaterial(prev => ({ ...prev, [materialName]: res.data || [] }));
    } catch { /* ignore */ }
  };

  const openPackageDialog = (pkg = null) => {
    setEditingPackage(pkg);
    setPackageForm(pkg ? {
      name: pkg.name || '',
      description: pkg.description || '',
      base_rate_per_sqft: pkg.base_rate_per_sqft || '',
      scope_items: (pkg.scope_items || []).map(i => ({ name: i.name || '', unit: i.unit || 'nos', quantity: i.quantity || 1, unit_rate: i.unit_rate || 0 })),
      material_items: (pkg.material_items || []).map(i => ({ name: i.name || '', brand: i.brand || '' }))
    } : { name: '', description: '', base_rate_per_sqft: '', scope_items: [], material_items: [] });
    fetchMaterialNames();
    // Prefetch brands for existing material items
    if (pkg?.material_items) {
      pkg.material_items.forEach(i => { if (i.name) fetchBrandsForMaterial(i.name); });
    }
    setAddingMaterialFor(null);
    setAddingBrandFor(null);
    setNewMaterialName('');
    setNewBrandName('');
    setPackageDialog(true);
  };

  const addPackageScopeItem = () => {
    setPackageForm(f => ({ ...f, scope_items: [...f.scope_items, { name: '', unit: 'nos', quantity: 1, unit_rate: 0 }] }));
  };

  const updatePackageScopeItem = (idx, field, val) => {
    setPackageForm(f => {
      const items = [...f.scope_items];
      items[idx] = { ...items[idx], [field]: val };
      return { ...f, scope_items: items };
    });
  };

  const removePackageScopeItem = (idx) => {
    setPackageForm(f => ({ ...f, scope_items: f.scope_items.filter((_, i) => i !== idx) }));
  };

  const addPackageMaterialItem = () => {
    setPackageForm(f => ({ ...f, material_items: [...f.material_items, { name: '', brand: '' }] }));
  };

  const updatePackageMaterialItem = (idx, field, val) => {
    setPackageForm(f => {
      const items = [...f.material_items];
      items[idx] = { ...items[idx], [field]: val };
      if (field === 'name') { items[idx].brand = ''; fetchBrandsForMaterial(val); }
      return { ...f, material_items: items };
    });
  };

  const removePackageMaterialItem = (idx) => {
    setPackageForm(f => ({ ...f, material_items: f.material_items.filter((_, i) => i !== idx) }));
  };

  const handleCreateMaterialName = async (idx) => {
    const name = newMaterialName.trim();
    if (!name) return;
    try {
      const res = await axios.post(`${API}/material-names`, { name });
      if (!res.data.exists) setMaterialNames(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      updatePackageMaterialItem(idx, 'name', res.data.name);
      setNewMaterialName('');
      setAddingMaterialFor(null);
      toast.success(`Material "${res.data.name}" added`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create material'); }
  };

  const handleCreateBrand = async (idx) => {
    const name = newBrandName.trim();
    const materialName = packageForm.material_items[idx]?.name;
    if (!name || !materialName) return;
    try {
      const res = await axios.post(`${API}/brands`, { name, category: materialName });
      setBrandsByMaterial(prev => ({ ...prev, [materialName]: [...(prev[materialName] || []), res.data].sort((a, b) => a.name.localeCompare(b.name)) }));
      updatePackageMaterialItem(idx, 'brand', res.data.name);
      setNewBrandName('');
      setAddingBrandFor(null);
      toast.success(`Brand "${res.data.name}" added`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to create brand'); }
  };

  const handleSavePackage = async () => {
    if (!packageForm.name.trim()) { toast.error('Package name is required'); return; }
    const payload = {
      name: packageForm.name,
      description: packageForm.description || '',
      base_rate_per_sqft: parseFloat(packageForm.base_rate_per_sqft) || 0,
      scope_items: packageForm.scope_items.filter(i => i.name.trim()).map(i => ({
        name: i.name, unit: i.unit || 'nos', quantity: parseFloat(i.quantity) || 1, unit_rate: parseFloat(i.unit_rate) || 0
      })),
      material_items: packageForm.material_items.filter(i => i.name.trim()).map(i => ({
        name: i.name, brand: i.brand || ''
      }))
    };
    try {
      if (editingPackage) {
        await axios.patch(`${API}/packages/${editingPackage.package_id}`, payload);
        toast.success('Package updated');
      } else {
        await axios.post(`${API}/packages`, payload);
        toast.success('Package created');
      }
      setPackageDialog(false);
      fetchPackages();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save package'); }
  };

  const handleDeletePackage = async (pkg) => {
    if (!window.confirm(`Delete package "${pkg.name}"?`)) return;
    try {
      await axios.delete(`${API}/packages/${pkg.package_id}`);
      toast.success('Package deleted');
      fetchPackages();
    } catch { toast.error('Failed to delete'); }
  };

  const filteredPackages = packages.filter(p => !packageSearch || p.name?.toLowerCase().includes(packageSearch.toLowerCase()));

  // === HELPERS ===
  const formatCurrency = (a) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(a || 0);

  // === MONTHLY SCHEDULE HANDLERS ===
  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const handleScheduleMonthChange = (dir) => {
    let m = scheduleMonth + dir;
    let y = scheduleYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setScheduleMonth(m); setScheduleYear(y);
    setTimeout(() => fetchMonthlyScheduleFor(m, y), 100);
  };

  const fetchMonthlyScheduleFor = async (m, y) => {
    try {
      setScheduleLoading(true);
      const r = await axios.get(`${API}/planning/monthly-schedule?month=${m}&year=${y}`);
      setMonthlySchedule(r.data || { entries: [], summary: {} });
    } catch { } finally { setScheduleLoading(false); }
  };

  const openAddStagesDialog = async () => {
    try {
      const r = await axios.get(`${API}/planning/monthly-schedule/available-stages?month=${scheduleMonth}&year=${scheduleYear}`);
      setAvailableStages(r.data || []);
      setSelectedStageIds([]);
      setAddStagesDialog(true);
    } catch { toast.error('Failed to load stages'); }
  };

  const handleAddStagesToSchedule = async () => {
    if (selectedStageIds.length === 0) { toast.error('Select at least one stage'); return; }
    try {
      await axios.post(`${API}/planning/monthly-schedule/add-stages`, { month: scheduleMonth, year: scheduleYear, stage_ids: selectedStageIds });
      toast.success(`Added ${selectedStageIds.length} stages`);
      setAddStagesDialog(false);
      fetchMonthlyScheduleFor(scheduleMonth, scheduleYear);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRemoveScheduleEntry = async (entryId) => {
    if (!confirm('Remove this stage from the schedule?')) return;
    try {
      await axios.delete(`${API}/planning/monthly-schedule/${entryId}`);
      toast.success('Removed');
      fetchMonthlyScheduleFor(scheduleMonth, scheduleYear);
    } catch { toast.error('Failed'); }
  };

  const handleRequestPayment = async (entryId) => {
    try {
      await axios.patch(`${API}/planning/monthly-schedule/${entryId}/request-payment`);
      toast.success('Payment requested! Sent to CRE for processing.');
      fetchMonthlyScheduleFor(scheduleMonth, scheduleYear);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };
  const getStatusBadge = (s) => {
    const m = { in_planning: 'bg-green-100 text-green-700', planning_review: 'bg-amber-100 text-amber-700', awaiting_approval: 'bg-yellow-100 text-yellow-700', gm_approved: 'bg-purple-100 text-purple-700', planning_approved: 'bg-green-100 text-green-700', active: 'bg-green-100 text-green-700', completed: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${m[s] || 'bg-gray-100 text-gray-700'}`}>{s?.replace(/_/g, ' ')}</span>;
  };
  const getStageBadge = (id) => {
    const s = stages.find(x => x.id === id);
    return <Badge variant="outline" className="text-xs capitalize">{s?.name || id?.replace(/_/g, ' ') || '-'}</Badge>;
  };
  const getMaterialName = (id) => materials.find(m => m.material_id === id)?.name || id;

  const filteredProjects = projects.filter(p => !projectSearch || (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) || (p.client_name || '').toLowerCase().includes(projectSearch.toLowerCase()));
  const filteredMaterials = materials.filter(m => {
    const search = !materialSearch || m.name.toLowerCase().includes(materialSearch.toLowerCase()) || m.category?.toLowerCase().includes(materialSearch.toLowerCase());
    if (materialFilter === 'active') return search && m.is_active !== false;
    if (materialFilter === 'inactive') return search && m.is_active === false;
    return search;
  });
  const filteredContractors = contractors.filter(c => !contractorSearch || c.name.toLowerCase().includes(contractorSearch.toLowerCase()));
  const filteredVendors = vendors.filter(v => !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()));

  const newProjectCount = newProjectsFromCRE.length;
  const requestCount = pendingRequests.length + paymentRequests.length;

  const CountBadge = ({ count }) => count > 0 ? <span className="ml-1.5 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] inline-flex items-center justify-center">{count}</span> : null;

  // Stage counts for Dashboard summary
  const allProjectsList = projects || [];
  const stageCountMap = {
    pre_construction: allProjectsList.filter(p => ['yet_to_start', 'new', 'planning', 'in_planning'].includes((p.current_stage || '').toLowerCase()) || !p.current_stage || p.status === 'draft').length,
    under_construction: allProjectsList.filter(p => !['yet_to_start', 'new', 'planning', 'in_planning', 'completed', 'delivered', 'handover'].includes((p.current_stage || '').toLowerCase()) && p.current_stage && p.status !== 'draft' && !['completed', 'delivered'].includes(p.status)).length,
    completed: allProjectsList.filter(p => ['completed', 'delivered', 'handover'].includes((p.current_stage || '').toLowerCase()) || ['completed', 'delivered'].includes(p.status)).length,
  };
  stageCountMap.other = Math.max(0, allProjectsList.length - stageCountMap.pre_construction - stageCountMap.under_construction - stageCountMap.completed);

  if (loading && !user) return <div className="min-h-screen bg-gray-50"><div className="max-w-7xl mx-auto px-4 py-8"><div className="bg-white rounded-lg border p-8 animate-pulse"><div className="h-6 bg-gray-200 rounded w-48 mb-4" /><div className="h-4 bg-gray-200 rounded w-full" /></div></div></div>;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="planning-board">
      <AppHeader user={user} customNav={[
        { label: 'Dashboard', value: 'dashboard', icon: 'Building2' },
        { label: 'Packages', value: 'packages', icon: 'Package' },
        { label: 'Material Vendors', value: 'material_vendors', icon: 'Truck' },
        { label: 'Labour Contractors', value: 'labour_contractors', icon: 'Users' },
        { label: 'RE Templates', value: 're_templates', icon: 'FileText' },
        { label: 'Live Map', value: 'live_map', icon: 'Radio' },
      ]} activeCustomNav={activeTab} onCustomNavChange={handleTabChange} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>

          {/* ==================== DASHBOARD ==================== */}
          <TabsContent value="dashboard">
            {/* Dashboard sub-tabs */}
            <div className="flex gap-1 border-b mb-3 bg-white rounded-t-lg px-2 pt-1">
              {[
                { key: 'all_projects', label: 'All Projects', badge: newProjectCount },
                { key: 'requests', label: 'Requests', badge: requestCount },
                { key: 'rough_estimates', label: 'Rough Estimates', badge: reNewCount },
                { key: 'payment_schedule', label: 'Payment Schedule' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleDashSubTabChange(tab.key)}
                  className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    dashSubTab === tab.key ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid={`dash-subtab-${tab.key}`}
                >
                  {tab.label}{tab.badge > 0 ? <CountBadge count={tab.badge} /> : null}
                </button>
              ))}
            </div>

            {/* ---- Dashboard > All Projects ---- */}
            {dashSubTab === 'all_projects' && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-600" />All Projects
                  </CardTitle>
                </div>
                {/* Sub-tabs */}
                <div className="flex gap-1 mt-3 border-b">
                  {[
                    { key: 'new', label: 'New Projects', badgeCls: 'bg-green-100 text-green-700 border-green-200' },
                    { key: 'active', label: 'Current Projects', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
                    { key: 'delivered', label: 'Delivered Projects', badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
                    { key: 'archived', label: 'Archive Projects', badgeCls: 'bg-gray-100 text-gray-600 border-gray-200' }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => handleProjectSubTabChange(tab.key)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        projectSubTab === tab.key
                          ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                      data-testid={`subtab-${tab.key}`}
                    >
                      {tab.label}
                      <span
                        className={`ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold border ${tab.badgeCls}`}
                        data-testid={`subtab-${tab.key}-count`}
                      >
                        {projectSubTab === tab.key ? subTabProjects.length : (subTabCounts[tab.key] ?? 0)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Date Filters */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Select value={projectDateFilter.type} onValueChange={(v) => setProjectDateFilter({ ...projectDateFilter, type: v })}>
                    <SelectTrigger className="h-8 w-32 text-xs" data-testid="date-filter-type">
                      <SelectValue placeholder="Filter by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="date">By Date</SelectItem>
                      <SelectItem value="range">Date Range</SelectItem>
                      <SelectItem value="month">By Month</SelectItem>
                      <SelectItem value="year">By Year</SelectItem>
                    </SelectContent>
                  </Select>

                  {projectDateFilter.type === 'date' && (
                    <Input type="date" value={projectDateFilter.date} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, date: e.target.value })} className="h-8 w-40 text-xs" data-testid="date-filter-date" />
                  )}
                  {projectDateFilter.type === 'range' && (
                    <>
                      <Input type="date" value={projectDateFilter.dateFrom} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, dateFrom: e.target.value })} className="h-8 w-36 text-xs" data-testid="date-filter-from" />
                      <span className="text-xs text-gray-400">to</span>
                      <Input type="date" value={projectDateFilter.dateTo} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, dateTo: e.target.value })} className="h-8 w-36 text-xs" data-testid="date-filter-to" />
                    </>
                  )}
                  {projectDateFilter.type === 'month' && (
                    <div className="flex gap-1">
                      <Select value={projectDateFilter.month} onValueChange={(v) => setProjectDateFilter({ ...projectDateFilter, month: v })}>
                        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
                        <SelectContent>
                          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                            <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" placeholder="Year" value={projectDateFilter.year} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, year: e.target.value })} className="h-8 w-20 text-xs" data-testid="date-filter-year" />
                    </div>
                  )}
                  {projectDateFilter.type === 'year' && (
                    <Input type="number" placeholder="Year" value={projectDateFilter.year} onChange={(e) => setProjectDateFilter({ ...projectDateFilter, year: e.target.value })} className="h-8 w-24 text-xs" data-testid="date-filter-year-only" />
                  )}

                  {projectDateFilter.type !== 'all' && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-8 text-xs" onClick={applyProjectDateFilter} data-testid="apply-date-filter">
                        <Filter className="h-3 w-3 mr-1" />Apply
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={clearProjectDateFilter} data-testid="clear-date-filter">
                        <X className="h-3 w-3 mr-1" />Clear
                      </Button>
                    </div>
                  )}

                  <div className="ml-auto relative">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search..." value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="project-search" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="projects-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Stage</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {subTabLoading && subTabProjects.length === 0 ? (
                        // Skeleton rows while first-load is in flight
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={`sk-${i}`} className="animate-pulse" data-testid={`skeleton-row-${i}`}>
                            <td className="px-4 py-3"><div className="h-3 w-32 bg-gray-200 rounded" /><div className="h-2.5 w-20 bg-gray-100 rounded mt-1.5" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-200 rounded mx-auto" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-16 bg-gray-200 rounded ml-auto" /></td>
                            <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded mx-auto" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-16 bg-gray-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-7 w-24 bg-gray-200 rounded mx-auto" /></td>
                          </tr>
                        ))
                      ) : (() => {
                          const filtered = subTabProjects.filter(p =>
                            !projectSearch ||
                            (p.name || '').toLowerCase().includes(projectSearch.toLowerCase()) ||
                            (p.client_name || '').toLowerCase().includes(projectSearch.toLowerCase())
                          );
                          if (filtered.length === 0) return (
                            <tr><td colSpan="7" className="p-8 text-center text-gray-400">
                              {projectSubTab === 'new' ? 'No new projects from CRE' : projectSubTab === 'active' ? 'No active construction projects' : projectSubTab === 'archived' ? 'No archived projects' : 'No delivered projects'}
                            </td></tr>
                          );
                          return filtered.map((p) => (
                            <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`project-row-${p.project_id}`}>
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{p.name}</p>
                                <p className="text-xs text-gray-400">{p.location || p.project_code || '-'}</p>
                              </td>
                              <td className="px-4 py-2.5 text-gray-600">{p.client_name || '-'}</td>
                              <td className="px-4 py-2.5 text-center">{getStageBadge(p.current_stage || 'yet_to_start')}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-green-600">{formatCurrency(p.total_value)}</td>
                              <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">
                                {projectSubTab === 'new' && p.planning_new_date ? new Date(p.planning_new_date).toLocaleDateString('en-IN') :
                                 projectSubTab === 'active' && p.planning_active_date ? new Date(p.planning_active_date).toLocaleDateString('en-IN') :
                                 projectSubTab === 'delivered' && p.planning_delivered_date ? new Date(p.planning_delivered_date).toLocaleDateString('en-IN') :
                                 projectSubTab === 'archived' && p.archived_at ? new Date(p.archived_at).toLocaleDateString('en-IN') :
                                 p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '-'}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex justify-center gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.location.href = `/projects/${p.project_id}`}>
                                    <Eye className="h-3 w-3 mr-1" />View
                                  </Button>
                                  {projectSubTab === 'new' && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                      onClick={() => handlePlanningStatusChange(p.project_id, 'active')}
                                      data-testid={`ready-to-construction-${p.project_id}`}
                                    >
                                      <ArrowRight className="h-3 w-3 mr-1" />Ready to Construction
                                    </Button>
                                  )}
                                  {projectSubTab === 'active' && null /* "Mark Delivered" moved to project detail page header (Hand Over button) */}
                                  {projectSubTab !== 'archived' && user?.role === 'super_admin' && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                                      onClick={() => openArchiveDialog(p.project_id, p.name)}
                                      data-testid={`archive-${p.project_id}`}
                                      title="Archive project (Super Admin only — requires email OTP)"
                                    >
                                      📦 Archive
                                    </Button>
                                  )}
                                  {projectSubTab === 'archived' && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs text-emerald-700 hover:bg-emerald-50"
                                        onClick={() => handleUnarchiveProject(p.project_id, p.name)}
                                        data-testid={`unarchive-${p.project_id}`}
                                      >
                                        ↩ Restore
                                      </Button>
                                      {(user?.role === 'planning' || user?.role === 'super_admin') && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 text-xs text-red-600 hover:bg-red-50"
                                          onClick={() => handleDeleteArchivedProject(p.project_id, p.name)}
                                          data-testid={`delete-archived-${p.project_id}`}
                                        >
                                          🗑 Delete
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ));
                        })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            )}

            {/* ---- Dashboard > Requests ---- */}
            {dashSubTab === 'requests' && (
              <PlanningRequestsTab projects={projects} />
            )}

            {/* ---- Dashboard > Rough Estimates ---- */}
            {dashSubTab === 'rough_estimates' && (
              <REProjectsPage embedded />
            )}

            {/* ---- Dashboard > Payment Schedule ---- */}
            {dashSubTab === 'payment_schedule' && (
              <div className="space-y-4">
                {/* Month Navigation */}
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button size="sm" variant="outline" onClick={() => handleScheduleMonthChange(-1)} data-testid="schedule-prev-month"><ArrowRight className="h-4 w-4 rotate-180" /></Button>
                        <div className="text-center min-w-[140px]">
                          <p className="text-lg font-bold text-gray-900" data-testid="schedule-current-month">{MONTH_NAMES[scheduleMonth]} {scheduleYear}</p>
                          <p className="text-xs text-gray-500">Payment Schedule</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleScheduleMonthChange(1)} data-testid="schedule-next-month"><ArrowRight className="h-4 w-4" /></Button>
                      </div>
                      <Button onClick={openAddStagesDialog} className="bg-amber-600 hover:bg-amber-700" data-testid="add-stages-btn"><Plus className="h-4 w-4 mr-1" />Add Stages</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Card className="border-l-4 border-l-indigo-500"><CardContent className="p-3"><p className="text-[10px] text-gray-500 uppercase font-medium">Total Planned</p><p className="text-lg font-bold text-indigo-700">{formatCurrency(monthlySchedule.summary?.total_planned)}</p><p className="text-[10px] text-gray-400">{monthlySchedule.summary?.total_entries || 0} stages</p></CardContent></Card>
                  <Card className="border-l-4 border-l-green-500"><CardContent className="p-3"><p className="text-[10px] text-gray-500 uppercase font-medium">Collected</p><p className="text-lg font-bold text-green-700">{formatCurrency(monthlySchedule.summary?.total_received)}</p></CardContent></Card>
                  <Card className="border-l-4 border-l-red-500"><CardContent className="p-3"><p className="text-[10px] text-gray-500 uppercase font-medium">Balance</p><p className="text-lg font-bold text-red-700">{formatCurrency(monthlySchedule.summary?.total_balance)}</p></CardContent></Card>
                  <Card className="border-l-4 border-l-amber-500"><CardContent className="p-3"><p className="text-[10px] text-gray-500 uppercase font-medium">Pending</p><p className="text-lg font-bold text-amber-700">{monthlySchedule.summary?.pending_count || 0}</p></CardContent></Card>
                  <Card className="border-l-4 border-l-blue-500"><CardContent className="p-3"><p className="text-[10px] text-gray-500 uppercase font-medium">Collected</p><p className="text-lg font-bold text-blue-700">{monthlySchedule.summary?.collected_count || 0}</p></CardContent></Card>
                </div>

                {/* Schedule Table */}
                <Card>
                  <CardContent className="p-0">
                    {scheduleLoading ? (<div className="p-8 text-center text-gray-400">Loading...</div>) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="payment-schedule-table">
                          <thead className="bg-gray-50 border-y">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(monthlySchedule.entries || []).length === 0 ? (
                              <tr><td colSpan="7" className="p-8 text-center text-gray-400">No stages scheduled for {MONTH_NAMES[scheduleMonth]} {scheduleYear}.</td></tr>
                            ) : (monthlySchedule.entries || []).map((e) => {
                              const balance = (e.amount || 0) - (e.amount_received || 0);
                              const hasPendingApproval = (e.pending_approval_count || 0) > 0;
                              const stageStatusConfig = { pending: { label: 'Not Collected', cls: 'bg-gray-100 text-gray-700' }, partial: { label: 'Partially', cls: 'bg-amber-100 text-amber-700' }, paid: { label: 'Collected', cls: 'bg-green-100 text-green-700' }, collected: { label: 'Collected', cls: 'bg-green-100 text-green-700' } };
                              const cfg = hasPendingApproval
                                ? { label: 'Pending Accountant Approval', cls: 'bg-orange-100 text-orange-700' }
                                : (stageStatusConfig[e.status] || stageStatusConfig.pending);
                              return (
                                <tr key={e.entry_id} className="hover:bg-gray-50" data-testid={`schedule-row-${e.entry_id}`}>
                                  <td className="px-4 py-2.5"><p className="font-medium text-sm">{e.project_name}</p></td>
                                  <td className="px-4 py-2.5 text-sm">{e.stage_name}</td>
                                  <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(e.amount)}</td>
                                  <td className="px-4 py-2.5 text-right text-green-600">
                                    {formatCurrency(e.amount_received || 0)}
                                    {(e.pending_approval_amount || 0) > 0 && (
                                      <p className="text-[10px] text-orange-600">+{formatCurrency(e.pending_approval_amount)} pending</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(balance)}</td>
                                  <td className="px-4 py-2.5 text-center"><Badge variant="outline" className={`text-xs ${cfg.cls}`}>{cfg.label}</Badge></td>
                                  <td className="px-4 py-2.5 text-center"><Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleRemoveScheduleEntry(e.entry_id)} data-testid={`remove-entry-${e.entry_id}`}><Trash2 className="h-3 w-3" /></Button></td>
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
            )}
          </TabsContent>

          {/* ==================== PACKAGES ==================== */}
          <TabsContent value="packages">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600" />Packages ({filteredPackages.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" /><Input placeholder="Search packages..." value={packageSearch} onChange={e => setPackageSearch(e.target.value)} className="pl-8 h-9 w-48 text-sm" data-testid="package-search" /></div>
                    <Button size="sm" onClick={() => openPackageDialog()} className="bg-amber-600 hover:bg-amber-700" data-testid="add-package-btn"><Plus className="h-3.5 w-3.5 mr-1" />Add Package</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPackages.length === 0 ? (
                  <p className="text-gray-400 text-center py-8 text-sm">No packages yet. Click "Add Package" to create one.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredPackages.map(pkg => (
                      <div key={pkg.package_id} className="border rounded-lg p-4 hover:border-amber-300 transition" data-testid={`package-card-${pkg.package_id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{pkg.name}</h4>
                              <Badge variant="outline" className="text-[10px]">{formatCurrency(pkg.base_rate_per_sqft)}/sqft</Badge>
                            </div>
                            {pkg.description && <p className="text-xs text-gray-500 mb-2">{pkg.description}</p>}
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>{pkg.scope_items?.length || 0} scope items</span>
                              <span>{pkg.material_items?.length || 0} materials</span>
                            </div>
                            {pkg.material_items?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {pkg.material_items.slice(0, 6).map((m, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">{m.name}{m.brand ? ` - ${m.brand}` : ''}</Badge>
                                ))}
                                {pkg.material_items.length > 6 && <Badge variant="secondary" className="text-[10px]">+{pkg.material_items.length - 6} more</Badge>}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openPackageDialog(pkg)} data-testid={`edit-pkg-${pkg.package_id}`}><Edit className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeletePackage(pkg)} data-testid={`delete-pkg-${pkg.package_id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Package Create/Edit Dialog */}
            <Dialog open={packageDialog} onOpenChange={setPackageDialog}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingPackage ? 'Edit Package' : 'Add New Package'}</DialogTitle>
                  <DialogDescription>Fill in the package details, scope items, and materials</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {/* Basic Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Package Name *</Label>
                      <Input data-testid="pkg-name" value={packageForm.name} onChange={e => setPackageForm(f => ({ ...f, name: e.target.value }))} placeholder="Package Name" />
                    </div>
                    <div>
                      <Label className="text-xs">Per Sq.ft Rate</Label>
                      <Input data-testid="pkg-rate" type="number" value={packageForm.base_rate_per_sqft} onChange={e => setPackageForm(f => ({ ...f, base_rate_per_sqft: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea data-testid="pkg-desc" value={packageForm.description} onChange={e => setPackageForm(f => ({ ...f, description: e.target.value }))} placeholder="Package description..." rows={2} />
                  </div>

                  {/* Scope Items */}
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">Scope Items</Label>
                      <Button size="sm" variant="outline" onClick={addPackageScopeItem} data-testid="add-scope-item"><Plus className="h-3 w-3 mr-1" />Add Item</Button>
                    </div>
                    {packageForm.scope_items.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No scope items. Click "Add Item" to start.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase px-1">
                          <div className="col-span-3">Name</div><div className="col-span-2">Unit</div><div className="col-span-2">Qty</div><div className="col-span-2">Rate</div><div className="col-span-2">Total</div><div className="col-span-1"></div>
                        </div>
                        {packageForm.scope_items.map((item, idx) => {
                          const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0);
                          return (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3"><Input placeholder="Item Name" value={item.name} onChange={e => updatePackageScopeItem(idx, 'name', e.target.value)} className="h-8 text-xs" data-testid={`scope-name-${idx}`} /></div>
                            <div className="col-span-2"><Input placeholder="Unit" value={item.unit} onChange={e => updatePackageScopeItem(idx, 'unit', e.target.value)} className="h-8 text-xs" data-testid={`scope-unit-${idx}`} /></div>
                            <div className="col-span-2"><Input type="number" placeholder="Qty" value={item.quantity} onChange={e => updatePackageScopeItem(idx, 'quantity', e.target.value)} className="h-8 text-xs" data-testid={`scope-qty-${idx}`} /></div>
                            <div className="col-span-2"><Input type="number" placeholder="Rate" value={item.unit_rate} onChange={e => updatePackageScopeItem(idx, 'unit_rate', e.target.value)} className="h-8 text-xs" data-testid={`scope-rate-${idx}`} /></div>
                            <div className="col-span-2"><span className="text-xs font-medium text-gray-600 pl-1">{formatCurrency(total)}</span></div>
                            <div className="col-span-1 flex justify-center"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => removePackageScopeItem(idx)}><X className="h-3 w-3" /></Button></div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Materials List */}
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">Materials</Label>
                      <Button size="sm" variant="outline" onClick={addPackageMaterialItem} data-testid="add-material-item"><Plus className="h-3 w-3 mr-1" />Add Material</Button>
                    </div>
                    {packageForm.material_items.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No materials. Click "Add Material" to start.</p>
                    ) : (
                      <div className="space-y-3">
                        {packageForm.material_items.map((item, idx) => (
                          <div key={idx} className="border border-dashed rounded p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 w-5 shrink-0">#{idx + 1}</span>
                              {/* Material Name */}
                              <div className="flex-1">
                                {addingMaterialFor === idx ? (
                                  <div className="flex items-center gap-1">
                                    <Input placeholder="New material name..." value={newMaterialName} onChange={e => setNewMaterialName(e.target.value)} className="h-8 text-xs flex-1" data-testid={`new-mat-input-${idx}`} onKeyDown={e => { if (e.key === 'Enter') handleCreateMaterialName(idx); }} />
                                    <Button size="sm" className="h-8 px-2 bg-green-600 hover:bg-green-700" onClick={() => handleCreateMaterialName(idx)}><Check className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAddingMaterialFor(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <Select value={item.name || '__pick__'} onValueChange={v => { if (v === '__create__') { setAddingMaterialFor(idx); setNewMaterialName(''); } else if (v !== '__pick__') { updatePackageMaterialItem(idx, 'name', v); } }}>
                                    <SelectTrigger className="h-8 text-xs" data-testid={`mat-name-${idx}`}><SelectValue placeholder="Select Material" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__pick__" disabled>Select Material</SelectItem>
                                      {materialNames.map(m => <SelectItem key={m.material_name_id} value={m.name}>{m.name}</SelectItem>)}
                                      <SelectItem value="__create__" className="text-blue-600 font-medium">+ Create New Material</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                              {/* Brand */}
                              <div className="flex-1">
                                {addingBrandFor === idx ? (
                                  <div className="flex items-center gap-1">
                                    <Input placeholder="New brand name..." value={newBrandName} onChange={e => setNewBrandName(e.target.value)} className="h-8 text-xs flex-1" data-testid={`new-brand-input-${idx}`} onKeyDown={e => { if (e.key === 'Enter') handleCreateBrand(idx); }} />
                                    <Button size="sm" className="h-8 px-2 bg-green-600 hover:bg-green-700" onClick={() => handleCreateBrand(idx)}><Check className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAddingBrandFor(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <Select value={item.brand || '__pick__'} onValueChange={v => { if (v === '__create__') { setAddingBrandFor(idx); setNewBrandName(''); } else if (v !== '__pick__') { updatePackageMaterialItem(idx, 'brand', v); } }} disabled={!item.name}>
                                    <SelectTrigger className="h-8 text-xs" data-testid={`mat-brand-${idx}`}><SelectValue placeholder={item.name ? 'Select Brand' : 'Pick material first'} /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__pick__" disabled>Select Brand</SelectItem>
                                      {(brandsByMaterial[item.name] || []).map(b => <SelectItem key={b.brand_id} value={b.name}>{b.name}</SelectItem>)}
                                      <SelectItem value="__create__" className="text-blue-600 font-medium">+ Create New Brand</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 shrink-0" onClick={() => removePackageMaterialItem(idx)}><X className="h-3.5 w-3.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPackageDialog(false)}>Cancel</Button>
                  <Button onClick={handleSavePackage} className="bg-amber-600 hover:bg-amber-700" data-testid="save-package-btn">{editingPackage ? 'Update Package' : 'Create Package'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ==================== MATERIAL VENDORS ==================== */}
          <TabsContent value="material_vendors">
            {/* Sub-tab strip — Material Vendor | Materials (mirrors Contractors tab) */}
            <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="material-subtabs">
              <button
                onClick={() => setMaterialSubTab('vendors')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${materialSubTab === 'vendors' ? 'bg-teal-50 text-teal-700 border border-teal-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                data-testid="material-subtab-vendors"
              >
                Material Vendor <Badge className="ml-1 bg-gray-100 text-gray-700 text-[10px]">{filteredVendors.length}</Badge>
              </button>
              <button
                onClick={() => setMaterialSubTab('materials')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${materialSubTab === 'materials' ? 'bg-teal-50 text-teal-700 border border-teal-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                data-testid="material-subtab-materials"
              >
                Materials <Badge className="ml-1 bg-gray-100 text-gray-700 text-[10px]">{materials.length}</Badge>
              </button>
            </div>

            {materialSubTab === 'materials' ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-teal-600" />Materials ({filteredMaterials.length})</CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                      <Button size="sm" onClick={() => openMaterialDialog()} className="bg-teal-600 hover:bg-teal-700" data-testid="add-material-btn"><Plus className="h-4 w-4 mr-1" />Add Material</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="materials-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Category</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Unit</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">HSN</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredMaterials.length === 0 ? (
                          <tr><td colSpan="6" className="p-8 text-center text-gray-400">No materials found. Click "Add Material" to create one.</td></tr>
                        ) : filteredMaterials.map(m => (
                          <tr key={m.material_id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`} data-testid={`material-row-${m.material_id}`}>
                            <td className="px-4 py-2.5"><p className="font-medium">{m.name}</p>{m.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{m.description}</p>}</td>
                            <td className="px-4 py-2.5 hidden sm:table-cell text-xs capitalize">{(m.category || '').replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2.5 hidden sm:table-cell text-xs">{m.unit || '-'}</td>
                            <td className="px-4 py-2.5 hidden md:table-cell text-xs">{m.hsn_code || '-'}</td>
                            <td className="px-4 py-2.5 text-center">{m.is_active !== false ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">Hidden</Badge>}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openMaterialDialog(m)} data-testid={`edit-material-${m.material_id}`}><Edit className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleMaterial(m)} data-testid={`toggle-material-${m.material_id}`}>{m.is_active !== false ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-green-600" />}</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-teal-600" />Material Vendors ({filteredVendors.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                    <Button size="sm" onClick={() => openVendorDialog()} className="bg-teal-600 hover:bg-teal-700" data-testid="add-vendor-btn"><Plus className="h-4 w-4 mr-1" />Add Vendor</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="vendors-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Contact</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Materials</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">GST</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredVendors.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No vendors found</td></tr>
                      ) : filteredVendors.map((v) => (
                        <tr key={v.vendor_id} className={`hover:bg-gray-50 ${!v.is_active ? 'opacity-50' : ''}`} data-testid={`vendor-row-${v.vendor_id}`}>
                          <td className="px-4 py-2.5"><p className="font-medium">{v.name}</p>{v.address && <p className="text-xs text-gray-400 truncate max-w-[200px]">{v.address}</p>}</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell"><p className="text-xs">{v.contact_person || '-'}</p><p className="text-xs text-gray-400">{v.phone || '-'}</p></td>
                          <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{(v.materials_supplied||[]).slice(0,2).map(id => <Badge key={id} variant="outline" className="text-xs">{getMaterialName(id)}</Badge>)}{(v.materials_supplied||[]).length > 2 && <Badge variant="outline" className="text-xs">+{v.materials_supplied.length-2}</Badge>}</div></td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs">{v.gst_number || '-'}</td>
                          <td className="px-4 py-2.5 text-center">{v.is_active !== false ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-gray-100 text-gray-500 text-xs">Hidden</Badge>}</td>
                          <td className="px-4 py-2.5"><div className="flex justify-center gap-1"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openVendorDialog(v)}><Edit className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleVendor(v)}>{v.is_active !== false ? <EyeOff className="h-3 w-3 text-gray-500" /> : <Eye className="h-3 w-3 text-green-600" />}</Button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            )}
          </TabsContent>

          {/* ==================== LABOUR CONTRACTORS ==================== */}
          <TabsContent value="labour_contractors">
            <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="contractor-subtabs">
              <button
                onClick={() => setContractorSubTab('contractors')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${contractorSubTab === 'contractors' ? 'bg-amber-50 text-amber-700 border border-amber-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                data-testid="contractor-subtab-contractors"
              >
                Contractors <Badge className="ml-1 bg-gray-100 text-gray-700 text-[10px]">{filteredContractors.length}</Badge>
              </button>
              <button
                onClick={() => setContractorSubTab('types')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${contractorSubTab === 'types' ? 'bg-amber-50 text-amber-700 border border-amber-300' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                data-testid="contractor-subtab-types"
              >
                Contractor Types <Badge className="ml-1 bg-gray-100 text-gray-700 text-[10px]">{contractorTypes.length}</Badge>
              </button>
            </div>

            {contractorSubTab === 'types' ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-amber-600" />Contractor Types ({contractorTypes.length})</CardTitle>
                    <Button size="sm" onClick={() => setTypeDialog({ open: true, editing: null, name: '', description: '' })} className="bg-amber-600 hover:bg-amber-700" data-testid="add-type-btn"><Plus className="h-4 w-4 mr-1" />Add Type</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="contractor-types-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Contractors</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {contractorTypes.length === 0 ? (
                          <tr><td colSpan="4" className="p-8 text-center text-gray-400">No contractor types yet. Click "Add Type" to create one.</td></tr>
                        ) : contractorTypes.map(t => (
                          <tr key={t.type_id} className="hover:bg-gray-50" data-testid={`type-row-${t.type_id}`}>
                            <td className="px-4 py-2.5 font-medium">{t.name}</td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs">{t.description || '-'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <Badge className="bg-amber-50 text-amber-700">{t.contractor_count || 0}</Badge>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-center gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title="View contractors of this type" onClick={() => openTypeView(t)} data-testid={`view-type-${t.type_id}`}><Eye className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setTypeDialog({ open: true, editing: t, name: t.name, description: t.description || '' })} data-testid={`edit-type-${t.type_id}`}><Edit className="h-3 w-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteType(t)} data-testid={`delete-type-${t.type_id}`}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-amber-600" />Labour Contractors ({filteredContractors.length})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative"><Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={contractorSearch} onChange={(e) => setContractorSearch(e.target.value)} className="pl-8 h-8 w-40 text-sm" /></div>
                    <Button size="sm" onClick={() => openContractorDialog()} className="bg-amber-600 hover:bg-amber-700" data-testid="add-contractor-btn"><Plus className="h-4 w-4 mr-1" />Add Contractor</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="contractors-table">
                    <thead className="bg-gray-50 border-y">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Work Types</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Phone</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Bank</th>
                        <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredContractors.length === 0 ? (
                        <tr><td colSpan="5" className="p-8 text-center text-gray-400">No contractors found</td></tr>
                      ) : filteredContractors.map((c) => (
                        <tr key={c.contractor_id} className="hover:bg-gray-50" data-testid={`contractor-row-${c.contractor_id}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{c.name}</p>
                              {c.is_locked && <Badge className="bg-red-50 text-red-700 border border-red-200 text-[10px] px-1.5 py-0"><Lock className="h-2.5 w-2.5 mr-0.5 inline" />Locked</Badge>}
                            </div>
                            {c.address && <p className="text-xs text-gray-400">{c.address}</p>}
                          </td>
                          <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{(c.work_types || []).slice(0,3).map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}{(c.work_types||[]).length > 3 && <Badge variant="outline" className="text-xs">+{c.work_types.length-3}</Badge>}</div></td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">{c.phone || '-'}</td>
                          <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-gray-500">{c.bank_name || '-'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${c.is_locked ? 'text-red-500' : 'text-gray-400'}`} title={c.is_locked ? 'Unlock' : 'Lock'} onClick={() => handleToggleLockContractor(c)} data-testid={`lock-contractor-${c.contractor_id}`}>{c.is_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}</Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openContractorDialog(c)} data-testid={`edit-contractor-${c.contractor_id}`}><Edit className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteContractor(c)} data-testid={`delete-contractor-${c.contractor_id}`}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            )}
          </TabsContent>

          {/* ==================== RE TEMPLATES ==================== */}
          <TabsContent value="re_templates">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-600" />
                    RE Templates ({filteredTemplates.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search templates..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} className="pl-8 h-8 w-48 text-sm" data-testid="template-search" />
                    </div>
                    <Button size="sm" onClick={() => openTemplateDialog()} data-testid="create-template-btn">
                      <Plus className="h-4 w-4 mr-1" /> Create Template
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No templates yet</p>
                    <p className="text-sm mt-1">Create your first RE template to reuse across projects</p>
                    <Button size="sm" className="mt-4" onClick={() => openTemplateDialog()} data-testid="create-first-template-btn">
                      <Plus className="h-4 w-4 mr-1" /> Create Template
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="templates-table">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Template Name</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Sq.ft</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Scope Items</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Estimated Total</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                          <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredTemplates.map(t => (
                          <tr key={t.template_id} className="hover:bg-gray-50" data-testid={`template-row-${t.template_id}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{t.name}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="outline" className="text-xs">{t.sqft || '-'} sqft</Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className="bg-purple-100 text-purple-700 text-xs">{t.scope_items?.length || 0} items</Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(t.estimated_total)}
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{t.created_by_name || '-'}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">
                              {t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openTemplateDialog(t)} data-testid={`edit-template-${t.template_id}`}>
                                  <Edit className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(t)} data-testid={`delete-template-${t.template_id}`}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
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

          {/* ==================== LIVE MAP ==================== */}
          <TabsContent value="live_map">
            <LiveMapSection />
          </TabsContent>

        </Tabs>
      </div>

      {/* ==================== DIALOGS ==================== */}
      <Dialog open={stageDialog} onOpenChange={setStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Project Stage</DialogTitle><DialogDescription>Move "{selectedProject?.name}" to a new stage</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Current Stage</Label><div className="mt-1">{getStageBadge(selectedProject?.current_stage || 'yet_to_start')}</div></div>
            <div><Label>Move to</Label><Select value={newStage} onValueChange={setNewStage}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStageDialog(false)}>Cancel</Button><Button onClick={handleUpdateStage} className="bg-indigo-600 hover:bg-indigo-700">Update</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Payment</DialogTitle></DialogHeader>
          <div className="py-4"><Label>Reason</Label><Input placeholder="Reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-2" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRejectDialog(false)}>Cancel</Button><Button variant="destructive" onClick={handleRejectPayment}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingMaterial ? 'Edit Material' : 'Add Material'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="Material name" className="mt-1" data-testid="material-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Category</Label><Select value={materialForm.category} onValueChange={(v) => setMaterialForm({ ...materialForm, category: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{MATERIAL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Unit</Label><UnitSelect value={materialForm.unit} onChange={(v) => setMaterialForm({ ...materialForm, unit: v })} className="mt-1" /></div>
            </div>
            <div><Label>Description</Label><Input value={materialForm.description} onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })} placeholder="Optional" className="mt-1" /></div>
            <div><Label>HSN Code</Label><Input value={materialForm.hsn_code} onChange={(e) => setMaterialForm({ ...materialForm, hsn_code: e.target.value })} placeholder="e.g. 2523" className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMaterialDialog(false)}>Cancel</Button><Button onClick={handleSaveMaterial} className="bg-blue-600 hover:bg-blue-700" data-testid="save-material-btn">{editingMaterial ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contractorDialog} onOpenChange={setContractorDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingContractor ? 'Edit Contractor' : 'Add Contractor'}
              {editingContractor && contractorForm.is_locked && (
                <Badge className="bg-red-50 text-red-700 border border-red-200 text-[10px]"><Lock className="h-2.5 w-2.5 mr-0.5 inline" />Locked</Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Capture name, banking info, and per-skill daily rates. Lock a record to flag it as protected (admin override allowed).
            </DialogDescription>
          </DialogHeader>
          <Tabs value={contractorTabIdx} onValueChange={setContractorTabIdx} className="w-full">
            <TabsList className={`grid w-full ${editingContractor ? 'grid-cols-4' : 'grid-cols-3'}`} data-testid="contractor-dialog-tabs">
              <TabsTrigger value="basic" data-testid="tab-basic">Basic</TabsTrigger>
              <TabsTrigger value="bank" data-testid="tab-bank">Bank</TabsTrigger>
              <TabsTrigger value="rates" data-testid="tab-rates">Employee Prices</TabsTrigger>
              {editingContractor && <TabsTrigger value="payments" data-testid="tab-payments">Payment Summary</TabsTrigger>}
            </TabsList>

            {/* === BASIC === */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div><Label>Name <span className="text-red-500">*</span></Label><Input value={contractorForm.name} onChange={(e) => setContractorForm({ ...contractorForm, name: e.target.value })} placeholder="Contractor name" className="mt-1" data-testid="contractor-name-input" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input value={contractorForm.phone} onChange={(e) => setContractorForm({ ...contractorForm, phone: e.target.value })} className="mt-1" data-testid="contractor-phone-input" /></div>
                <div><Label>Email</Label><Input value={contractorForm.email} onChange={(e) => setContractorForm({ ...contractorForm, email: e.target.value })} className="mt-1" data-testid="contractor-email-input" /></div>
              </div>
              <div><Label>Address</Label><Input value={contractorForm.address} onChange={(e) => setContractorForm({ ...contractorForm, address: e.target.value })} className="mt-1" data-testid="contractor-address-input" /></div>
              <div>
                <Label>Contractor Type</Label>
                {/* Multi-select dropdown with checkboxes — pick one or many types */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between mt-1 font-normal h-9"
                      data-testid="contractor-type-select"
                    >
                      <span className="truncate text-left">
                        {contractorForm.work_types && contractorForm.work_types.length > 0
                          ? contractorForm.work_types.join(', ')
                          : <span className="text-gray-400">Select contractor type(s)</span>}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="max-h-64 overflow-y-auto py-1">
                      {(contractorTypes.length > 0 ? contractorTypes.map(t => t.name) : WORK_TYPES).map(wt => {
                        const checked = (contractorForm.work_types || []).includes(wt);
                        return (
                          <label
                            key={wt}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                            data-testid={`contractor-type-option-${wt.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const cur = contractorForm.work_types || [];
                                setContractorForm({
                                  ...contractorForm,
                                  work_types: v ? [...cur, wt] : cur.filter(x => x !== wt),
                                });
                              }}
                            />
                            <span>{wt}</span>
                          </label>
                        );
                      })}
                      {contractorTypes.length === 0 && (
                        <p className="text-[11px] text-gray-400 italic px-3 py-2">
                          Tip: Add custom types under "Contractor Types" tab.
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md bg-gray-50 border">
                <button type="button" onClick={() => setContractorForm({ ...contractorForm, is_locked: !contractorForm.is_locked })} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${contractorForm.is_locked ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`} data-testid="contractor-lock-toggle">
                  {contractorForm.is_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  {contractorForm.is_locked ? 'Locked' : 'Unlocked'}
                </button>
                <p className="text-[11px] text-gray-500 leading-tight">Locked contractors are visually flagged. Admins can still edit or delete locked records — the flag is a marker, not a hard restriction.</p>
              </div>
            </TabsContent>

            {/* === BANK === */}
            <TabsContent value="bank" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Bank Name</Label><Input value={contractorForm.bank_name} onChange={(e) => setContractorForm({ ...contractorForm, bank_name: e.target.value })} className="mt-1" placeholder="e.g., HDFC Bank" data-testid="contractor-bank-input" /></div>
                <div><Label>Account Number</Label><Input value={contractorForm.account_number} onChange={(e) => setContractorForm({ ...contractorForm, account_number: e.target.value })} className="mt-1" data-testid="contractor-account-input" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>IFSC Code</Label><Input value={contractorForm.ifsc_code} onChange={(e) => setContractorForm({ ...contractorForm, ifsc_code: e.target.value.toUpperCase() })} className="mt-1 uppercase" placeholder="e.g., HDFC0001234" data-testid="contractor-ifsc-input" /></div>
              </div>
              <p className="text-[11px] text-gray-500 italic">Bank details are used when generating payouts and reconciling cheques. Keep them current to avoid payout failures.</p>
            </TabsContent>

            {/* === EMPLOYEE PRICES === */}
            <TabsContent value="rates" className="space-y-4 mt-4">
              <p className="text-xs text-gray-600">Per-day rate (₹) for each labour category. These rates are picked up automatically when raising labour work orders.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 rounded-md border bg-emerald-50/50">
                  <Label className="text-emerald-800">Skilled / day</Label>
                  <Input type="number" min="0" value={contractorForm.daily_rate_skilled} onChange={(e) => setContractorForm({ ...contractorForm, daily_rate_skilled: e.target.value })} className="mt-1 bg-white" placeholder="₹0" data-testid="rate-skilled-input" />
                  <p className="text-[10px] text-emerald-700 mt-1">e.g., Mason, Electrician, Plumber</p>
                </div>
                <div className="p-3 rounded-md border bg-amber-50/50">
                  <Label className="text-amber-800">Semi-Skilled / day</Label>
                  <Input type="number" min="0" value={contractorForm.daily_rate_semi_skilled} onChange={(e) => setContractorForm({ ...contractorForm, daily_rate_semi_skilled: e.target.value })} className="mt-1 bg-white" placeholder="₹0" data-testid="rate-semi-skilled-input" />
                  <p className="text-[10px] text-amber-700 mt-1">e.g., Helper Carpenter</p>
                </div>
                <div className="p-3 rounded-md border bg-gray-50">
                  <Label className="text-gray-800">Unskilled / day</Label>
                  <Input type="number" min="0" value={contractorForm.daily_rate_unskilled} onChange={(e) => setContractorForm({ ...contractorForm, daily_rate_unskilled: e.target.value })} className="mt-1 bg-white" placeholder="₹0" data-testid="rate-unskilled-input" />
                  <p className="text-[10px] text-gray-600 mt-1">e.g., General Labour</p>
                </div>
              </div>
            </TabsContent>

            {/* === PAYMENT SUMMARY (edit only) === */}
            {editingContractor && (
              <TabsContent value="payments" className="space-y-4 mt-4">
                {contractorPaymentLoading ? (
                  <p className="text-sm text-gray-400 text-center py-8">Loading payment summary…</p>
                ) : !contractorPaymentSummary ? (
                  <p className="text-sm text-gray-400 text-center py-8">No payment data available.</p>
                ) : (
                  <div className="space-y-4">
                    {/* Work Order Stats */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center gap-1.5"><Briefcase className="h-3 w-3" />Work Orders</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-3 rounded-md border bg-blue-50/60" data-testid="ps-wo-count"><p className="text-[10px] text-blue-700 uppercase">No. of Orders</p><p className="text-lg font-semibold text-blue-900">{contractorPaymentSummary.work_orders.count}</p></div>
                        <div className="p-3 rounded-md border bg-blue-50/60" data-testid="ps-wo-total"><p className="text-[10px] text-blue-700 uppercase">Total Value</p><p className="text-lg font-semibold text-blue-900">₹{(contractorPaymentSummary.work_orders.total_amount || 0).toLocaleString('en-IN')}</p></div>
                        <div className="p-3 rounded-md border bg-emerald-50/60" data-testid="ps-wo-paid"><p className="text-[10px] text-emerald-700 uppercase">Paid</p><p className="text-lg font-semibold text-emerald-900">₹{(contractorPaymentSummary.work_orders.paid_amount || 0).toLocaleString('en-IN')}</p></div>
                        <div className="p-3 rounded-md border bg-amber-50/60" data-testid="ps-wo-pending"><p className="text-[10px] text-amber-700 uppercase">Pending (Total − Paid)</p><p className="text-lg font-semibold text-amber-900">₹{(contractorPaymentSummary.work_orders.pending_amount || 0).toLocaleString('en-IN')}</p></div>
                      </div>
                    </div>

                    {/* Payment Request Stats */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center gap-1.5"><CreditCard className="h-3 w-3" />Payment Requests</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div className="p-3 rounded-md border bg-purple-50/60" data-testid="ps-req-raised"><p className="text-[10px] text-purple-700 uppercase">Raised</p><p className="text-base font-semibold text-purple-900">₹{(contractorPaymentSummary.payment_requests.raised_amount || 0).toLocaleString('en-IN')}</p><p className="text-[10px] text-purple-600">{contractorPaymentSummary.payment_requests.raised_count} request(s)</p></div>
                        <div className="p-3 rounded-md border bg-emerald-50/60" data-testid="ps-req-collected"><p className="text-[10px] text-emerald-700 uppercase">Collected</p><p className="text-base font-semibold text-emerald-900">₹{(contractorPaymentSummary.payment_requests.collected_amount || 0).toLocaleString('en-IN')}</p><p className="text-[10px] text-emerald-600">{contractorPaymentSummary.payment_requests.collected_count} paid</p></div>
                        <div className="p-3 rounded-md border bg-amber-50/60" data-testid="ps-req-pending"><p className="text-[10px] text-amber-700 uppercase">Pending Collection</p><p className="text-base font-semibold text-amber-900">₹{(contractorPaymentSummary.payment_requests.pending_amount || 0).toLocaleString('en-IN')}</p><p className="text-[10px] text-amber-600">{contractorPaymentSummary.payment_requests.pending_count} awaiting</p></div>
                      </div>
                    </div>

                    {/* Projects List */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-gray-500 mb-2 flex items-center gap-1.5"><Building2 className="h-3 w-3" />Projects ({contractorPaymentSummary.projects?.length || 0})</h4>
                      {(contractorPaymentSummary.projects || []).length === 0 ? (
                        <p className="text-xs text-gray-400 italic p-3 text-center bg-gray-50 rounded-md">No projects yet.</p>
                      ) : (
                        <div className="overflow-x-auto border rounded-md">
                          <table className="w-full text-xs" data-testid="ps-projects-table">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-2.5 py-2 text-left">Project</th>
                                <th className="px-2.5 py-2 text-center">WOs</th>
                                <th className="px-2.5 py-2 text-right">Total</th>
                                <th className="px-2.5 py-2 text-right">Paid</th>
                                <th className="px-2.5 py-2 text-right">Pending</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {contractorPaymentSummary.projects.map(p => (
                                <tr key={p.project_id} className="hover:bg-gray-50">
                                  <td className="px-2.5 py-2 font-medium">{p.project_name || p.project_id}</td>
                                  <td className="px-2.5 py-2 text-center">{p.wo_count}</td>
                                  <td className="px-2.5 py-2 text-right">₹{(p.total_amount || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-2.5 py-2 text-right text-emerald-700">₹{(p.paid_amount || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-2.5 py-2 text-right text-amber-700 font-medium">₹{(p.pending_amount || 0).toLocaleString('en-IN')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
          <DialogFooter><Button variant="outline" onClick={() => setContractorDialog(false)}>Cancel</Button><Button onClick={handleSaveContractor} className="bg-amber-600 hover:bg-amber-700" data-testid="save-contractor-btn">{editingContractor ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorDialog} onOpenChange={setVendorDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Material Vendor' : 'Add Material Vendor'}</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Capture vendor info, banking details, and the materials they sell.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={vendorTabIdx} onValueChange={setVendorTabIdx} className="w-full">
            <TabsList className="grid w-full grid-cols-3" data-testid="vendor-dialog-tabs">
              <TabsTrigger value="basic" data-testid="vendor-tab-basic">Basic</TabsTrigger>
              <TabsTrigger value="bank" data-testid="vendor-tab-bank">Bank</TabsTrigger>
              <TabsTrigger value="materials" data-testid="vendor-tab-materials">Materials they sell</TabsTrigger>
            </TabsList>

            {/* === BASIC === */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Company Name <span className="text-red-500">*</span></Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} className="mt-1" data-testid="vendor-name-input" /></div>
                <div><Label>Contact Person</Label><Input value={vendorForm.contact_person} onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} className="mt-1" /></div>
                <div><Label>Email</Label><Input value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} className="mt-1" /></div>
              </div>
              <div><Label>Address</Label><Input value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>GST Number</Label><Input value={vendorForm.gst_number} onChange={(e) => setVendorForm({ ...vendorForm, gst_number: e.target.value })} className="mt-1" /></div>
                <div><Label>Payment Terms</Label><Select value={vendorForm.payment_terms} onValueChange={(v) => setVendorForm({ ...vendorForm, payment_terms: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full">Full</SelectItem><SelectItem value="advance">Advance</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></div>
              </div>
              {vendorForm.payment_terms === 'credit' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Credit Limit</Label><NumericInput value={vendorForm.credit_limit} onChange={(e) => setVendorForm({ ...vendorForm, credit_limit: parseFloat(e.target.value)||0 })} className="mt-1" /></div>
                  <div><Label>Credit Days</Label><Input value={vendorForm.credit_days} onChange={(e) => setVendorForm({ ...vendorForm, credit_days: parseInt(e.target.value)||0 })} className="mt-1" /></div>
                </div>
              )}
            </TabsContent>

            {/* === BANK === */}
            <TabsContent value="bank" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Bank Name</Label><Input value={vendorForm.bank_name} onChange={(e) => setVendorForm({ ...vendorForm, bank_name: e.target.value })} className="mt-1" placeholder="e.g., HDFC Bank" data-testid="vendor-bank-input" /></div>
                <div><Label>Account Number</Label><Input value={vendorForm.account_number} onChange={(e) => setVendorForm({ ...vendorForm, account_number: e.target.value })} className="mt-1" data-testid="vendor-account-input" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>IFSC Code</Label><Input value={vendorForm.ifsc_code} onChange={(e) => setVendorForm({ ...vendorForm, ifsc_code: e.target.value.toUpperCase() })} className="mt-1 uppercase" placeholder="e.g., HDFC0001234" data-testid="vendor-ifsc-input" /></div>
              </div>
              <p className="text-[11px] text-gray-500 italic">Bank details are used when generating payouts and reconciling cheques.</p>
            </TabsContent>

            {/* === MATERIALS THEY SELL === */}
            <TabsContent value="materials" className="space-y-3 mt-4">
              <Label>Materials they sell</Label>
              {/* Multi-select dropdown with checkboxes — pulled from the Materials master */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal h-9"
                    data-testid="vendor-materials-select"
                  >
                    <span className="truncate text-left">
                      {vendorForm.materials_supplied && vendorForm.materials_supplied.length > 0
                        ? vendorForm.materials_supplied.map(id => getMaterialName(id)).join(', ')
                        : <span className="text-gray-400">Select material(s)</span>}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="max-h-72 overflow-y-auto py-1">
                    {materials.filter(m => m.is_active !== false).length === 0 && (
                      <p className="text-[11px] text-gray-400 italic px-3 py-2">
                        Tip: Add materials under the "Materials" sub-tab.
                      </p>
                    )}
                    {materials.filter(m => m.is_active !== false).map(m => {
                      const checked = (vendorForm.materials_supplied || []).includes(m.material_id);
                      return (
                        <label
                          key={m.material_id}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                          data-testid={`vendor-material-option-${m.material_id}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const cur = vendorForm.materials_supplied || [];
                              setVendorForm({
                                ...vendorForm,
                                materials_supplied: v ? [...cur, m.material_id] : cur.filter(id => id !== m.material_id),
                              });
                            }}
                          />
                          <span className="flex-1">{m.name}</span>
                          {m.unit && <span className="text-[10px] text-gray-400">{m.unit}</span>}
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-gray-500 italic">Selected materials become the auto-suggest list when raising POs against this vendor.</p>
            </TabsContent>
          </Tabs>
          <DialogFooter><Button variant="outline" onClick={() => setVendorDialog(false)}>Cancel</Button><Button onClick={handleSaveVendor} className="bg-teal-600 hover:bg-teal-700" data-testid="save-vendor-btn">{editingVendor ? 'Update' : 'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stages to Monthly Schedule Dialog */}
      <Dialog open={addStagesDialog} onOpenChange={setAddStagesDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Stages to {MONTH_NAMES[scheduleMonth]} {scheduleYear} Schedule</DialogTitle>
            <DialogDescription>Select project payment stages to include in this month's collection plan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {availableStages.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No available stages. All stages are either fully collected or already scheduled.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{availableStages.length} stages available</span>
                  <Button size="sm" variant="ghost" className="text-xs"
                    onClick={() => setSelectedStageIds(selectedStageIds.length === availableStages.length ? [] : availableStages.map(s => s.stage_id))}>
                    {selectedStageIds.length === availableStages.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                {availableStages.map(s => (
                  <label key={s.stage_id} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer border-t" data-testid={`stage-option-${s.stage_id}`}>
                    <input type="checkbox" checked={selectedStageIds.includes(s.stage_id)} onChange={(e) => {
                      if (e.target.checked) setSelectedStageIds([...selectedStageIds, s.stage_id]);
                      else setSelectedStageIds(selectedStageIds.filter(id => id !== s.stage_id));
                    }} className="w-4 h-4 text-amber-600 rounded" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{s.project_name} <span className="text-gray-500">— {s.client_name}</span></p>
                      <p className="text-xs text-gray-500">{s.stage_name} ({s.stage_label})</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(s.amount)}</p>
                      {(s.amount_received || 0) > 0 && <p className="text-xs text-green-600">Received: {formatCurrency(s.amount_received)}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStagesDialog(false)}>Cancel</Button>
            <Button onClick={handleAddStagesToSchedule} disabled={selectedStageIds.length === 0} className="bg-amber-600 hover:bg-amber-700" data-testid="confirm-add-stages">
              Add {selectedStageIds.length} Stage{selectedStageIds.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== RE TEMPLATE DIALOG ==================== */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="template-dialog-title">
              <FileText className="h-5 w-5 text-purple-600" />
              {editingTemplate ? 'Edit Template' : 'Create RE Template'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update template details and scope items' : 'Define a reusable rough estimate template with scope items'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <Label>Template Name *</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Standard 2BHK, Premium Villa"
                  data-testid="template-name-input"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Sq.ft</Label>
                <NumericInput
                  value={templateForm.sqft}
                  onChange={(e) => setTemplateForm({ ...templateForm, sqft: e.target.value })}
                  placeholder="e.g., 1200"
                  data-testid="template-sqft-input"
                />
              </div>
            </div>

            {/* Scope Items Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Scope of Work Items</Label>
                <Button variant="outline" size="sm" onClick={addTemplateScopeItem} data-testid="add-scope-item-btn">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-1 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center w-28">Qty</th>
                      <th className="px-3 py-2 text-center w-28">Unit</th>
                      <th className="px-3 py-2 text-right w-32">Rate</th>
                      <th className="px-3 py-2 text-right w-32">Total</th>
                      <th className="px-3 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {templateForm.scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                          No scope items added. Click "Add Item" to start.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={templateForm.scope_items.map((_, i) => `scope-${i}`)}
                        onReorder={(newIds) => {
                          const newItems = newIds.map(id => templateForm.scope_items[parseInt(id.split('-')[1])]);
                          setTemplateForm({ ...templateForm, scope_items: newItems });
                        }}
                      >
                      {templateForm.scope_items.map((item, idx) => (
                        <SortableTableRow key={`scope-${idx}`} id={`scope-${idx}`}>
                          {({ listeners, attributes }) => (
                            <>
                          <td className="px-1 py-2 text-center">
                            <DragHandle listeners={listeners} attributes={attributes} />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              value={item.name}
                              onChange={(e) => updateTemplateScopeItem(idx, 'name', e.target.value)}
                              placeholder="Item description"
                              className="h-9 w-full"
                              data-testid={`scope-item-name-${idx}`}
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <NumericInput
                              value={item.quantity}
                              onChange={(e) => updateTemplateScopeItem(idx, 'quantity', e.target.value)}
                              className="h-9 text-center w-full"
                              data-testid={`scope-item-qty-${idx}`}
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <UnitSelect
                              value={item.unit}
                              onChange={(v) => updateTemplateScopeItem(idx, 'unit', v)}
                              className="h-9"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <NumericInput
                              value={item.rate}
                              onChange={(e) => updateTemplateScopeItem(idx, 'rate', e.target.value)}
                              className="h-9 text-right w-full"
                              data-testid={`scope-item-rate-${idx}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium align-top whitespace-nowrap">
                            {formatCurrency(item.total)}
                          </td>
                          <td className="px-3 py-2">
                            <Button variant="ghost" size="sm" onClick={() => removeTemplateScopeItem(idx)} data-testid={`remove-scope-item-${idx}`}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </td>
                            </>
                          )}
                        </SortableTableRow>
                      ))}
                      </SortableList>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total */}
            {templateForm.scope_items.length > 0 && (
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-purple-600">Estimated Total</p>
                  <p className="text-2xl font-bold text-purple-800" data-testid="template-estimated-total">
                    {formatCurrency(templateForm.scope_items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)), 0))}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} className="bg-purple-600 hover:bg-purple-700" data-testid="save-template-btn">
              {editingTemplate ? 'Update Template' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />

      {/* Contractor Type dialog (add / edit) */}
      <Dialog open={typeDialog.open} onOpenChange={(o) => !o && setTypeDialog({ open: false, editing: null, name: '', description: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{typeDialog.editing ? 'Edit Contractor Type' : 'Add Contractor Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={typeDialog.name} onChange={(e) => setTypeDialog(t => ({ ...t, name: e.target.value }))} placeholder="e.g., Mason, Plumber" data-testid="type-name-input" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={typeDialog.description} onChange={(e) => setTypeDialog(t => ({ ...t, description: e.target.value }))} placeholder="Optional notes about this contractor type" data-testid="type-description-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialog({ open: false, editing: null, name: '', description: '' })}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleSaveType} data-testid="type-save-btn">{typeDialog.editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contractor Type — view contractors of this type */}
      <Dialog open={typeViewDialog.open} onOpenChange={(o) => !o && setTypeViewDialog({ open: false, type: null, contractors: [], loading: false })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-amber-600" />Contractors of "{typeViewDialog.type?.name || ''}"</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">{typeViewDialog.type?.description || 'All active contractors that include this type.'}</DialogDescription>
          </DialogHeader>
          {typeViewDialog.loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : typeViewDialog.contractors.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8" data-testid="type-view-empty">No contractors registered under this type yet.</p>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm" data-testid="type-view-table">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type of Work</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Phone</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Bank</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {typeViewDialog.contractors.map(c => (
                    <tr key={c.contractor_id} className="hover:bg-gray-50" data-testid={`type-view-row-${c.contractor_id}`}>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(c.work_types || []).length === 0 ? (
                            <span className="text-xs text-gray-400">-</span>
                          ) : (c.work_types || []).map(t => (
                            <Badge
                              key={t}
                              variant="outline"
                              className={`text-[10px] ${typeViewDialog.type?.name === t ? 'bg-amber-50 border-amber-300 text-amber-800' : ''}`}
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell text-gray-600">{c.phone || '-'}</td>
                      <td className="px-3 py-2 hidden sm:table-cell text-gray-500 text-xs">{c.bank_name || '-'}</td>
                      <td className="px-3 py-2 text-center">{c.is_locked ? <Badge className="bg-red-50 text-red-700 border border-red-200 text-[10px]"><Lock className="h-2.5 w-2.5 mr-0.5 inline" />Locked</Badge> : <Badge variant="outline" className="text-[10px]">Active</Badge>}</td>
                      <td className="px-3 py-2 text-center">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setTypeViewDialog({ open: false, type: null, contractors: [], loading: false }); openContractorDialog(c); }} data-testid={`type-view-open-${c.contractor_id}`}><Edit className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeViewDialog({ open: false, type: null, contractors: [], loading: false })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Project — OTP confirmation dialog (Super Admin only) */}
      <Dialog
        open={archiveDialog.open}
        onOpenChange={(o) => !o && !archiveDialog.submitting && setArchiveDialog({ open: false, projectId: '', projectName: '', otp: '', sending: false, submitting: false, sentMsg: '' })}
      >
        <DialogContent className="max-w-md" data-testid="archive-otp-dialog">
          <DialogHeader>
            <DialogTitle className="text-amber-700">Archive Project — Email OTP Required</DialogTitle>
            <DialogDescription>
              You're about to archive <strong>{archiveDialog.projectName}</strong>. For your safety, an OTP has been sent to your registered email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded p-2">
              {archiveDialog.sending ? 'Sending OTP…' : (archiveDialog.sentMsg || 'OTP sent — check your email inbox.')}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Enter 6-digit OTP</label>
              <Input
                data-testid="archive-otp-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={archiveDialog.otp}
                onChange={(e) => setArchiveDialog(d => ({ ...d, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="••••••"
                className="text-center tracking-[0.5em] font-mono text-lg"
                autoFocus
                disabled={archiveDialog.submitting || archiveDialog.sending}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resendArchiveOtp}
              disabled={archiveDialog.sending || archiveDialog.submitting}
              data-testid="archive-otp-resend"
            >
              Resend OTP
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveDialog({ open: false, projectId: '', projectName: '', otp: '', sending: false, submitting: false, sentMsg: '' })}
              disabled={archiveDialog.submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={submitArchiveOtp}
              disabled={archiveDialog.submitting || archiveDialog.sending || archiveDialog.otp.length !== 6}
              data-testid="archive-otp-confirm"
            >
              {archiveDialog.submitting ? 'Archiving…' : 'Confirm & Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
