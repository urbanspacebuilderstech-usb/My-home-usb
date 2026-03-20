import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  HardHat, LogOut, ArrowLeft, Plus, Package, Users, MapPin, Building2,
  Clock, CheckCircle, XCircle, Truck, Camera, AlertTriangle, Send,
  Calendar, ClipboardList, Warehouse, Save, Trash2, History,
  ChevronRight, Banknote, ArrowRight, Eye, Circle
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
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { UnitSelect } from '../components/UnitSelect';
import OrderDetailDialog from '../components/OrderDetailDialog';
import WorkOrderTab from '../components/WorkOrderTab';

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

export default function SiteEngineerProject() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [labourTypes, setLabourTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('materials');
  const [materialSubTab, setMaterialSubTab] = useState('orders');
  const [labourSubTab, setLabourSubTab] = useState('orders');
  
  const [materialRequestDialog, setMaterialRequestDialog] = useState(false);
  const [labourRequestDialog, setLabourRequestDialog] = useState(false);
  const [receiveDialog, setReceiveDialog] = useState({ open: false, request: null });
  const [otpDialog, setOtpDialog] = useState({ open: false, receipt: null });
  
  const [materialForm, setMaterialForm] = useState({ material_id: '', material_name: '', quantity: '', unit: 'kg', remarks: '' });
  const [vendorSuggestion, setVendorSuggestion] = useState(null);
  const [labourForm, setLabourForm] = useState({ labour_type: '', num_workers: '', num_days: '', rate_per_day: '', remarks: '' });
  const [receiveForm, setReceiveForm] = useState({ received_qty: '', remarks: '' });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Labour Count state
  const [labourCountDate, setLabourCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignedContractors, setAssignedContractors] = useState([]);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [attendanceCounts, setAttendanceCounts] = useState({});
  const [contractorAttendanceHistory, setContractorAttendanceHistory] = useState([]);
  const [savingLabourCount, setSavingLabourCount] = useState(false);
  const [requestingPayment, setRequestingPayment] = useState(false);

  // Stock Register state
  const [stockDate, setStockDate] = useState(new Date().toISOString().split('T')[0]);
  const [stockEntries, setStockEntries] = useState({});
  const [latestStock, setLatestStock] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);
  const [savingStock, setSavingStock] = useState(false);
  const [addStockMaterial, setAddStockMaterial] = useState({ name: '', unit: 'bags' });

  useEffect(() => {
    fetchData();
  }, [projectId]);

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
      const [latestRes, historyRes] = await Promise.all([
        axios.get(`${API}/material-inventory/latest?project_id=${projectId}`),
        axios.get(`${API}/material-inventory?project_id=${projectId}`)
      ]);
      setLatestStock(latestRes.data || []);
      setStockHistory(historyRes.data || []);
      // Pre-populate from latest stock or empty
      const entries = {};
      (latestRes.data || []).forEach(item => {
        entries[item.material_name] = {
          unit: item.unit || '',
          opening_stock: item.closing_stock || 0,
          received: 0,
          used: 0
        };
      });
      setStockEntries(entries);
    } catch { setLatestStock([]); setStockHistory([]); }
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
          used: Number(data.used) || 0
        });
      }
      toast.success('Stock register saved for ' + stockDate);
      fetchStockData(stockDate);
    } catch { toast.error('Failed to save stock'); }
    finally { setSavingStock(false); }
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
    if (activeTab === 'stock_register' && projectId) fetchStockData(stockDate);
  }, [activeTab, stockDate, projectId]);

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
      toast.error('Geolocation is not supported');
      setGettingLocation(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setGettingLocation(false);
        toast.success('Location captured');
      },
      (error) => {
        toast.error('Failed to get location. Enable GPS.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
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
    if ((!materialForm.material_id && !materialForm.material_name) || !materialForm.quantity) {
      toast.error('Please fill material name and quantity');
      return;
    }
    
    try {
      const payload = {
        project_id: projectId,
        quantity: parseFloat(materialForm.quantity),
        unit: materialForm.unit || 'kg',
        remarks: materialForm.remarks || null
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
      setMaterialForm({ material_id: '', material_name: '', quantity: '', unit: 'kg', remarks: '' });
      setVendorSuggestion(null);
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
    setReceiveForm({ received_qty: request.quantity.toString(), remarks: '' });
    setGpsLocation(null);
  };

  const handleInitiateReceive = async () => {
    if (!gpsLocation) {
      toast.error('GPS location required');
      return;
    }
    if (!receiveForm.received_qty) {
      toast.error('Enter received quantity');
      return;
    }
    
    try {
      const response = await axios.post(`${API}/site-engineer/material-receipts/initiate`, {
        request_id: receiveDialog.request.request_id,
        received_qty: parseFloat(receiveForm.received_qty),
        gps_latitude: gpsLocation.latitude,
        gps_longitude: gpsLocation.longitude,
        remarks: receiveForm.remarks || null
      });
      
      setReceiveDialog({ open: false, request: null });
      setOtpDialog({ open: true, receipt: response.data });
      
      if (response.data.otp_sent) {
        toast.success(`OTP sent to ${response.data.otp_email}`);
      } else if (response.data.test_otp) {
        toast.info(`Demo OTP: ${response.data.test_otp}`);
      }
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to initiate receipt');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Enter valid 6-digit OTP');
      return;
    }
    
    try {
      await axios.post(`${API}/site-engineer/material-receipts/verify-otp`, {
        receipt_id: otpDialog.receipt.receipt_id,
        otp_code: otpCode
      });
      toast.success('Receipt verified!');
      setOtpDialog({ open: false, receipt: null });
      setOtpCode('');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Invalid OTP');
    }
  };

  const formatCurrency = (amount) => `₹${amount?.toLocaleString() || 0}`;
  const canReceive = (status) => ['accountant_approved', 'ready_for_delivery', 'received_partial'].includes(status);

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
  const myMaterialOrders = material_requests.filter(r => !['received_completed', 'rejected'].includes(r.status));
  const receivedMaterials = material_requests.filter(r => ['received_partial', 'received_completed'].includes(r.status));
  const myLabourOrders = labour_requests.filter(r => !['approved', 'rejected'].includes(r.status));
  const approvedLabour = labour_requests.filter(r => r.status === 'approved');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Navigation */}
      <nav className="bg-gradient-to-r from-orange-600 to-orange-700 px-3 py-2 sm:px-6 sm:py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => window.location.href = '/site-engineer'}
              className="text-white hover:bg-orange-500 h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold text-white truncate">{project.name}</h1>
              <p className="text-xs text-orange-100 truncate hidden sm:block">{project.client_name}</p>
            </div>
          </div>
          
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-orange-500 h-8 w-8">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 py-3 sm:px-6 sm:py-8">
        {/* Project Info - Compact on mobile */}
        <Card className="mb-3 sm:mb-8 bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-3 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Project</p>
                  <p className="text-xs sm:text-sm font-semibold truncate">{project.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Client</p>
                  <p className="text-xs sm:text-sm font-semibold truncate">{project.client_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="text-xs sm:text-sm font-semibold truncate">{project.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 sm:h-8 sm:w-8 text-orange-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="text-xs sm:text-sm font-semibold truncate">{project.building_type || 'Building'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3 sm:mb-6 w-full grid grid-cols-3">
            <TabsTrigger value="materials" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Materials</span>
              <span className="sm:hidden">Mat</span>
            </TabsTrigger>
            <TabsTrigger value="work_orders" className="gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-work-orders">
              <ClipboardList className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Work Orders</span>
              <span className="sm:hidden">WO</span>
            </TabsTrigger>
            <TabsTrigger value="stock_register" className="gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-stock-register">
              <Warehouse className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Stock Register</span>
              <span className="sm:hidden">Stock</span>
            </TabsTrigger>
          </TabsList>

          {/* MATERIALS TAB */}
          <TabsContent value="materials">
            <Card>
              <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg">Materials</CardTitle>
                  <CardDescription className="text-xs sm:text-sm hidden sm:block">Request and track orders</CardDescription>
                </div>
                <Dialog open={materialRequestDialog} onOpenChange={setMaterialRequestDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="request-material-btn" size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700 text-xs sm:text-sm whitespace-nowrap">
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Request</span> Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] sm:max-w-lg mx-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Request Material</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">Submit a new material request</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="bg-gray-50 p-2 sm:p-3 rounded-lg text-xs sm:text-sm">
                        <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
                        <p><strong>Site:</strong> {project.name}</p>
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Material Name *</Label>
                        {materials.length > 0 ? (
                          <Select value={materialForm.material_id} onValueChange={(v) => {
                            const mat = materials.find(m => m.material_id === v);
                            const name = mat?.name || '';
                            setMaterialForm({...materialForm, material_id: v, material_name: name, unit: mat?.unit || 'kg'});
                            fetchVendorSuggestion(name);
                          }}>
                            <SelectTrigger className="text-xs sm:text-sm">
                              <SelectValue placeholder="Select material" />
                            </SelectTrigger>
                            <SelectContent>
                              {materials.map(m => (
                                <SelectItem key={m.material_id} value={m.material_id} className="text-xs sm:text-sm">
                                  {m.name} ({m.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input 
                            value={materialForm.material_name}
                            onChange={(e) => setMaterialForm({...materialForm, material_name: e.target.value})}
                            onBlur={(e) => fetchVendorSuggestion(e.target.value)}
                            placeholder="e.g., TMT Steel 12mm, Cement OPC 53, Sand River"
                            className="text-sm"
                            data-testid="material-name-input"
                          />
                        )}
                      </div>
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
                          <Label className="text-xs sm:text-sm">Unit</Label>
                          <UnitSelect value={materialForm.unit} onChange={(v) => setMaterialForm({...materialForm, unit: v})} data-testid="material-unit-select" />
                        </div>
                      </div>
                      {vendorSuggestion && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-2" data-testid="vendor-suggestion-banner">
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <div className="text-xs sm:text-sm">
                            <span className="text-green-800 font-medium">Pre-assigned Vendor:</span>{' '}
                            <span className="text-green-700">{vendorSuggestion.vendor_name}</span>
                            {vendorSuggestion.brand && <span className="text-green-600 ml-1">({vendorSuggestion.brand})</span>}
                            <span className="text-green-500 ml-1">— {vendorSuggestion.category}</span>
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
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" size="sm" onClick={() => setMaterialRequestDialog(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleMaterialRequest}>
                        <Send className="h-3 w-3 mr-1" />Submit
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <Tabs value={materialSubTab} onValueChange={setMaterialSubTab}>
                  <TabsList className="mb-3 w-full grid grid-cols-2 h-8">
                    <TabsTrigger value="orders" className="text-xs">My Orders ({myMaterialOrders.length})</TabsTrigger>
                    <TabsTrigger value="received" className="text-xs">Received ({receivedMaterials.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="orders">
                    {myMaterialOrders.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        <Package className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No active orders</p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {myMaterialOrders.map(req => (
                          <Card 
                            key={req.request_id} 
                            className="border-l-4 border-l-orange-500 cursor-pointer hover:shadow-md hover:border-l-orange-600 transition-all"
                            onClick={() => setSelectedOrder(req)}
                            data-testid={`order-card-${req.request_id}`}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 className="text-sm font-semibold truncate">{req.material_name}</h4>
                                    <StatusBadge status={req.status} />
                                  </div>
                                  <div className="text-xs text-gray-600 space-y-0.5">
                                    <p><strong>ID:</strong> {req.order_id}</p>
                                    <p><strong>Qty:</strong> {req.quantity} {req.unit}</p>
                                    {(req.assigned_vendor_name || req.vendor_name) && (
                                      <div className="flex items-center gap-1">
                                        <span className="font-medium text-blue-700">Vendor:</span> {req.vendor_name || req.assigned_vendor_name}
                                        {req.po_id && <Badge variant="outline" className="text-[9px] ml-1 border-green-300 text-green-700">PO: {req.po_id}</Badge>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {canReceive(req.status) && (
                                    <Button 
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); openReceiveDialog(req); }}
                                      className="gap-1 bg-green-600 hover:bg-green-700 text-xs whitespace-nowrap"
                                    >
                                      <Package className="h-3 w-3" />Receive
                                    </Button>
                                  )}
                                  <Eye className="h-4 w-4 text-gray-400" />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="received">
                    {receivedMaterials.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        <CheckCircle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No received materials</p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {receivedMaterials.map(req => (
                          <Card 
                            key={req.request_id} 
                            className="border-l-4 border-l-green-500 cursor-pointer hover:shadow-md transition-all"
                            onClick={() => setSelectedOrder(req)}
                            data-testid={`received-card-${req.request_id}`}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-sm font-semibold truncate">{req.material_name}</h4>
                                    <StatusBadge status={req.status} />
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    <p><strong>Qty:</strong> {req.quantity} {req.unit}</p>
                                  </div>
                                </div>
                                <Eye className="h-4 w-4 text-gray-400" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WORK ORDERS TAB */}
          <TabsContent value="work_orders">
            <WorkOrderTab projectId={projectId} />
          </TabsContent>

          {/* STOCK REGISTER TAB */}
          <TabsContent value="stock_register">
            <Card>
              <CardHeader className="p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-amber-600" />
                      Daily Stock Register
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Log opening and closing stock for each material</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <Input
                      type="date"
                      value={stockDate}
                      onChange={(e) => setStockDate(e.target.value)}
                      className="w-40 text-sm"
                      data-testid="stock-register-date"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <div className="space-y-4">
                  {/* Add Material Row */}
                  <div className="flex items-end gap-2 bg-gray-50 rounded-lg p-3">
                    <div className="flex-1">
                      <Label className="text-xs">Material Name</Label>
                      <Input
                        value={addStockMaterial.name}
                        onChange={(e) => setAddStockMaterial(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. Cement, Sand, Steel"
                        className="text-sm"
                        data-testid="add-stock-material-name"
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Unit</Label>
                      <UnitSelect value={addStockMaterial.unit} onChange={(v) => setAddStockMaterial(prev => ({ ...prev, unit: v }))} />
                    </div>
                    <Button size="sm" onClick={handleAddStockMaterial} className="gap-1" data-testid="add-stock-material-btn">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>

                  {/* Stock Entry Table */}
                  {Object.keys(stockEntries).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="stock-register-table">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-xs">Material</th>
                            <th className="text-left px-2 py-2 font-medium text-xs w-14">Unit</th>
                            <th className="text-center px-2 py-2 font-medium text-xs">Opening</th>
                            <th className="text-center px-2 py-2 font-medium text-xs">Received</th>
                            <th className="text-center px-2 py-2 font-medium text-xs">Used</th>
                            <th className="text-center px-2 py-2 font-medium text-xs bg-green-50">Closing</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {Object.entries(stockEntries).map(([name, data]) => {
                            const closing = (Number(data.opening_stock) || 0) + (Number(data.received) || 0) - (Number(data.used) || 0);
                            return (
                              <tr key={name} className="hover:bg-gray-50" data-testid={`stock-row-${name}`}>
                                <td className="px-3 py-2 font-medium text-xs sm:text-sm">{name}</td>
                                <td className="px-2 py-2 text-xs text-gray-500">{data.unit}</td>
                                <td className="px-1 py-1">
                                  <Input
                                    type="number" min="0" className="text-center text-sm h-8 w-20 mx-auto"
                                    value={data.opening_stock || ''}
                                    onChange={(e) => setStockEntries(prev => ({ ...prev, [name]: { ...prev[name], opening_stock: e.target.value } }))}
                                    data-testid={`stock-opening-${name}`}
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <Input
                                    type="number" min="0" className="text-center text-sm h-8 w-20 mx-auto"
                                    value={data.received || ''}
                                    onChange={(e) => setStockEntries(prev => ({ ...prev, [name]: { ...prev[name], received: e.target.value } }))}
                                    data-testid={`stock-received-${name}`}
                                  />
                                </td>
                                <td className="px-1 py-1">
                                  <Input
                                    type="number" min="0" className="text-center text-sm h-8 w-20 mx-auto"
                                    value={data.used || ''}
                                    onChange={(e) => setStockEntries(prev => ({ ...prev, [name]: { ...prev[name], used: e.target.value } }))}
                                    data-testid={`stock-used-${name}`}
                                  />
                                </td>
                                <td className="px-2 py-2 text-center font-bold text-sm bg-green-50">
                                  <span className={closing < 0 ? 'text-red-600' : 'text-green-700'}>{closing}</span>
                                </td>
                                <td className="px-1 py-1">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => {
                                    setStockEntries(prev => { const next = { ...prev }; delete next[name]; return next; });
                                  }}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="flex justify-end mt-3">
                        <Button onClick={handleSaveStock} disabled={savingStock} className="gap-1" data-testid="save-stock-btn">
                          <Save className="h-3.5 w-3.5" />
                          {savingStock ? 'Saving...' : 'Save Stock Register'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Warehouse className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No materials added yet</p>
                      <p className="text-xs mt-1">Add materials above to start tracking stock</p>
                    </div>
                  )}

                  {/* Latest Stock Summary */}
                  {latestStock.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-gray-700">
                        <History className="h-3.5 w-3.5" />
                        Current Stock Levels
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {latestStock.map((item, idx) => (
                          <div key={idx} className="bg-amber-50 rounded-lg p-2.5 border border-amber-100" data-testid={`latest-stock-${item.material_name}`}>
                            <p className="text-xs font-medium text-gray-700 truncate">{item.material_name}</p>
                            <p className="text-lg font-bold text-amber-700">{item.closing_stock} <span className="text-xs font-normal text-gray-500">{item.unit}</span></p>
                            <p className="text-[10px] text-gray-400">as of {item.date}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Receive Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(open) => !open && setReceiveDialog({ open: false, request: null })}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg mx-auto">
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
              </div>
              
              <div>
                <Label className="text-xs sm:text-sm">Received Qty *</Label>
                <NumericInput 
                  
                  value={receiveForm.received_qty}
                  onChange={(e) => setReceiveForm({...receiveForm, received_qty: e.target.value})}
                  className="text-sm"
                />
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
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      {gettingLocation ? 'Getting Location...' : 'Capture GPS'}
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 p-2 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-800">OTP will be sent to your email for verification</p>
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
            >
              <Send className="h-3 w-3 mr-1" />Get OTP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OTP Dialog */}
      <Dialog open={otpDialog.open} onOpenChange={(open) => !open && setOtpDialog({ open: false, receipt: null })}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Enter OTP</DialogTitle>
            <DialogDescription className="text-xs">6-digit code sent to your email</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input 
              type="text"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl tracking-widest font-mono"
            />
            {otpDialog.receipt?.test_otp && (
              <div className="bg-amber-50 p-2 rounded-lg text-center">
                <p className="text-xs text-amber-700">
                  <strong>Demo OTP:</strong> {otpDialog.receipt.test_otp}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOtpDialog({ open: false, receipt: null })}>Cancel</Button>
            <Button 
              size="sm"
              onClick={handleVerifyOTP}
              disabled={otpCode.length !== 6}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-3 w-3 mr-1" />Verify
            </Button>
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
