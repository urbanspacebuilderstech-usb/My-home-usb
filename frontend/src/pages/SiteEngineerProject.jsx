import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  HardHat, LogOut, ArrowLeft, Plus, Package, Users, MapPin, Building2,
  Clock, CheckCircle, XCircle, Truck, Camera, AlertTriangle, Send,
  Calendar, ClipboardList, Warehouse, Save, Trash2, History,
  ChevronRight, Banknote, ArrowRight, Eye, Circle,
  ListChecks, CheckCircle2, Video, FileText, IndianRupee
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import MetaDateFilter from '../components/MetaDateFilter';
import ProjectCuringTab from '../components/ProjectCuringTab';
import ProjectDLRDPRList from '../components/ProjectDLRDPRList';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { UnitSelect } from '../components/UnitSelect';
import OrderDetailDialog from '../components/OrderDetailDialog';
import WorkOrderTab from '../components/WorkOrderTab';
import DLRPanel from '../components/DLRPanel';
import SiteEngineerWorkOrdersV2 from '../components/SiteEngineerWorkOrdersV2';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  requested: { label: 'Requested', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  pm_approved: { label: 'PM Approved', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  planning_approved: { label: 'Planning OK', color: 'bg-amber-50 text-amber-800', icon: CheckCircle },
  procurement_approved: { label: 'Procurement OK', color: 'bg-purple-100 text-purple-800', icon: CheckCircle },
  pending_accounts_approval: { label: 'Pending Accounts', color: 'bg-indigo-100 text-indigo-800', icon: Clock },
  accountant_approved: { label: 'Accounts OK', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  accounts_approved: { label: 'Accounts OK', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  vendor_selected: { label: 'Vendor Selected', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  waiting_payment: { label: 'Awaiting Payment', color: 'bg-amber-100 text-amber-800', icon: Clock },
  payment_approved: { label: 'Payment OK', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  po_generated: { label: 'PO Generated', color: 'bg-cyan-100 text-cyan-800', icon: CheckCircle },
  ready_for_delivery: { label: 'Ready', color: 'bg-cyan-100 text-cyan-800', icon: Truck },
  in_transit: { label: 'In Transit', color: 'bg-blue-100 text-blue-800', icon: Truck },
  collected: { label: 'Collected', color: 'bg-sky-100 text-sky-800', icon: Package },
  procurement_verifying: { label: 'Verifying', color: 'bg-fuchsia-100 text-fuchsia-800', icon: Package },
  delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800', icon: Truck },
  received_partial: { label: 'Partial', color: 'bg-orange-100 text-orange-800', icon: Package },
  received_completed: { label: 'Complete', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle }
};

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-800', icon: Clock };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
};

// Compact per-card lifecycle stepper — mirrors the canonical Planning /
// Procurement pipeline (New Request → Purchase → Transit → Collect Material →
// Purchase Verification → Payment Pending → Completed) so an SE can see at a
// glance how far a single request has progressed, without opening it.
const MATERIAL_STAGE_FLOW = ['Requested', 'Purchase', 'Transit', 'Collected', 'Verified', 'Payment', 'Completed'];

function materialStageIndex(status) {
  const s = (status || '').toLowerCase();
  if (['delivered', 'completed', 'closed'].includes(s)) return 6;
  if (['pending_accounts_approval', 'pending_advance_payment', 'pending_balance_payment', 'accounts_approved', 'payment_approved'].includes(s)) return 5;
  if (s === 'procurement_verifying') return 4;
  if (['collected', 'procurement_verify_rejected'].includes(s)) return 3;
  if (s === 'in_transit') return 2;
  if (['requested', 'pm_approved', 'procurement_priced', 'procurement_revision'].includes(s)) return 1;
  return 0; // planning_initial_pending / rejected / anything unrecognized — just Requested
}

const MaterialStageFlow = ({ status }) => {
  const current = materialStageIndex(status);
  return (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-0.5 mt-1.5" data-testid="se-mat-stage-flow">
      {MATERIAL_STAGE_FLOW.map((label, idx) => (
        <span key={label} className="flex items-center gap-1">
          {idx > 0 && <span className="text-gray-300 text-[10px]">-</span>}
          {idx <= current ? (
            <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[9px] font-medium">
              {label}
            </span>
          ) : (
            <span className="text-[9px] text-gray-400">{label}</span>
          )}
        </span>
      ))}
    </div>
  );
};

// Material lifecycle filter cards — Site Engineer view.
// Order matches the SE's actual to-do list: New Request → Purchase (Procurement's
// leg, nothing for the SE to do) → Transit → Collect Material (SE's last active
// step). Everything past collection (Purchase Verification / Payment Pending /
// Completed) is Procurement's & Accounts' job, so those — along with any
// rejected/revision status — roll into "Collect Material" or "Awaiting
// Planning"/"Awaiting Procurement" (whichever stage they bounced back to)
// rather than getting their own tab; still reachable via "All".
const LIFECYCLE_BUCKETS = [
  { key: 'all',                 label: 'All',                  Icon: ListChecks,    cls: 'bg-violet-50 border-violet-200 text-violet-700',    active: 'bg-violet-600 text-white border-violet-600' },
  { key: 'planning_initial',    label: 'Awaiting Planning',    Icon: ClipboardList, cls: 'bg-yellow-50 border-yellow-200 text-yellow-700',    active: 'bg-yellow-600 text-white border-yellow-600' },
  { key: 'awaiting_procurement',label: 'Awaiting Procurement', Icon: ClipboardList, cls: 'bg-amber-50 border-amber-200 text-amber-700',       active: 'bg-amber-600 text-white border-amber-600' },
  { key: 'transit',             label: 'Transit',              Icon: Truck,         cls: 'bg-sky-50 border-sky-200 text-sky-700',             active: 'bg-sky-600 text-white border-sky-600' },
  { key: 'collected',           label: 'Received Material',    Icon: Package,       cls: 'bg-lime-50 border-lime-200 text-lime-700',          active: 'bg-lime-600 text-white border-lime-600' },
];

function bucketForMaterial(req) {
  const status = (req.status || '').toLowerCase();
  if (['planning_initial_pending', 'planning_initial_rejected'].includes(status)) return 'planning_initial';
  if (['requested', 'pm_approved', 'procurement_priced', 'procurement_revision'].includes(status)) return 'awaiting_procurement';
  if (['in_transit', 'ready_for_delivery'].includes(status)) return 'transit';
  // Everything from "SE marked collected" onward — Purchase Verification,
  // Payment Pending, and Completed/Delivered — sits in the SE's last
  // actionable bucket since there's nothing left for the SE to do.
  if ([
    'collected', 'procurement_verify_rejected', 'procurement_verifying',
    'pending_accounts_approval', 'pending_balance_payment', 'accounts_approved', 'payment_approved', 'accountant_approved',
    'delivered', 'completed', 'closed', 'received_partial', 'received_completed',
  ].includes(status)) return 'collected';
  return 'all';
}

export default function SiteEngineerProject() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [labourTypes, setLabourTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('dlr_dpr');
  // Sub-tab inside DLR & DPR: 'dlr' (existing) | 'payments' (read-only payment schedule)
  const [dlrSubTab, setDlrSubTab] = useState('dlr');
  const [paymentStages, setPaymentStages] = useState([]);
  const [paymentStagesLoading, setPaymentStagesLoading] = useState(false);
  const [materialsSubTab, setMaterialsSubTab] = useState('requests'); // requests | inventory
  const [materialBucket, setMaterialBucket] = useState('all'); // lifecycle filter
  const [labourSubTab, setLabourSubTab] = useState('orders');
  
  const [materialRequestDialog, setMaterialRequestDialog] = useState(false);
  const [receiveDialog, setReceiveDialog] = useState({ open: false, request: null });
  
  const [quickAttPopup, setQuickAttPopup] = useState(false);
  
  const [materialForm, setMaterialForm] = useState({ material_id: '', material_name: '', brand: '', category: '', quantity: '', unit: 'kg', remarks: '', is_approved: true, delivery_choice: '48h', delivery_custom_date: '', emergency_reason: '', is_locked_from_package: false, locked_estimated_rate: null });
  // ── Steel multi-item state (Feb 2026) ─────────────────────────────────
  // When the selected material has `category === 'steel'` the dialog swaps
  // the Quantity+Unit block for a Steel-specific UI: diameter dropdown +
  // rod count + auto-calc weight (kg). Multiple items can be added via
  // "+ Add Another Item" — each gets its own diameter/rods/weight/remarks
  // and is submitted as a separate material_request on the backend. The
  // weight is stored in `quantity` and unit fixed to 'kg' so Planning /
  // Procurement see standard units.
  const STEEL_DIAMETERS_MM = [6, 8, 10, 12, 16, 20, 25, 32];
  const STEEL_ROD_LENGTH_FT = 40;
  const STEEL_ROD_LENGTH_M = 12.192; // 40 ft → metres
  const calcSteelWeightKg = (diameterMm, rodCount) => {
    const D = parseFloat(diameterMm); const N = parseInt(rodCount, 10);
    if (!D || !N) return 0;
    // Indian standard: W (kg) = D² ÷ 162 × L(m) × N
    return Math.round(((D * D) / 162) * STEEL_ROD_LENGTH_M * N * 100) / 100;
  };
  const [steelItems, setSteelItems] = useState([
    { diameter: 8, rod_count: '', weight: 0, remarks: '' },
  ]);
  const resetSteelItems = () => setSteelItems([{ diameter: 8, rod_count: '', weight: 0, remarks: '' }]);
  // Detect Steel from EITHER the category tag (preferred — set by Super
  // Admin in Material Master) OR the material name (fallback — covers
  // materials not yet tagged). Both paths flip the dialog into Steel mode.
  const isSteelSelected = (
    (materialForm.category || '').toLowerCase() === 'steel' ||
    (materialForm.material_name || '').toLowerCase().includes('steel')
  );
  const [vendorSuggestion, setVendorSuggestion] = useState(null);
  const [approvedMaterials, setApprovedMaterials] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState(false);
  const materialDropdownRef = useRef(null);

  // Close the approved-material dropdown on outside click / Escape.
  useEffect(() => {
    if (!materialDropdownOpen) return;
    const onDown = (e) => {
      if (materialDropdownRef.current && !materialDropdownRef.current.contains(e.target)) {
        setMaterialDropdownOpen(false);
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') setMaterialDropdownOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [materialDropdownOpen]);
  const [labourForm, setLabourForm] = useState({ labour_type: '', num_workers: '', num_days: '', rate_per_day: '', remarks: '' });
  const [receiveForm, setReceiveForm] = useState({ received_qty: '', remarks: '', receive_date: new Date().toISOString().split('T')[0], receive_time: new Date().toTimeString().slice(0,5) });
  // Feb 12 2026 — per-diameter received qty for steel orders. Indexed the same
  // as receiveDialog.request.steel_specs.items, each entry is the kg received
  // for that diameter. The total received_qty is the live sum below the table.
  const [receivedSteelItems, setReceivedSteelItems] = useState([]);
  // Feb 12 2026 — receivedSteelRods[i] is the editable rod count per diameter
  // (e.g., supplier delivered 196 of 200 requested rods). Weight auto-syncs
  // from the canonical steel formula  W = (D²/162) × 12.192 × N.
  const [receivedSteelRods, setReceivedSteelRods] = useState([]);
  // Feb 12 2026 — when received qty ≠ requested qty (per diameter or total),
  // SE must enter a reason. Stored in the receipt for downstream audit.
  const [mismatchReason, setMismatchReason] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [lorryImageId, setLorryImageId] = useState(null);
  const [materialImageId, setMaterialImageId] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(null);
  // Daily Progress state
  const [dailyProgressDialog, setDailyProgressDialog] = useState(false);
  const [dailyProgressForm, setDailyProgressForm] = useState({ summary: '', current_stage: '' });
  const [dailyProgressEntries, setDailyProgressEntries] = useState([]);
  const [savingProgress, setSavingProgress] = useState(false);
  // Received stock
  const [receivedStock, setReceivedStock] = useState([]);

  // Labour Count state
  const [labourCountDate, setLabourCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignedContractors, setAssignedContractors] = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [attendanceCounts, setAttendanceCounts] = useState({});
  const [contractorAttendanceHistory, setContractorAttendanceHistory] = useState([]);
  const [savingLabourCount, setSavingLabourCount] = useState(false);
  const [requestingPayment, setRequestingPayment] = useState(false);

  // Project Work Orders (new system with approval pipeline)
  const [projectWorkOrders, setProjectWorkOrders] = useState([]);
  const [loadingPWO, setLoadingPWO] = useState(false);
  const [expandedDlr, setExpandedDlr] = useState(null);

  // DLR & DPR tab metrics
  const [dailyLabourCount, setDailyLabourCount] = useState('—');
  const [lastDPRDate, setLastDPRDate] = useState(null);
  const [activeContractorsCount, setActiveContractorsCount] = useState('—');
  const [openHindrancesCount, setOpenHindrancesCount] = useState('—');

  // Stock Register / Inventory state
  const [stockDate, setStockDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockEntries, setStockEntries] = useState({});
  const [latestStock, setLatestStock] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [savingStock, setSavingStock] = useState(false);
  const [addStockMaterial, setAddStockMaterial] = useState({ name: '', unit: 'bags' });
  const [inventoryDashboard, setInventoryDashboard] = useState(null);
  const [savingThreshold, setSavingThreshold] = useState(null);
  // Inventory date range filter (MetaDateFilter)
  const [inventoryDateRange, setInventoryDateRange] = useState(null);
  // Material Requests date filter
  const [matReqDateRange, setMatReqDateRange] = useState(null);
  // Quick "Out Stock" / consume dialog
  const [consumeDialog, setConsumeDialog] = useState({ open: false, material: null, qty: '', notes: '' });
  const [savingConsume, setSavingConsume] = useState(false);
  // Per-material stock history dialog
  const [stockHistoryDialog, setStockHistoryDialog] = useState({ open: false, materialName: '', loading: false, entries: [] });

  useEffect(() => {
    fetchData();
    fetchApprovedMaterials();
  }, [projectId]);

  const fetchApprovedMaterials = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/approved-materials`);
      setApprovedMaterials(res.data || []);
    } catch { setApprovedMaterials([]); }
  };

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, projectRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/site-engineer/project/${projectId}`)
      ]);
      // Load optional data gracefully
      const [materialsRes, labourTypesRes] = await Promise.allSettled([
        axios.get(`${API}/materials`),
        axios.get(`${API}/site-engineer/labour-types`)
      ]);
      setUser(userRes.data);
      setProjectData(projectRes.data);
      setMaterials(materialsRes.status === 'fulfilled' ? materialsRes.value.data : []);
      setLabourTypes(labourTypesRes.status === 'fulfilled' ? labourTypesRes.value.data : [
        'Mason', 'Helper', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Welder', 'Bar Bender', 'Tile Worker'
      ]);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied');
        window.location.href = '/site-engineer';
      } else {
        toast.error('Failed to load project data');
      }
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  // ============ PROJECT WORK ORDERS FUNCTIONS ============
  const fetchProjectWorkOrders = async () => {
    setLoadingPWO(true);
    try {
      const res = await axios.get(`${API}/projects/${projectId}/work-orders`);
      setProjectWorkOrders(res.data || []);
    } catch { setProjectWorkOrders([]); }
    finally { setLoadingPWO(false); }
  };

  useEffect(() => {
    if (activeTab === 'work_orders') fetchProjectWorkOrders();
  }, [activeTab, projectId]);

  // Fetch DLR & DPR tab metrics
  const fetchDLRDPRMetrics = async () => {
    if (!projectId) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      // Today's labour total + active contractors from today's DLR
      const todayRes = await axios.get(`${API}/projects/${projectId}/dlr/summary?date=${today}`);
      setDailyLabourCount(todayRes.data?.total_workers ?? 0);
      setActiveContractorsCount(Object.keys(todayRes.data?.by_contractor || {}).length);
    } catch {
      setDailyLabourCount(0); setActiveContractorsCount(0);
    }
    try {
      // Last DPR date — most recent DLR entry across project (any date)
      const allRes = await axios.get(`${API}/projects/${projectId}/dlr/summary`);
      const entries = allRes.data?.entries || [];
      if (entries.length > 0) setLastDPRDate(entries[0].date);
      else setLastDPRDate(null);
    } catch { setLastDPRDate(null); }
    try {
      // Open hindrances — from project stages
      const stagesRes = await axios.get(`${API}/projects/${projectId}/project-stages`);
      const stages = stagesRes.data || [];
      const open = stages.filter(s => (s.hindrance_type || s.hindrance_reason) && s.status !== 'finished').length;
      setOpenHindrancesCount(open);
    } catch { setOpenHindrancesCount(0); }
  };

  useEffect(() => {
    if (activeTab === 'dlr_dpr') fetchDLRDPRMetrics();
    /* eslint-disable-next-line */
  }, [activeTab, projectId]);

  const handleRequestStagePaymentNew = async (woId, stageId) => {
    setRequestingPayment(true);
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${woId}/stages/${stageId}/request-payment`, {
        notes: 'Payment requested by Site Engineer'
      });
      toast.success('Payment request sent for approval');
      fetchProjectWorkOrders();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to request payment'); }
    finally { setRequestingPayment(false); }
  };

  const getStageStatusBadge = (status) => {
    const map = {
      pending: { label: 'Active', cls: 'bg-blue-100 text-blue-800' },
      requested: { label: 'Requested', cls: 'bg-amber-100 text-amber-800' },
      pm_approved: { label: 'PM Approved', cls: 'bg-blue-100 text-blue-800' },
      planning_approved: { label: 'Planning OK', cls: 'bg-indigo-100 text-indigo-800' },
      approved: { label: 'Paid', cls: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
    };
    return map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  };

  // ============ LABOUR COUNT FUNCTIONS ============
  const fetchAssignedContractors = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/assigned-contractors`);
      setAssignedContractors(res.data || []);
    } catch { setAssignedContractors([]); }
  };

  const fetchContractorAttendance = async (contractorId, date) => {
    try {
      const res = await axios.get(`${API}/labour-attendance?project_id=${projectId}&contractor_id=${contractorId}`);
      setContractorAttendanceHistory(res.data || []);
    } catch { setContractorAttendanceHistory([]); }
  };

  const handleOpenContractor = (contractor) => {
    setSelectedContractor(contractor);
    // Pre-populate attendance inputs from labour_rates
    const counts = {};
    (contractor.labour_rates || []).forEach(r => { counts[r.type || r.label] = ''; });
    setAttendanceCounts(counts);
    fetchContractorAttendance(contractor.contractor_id, labourCountDate);
  };

  const handleSaveAttendance = async () => {
    if (!selectedContractor) return;
    const entries = (selectedContractor.labour_rates || [])
      .map(r => ({
        type: r.type || r.label,
        label: r.label || r.type,
        count: Number(attendanceCounts[r.type || r.label]) || 0,
        per_day_cost: Number(r.rate) || 0,
      }))
      .filter(e => e.count > 0);
    if (entries.length === 0) { toast.error('Enter at least one worker count'); return; }
    setSavingLabourCount(true);
    try {
      await axios.post(`${API}/labour-attendance`, {
        project_id: projectId,
        contractor_id: selectedContractor.contractor_id,
        contractor_name: selectedContractor.contractor_name,
        date: labourCountDate,
        entries,
        notes: `Attendance for ${selectedContractor.contractor_name}`
      });
      toast.success('Attendance saved for ' + labourCountDate);
      fetchContractorAttendance(selectedContractor.contractor_id, labourCountDate);
    } catch { toast.error('Failed to save attendance'); }
    finally { setSavingLabourCount(false); }
  };

  const handleRaisePayment = async (workOrderId, stageId, amount) => {
    setRequestingPayment(true);
    try {
      await axios.patch(`${API}/labour-work-orders/${workOrderId}/stages/${stageId}/request-payment`, {
        requested_amount: amount,
        notes: 'Payment requested by Site Engineer'
      });
      toast.success('Payment request sent to Planning for review');
      fetchAssignedContractors();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to request payment'); }
    finally { setRequestingPayment(false); }
  };

  // ============ STOCK REGISTER FUNCTIONS ============
  const fetchStockData = async (date) => {
    try {
      const [latestRes, historyRes, receivedRes, dashRes] = await Promise.all([
        axios.get(`${API}/material-inventory/latest?project_id=${projectId}`),
        axios.get(`${API}/material-inventory?project_id=${projectId}`),
        axios.get(`${API}/projects/${projectId}/received-stock`),
        axios.get(`${API}/material-inventory/dashboard?project_id=${projectId}`)
      ]);
      setLatestStock(latestRes.data || []);
      setStockHistory(historyRes.data || []);
      setReceivedStock(receivedRes.data || []);
      setInventoryDashboard(dashRes.data || null);

      // Auto-populate entries from received stock + existing inventory
      const entries = {};
      
      // First: add all received materials
      (receivedRes.data || []).forEach(item => {
        entries[item.material_name] = {
          unit: item.unit || '',
          opening_stock: 0,
          received: item.total_received || 0,
          used: 0
        };
      });

      // Then: overlay with latest inventory (carry-forward closing as opening)
      (latestRes.data || []).forEach(item => {
        if (entries[item.material_name]) {
          entries[item.material_name].opening_stock = item.closing_stock || 0;
        } else {
          entries[item.material_name] = {
            unit: item.unit || '',
            opening_stock: item.closing_stock || 0,
            received: 0,
            used: 0
          };
        }
      });

      setStockEntries(entries);
    } catch { setLatestStock([]); setStockHistory([]); setReceivedStock([]); }
  };

  const handleSaveStock = async () => {
    const items = Object.entries(stockEntries).filter(([, v]) => v.opening_stock > 0 || v.received > 0 || v.used > 0);
    if (items.length === 0) { toast.error('Enter at least one material stock'); return; }
    setSavingStock(true);
    try {
      for (const [name, data] of items) {
        await axios.post(`${API}/material-inventory`, {
          project_id: projectId,
          material_name: name,
          unit: data.unit || '',
          date: stockDate,
          opening_stock: Number(data.opening_stock) || 0,
          received: Number(data.received) || 0,
          used: Number(data.used) || 0,
          min_threshold: Number(data.min_threshold) || 0
        });
      }
      toast.success('Inventory saved for ' + stockDate);
      fetchStockData(stockDate);
    } catch { toast.error('Failed to save stock'); }
    finally { setSavingStock(false); }
  };

  const handleUpdateThreshold = async (materialName, threshold) => {
    setSavingThreshold(materialName);
    try {
      await axios.patch(`${API}/material-inventory/threshold`, {
        project_id: projectId,
        material_name: materialName,
        min_threshold: Number(threshold) || 0
      });
      toast.success(`Threshold updated for ${materialName}`);
      fetchStockData(stockDate);
    } catch { toast.error('Failed to update threshold'); }
    finally { setSavingThreshold(null); }
  };

  const submitConsume = async () => {
    const qty = parseFloat(consumeDialog.qty);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    setSavingConsume(true);
    try {
      await axios.post(`${API}/material-inventory/consume`, {
        project_id: projectId,
        material_name: consumeDialog.material.material_name,
        unit: consumeDialog.material.unit,
        qty,
        notes: consumeDialog.notes,
      });
      toast.success(`Recorded ${qty} ${consumeDialog.material.unit} used`);
      setConsumeDialog({ open: false, material: null, qty: '', notes: '' });
      fetchStockData(stockDate);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to record consumption');
    } finally { setSavingConsume(false); }
  };

  const openStockHistory = async (materialName) => {
    setStockHistoryDialog({ open: true, materialName, loading: true, entries: [] });
    try {
      const params = new URLSearchParams({ project_id: projectId, material_name: materialName });
      if (inventoryDateRange?.from) params.set('from_date', inventoryDateRange.from);
      if (inventoryDateRange?.to) params.set('to_date', inventoryDateRange.to);
      const res = await axios.get(`${API}/material-inventory/history?${params}`);
      setStockHistoryDialog({ open: true, materialName, loading: false, entries: res.data?.entries || [] });
    } catch {
      setStockHistoryDialog({ open: true, materialName, loading: false, entries: [] });
    }
  };

  const handleAddStockMaterial = () => {
    if (!addStockMaterial.name.trim()) return;
    setStockEntries(prev => ({
      ...prev,
      [addStockMaterial.name.trim()]: { unit: addStockMaterial.unit, opening_stock: 0, received: 0, used: 0 }
    }));
    setAddStockMaterial({ name: '', unit: 'bags' });
  };

  // Load assigned contractors when tab changes
  useEffect(() => {
    if (activeTab === 'labour_count' && projectId) fetchAssignedContractors();
  }, [activeTab, projectId]);

  useEffect(() => {
    if (activeTab === 'stock_register' && projectId) {
      fetchStockData(stockDate);
    }
  }, [activeTab, stockDate, projectId]);

  useEffect(() => {
    if (activeTab === 'daily_progress' && projectId) fetchDailyProgress();
  }, [activeTab, projectId]);

  const fetchReceivedStock = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/received-stock`);
      setReceivedStock(res.data || []);
    } catch { setReceivedStock([]); }
  };

  const fetchDailyProgress = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/daily-progress`);
      setDailyProgressEntries(res.data || []);
    } catch { setDailyProgressEntries([]); }
  };

  const handleSaveDailyProgress = async () => {
    if (!dailyProgressForm.summary.trim()) { toast.error('Please enter work summary'); return; }
    setSavingProgress(true);
    try {
      await axios.post(`${API}/projects/${projectId}/daily-progress`, {
        summary: dailyProgressForm.summary,
        current_stage: dailyProgressForm.current_stage || null,
      });
      toast.success('Daily progress saved!');
      setDailyProgressDialog(false);
      setDailyProgressForm({ summary: '', current_stage: '' });
      fetchDailyProgress();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save progress'); }
    finally { setSavingProgress(false); }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  const getGPSLocation = () => {
    setGettingLocation(true);
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported on this device');
      setGettingLocation(false);
      return;
    }

    const explain = (err) => {
      if (err.code === 1) return 'Location permission denied. Tap the lock icon → Site settings → enable Location.';
      if (err.code === 2) return 'GPS signal unavailable. Move outdoors or near a window and retry.';
      if (err.code === 3) return 'GPS request timed out. Retry once you have a clear signal.';
      return 'Failed to get location.';
    };

    const onSuccess = (position) => {
      setGpsLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setGettingLocation(false);
      toast.success(`Location captured (±${Math.round(position.coords.accuracy)}m)`);
    };

    // First try high-accuracy (GPS hardware), fall back to network/IP if it fails.
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err1) => {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (err2) => {
            toast.error(explain(err2));
            setGettingLocation(false);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const fetchVendorSuggestion = async (matName) => {
    if (!matName || matName.length < 2) { setVendorSuggestion(null); return; }
    try {
      const res = await axios.get(`${API}/projects/${projectId}/vendor-suggestion?material_name=${encodeURIComponent(matName)}`);
      setVendorSuggestion(res.data?.found ? res.data : null);
    } catch { setVendorSuggestion(null); }
  };

  const handleMaterialRequest = async () => {
    // Skip the legacy "name + quantity" guard when the dialog is in
    // Steel multi-item mode — those rows have their own validation below.
    const steelMode = isSteelSelected;
    if (!steelMode) {
      if ((!materialForm.material_id && !materialForm.material_name) || !materialForm.quantity) {
        toast.error('Please fill material name and quantity');
        return;
      }
    } else if (!materialForm.material_id && !materialForm.material_name) {
      toast.error('Please pick a Steel material');
      return;
    }

    // Compute requested delivery hours from the SE delivery choice. Standard SLA is 48h —
    // anything below requires an emergency reason.
    let requestedHours = 48;
    let expectedDeliveryISO = '';
    if (materialForm.delivery_choice === '24h') {
      requestedHours = 24;
    } else if (materialForm.delivery_choice === '48h') {
      requestedHours = 48;
    } else if (materialForm.delivery_choice === 'custom') {
      if (!materialForm.delivery_custom_date) {
        toast.error('Pick a delivery date'); return;
      }
      const target = new Date(materialForm.delivery_custom_date);
      const now = new Date();
      requestedHours = Math.max(1, Math.round((target - now) / 36e5));
      expectedDeliveryISO = target.toISOString();
    }
    if (!expectedDeliveryISO) {
      expectedDeliveryISO = new Date(Date.now() + requestedHours * 36e5).toISOString();
    }
    if (requestedHours < 48 && !materialForm.emergency_reason.trim()) {
      toast.error('Emergency reason required for delivery under 48 hours');
      return;
    }

    try {
      // ── Steel multi-item submission ────────────────────────────────────
      // When the SE picked a Steel material, the dialog collected one or
      // more `steelItems` rows. We POST one material_request per row,
      // converting each (diameter × rods) into kg via calcSteelWeightKg.
      if (isSteelSelected) {
        const validRows = steelItems.filter(r => r.diameter && parseInt(r.rod_count, 10) > 0);
        if (validRows.length === 0) { toast.error('Add at least one Steel row with rod count'); return; }
        // Group ALL steel items into ONE material request. The request's
        // quantity = sum of weights; steel_specs.items[] preserves each row
        // (diameter / rods / weight / remarks) so downstream Planning &
        // Procurement see the complete breakdown on a single card.
        const items = validRows.map((row) => ({
          diameter_mm: parseFloat(row.diameter),
          rod_count: parseInt(row.rod_count, 10),
          rod_length_ft: STEEL_ROD_LENGTH_FT,
          rod_length_m: STEEL_ROD_LENGTH_M,
          calculated_weight_kg: calcSteelWeightKg(row.diameter, row.rod_count),
          remarks: row.remarks || '',
        }));
        const totalWeight = Math.round(items.reduce((s, i) => s + i.calculated_weight_kg, 0) * 100) / 100;
        const totalRods = items.reduce((s, i) => s + i.rod_count, 0);
        // Feb 12 2026 — when SE manually overrode the Quantity (kg) field, use
        // that value as the request quantity. Otherwise stick with the
        // formula-computed totalWeight.
        const manualQty = parseFloat(materialForm.quantity);
        const requestQty = (!isNaN(manualQty) && manualQty > 0) ? manualQty : totalWeight;
        const payload = {
          project_id: projectId,
          quantity: requestQty,
          unit: 'kg',
          remarks: materialForm.remarks || null,
          is_approved_material: materialForm.is_approved,
          brand: materialForm.brand || null,
          material_id: materialForm.material_id || undefined,
          material_name: materialForm.material_name || undefined,
          se_delivery_choice: materialForm.delivery_choice,
          se_requested_hours: requestedHours,
          se_expected_delivery: expectedDeliveryISO,
          se_emergency_reason: requestedHours < 48 ? materialForm.emergency_reason.trim() : '',
          steel_specs: {
            items,
            total_items: items.length,
            total_rods: totalRods,
            total_weight_kg: totalWeight,
            // Legacy single-row mirror for backward compat with the old card UI
            diameter_mm: items[0].diameter_mm,
            rod_count: items[0].rod_count,
            rod_length_ft: STEEL_ROD_LENGTH_FT,
            rod_length_m: STEEL_ROD_LENGTH_M,
            calculated_weight_kg: items[0].calculated_weight_kg,
          },
        };
        try {
          await axios.post(`${API}/site-engineer/material-requests`, payload);
          toast.success(`Steel request submitted (${items.length} item${items.length === 1 ? '' : 's'}, ${totalWeight} kg) — sent to Planning`);
          setMaterialRequestDialog(false);
          setMaterialForm({ material_id: '', material_name: '', brand: '', category: '', quantity: '', unit: 'kg', remarks: '', is_approved: true, delivery_choice: '48h', delivery_custom_date: '', emergency_reason: '' });
          resetSteelItems();
          setVendorSuggestion(null);
          setMaterialSearch('');
          fetchData(false);
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Failed to submit steel request');
        }
        return;
      }

      const payload = {
        project_id: projectId,
        quantity: parseFloat(materialForm.quantity),
        unit: materialForm.unit || 'kg',
        remarks: materialForm.remarks || null,
        is_approved_material: materialForm.is_approved,
        brand: materialForm.brand || null,
        se_delivery_choice: materialForm.delivery_choice,
        se_requested_hours: requestedHours,
        se_expected_delivery: expectedDeliveryISO,
        se_emergency_reason: requestedHours < 48 ? materialForm.emergency_reason.trim() : '',
      };
      if (materialForm.material_id) {
        payload.material_id = materialForm.material_id;
      }
      if (materialForm.material_name) {
        payload.material_name = materialForm.material_name;
      }
      
      await axios.post(`${API}/site-engineer/material-requests`, payload);
      toast.success('Material request submitted! Goes to Planning for approval');
      setMaterialRequestDialog(false);
      setMaterialForm({ material_id: '', material_name: '', brand: '', category: '', quantity: '', unit: 'kg', remarks: '', is_approved: true, delivery_choice: '48h', delivery_custom_date: '', emergency_reason: '' });
      setVendorSuggestion(null);
      setMaterialSearch('');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit request');
    }
  };

  const handleLabourRequest = async () => {
    if (!labourForm.labour_type || !labourForm.num_workers || !labourForm.num_days || !labourForm.rate_per_day) {
      toast.error('Please fill all required fields');
      return;
    }
    
    try {
      await axios.post(`${API}/site-engineer/labour-requests`, {
        project_id: projectId,
        labour_type: labourForm.labour_type,
        num_workers: parseInt(labourForm.num_workers),
        num_days: parseInt(labourForm.num_days),
        rate_per_day: parseFloat(labourForm.rate_per_day),
        remarks: labourForm.remarks || null
      });
      toast.success('Labour request submitted! Goes to Planning for approval');
      setLabourRequestDialog(false);
      setLabourForm({ labour_type: '', num_workers: '', num_days: '', rate_per_day: '', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit request');
    }
  };

  const openReceiveDialog = (request) => {
    setReceiveDialog({ open: true, request });
    setReceiveForm({ 
      received_qty: request.quantity.toString(), 
      remarks: '',
      receive_date: new Date().toISOString().split('T')[0],
      receive_time: new Date().toTimeString().slice(0,5)
    });
    // Feb 2026 — prefill per-diameter received qty with the requested weight per
    // diameter (so SE can correct row-by-row if some rods were short).
    const items = request?.steel_specs?.items;
    if (Array.isArray(items) && items.length > 0) {
      setReceivedSteelItems(items.map(it => String(it.calculated_weight_kg || it.weight_kg || 0)));
      setReceivedSteelRods(items.map(it => String(it.rod_count ?? '')));
    } else {
      setReceivedSteelItems([]);
      setReceivedSteelRods([]);
    }
    setMismatchReason('');
    setGpsLocation(null);
    setLorryImageId(null);
    setMaterialImageId(null);
  };

  const handleImageUpload = async (file, type) => {
    if (!file) return;
    // Mobile photos can be 5–15MB; allow up to 25MB.
    if (file.size > 25 * 1024 * 1024) { toast.error('Image must be under 25MB'); return; }
    setUploadingImage(type);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'material_receipt');
    formData.append('project_id', projectId);
    try {
      // Do NOT set Content-Type — axios will generate the multipart boundary automatically.
      const res = await axios.post(`${API}/files/upload`, formData);
      if (type === 'lorry') setLorryImageId(res.data.file_id);
      else setMaterialImageId(res.data.file_id);
      toast.success(`${type === 'lorry' ? 'Lorry' : 'Material'} image uploaded`);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Image upload failed';
      toast.error(typeof msg === 'string' ? msg : 'Image upload failed');
    }
    finally { setUploadingImage(null); }
  };

  const handleInitiateReceive = async () => {
    if (!gpsLocation) {
      toast.error('GPS location required');
      return;
    }
    // Feb 2026 — when steel breakdown is present, the per-diameter rows are
    // the source of truth and `received_qty` becomes the auto-summed total.
    const steelItems = receiveDialog.request?.steel_specs?.items || [];
    const isSteelBreakdown = steelItems.length > 0;
    let receivedQtyFinal = parseFloat(receiveForm.received_qty);
    let steelReceivedPayload = null;
    if (isSteelBreakdown) {
      const parsed = steelItems.map((it, idx) => parseFloat(receivedSteelItems[idx]));
      if (parsed.some(v => isNaN(v) || v < 0)) {
        toast.error('Enter received qty for every diameter (≥ 0)');
        return;
      }
      receivedQtyFinal = parsed.reduce((s, v) => s + v, 0);
      const reqTotal = steelItems.reduce((s, it) => s + Number(it.calculated_weight_kg || it.weight_kg || 0), 0);
      // Feb 12 2026 — surface qty mismatch (per row OR overall total) and
      // force SE to enter a reason so the audit captures WHY received ≠ requested.
      const hasMismatch = Math.abs(receivedQtyFinal - reqTotal) >= 0.01;
      if (hasMismatch && !mismatchReason.trim()) {
        toast.error('Received qty does not match requested. Please enter a reason.');
        return;
      }
      steelReceivedPayload = steelItems.map((it, idx) => {
        const reqW = Number(it.calculated_weight_kg || it.weight_kg) || 0;
        return {
          diameter_mm: it.diameter_mm,
          rod_count: it.rod_count,
          received_rod_count: parseInt(receivedSteelRods[idx], 10) || 0,
          requested_weight_kg: reqW,
          received_weight_kg: parsed[idx],
          diff_kg: Math.round((parsed[idx] - reqW) * 100) / 100,
        };
      });
    } else if (!receivedQtyFinal || receivedQtyFinal <= 0) {
      toast.error('Enter received quantity');
      return;
    }

    try {
      const payload = {
        request_id: receiveDialog.request.request_id,
        received_qty: receivedQtyFinal,
        gps_latitude: gpsLocation.latitude,
        gps_longitude: gpsLocation.longitude,
        receive_date: receiveForm.receive_date,
        receive_time: receiveForm.receive_time,
        lorry_image_id: lorryImageId,
        material_image_id: materialImageId,
        remarks: receiveForm.remarks || null,
      };
      if (steelReceivedPayload) payload.steel_received = steelReceivedPayload;
      if (mismatchReason.trim()) payload.qty_mismatch_reason = mismatchReason.trim();
      // Single-button flow: the backend's receipt endpoint still requires the
      // `collected` checkpoint status, so silently satisfy it here as part of
      // the same submit — the item stays in Transit right up until this
      // Confirm Receipt call actually goes through.
      if (receiveDialog.request.status === 'in_transit') {
        await axios.post(`${API}/site-engineer/material-requests/${receiveDialog.request.request_id}/mark-collected`);
      }
      await axios.post(`${API}/site-engineer/material-receipts/initiate`, payload);

      toast.success('Material receipt recorded');
      setReceiveDialog({ open: false, request: null });
      // Reset form
      setLorryImageId(null);
      setMaterialImageId(null);
      setGpsLocation(null);
      setReceiveForm({ received_qty: '', remarks: '', receive_date: new Date().toISOString().split('T')[0], receive_time: new Date().toTimeString().slice(0,5) });
      setReceivedSteelItems([]);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to record receipt');
    }
  };

  const formatCurrency = (amount) => `₹${amount?.toLocaleString() || 0}`;
  // Single-button flow: in_transit -> [Material Collecting] (opens the full
  // receipt dialog directly) -> Confirm Receipt -> procurement_verifying.
  // The item only leaves Transit once Confirm Receipt is actually submitted —
  // clicking the button alone doesn't move it, since handleInitiateReceive
  // silently marks it collected first (see below) as part of the same submit.
  // `accountant_approved` / `ready_for_delivery` / `received_partial` are legacy statuses that
  // bypass the collected checkpoint and go straight to the full receipt dialog.
  const canReceive = (status) => ['in_transit', 'collected', 'accountant_approved', 'ready_for_delivery', 'received_partial'].includes(status);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!projectData || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Failed to load project</div>
      </div>
    );
  }

  const { project, material_requests, labour_requests } = projectData;
  const myLabourOrders = labour_requests.filter(r => !['approved', 'rejected'].includes(r.status));
  const approvedLabour = labour_requests.filter(r => r.status === 'approved');

  // Lifecycle bucketing — exclude rejected from all views
  const lifecycleItemsRaw = material_requests.filter(r => !['rejected', 'procurement_rejected'].includes((r.status || '').toLowerCase()));
  const lifecycleItems = (() => {
    if (!matReqDateRange?.from || !matReqDateRange?.to) return lifecycleItemsRaw;
    const fromTs = new Date(matReqDateRange.from + 'T00:00:00').getTime();
    const toTs = new Date(matReqDateRange.to + 'T23:59:59').getTime();
    return lifecycleItemsRaw.filter(r => {
      const t = new Date(r.created_at || 0).getTime();
      return t >= fromTs && t <= toTs;
    });
  })();
  const bucketCounts = lifecycleItems.reduce((acc, r) => {
    acc.all = (acc.all || 0) + 1;
    const b = bucketForMaterial(r);
    acc[b] = (acc[b] || 0) + 1;
    return acc;
  }, {});
  const visibleLifecycleItems = (materialBucket === 'all'
    ? lifecycleItems
    : lifecycleItems.filter(r => bucketForMaterial(r) === materialBucket))
    .slice()
    .sort((a, b) => {
      // High Priority items float to the top so the SE sees urgent Collects first.
      const ap = a.is_high_priority ? 1 : 0;
      const bp = b.is_high_priority ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Standard App Header (Planning-style) */}
      <AppHeader
        user={user}
        headerActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/site-engineer'}
            className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
            data-testid="back-to-projects-btn"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        }
      />

      <div className="max-w-6xl mx-auto px-3 py-3 sm:px-6 sm:py-6">
        {/* Compact Project Header */}
        <div className="bg-gradient-to-r from-amber-50 via-white to-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 mb-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="bg-amber-100 p-2 rounded-lg shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate" data-testid="project-name-heading">{project.name}</h1>
              <div className="flex items-center gap-3 sm:gap-4 mt-1 flex-wrap text-sm text-gray-600">
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5 text-amber-600" /> {project.client_name}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-amber-600" /> {project.location}</span>
                {project.building_type && (
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-amber-600" /> {project.building_type}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Attendance Button — REMOVED (DLR & DPR tab now handles attendance via DLR popup) */}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'materials') setMaterialsSubTab('requests'); }}>
          <TabsList className="mb-3 sm:mb-6 w-full grid grid-cols-4">
            <TabsTrigger value="dlr_dpr" className="gap-1 sm:gap-2 text-sm sm:text-base" data-testid="tab-dlr-dpr">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">DLR &amp; DPR</span>
              <span className="sm:hidden">DLR/DPR</span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-1 sm:gap-2 text-sm sm:text-base">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Materials</span>
              <span className="sm:hidden">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="work_orders" className="gap-1 sm:gap-2 text-sm sm:text-base" data-testid="tab-work-orders">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Work Order (Labour)</span>
              <span className="sm:hidden">WO (Labour)</span>
            </TabsTrigger>
            <TabsTrigger value="curing" className="gap-1 sm:gap-2 text-sm sm:text-base" data-testid="tab-curing-video">
              <Video className="h-4 w-4" />
              <span>Curing</span>
            </TabsTrigger>
          </TabsList>

          {/* DLR & DPR TAB — Daily Labour Report + Daily Progress Report  +  Payment Schedule (read-only) */}
          <TabsContent value="dlr_dpr">
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-600" /> DLR &amp; DPR
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Daily Labour Report &amp; Daily Progress Report submitted by Site Engineer</CardDescription>
                  </div>
                </div>
                {/* Feb 20 2026 — Removed the Payment Schedule sub-tab from
                    Site Engineer's DLR & DPR view at user's request. SE
                    doesn't need the payment-schedule read-only mirror here
                    (it's still available on the Accountant side). */}
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-3 space-y-4">
                {dlrSubTab === 'dlr' ? (
                  <>
                    {/* DLR card — single unified entry point (DPR captured inside DLR popup) */}
                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-white p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                          <ClipboardList className="h-4 w-4 text-amber-700" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">Daily Labour Report (DLR) &amp; Daily Progress Report (DPR)</h3>
                          <p className="text-[11px] text-gray-500">Labour headcount + Current stage + Work summary — captured in one form</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        Open the Work Order → click <span className="font-semibold">+ DLR</span> to capture today&apos;s
                        labour deployment along with the Current Project Stage and Work Summary (DPR).
                      </p>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-1 w-full sm:w-auto"
                        onClick={() => setActiveTab('work_orders')}
                        data-testid="open-dlr-btn"
                      >
                        <Calendar className="h-3.5 w-3.5" /> Open Today&apos;s DLR &amp; DPR
                      </Button>
                    </div>

                    {/* Quick metric strip — today's summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="rounded-xl border bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Today&apos;s Labour</p>
                        <p className="text-base font-bold text-amber-700 mt-0.5">{dailyLabourCount}</p>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Last DPR</p>
                        <p className="text-base font-bold text-emerald-700 mt-0.5">{lastDPRDate ? new Date(lastDPRDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'}</p>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Active Contractors</p>
                        <p className="text-base font-bold text-blue-700 mt-0.5">{activeContractorsCount}</p>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Open Hindrances</p>
                        <p className="text-base font-bold text-rose-700 mt-0.5">{openHindrancesCount}</p>
                      </div>
                    </div>

                    {/* Overall DLR & DPR submissions list */}
                    <ProjectDLRDPRList projectId={projectId} />
                  </>
                ) : (
                  /* PAYMENT SCHEDULE — read-only view */
                  <div className="rounded-xl border bg-white overflow-hidden" data-testid="se-payment-schedule">
                    <div className="px-3 sm:px-4 py-2.5 border-b bg-gray-50/60 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-semibold text-gray-900">Payment Schedule ({paymentStages.length})</span>
                      </div>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">View only</span>
                    </div>
                    {paymentStagesLoading ? (
                      <p className="text-center text-gray-400 text-xs py-6">Loading…</p>
                    ) : paymentStages.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <IndianRupee className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">No payment stages set up yet.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Stage</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Received</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600">Balance</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {paymentStages.map((s, i) => {
                              const bal = (s.amount || 0) - (s.amount_received || 0);
                              const pct = s.amount ? Math.round(((s.amount_received || 0) / s.amount) * 100) : 0;
                              const statusColor = s.status === 'paid' ? 'bg-green-100 text-green-700' : s.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600';
                              return (
                                <tr key={s.stage_id} className="hover:bg-gray-50" data-testid={`se-ps-row-${s.stage_id}`}>
                                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                                  <td className="px-3 py-2 font-medium">{s.stage_name}</td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(s.amount)}</td>
                                  <td className="px-3 py-2 text-right text-green-700">{formatCurrency(s.amount_received || 0)}</td>
                                  <td className="px-3 py-2 text-right text-red-600">{formatCurrency(bal)}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
                                      {s.status === 'paid' ? `Collected (${pct}%)` : s.status === 'partial' ? `Partial (${pct}%)` : 'Pending'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-500">
                                    {s.completed_date
                                      ? new Date(s.completed_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                      : s.due_date
                                        ? new Date(s.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MATERIALS TAB (with Requests | Inventory sub-tabs) */}
          <TabsContent value="materials">
            {/* Materials sub-tabs: Requests | Inventory */}
            <div className="flex gap-1 mb-3 border-b">
              <button
                onClick={() => setMaterialsSubTab('requests')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${materialsSubTab === 'requests' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                data-testid="mat-subtab-requests"
              >
                Material Requests
              </button>
              <button
                onClick={() => { setMaterialsSubTab('inventory'); fetchStockData(stockDate); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${materialsSubTab === 'inventory' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                data-testid="mat-subtab-inventory"
              >
                Inventory
              </button>
            </div>
            {materialsSubTab === 'requests' && (
            <Card>
              <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg">Materials</CardTitle>
                  <CardDescription className="text-xs sm:text-sm hidden sm:block">Request and collect materials across the lifecycle</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <MetaDateFilter value={matReqDateRange} onChange={setMatReqDateRange} defaultPreset={null} />
                <Dialog open={materialRequestDialog} onOpenChange={(open) => {
                  setMaterialRequestDialog(open);
                  if (!open) {
                    setMaterialForm({ material_id: '', material_name: '', brand: '', category: '', quantity: '', unit: 'kg', remarks: '', is_approved: true, is_locked_from_package: false, locked_estimated_rate: null });
                    setMaterialSearch('');
                    setVendorSuggestion(null);
                    resetSteelItems();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button data-testid="request-material-btn" size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700 text-xs sm:text-sm whitespace-nowrap">
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Request</span> Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] sm:max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Request Material</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">Choose from approved list or request custom material</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="bg-gray-50 p-2 sm:p-3 rounded-lg text-xs sm:text-sm">
                        <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
                        <p><strong>Site:</strong> {project.name}</p>
                      </div>

                      {/* Toggle: Approved vs Custom */}
                      <div className="flex rounded-lg border overflow-hidden" data-testid="material-type-toggle">
                        <button
                          type="button"
                          className={`flex-1 px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${materialForm.is_approved ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                          onClick={() => {
                            setMaterialForm({ ...materialForm, is_approved: true, material_id: '', material_name: '', brand: '', category: '', unit: 'kg', is_locked_from_package: false, locked_estimated_rate: null });
                            setMaterialSearch('');
                          }}
                          data-testid="toggle-approved-materials"
                        >
                          Approved Materials
                        </button>
                        <button
                          type="button"
                          className={`flex-1 px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${!materialForm.is_approved ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                          onClick={() => {
                            setMaterialForm({ ...materialForm, is_approved: false, material_id: '', material_name: '', brand: '', category: '', unit: 'kg', is_locked_from_package: false, locked_estimated_rate: null });
                            setMaterialSearch('');
                          }}
                          data-testid="toggle-custom-material"
                        >
                          Custom / Other
                        </button>
                      </div>

                      {materialForm.is_approved ? (
                        <>
                          {/* Search & select from approved list — collapsible dropdown */}
                          <div ref={materialDropdownRef} className="relative">
                            <Label className="text-xs sm:text-sm">Search Approved Material *</Label>
                            <Input
                              value={materialForm.material_id ? (materialForm.material_name + (materialForm.brand ? ` · ${materialForm.brand}` : '')) : materialSearch}
                              onChange={(e) => {
                                // Typing clears the previous selection and re-opens results
                                setMaterialSearch(e.target.value);
                                if (materialForm.material_id) {
                                  setMaterialForm({ ...materialForm, material_id: '', material_name: '', brand: '', category: '', is_locked_from_package: false, locked_estimated_rate: null });
                                }
                                setMaterialDropdownOpen(true);
                              }}
                              onFocus={() => setMaterialDropdownOpen(true)}
                              onClick={() => setMaterialDropdownOpen(true)}
                              placeholder="Search by name or brand..."
                              className="text-sm pr-8"
                              data-testid="approved-material-search"
                              autoComplete="off"
                            />
                            {(materialForm.material_id || materialSearch) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMaterialSearch('');
                                  setMaterialForm({ ...materialForm, material_id: '', material_name: '', brand: '', category: '', is_locked_from_package: false, locked_estimated_rate: null });
                                  setMaterialDropdownOpen(false);
                                }}
                                className="absolute right-2 top-[28px] h-7 w-7 flex items-center justify-center text-gray-400 hover:text-red-500"
                                data-testid="approved-material-clear"
                                aria-label="Clear"
                              >×</button>
                            )}

                            {/* Approved material list — only visible when dropdown is open */}
                            {materialDropdownOpen && (
                              <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto border rounded-lg divide-y bg-white shadow-lg" data-testid="approved-materials-list">
                                {approvedMaterials
                                  .filter(m => {
                                    const q = materialSearch.toLowerCase();
                                    return !q
                                      || (m.name || '').toLowerCase().includes(q)
                                      || (m.brand || '').toLowerCase().includes(q)
                                      || (m.category || '').toLowerCase().includes(q);
                                  })
                                  .map(mat => {
                                    const isSelected = materialForm.material_id === mat.material_id;
                                    const isProjectApproved = mat.project_approved || mat.source === 'project' || mat.source === 'package';
                                    return (
                                      <button
                                        key={mat.material_id}
                                        type="button"
                                        className={`w-full text-left px-3 py-2 text-xs sm:text-sm transition-colors ${isSelected ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'hover:bg-gray-50'}`}
                                        onClick={() => {
                                          // Detect Steel via category OR name (fallback if tag missing)
                                          const steelDetected = (mat.category || '').toLowerCase() === 'steel'
                                            || (mat.name || '').toLowerCase().includes('steel');
                                          setMaterialForm({
                                            ...materialForm,
                                            material_id: mat.material_id,
                                            material_name: mat.name,
                                            brand: mat.brand || '',
                                            category: mat.category || (steelDetected ? 'steel' : ''),
                                            unit: steelDetected ? 'kg' : (mat.unit || 'kg'),
                                            is_locked_from_package: !!mat.is_locked_from_package,
                                            locked_estimated_rate: mat.locked_estimated_rate ?? null,
                                          });
                                          if (steelDetected) resetSteelItems();
                                          setMaterialSearch('');
                                          setMaterialDropdownOpen(false);
                                          fetchVendorSuggestion(mat.name);
                                        }}
                                        data-testid={`approved-mat-${mat.material_id}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <span className="font-medium">{mat.name}</span>
                                            {mat.brand && (
                                              <span className="ml-2 text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{mat.brand}</span>
                                            )}
                                            {isProjectApproved && (
                                              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">project</span>
                                            )}
                                            {mat.is_locked_from_package && mat.locked_estimated_rate > 0 && (
                                              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200" title="Planning-locked price">
                                                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3v3H6v-3c0-1.657 1.343-3 3-3s3 1.343 3 3z"/></svg>
                                                ₹{Number(mat.locked_estimated_rate).toLocaleString('en-IN')}/{mat.unit || 'unit'}
                                              </span>
                                            )}
                                            {!isProjectApproved && mat.category && (
                                              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium capitalize">{mat.category}</span>
                                            )}
                                          </div>
                                          <span className="text-gray-400 text-xs flex-shrink-0">{mat.unit}</span>
                                        </div>
                                        {mat.specification && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{mat.specification}</p>}
                                      </button>
                                    );
                                  })}
                                {approvedMaterials.length === 0 && (
                                  <div className="text-center py-4 text-gray-400 text-xs">No materials available — try Custom / Other</div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Selected material summary */}
                          {materialForm.material_id && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5" data-testid="selected-material-info">
                              <p className="text-xs sm:text-sm font-medium text-amber-800">{materialForm.material_name}</p>
                              {materialForm.brand && <p className="text-xs text-amber-600">Brand: {materialForm.brand}</p>}
                              {materialForm.is_locked_from_package && materialForm.locked_estimated_rate > 0 && (
                                <p className="text-xs text-amber-700 mt-1 flex items-center gap-1" data-testid="locked-price-chip">
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3v3H6v-3c0-1.657 1.343-3 3-3s3 1.343 3 3z"/></svg>
                                  Locked by Planning: <span className="font-semibold">₹{Number(materialForm.locked_estimated_rate).toLocaleString('en-IN')}</span> per {materialForm.unit}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Custom material entry */}
                          <div>
                            <Label className="text-xs sm:text-sm">Material Name *</Label>
                            <Input
                              value={materialForm.material_name}
                              onChange={(e) => setMaterialForm({ ...materialForm, material_name: e.target.value })}
                              onBlur={(e) => fetchVendorSuggestion(e.target.value)}
                              placeholder="e.g., TMT Steel 12mm, Cement OPC 53, Sand River"
                              className="text-sm"
                              data-testid="custom-material-name-input"
                            />
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm">Brand (optional)</Label>
                            <Input
                              value={materialForm.brand}
                              onChange={(e) => setMaterialForm({ ...materialForm, brand: e.target.value })}
                              placeholder="e.g., UltraTech, Tata Tiscon"
                              className="text-sm"
                              data-testid="custom-material-brand-input"
                            />
                          </div>
                        </>
                      )}

                      {/* Quantity + Unit OR Steel-specific block (Feb 2026).
                          When the selected material is tagged with
                          category="steel", show diameter / rod-count /
                          auto-calc weight + multi-item rows ("+ Add Another
                          Item"). All other materials keep the simple
                          Quantity + Unit input. */}
                      {isSteelSelected ? (
                        <div className="space-y-2" data-testid="steel-multi-rows">
                          {steelItems.map((row, idx) => {
                            const w = calcSteelWeightKg(row.diameter, row.rod_count);
                            return (
                              <div key={idx} className="border rounded-lg p-2.5 bg-slate-50 space-y-2 relative" data-testid={`steel-row-${idx}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-700">Item {idx + 1} <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">STEEL</span></span>
                                  {steelItems.length > 1 && (
                                    <button type="button" onClick={() => setSteelItems(items => items.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 text-xs" data-testid={`steel-row-${idx}-remove`}>× Remove</button>
                                  )}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-[10px] sm:text-xs">Diameter (mm) *</Label>
                                    <select
                                      value={row.diameter}
                                      onChange={(e) => setSteelItems(items => items.map((it, i) => i === idx ? { ...it, diameter: parseFloat(e.target.value), weight: calcSteelWeightKg(e.target.value, it.rod_count) } : it))}
                                      className="w-full mt-1 h-9 text-sm border rounded px-2 bg-white"
                                      data-testid={`steel-row-${idx}-diameter`}
                                    >
                                      {STEEL_DIAMETERS_MM.map(d => <option key={d} value={d}>{d} mm</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] sm:text-xs">No. of Rods ({STEEL_ROD_LENGTH_FT} ft) *</Label>
                                    <NumericInput
                                      value={row.rod_count}
                                      onChange={(e) => setSteelItems(items => items.map((it, i) => i === idx ? { ...it, rod_count: e.target.value, weight: calcSteelWeightKg(it.diameter, e.target.value) } : it))}
                                      placeholder="e.g. 9"
                                      className="text-sm mt-1"
                                      data-testid={`steel-row-${idx}-rods`}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] sm:text-xs">Calculated Weight (kg)</Label>
                                    <div className="mt-1 h-9 px-2 flex items-center text-sm font-semibold rounded border bg-amber-50 text-amber-700" data-testid={`steel-row-${idx}-weight`}>
                                      {w ? `${w} kg` : '—'}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-[10px] sm:text-xs">Item Remarks (optional)</Label>
                                  <Input
                                    value={row.remarks}
                                    onChange={(e) => setSteelItems(items => items.map((it, i) => i === idx ? { ...it, remarks: e.target.value } : it))}
                                    placeholder="Any notes for this item..."
                                    className="text-sm mt-1"
                                    data-testid={`steel-row-${idx}-remarks`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setSteelItems(items => [...items, { diameter: 8, rod_count: '', weight: 0, remarks: '' }])}
                            className="w-full border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg py-2 text-xs sm:text-sm font-medium flex items-center justify-center gap-1"
                            data-testid="steel-add-item-btn"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Another Item
                          </button>
                          {/* Steel totals — sums weight & rod count across every row. */}
                          {(() => {
                            const validRows = steelItems.filter(r => r.diameter && parseInt(r.rod_count, 10) > 0);
                            const totalRods = validRows.reduce((s, r) => s + parseInt(r.rod_count, 10), 0);
                            const totalWeight = validRows.reduce((s, r) => s + calcSteelWeightKg(r.diameter, r.rod_count), 0);
                            return (
                              <>
                                <div className="mt-2 border-2 border-amber-300 rounded-lg bg-amber-50 p-2.5 flex items-center justify-between" data-testid="steel-totals">
                                  <div className="text-xs sm:text-sm text-amber-900 font-semibold">
                                    Total: <span className="text-base sm:text-lg">{validRows.length}</span> item{validRows.length === 1 ? '' : 's'} · <span className="text-base sm:text-lg">{totalRods}</span> rod{totalRods === 1 ? '' : 's'}
                                  </div>
                                  <div className="text-sm sm:text-base font-bold text-amber-700" data-testid="steel-total-weight">
                                    {Math.round(totalWeight * 100) / 100} kg
                                  </div>
                                </div>
                                {/* Feb 12 2026 — user-visible Quantity (kg) field
                                    for Steel. Auto-mirrors the calculated total
                                    above but stays editable so SE can override
                                    when site receives a slightly different
                                    weight than the formula. Submission picks
                                    whichever is most recent (override or auto). */}
                                <div className="mt-2">
                                  <Label className="text-xs sm:text-sm">Quantity (kg) *</Label>
                                  <NumericInput
                                    value={materialForm.quantity === '' ? String(Math.round(totalWeight * 100) / 100 || '') : materialForm.quantity}
                                    onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })}
                                    placeholder="Auto-fills with total weight"
                                    className="text-sm"
                                    data-testid="steel-total-quantity-input"
                                  />
                                  <p className="text-[10px] text-gray-500 mt-0.5">Auto-filled from rods × weight. Edit if site actuals differ.</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs sm:text-sm">Quantity *</Label>
                            <NumericInput 
                              value={materialForm.quantity}
                              onChange={(e) => setMaterialForm({...materialForm, quantity: e.target.value})}
                              placeholder="Enter quantity"
                              className="text-sm"
                              data-testid="material-quantity-input"
                            />
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm flex items-center gap-1">
                              Unit
                              {materialForm.is_locked_from_package && (
                                <svg className="h-3 w-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-testid="unit-lock-icon"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3v3H6v-3c0-1.657 1.343-3 3-3s3 1.343 3 3z"/></svg>
                              )}
                            </Label>
                            <UnitSelect value={materialForm.unit} onChange={(v) => setMaterialForm({...materialForm, unit: v})} disabled={materialForm.is_locked_from_package} data-testid="material-unit-select" />
                          </div>
                        </div>
                      )}
                      {vendorSuggestion && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-2" data-testid="vendor-suggestion-banner">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <div className="text-xs sm:text-sm">
                            <span className="text-green-800 font-medium">Pre-assigned Vendor:</span>{' '}
                            <span className="text-green-700">{vendorSuggestion.vendor_name}</span>
                            {vendorSuggestion.brand && <span className="text-green-600 ml-1">({vendorSuggestion.brand})</span>}
                            <span className="text-green-500 ml-1">- {vendorSuggestion.category}</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs sm:text-sm">Remarks</Label>
                        <Textarea 
                          value={materialForm.remarks}
                          onChange={(e) => setMaterialForm({...materialForm, remarks: e.target.value})}
                          placeholder="Notes..."
                          rows={2}
                          className="text-sm"
                        />
                      </div>

                      {/* Expected Delivery Time — SE picks 24h / 48h / Custom Date.
                          Standard SLA is 48h. Below 48h triggers an emergency-reason input. */}
                      <div className="border rounded-lg p-2.5 bg-amber-50/30 border-amber-200" data-testid="se-delivery-section">
                        <Label className="text-xs sm:text-sm font-semibold text-amber-800 mb-1.5 block">Expected Delivery</Label>
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {[
                            { v: '24h',    label: '24 Hours' },
                            { v: '48h',    label: '48 Hours' },
                            { v: 'custom', label: 'Custom' },
                          ].map(opt => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => setMaterialForm({ ...materialForm, delivery_choice: opt.v, ...(opt.v !== 'custom' ? { delivery_custom_date: '' } : {}) })}
                              className={`px-2 py-1.5 text-xs rounded border transition-all ${
                                materialForm.delivery_choice === opt.v
                                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                  : 'bg-white border-gray-200 text-gray-700 hover:border-amber-300'
                              }`}
                              data-testid={`se-delivery-${opt.v}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {materialForm.delivery_choice === 'custom' && (
                          <Input
                            type="datetime-local"
                            value={materialForm.delivery_custom_date}
                            onChange={(e) => setMaterialForm({ ...materialForm, delivery_custom_date: e.target.value })}
                            min={new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16)}
                            className="text-sm mb-2"
                            data-testid="se-delivery-custom"
                          />
                        )}
                        {/* Emergency reason — required when SE picks <48h */}
                        {(materialForm.delivery_choice === '24h' ||
                          (materialForm.delivery_choice === 'custom' && materialForm.delivery_custom_date &&
                           ((new Date(materialForm.delivery_custom_date) - new Date()) / 36e5) < 48)) && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 mt-1.5" data-testid="se-emergency-box">
                            <Label className="text-xs font-semibold text-red-700 mb-0.5 block">⚠ Emergency Reason *</Label>
                            <p className="text-[10px] text-red-600 mb-1">Standard delivery SLA is 48 hours. Please justify the urgency.</p>
                            <Textarea
                              rows={2}
                              value={materialForm.emergency_reason}
                              onChange={(e) => setMaterialForm({ ...materialForm, emergency_reason: e.target.value })}
                              placeholder="Why is this needed sooner than 48h?"
                              className="text-sm"
                              data-testid="se-emergency-reason"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" size="sm" onClick={() => setMaterialRequestDialog(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleMaterialRequest} data-testid="submit-material-request-btn">
                        <Send className="h-3 w-3 mr-1" />Submit
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                {/* Unified lifecycle filter cards (mirrors Procurement / Planning) */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 mb-3" data-testid="se-mat-lifecycle-cards">
                  {LIFECYCLE_BUCKETS.map(b => {
                    const Icon = b.Icon;
                    const active = materialBucket === b.key;
                    const count = bucketCounts[b.key] || 0;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setMaterialBucket(b.key)}
                        className={`flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-md border text-[10px] sm:text-[11px] font-medium transition-all min-h-[58px] ${
                          active ? b.active + ' shadow-sm' : b.cls + ' hover:shadow-sm'
                        }`}
                        data-testid={`se-mat-bucket-${b.key}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="leading-tight text-center">{b.label}</span>
                        <span className={`text-xs font-bold ${active ? 'text-white' : ''}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Filtered request list */}
                {visibleLifecycleItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                    <p className="text-sm">No requests in this bucket</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3" data-testid="se-mat-list">
                    {visibleLifecycleItems.map(req => {
                      const bKey = bucketForMaterial(req);
                      const isReceivable = canReceive(req.status);
                      const accentMap = {
                        planning_initial: 'border-l-yellow-500',
                        awaiting_procurement: 'border-l-amber-500',
                        planning_awaiting: 'border-l-lime-500',
                        revision: 'border-l-orange-500',
                        awaiting_accountant: 'border-l-cyan-500',
                        transit: 'border-l-sky-500',
                        delivered: 'border-l-emerald-500',
                        all: 'border-l-violet-500',
                      };
                      return (
                        <Card
                          key={req.request_id}
                          className={`border-l-4 ${req.is_high_priority ? 'border-l-red-600 ring-2 ring-red-300' : (accentMap[bKey] || 'border-l-amber-500')} cursor-pointer hover:shadow-md transition-all relative`}
                          onClick={() => setSelectedOrder(req)}
                          data-testid={`se-mat-card-${req.request_id}`}
                        >
                          {req.is_high_priority && (
                            <div
                              className="absolute -top-2 left-3 z-10 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide shadow-md flex items-center gap-1"
                              data-testid={`se-mat-priority-ribbon-${req.request_id}`}
                            >
                              ⚡ High Priority
                            </div>
                          )}
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h4 className="text-sm font-semibold truncate">{req.material_name}</h4>
                                  <StatusBadge status={req.status} />
                                </div>
                                <div className="text-xs text-gray-600 space-y-0.5">
                                  <p><strong>ID:</strong> {req.request_number || req.order_id || req.request_id}</p>
                                  <p><strong>Qty:</strong> {req.quantity} {req.unit}</p>
                                  {req.brand && (
                                    <p className="text-blue-600"><strong>Brand:</strong> {req.brand}</p>
                                  )}
                                  {/* Steel multi-item breakdown — render every row from
                                      steel_specs.items[] so SE/Planning see the complete
                                      composition in a single card (was previously one
                                      card per item which was noisy). Falls back to the
                                      legacy single-row display for older requests. */}
                                  {req.steel_specs?.items?.length > 0 ? (
                                    <div className="mt-1 border border-amber-300 rounded bg-amber-50 p-1.5" data-testid={`se-mat-steel-${req.request_id}`}>
                                      <p className="text-[10px] font-semibold text-amber-800 uppercase mb-1">
                                        ⚙ Steel — {req.steel_specs.total_items} item{req.steel_specs.total_items === 1 ? '' : 's'} · {req.steel_specs.total_rods} rods · {req.steel_specs.total_weight_kg} kg
                                      </p>
                                      <table className="w-full text-[10px]">
                                        <thead className="text-gray-500 uppercase">
                                          <tr><th className="text-left">#</th><th className="text-left">Diameter</th><th className="text-right">Rods (40 ft)</th><th className="text-right">Weight</th></tr>
                                        </thead>
                                        <tbody>
                                          {req.steel_specs.items.map((it, ii) => (
                                            <tr key={ii} className="border-t border-amber-200">
                                              <td>{ii + 1}</td>
                                              <td className="font-semibold text-slate-800">Ø {it.diameter_mm} mm</td>
                                              <td className="text-right">{it.rod_count}</td>
                                              <td className="text-right font-semibold text-amber-700">{it.calculated_weight_kg} kg</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : req.steel_specs ? (
                                    <p className="text-[11px] text-amber-700"><strong>Steel:</strong> Ø{req.steel_specs.diameter_mm}mm × {req.steel_specs.rod_count} rods = {req.steel_specs.calculated_weight_kg} kg</p>
                                  ) : null}
                                  {(req.assigned_vendor_name || req.vendor_name) && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="font-medium text-blue-700">Vendor:</span> {req.vendor_name || req.assigned_vendor_name}
                                      {req.po_id && <Badge variant="outline" className="text-[9px] ml-1 border-green-300 text-green-700">PO: {req.po_id}</Badge>}
                                    </div>
                                  )}
                                  {req.payment_mode && (
                                    <p className="text-purple-700"><strong>Payment:</strong> {req.payment_mode}</p>
                                  )}
                                </div>
                                <MaterialStageFlow status={req.status} />
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* High Priority toggle — visible in every bucket so SE can flag
                                    an urgent request at any lifecycle stage. Propagates to
                                    Procurement / Planning / Accountant views via is_high_priority. */}
                                <button
                                  type="button"
                                  title={req.is_high_priority ? 'Clear High Priority' : 'Mark High Priority'}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await axios.patch(`${API}/procurement-simple/material-requests/${req.request_id}/toggle-priority`, { is_high_priority: !req.is_high_priority });
                                      toast.success(!req.is_high_priority ? 'Marked High Priority' : 'Priority cleared');
                                      fetchData(false);
                                    } catch (err) {
                                      toast.error(err.response?.data?.detail || 'Failed to update priority');
                                    }
                                  }}
                                  className={`h-7 px-2 flex items-center gap-1 rounded border text-[10px] font-semibold transition-colors ${
                                    req.is_high_priority
                                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                                      : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                                  }`}
                                  data-testid={`se-mat-priority-btn-${req.request_id}`}
                                >
                                  {req.is_high_priority ? '★ ON' : '☆ Priority'}
                                </button>
                                {/* Delete: SE can delete their own material request ONLY while
                                    Planning hasn't approved it yet. Once any approval flag is
                                    set (planning_initial / PM / procurement / final) the delete
                                    icon disappears so audit chain is preserved. */}
                                {(req.status || '').toLowerCase() === 'planning_initial_pending' && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!window.confirm(`Delete material request ${req.request_number || req.order_id || req.request_id}? This cannot be undone.`)) return;
                                      try {
                                        await axios.delete(`${API}/site-engineer/material-requests/${req.request_id}`);
                                        toast.success('Material request deleted');
                                        fetchData(false);
                                      } catch (err) {
                                        toast.error(err.response?.data?.detail || 'Failed to delete');
                                      }
                                    }}
                                    className="h-7 w-7 flex items-center justify-center rounded text-red-500 hover:text-red-700 hover:bg-red-50"
                                    title="Delete request"
                                    data-testid={`se-mat-delete-${req.request_id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {isReceivable && (
                                  <Button
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); openReceiveDialog(req); }}
                                    className="gap-1 bg-green-600 hover:bg-green-700 text-xs whitespace-nowrap"
                                    data-testid={`receive-btn-${req.request_id}`}
                                  >
                                    <Package className="h-3 w-3" />Material Collecting
                                  </Button>
                                )}
                                <Eye className="h-4 w-4 text-gray-400" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </TabsContent>

          {/* WORK ORDERS TAB — Redesigned (V2) */}
          <TabsContent value="work_orders">
            <SiteEngineerWorkOrdersV2 projectId={projectId} />
          </TabsContent>

          {/* INVENTORY (rendered as second pane within Materials tab) */}
          <TabsContent value="materials" forceMount={false}>
            {materialsSubTab === 'inventory' && (
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-amber-600" />
                      Daily Inventory Register
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Auto-tracks stock from each material receipt — opening, received, used, closing.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <MetaDateFilter value={inventoryDateRange} onChange={setInventoryDateRange} defaultPreset={null} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="space-y-4">

                  {/* Current Stock Dashboard */}
                  {inventoryDashboard && (
                    <div data-testid="inventory-dashboard">
                      {/* Current Stock Summary Table */}
                      {inventoryDashboard.materials?.length > 0 && (
                        <div className="border rounded-lg overflow-hidden mb-3" data-testid="current-stock-table">
                          <div className="bg-gray-800 text-white px-3 py-2 text-xs font-semibold flex items-center gap-1">
                            <Warehouse className="h-3 w-3" /> Current Stock Levels
                          </div>
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 border-b">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-600">Material</th>
                                <th className="text-center px-2 py-2 font-medium text-gray-600">Unit</th>
                                <th className="text-center px-2 py-2 font-medium text-blue-700">Current Stock</th>
                                <th className="text-center px-2 py-2 font-medium text-green-700">Last In At</th>
                                <th className="text-center px-2 py-2 font-medium text-red-700">Last Out At</th>
                                <th className="text-center px-2 py-2 font-medium text-green-700">Total Received</th>
                                <th className="text-center px-2 py-2 font-medium text-red-700">Total Used</th>
                                <th className="text-center px-2 py-2 font-medium text-amber-700">Min</th>
                                <th className="text-center px-2 py-2 font-medium text-gray-600">Status</th>
                                <th className="text-center px-2 py-2 font-medium text-gray-600">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {inventoryDashboard.materials.map((m, i) => {
                                const fmtAt = (s) => {
                                  if (!s) return '—';
                                  try { return new Date(s).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; }
                                };
                                return (
                                <tr
                                  key={m.material_name}
                                  className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${m.is_low_stock ? 'bg-red-50' : ''} cursor-pointer hover:bg-amber-50/50 transition-colors`}
                                  onClick={() => openStockHistory(m.material_name)}
                                  data-testid={`inv-row-${m.material_name}`}
                                >
                                  <td className="px-3 py-2 font-medium">{m.material_name}</td>
                                  <td className="px-2 py-2 text-center text-gray-500">{m.unit}</td>
                                  <td className={`px-2 py-2 text-center font-bold ${m.is_low_stock ? 'text-red-700' : 'text-blue-700'}`}>{m.current_stock}</td>
                                  <td className="px-2 py-2 text-center text-gray-600 whitespace-nowrap">{fmtAt(m.last_in_at)}</td>
                                  <td className="px-2 py-2 text-center text-gray-600 whitespace-nowrap">{fmtAt(m.last_out_at)}</td>
                                  <td className="px-2 py-2 text-center text-green-700">{m.total_received}</td>
                                  <td className="px-2 py-2 text-center text-red-600">{m.total_used}</td>
                                  <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      type="number" min="0"
                                      className="h-6 w-16 text-center text-[11px] border-amber-200"
                                      defaultValue={m.min_threshold || ''}
                                      onBlur={(e) => {
                                        const val = Number(e.target.value);
                                        if (val !== (m.min_threshold || 0)) handleUpdateThreshold(m.material_name, val);
                                      }}
                                      data-testid={`inv-threshold-${m.material_name}`}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    {m.is_low_stock ? (
                                      <Badge className="bg-red-100 text-red-700 text-[10px]" data-testid={`inv-alert-${m.material_name}`}>LOW</Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-700 text-[10px]">OK</Badge>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] gap-1 border-red-300 text-red-700 hover:bg-red-50"
                                      onClick={() => setConsumeDialog({ open: true, material: m, qty: '', notes: '' })}
                                      disabled={m.current_stock <= 0}
                                      data-testid={`inv-consume-${m.material_name}`}
                                    >
                                      <ArrowRight className="h-3 w-3" /> Out Stock
                                    </Button>
                                  </td>
                                </tr>
                              );})}
                            </tbody>
                          </table>
                          <p className="text-[10px] text-gray-400 px-3 py-1 border-t bg-gray-50">
                            Click any row to see date-wise stock history. "Out Stock" records consumption with timestamp.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            )}
          </TabsContent>

          {/* DAILY PROGRESS TAB */}
          <TabsContent value="daily_progress">
            <Card>
              <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    Daily Progress
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Log daily updates for this project</CardDescription>
                </div>
                <Dialog open={dailyProgressDialog} onOpenChange={setDailyProgressDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm" data-testid="todays-update-btn">
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" /> Today's Update
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] sm:max-w-lg mx-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Daily Progress Report</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">Log today's work update</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="bg-blue-50 p-3 rounded-lg text-xs sm:text-sm space-y-1">
                        <p><strong>Project:</strong> {project.name}</p>
                        <p><strong>Date:</strong> {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p><strong>Day:</strong> {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</p>
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Current Project Stage</Label>
                        <Select value={dailyProgressForm.current_stage} onValueChange={(v) => setDailyProgressForm({...dailyProgressForm, current_stage: v})}>
                          <SelectTrigger className="text-xs sm:text-sm" data-testid="progress-stage-select">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {['Foundation', 'Plinth', 'Ground Floor Slab', 'First Floor Slab', 'Second Floor Slab', 'Roof Slab', 'Brickwork', 'Plastering', 'Electrical', 'Plumbing', 'Flooring', 'Painting', 'Finishing', 'Handover'].map(s => (
                              <SelectItem key={s} value={s} className="text-xs sm:text-sm">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Work Summary *</Label>
                        <Textarea
                          value={dailyProgressForm.summary}
                          onChange={(e) => setDailyProgressForm({...dailyProgressForm, summary: e.target.value})}
                          placeholder="Describe today's work progress, activities completed, any issues..."
                          rows={4}
                          className="text-sm"
                          data-testid="progress-summary-input"
                        />
                      </div>
                    </div>
                    <DialogFooter className="gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDailyProgressDialog(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveDailyProgress} disabled={savingProgress} className="bg-blue-600 hover:bg-blue-700" data-testid="save-progress-btn">
                        <Save className="h-3 w-3 mr-1" />{savingProgress ? 'Saving...' : 'Save Update'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                {dailyProgressEntries.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No progress updates yet</p>
                    <p className="text-xs mt-1">Click "Today's Update" to log your first entry</p>
                  </div>
                ) : (
                  <div className="space-y-3" data-testid="daily-progress-list">
                    {dailyProgressEntries.map((entry, idx) => (
                      <Card key={entry.progress_id || idx} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-xs font-bold text-blue-800">{entry.date} ({entry.day})</p>
                              {entry.current_stage && (
                                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium">{entry.current_stage}</span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">{entry.site_engineer_name}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap">{entry.summary}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CURING VIDEO TAB — moved from main dashboard, scoped to this project */}
          <TabsContent value="curing">
            <ProjectCuringTab projectId={projectId} projectName={project.name} user={user} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Receive Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(open) => !open && setReceiveDialog({ open: false, request: null })}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-green-600" />
              Receive Material
            </DialogTitle>
          </DialogHeader>
          {receiveDialog.request && (
            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded-lg text-xs sm:text-sm">
                <p><strong>Material:</strong> {receiveDialog.request.material_name}</p>
                <p><strong>Requested:</strong> {receiveDialog.request.quantity} {receiveDialog.request.unit}</p>
                {receiveDialog.request.brand && <p><strong>Brand:</strong> {receiveDialog.request.brand}</p>}
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs sm:text-sm">Receive Date *</Label>
                  <Input
                    type="date"
                    value={receiveForm.receive_date}
                    onChange={(e) => setReceiveForm({...receiveForm, receive_date: e.target.value})}
                    className="text-sm"
                    data-testid="receive-date-input"
                  />
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Receive Time *</Label>
                  <Input
                    type="time"
                    value={receiveForm.receive_time}
                    onChange={(e) => setReceiveForm({...receiveForm, receive_time: e.target.value})}
                    className="text-sm"
                    data-testid="receive-time-input"
                  />
                </div>
              </div>
              
              {/* Received Qty — per-diameter when steel_specs.items present (Feb 2026) */}
              {receiveDialog.request.steel_specs?.items?.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50/40 overflow-hidden">
                  <div className="px-3 py-2 bg-amber-100/60 text-[11px] uppercase tracking-wide text-amber-800 font-semibold flex items-center justify-between">
                    <span>⚙ Steel — Received Per Diameter *</span>
                    <span className="text-[10px] normal-case">{receiveDialog.request.steel_specs.items.length} diameter{receiveDialog.request.steel_specs.items.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 text-amber-800">
                        <tr>
                          <th className="text-left px-2 py-1.5 w-6">#</th>
                          <th className="text-left px-2 py-1.5">Diameter</th>
                          <th className="text-right px-2 py-1.5">Req. Rods</th>
                          <th className="text-right px-2 py-1.5">Recv. Rods *</th>
                          <th className="text-right px-2 py-1.5">Requested (kg)</th>
                          <th className="text-right px-2 py-1.5">Received Qty (kg) *</th>
                          <th className="text-right px-2 py-1.5">Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiveDialog.request.steel_specs.items.map((it, idx) => {
                          const reqW = Number(it.calculated_weight_kg || it.weight_kg || 0);
                          const recv = parseFloat(receivedSteelItems[idx]);
                          const diff = isNaN(recv) ? 0 : (recv - reqW);
                          const diffColor = Math.abs(diff) < 0.01 ? 'text-gray-400' : (diff < 0 ? 'text-rose-700' : 'text-emerald-700');
                          return (
                          <tr key={idx} className="border-t border-amber-200">
                            <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                            <td className="px-2 py-1.5 font-semibold text-slate-800">Ø {it.diameter_mm} mm</td>
                            <td className="px-2 py-1.5 text-right text-gray-600">{it.rod_count}</td>
                            <td className="px-2 py-1.5">
                              <NumericInput
                                value={receivedSteelRods[idx] || ''}
                                onChange={(e) => {
                                  const next = [...receivedSteelRods];
                                  next[idx] = e.target.value;
                                  setReceivedSteelRods(next);
                                  // Auto-sync kg from new rod count
                                  const nextKg = [...receivedSteelItems];
                                  const w = calcSteelWeightKg(it.diameter_mm, e.target.value);
                                  nextKg[idx] = String(w || '');
                                  setReceivedSteelItems(nextKg);
                                }}
                                className="h-7 text-right text-sm w-20 ml-auto"
                                data-testid={`receive-steel-rods-${it.diameter_mm}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right text-amber-700">{reqW.toFixed(2)}</td>
                            <td className="px-2 py-1.5">
                              <NumericInput
                                value={receivedSteelItems[idx] || ''}
                                onChange={(e) => {
                                  const next = [...receivedSteelItems];
                                  next[idx] = e.target.value;
                                  setReceivedSteelItems(next);
                                }}
                                className="h-7 text-right text-sm"
                                data-testid={`receive-steel-qty-${it.diameter_mm}`}
                              />
                            </td>
                            <td className={`px-2 py-1.5 text-right font-semibold ${diffColor}`} data-testid={`receive-steel-diff-${it.diameter_mm}`}>
                              {Math.abs(diff) < 0.01 ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-amber-100/40 border-t border-amber-300">
                        {(() => {
                          const reqTot = receiveDialog.request.steel_specs.total_weight_kg || 0;
                          const recvTot = receivedSteelItems.reduce((s, v) => s + (parseFloat(v) || 0), 0);
                          const totDiff = recvTot - reqTot;
                          const tDiffColor = Math.abs(totDiff) < 0.01 ? 'text-gray-500' : (totDiff < 0 ? 'text-rose-700' : 'text-emerald-700');
                          const reqRodsTot = receiveDialog.request.steel_specs.items.reduce((s, it) => s + (parseInt(it.rod_count, 10) || 0), 0);
                          const recvRodsTot = receivedSteelRods.reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
                          return (
                            <tr>
                              <td colSpan={2} className="px-2 py-1.5 text-right font-semibold text-amber-800">Total</td>
                              <td className="px-2 py-1.5 text-right text-amber-700">{reqRodsTot}</td>
                              <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{recvRodsTot}</td>
                              <td className="px-2 py-1.5 text-right text-amber-700 font-semibold">{reqTot.toFixed(2)} kg</td>
                              <td className="px-2 py-1.5 text-right font-bold text-emerald-700" data-testid="receive-steel-total">{recvTot.toFixed(2)} kg</td>
                              <td className={`px-2 py-1.5 text-right font-bold ${tDiffColor}`} data-testid="receive-steel-total-diff">{Math.abs(totDiff) < 0.01 ? '—' : `${totDiff > 0 ? '+' : ''}${totDiff.toFixed(2)}`}</td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                  {/* Reason for Qty mismatch — required if any diff > 0.01 kg */}
                  {(() => {
                    const reqTot = receiveDialog.request.steel_specs.total_weight_kg || 0;
                    const recvTot = receivedSteelItems.reduce((s, v) => s + (parseFloat(v) || 0), 0);
                    const hasMismatch = Math.abs(recvTot - reqTot) >= 0.01;
                    if (!hasMismatch) return null;
                    return (
                      <div className="px-3 py-2 border-t border-amber-300 bg-rose-50/40">
                        <Label className="text-[11px] text-rose-700 font-semibold">Reason for Qty Mismatch *</Label>
                        <Input
                          value={mismatchReason}
                          onChange={(e) => setMismatchReason(e.target.value)}
                          placeholder="e.g., supplier short delivery, rounding adjustment, broken rod"
                          className="text-sm mt-1"
                          data-testid="receive-mismatch-reason"
                        />
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div>
                  <Label className="text-xs sm:text-sm">Received Qty *</Label>
                  <NumericInput 
                    value={receiveForm.received_qty}
                    onChange={(e) => setReceiveForm({...receiveForm, received_qty: e.target.value})}
                    className="text-sm"
                    data-testid="receive-qty-input"
                  />
                </div>
              )}

              {/* Image Uploads */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs sm:text-sm">Lorry Image</Label>
                  <div className="mt-1">
                    {lorryImageId ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                        <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        <p className="text-xs text-green-700 mt-1">Uploaded</p>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-1 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" data-testid="lorry-image-upload">
                        <Camera className="h-5 w-5 text-gray-400" />
                        <span className="text-xs text-gray-500">{uploadingImage === 'lorry' ? 'Uploading...' : 'Upload'}</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e.target.files[0], 'lorry')} disabled={uploadingImage === 'lorry'} />
                      </label>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Material Image</Label>
                  <div className="mt-1">
                    {materialImageId ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                        <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        <p className="text-xs text-green-700 mt-1">Uploaded</p>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-1 p-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors" data-testid="material-image-upload">
                        <Camera className="h-5 w-5 text-gray-400" />
                        <span className="text-xs text-gray-500">{uploadingImage === 'material' ? 'Uploading...' : 'Upload'}</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e.target.files[0], 'material')} disabled={uploadingImage === 'material'} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm">GPS Location *</Label>
                <div className="mt-1">
                  {gpsLocation ? (
                    <div className="bg-green-50 border border-green-200 p-2 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs font-medium">Location Captured</span>
                      </div>
                      <p className="text-xs text-green-600 mt-1">
                        {gpsLocation.latitude.toFixed(4)}, {gpsLocation.longitude.toFixed(4)}
                      </p>
                    </div>
                  ) : (
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={getGPSLocation}
                      disabled={gettingLocation}
                      className="w-full text-xs sm:text-sm"
                      data-testid="capture-gps-btn"
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      {gettingLocation ? 'Getting Location...' : 'Capture GPS'}
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs sm:text-sm">Remarks</Label>
                <Textarea
                  value={receiveForm.remarks}
                  onChange={(e) => setReceiveForm({...receiveForm, remarks: e.target.value})}
                  placeholder="Any notes about the delivery..."
                  rows={2}
                  className="text-sm"
                  data-testid="receive-remarks-input"
                />
              </div>
              
              <div className="bg-blue-50 border border-blue-200 p-2 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800">Submit will record the receipt and notify Procurement &amp; Planning with the uploaded images.</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setReceiveDialog({ open: false, request: null })}>Cancel</Button>
            <Button 
              size="sm"
              onClick={handleInitiateReceive}
              disabled={!gpsLocation}
              className="bg-green-600 hover:bg-green-700"
              data-testid="submit-receive-btn"
            >
              <Send className="h-3 w-3 mr-1" />Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Out Stock / Consume dialog */}
      <Dialog open={consumeDialog.open} onOpenChange={(o) => !o && setConsumeDialog({ open: false, material: null, qty: '', notes: '' })}>
        <DialogContent className="max-w-md" data-testid="consume-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><ArrowRight className="h-5 w-5" /> Out Stock — Record Consumption</DialogTitle>
            <DialogDescription className="text-xs">
              {consumeDialog.material?.material_name} · Current: <strong>{consumeDialog.material?.current_stock} {consumeDialog.material?.unit}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Quantity used *</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={consumeDialog.qty}
                onChange={(e) => setConsumeDialog({ ...consumeDialog, qty: e.target.value })}
                placeholder={`Max ${consumeDialog.material?.current_stock || 0}`}
                className="h-9 text-sm"
                autoFocus
                data-testid="consume-qty"
              />
            </div>
            <div>
              <Label className="text-xs">Notes / Stage / Purpose</Label>
              <Textarea
                rows={2}
                value={consumeDialog.notes}
                onChange={(e) => setConsumeDialog({ ...consumeDialog, notes: e.target.value })}
                placeholder="e.g. Used for Foundation casting"
                className="text-sm"
                data-testid="consume-notes"
              />
            </div>
            <p className="text-[10px] text-gray-400">Date &amp; time will be auto-captured.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConsumeDialog({ open: false, material: null, qty: '', notes: '' })} disabled={savingConsume}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={submitConsume} disabled={savingConsume} data-testid="consume-confirm">
              {savingConsume ? 'Recording…' : 'Record Out Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock History dialog (per material) */}
      <Dialog open={stockHistoryDialog.open} onOpenChange={(o) => !o && setStockHistoryDialog({ open: false, materialName: '', loading: false, entries: [] })}>
        <DialogContent className="max-w-2xl" data-testid="stock-history-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700"><History className="h-5 w-5" /> Stock History — {stockHistoryDialog.materialName}</DialogTitle>
            <DialogDescription className="text-xs">Date-wise opening / received / used / closing stock.</DialogDescription>
          </DialogHeader>
          {stockHistoryDialog.loading ? (
            <p className="text-center text-xs text-gray-400 py-6">Loading…</p>
          ) : stockHistoryDialog.entries.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">No history entries yet.</p>
          ) : (
            <div className="border rounded-md overflow-hidden max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Date</th>
                    <th className="text-center px-2 py-1.5 font-semibold text-blue-700">Opening</th>
                    <th className="text-center px-2 py-1.5 font-semibold text-green-700">Received</th>
                    <th className="text-center px-2 py-1.5 font-semibold text-red-700">Used</th>
                    <th className="text-center px-2 py-1.5 font-semibold text-emerald-700">Closing</th>
                    <th className="text-center px-2 py-1.5 font-semibold text-gray-600">In At</th>
                    <th className="text-center px-2 py-1.5 font-semibold text-gray-600">Out At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stockHistoryDialog.entries.map((e, i) => {
                    const fmtAt = (s) => { if (!s) return '—'; try { return new Date(s).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; } };
                    return (
                      <tr key={e.inventory_id} className={i % 2 ? 'bg-gray-50/50' : 'bg-white'} data-testid={`stock-history-row-${i}`}>
                        <td className="px-2 py-1.5 font-medium">{e.date}</td>
                        <td className="px-2 py-1.5 text-center">{e.opening_stock}</td>
                        <td className="px-2 py-1.5 text-center text-green-700">{e.received}</td>
                        <td className="px-2 py-1.5 text-center text-red-600">{e.used}</td>
                        <td className="px-2 py-1.5 text-center font-bold text-emerald-700">{e.closing_stock}</td>
                        <td className="px-2 py-1.5 text-center text-gray-500 whitespace-nowrap">{fmtAt(e.last_in_at)}</td>
                        <td className="px-2 py-1.5 text-center text-gray-500 whitespace-nowrap">{fmtAt(e.last_out_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStockHistoryDialog({ open: false, materialName: '', loading: false, entries: [] })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
      <OrderDetailDialog
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        onUpdate={() => fetchProjectData()}
      />
    </div>
  );
}
