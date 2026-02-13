import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  HardHat, LogOut, ArrowLeft, Plus, Package, Users, MapPin, Building2,
  Clock, CheckCircle, XCircle, Truck, Camera, AlertTriangle, Send, Eye
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  requested: { label: 'Requested', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  planning_approved: { label: 'Planning Approved', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
  procurement_approved: { label: 'Procurement Approved', color: 'bg-purple-100 text-purple-800', icon: CheckCircle },
  accountant_approved: { label: 'Accountant Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  ready_for_delivery: { label: 'Ready for Delivery', color: 'bg-cyan-100 text-cyan-800', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-teal-100 text-teal-800', icon: Truck },
  received_partial: { label: 'Received (Partial)', color: 'bg-orange-100 text-orange-800', icon: Package },
  received_completed: { label: 'Received (Complete)', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle }
};

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-800', icon: Clock };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
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
  
  // Dialog states
  const [materialRequestDialog, setMaterialRequestDialog] = useState(false);
  const [labourRequestDialog, setLabourRequestDialog] = useState(false);
  const [receiveDialog, setReceiveDialog] = useState({ open: false, request: null });
  const [otpDialog, setOtpDialog] = useState({ open: false, receipt: null });
  
  // Form states
  const [materialForm, setMaterialForm] = useState({ material_id: '', quantity: '', remarks: '' });
  const [labourForm, setLabourForm] = useState({ labour_type: '', num_workers: '', num_days: '', rate_per_day: '', remarks: '' });
  const [receiveForm, setReceiveForm] = useState({ received_qty: '', remarks: '' });
  const [otpCode, setOtpCode] = useState('');
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, projectRes, materialsRes, labourTypesRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/site-engineer/project/${projectId}`),
        axios.get(`${API}/materials`),
        axios.get(`${API}/site-engineer/labour-types`)
      ]);
      setUser(userRes.data);
      setProjectData(projectRes.data);
      setMaterials(materialsRes.data);
      setLabourTypes(labourTypesRes.data);
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

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  // Get GPS location
  const getGPSLocation = () => {
    setGettingLocation(true);
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
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
        console.error('GPS Error:', error);
        toast.error('Failed to get location. Please enable GPS.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Material Request Handlers
  const handleMaterialRequest = async () => {
    if (!materialForm.material_id || !materialForm.quantity) {
      toast.error('Please fill all required fields');
      return;
    }
    
    try {
      await axios.post(`${API}/site-engineer/material-requests`, {
        project_id: projectId,
        material_id: materialForm.material_id,
        quantity: parseFloat(materialForm.quantity),
        remarks: materialForm.remarks || null
      });
      toast.success('Material request submitted');
      setMaterialRequestDialog(false);
      setMaterialForm({ material_id: '', quantity: '', remarks: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  // Labour Request Handlers
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
      toast.success('Labour request submitted');
      setLabourRequestDialog(false);
      setLabourForm({ labour_type: '', num_workers: '', num_days: '', rate_per_day: '', remarks: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  // Material Receive Handlers
  const openReceiveDialog = (request) => {
    setReceiveDialog({ open: true, request });
    setReceiveForm({ received_qty: request.quantity.toString(), remarks: '' });
    setGpsLocation(null);
  };

  const handleInitiateReceive = async () => {
    if (!gpsLocation) {
      toast.error('GPS location is required. Please capture your location.');
      return;
    }
    if (!receiveForm.received_qty) {
      toast.error('Please enter received quantity');
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
      toast.error(error.response?.data?.detail || 'Failed to initiate receipt');
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    
    try {
      await axios.post(`${API}/site-engineer/material-receipts/verify-otp`, {
        receipt_id: otpDialog.receipt.receipt_id,
        otp_code: otpCode
      });
      toast.success('Material receipt verified successfully!');
      setOtpDialog({ open: false, receipt: null });
      setOtpCode('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    }
  };

  const formatCurrency = (amount) => `₹${amount?.toLocaleString() || 0}`;

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

  const { project, material_requests, labour_requests, material_receipts } = projectData;
  
  // Filter material requests
  const myMaterialOrders = material_requests.filter(r => !['received_completed', 'rejected'].includes(r.status));
  const receivedMaterials = material_requests.filter(r => ['received_partial', 'received_completed'].includes(r.status));
  
  // Filter labour requests
  const myLabourOrders = labour_requests.filter(r => !['approved', 'rejected'].includes(r.status));
  const approvedLabour = labour_requests.filter(r => r.status === 'approved');

  // Can receive materials
  const canReceive = (status) => ['accountant_approved', 'ready_for_delivery', 'received_partial'].includes(status);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => window.location.href = '/site-engineer'}
              className="text-white hover:bg-orange-500"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-white/20 p-2 rounded-lg">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{project.name}</h1>
              <p className="text-xs text-orange-100">{project.client_name} • {project.location}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 pl-4 border-l border-orange-400">
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{user.name}</p>
                <p className="text-xs text-orange-100">Site Engineer</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-orange-500">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Project Info Header */}
        <Card className="mb-8 bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-orange-600" />
                <div>
                  <p className="text-xs text-gray-500">Project</p>
                  <p className="font-semibold">{project.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-orange-600" />
                <div>
                  <p className="text-xs text-gray-500">Client</p>
                  <p className="font-semibold">{project.client_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-8 w-8 text-orange-600" />
                <div>
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="font-semibold">{project.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-orange-600" />
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="font-semibold">{project.building_type || 'Building'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="materials" className="gap-2">
              <Package className="h-4 w-4" />
              Materials
            </TabsTrigger>
            <TabsTrigger value="labours" className="gap-2">
              <Users className="h-4 w-4" />
              Labours
            </TabsTrigger>
          </TabsList>

          {/* ==================== MATERIALS TAB ==================== */}
          <TabsContent value="materials">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Materials</CardTitle>
                  <CardDescription>Request and track material orders</CardDescription>
                </div>
                <Dialog open={materialRequestDialog} onOpenChange={setMaterialRequestDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="request-material-btn" className="gap-2 bg-orange-600 hover:bg-orange-700">
                      <Plus className="h-4 w-4" />Request Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Material</DialogTitle>
                      <DialogDescription>Submit a new material request for this project</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="bg-gray-50 p-3 rounded-lg text-sm">
                        <p><strong>Order ID:</strong> Auto-generated</p>
                        <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
                        <p><strong>Site:</strong> {project.name}</p>
                      </div>
                      <div>
                        <Label>Material *</Label>
                        <Select value={materialForm.material_id} onValueChange={(v) => setMaterialForm({...materialForm, material_id: v})}>
                          <SelectTrigger data-testid="material-select">
                            <SelectValue placeholder="Select material" />
                          </SelectTrigger>
                          <SelectContent>
                            {materials.map(m => (
                              <SelectItem key={m.material_id} value={m.material_id}>
                                {m.name} ({m.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantity *</Label>
                        <Input 
                          data-testid="quantity-input"
                          type="number"
                          value={materialForm.quantity}
                          onChange={(e) => setMaterialForm({...materialForm, quantity: e.target.value})}
                          placeholder="Enter quantity"
                        />
                      </div>
                      <div>
                        <Label>Remarks</Label>
                        <Textarea 
                          value={materialForm.remarks}
                          onChange={(e) => setMaterialForm({...materialForm, remarks: e.target.value})}
                          placeholder="Any additional notes..."
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setMaterialRequestDialog(false)}>Cancel</Button>
                      <Button data-testid="submit-material-btn" onClick={handleMaterialRequest}>
                        <Send className="h-4 w-4 mr-2" />Submit Request
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Tabs value={materialSubTab} onValueChange={setMaterialSubTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="orders">My Orders ({myMaterialOrders.length})</TabsTrigger>
                    <TabsTrigger value="received">Received ({receivedMaterials.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="orders">
                    {myMaterialOrders.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>No active material orders</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {myMaterialOrders.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-orange-500">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h4 className="font-semibold">{req.material_name}</h4>
                                    <StatusBadge status={req.status} />
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                                    <p><strong>Order ID:</strong> {req.order_id}</p>
                                    <p><strong>Quantity:</strong> {req.quantity} {req.unit}</p>
                                    <p><strong>Date:</strong> {new Date(req.created_at).toLocaleDateString()}</p>
                                    {req.remarks && <p><strong>Remarks:</strong> {req.remarks}</p>}
                                  </div>
                                </div>
                                {canReceive(req.status) && (
                                  <Button 
                                    data-testid={`receive-btn-${req.request_id}`}
                                    onClick={() => openReceiveDialog(req)}
                                    className="gap-2 bg-green-600 hover:bg-green-700"
                                  >
                                    <Package className="h-4 w-4" />Receive
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="received">
                    {receivedMaterials.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>No received materials yet</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {receivedMaterials.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold">{req.material_name}</h4>
                                <StatusBadge status={req.status} />
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                                <p><strong>Order ID:</strong> {req.order_id}</p>
                                <p><strong>Quantity:</strong> {req.quantity} {req.unit}</p>
                                <p><strong>Date:</strong> {new Date(req.created_at).toLocaleDateString()}</p>
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

          {/* ==================== LABOURS TAB ==================== */}
          <TabsContent value="labours">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Labours</CardTitle>
                  <CardDescription>Request and track labour orders</CardDescription>
                </div>
                <Dialog open={labourRequestDialog} onOpenChange={setLabourRequestDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="request-labour-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4" />Request Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request Labour</DialogTitle>
                      <DialogDescription>Submit a new labour request for this project</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Labour Type *</Label>
                        <Select value={labourForm.labour_type} onValueChange={(v) => setLabourForm({...labourForm, labour_type: v})}>
                          <SelectTrigger data-testid="labour-type-select">
                            <SelectValue placeholder="Select labour type" />
                          </SelectTrigger>
                          <SelectContent>
                            {labourTypes.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Workers *</Label>
                          <Input 
                            data-testid="workers-input"
                            type="number"
                            value={labourForm.num_workers}
                            onChange={(e) => setLabourForm({...labourForm, num_workers: e.target.value})}
                            placeholder="Count"
                          />
                        </div>
                        <div>
                          <Label>Days *</Label>
                          <Input 
                            data-testid="days-input"
                            type="number"
                            value={labourForm.num_days}
                            onChange={(e) => setLabourForm({...labourForm, num_days: e.target.value})}
                            placeholder="Days"
                          />
                        </div>
                        <div>
                          <Label>Rate/Day *</Label>
                          <Input 
                            data-testid="rate-input"
                            type="number"
                            value={labourForm.rate_per_day}
                            onChange={(e) => setLabourForm({...labourForm, rate_per_day: e.target.value})}
                            placeholder="₹"
                          />
                        </div>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm font-medium text-blue-700">
                          Total: {formatCurrency((parseInt(labourForm.num_workers) || 0) * (parseInt(labourForm.num_days) || 0) * (parseFloat(labourForm.rate_per_day) || 0))}
                        </p>
                      </div>
                      <div>
                        <Label>Remarks</Label>
                        <Textarea 
                          value={labourForm.remarks}
                          onChange={(e) => setLabourForm({...labourForm, remarks: e.target.value})}
                          placeholder="Any additional notes..."
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setLabourRequestDialog(false)}>Cancel</Button>
                      <Button data-testid="submit-labour-btn" onClick={handleLabourRequest}>
                        <Send className="h-4 w-4 mr-2" />Submit Request
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Tabs value={labourSubTab} onValueChange={setLabourSubTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="orders">My Orders ({myLabourOrders.length})</TabsTrigger>
                    <TabsTrigger value="approved">Approved ({approvedLabour.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="orders">
                    {myLabourOrders.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>No active labour orders</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {myLabourOrders.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-blue-500">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold">{labourTypes.find(t => t.value === req.labour_type)?.label || req.labour_type}</h4>
                                <StatusBadge status={req.status} />
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm text-gray-600">
                                <p><strong>Order ID:</strong> {req.order_id}</p>
                                <p><strong>Workers:</strong> {req.num_workers}</p>
                                <p><strong>Days:</strong> {req.num_days}</p>
                                <p><strong>Rate:</strong> {formatCurrency(req.rate_per_day)}/day</p>
                                <p><strong>Total:</strong> {formatCurrency(req.total_amount)}</p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="approved">
                    {approvedLabour.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>No approved labour requests yet</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {approvedLabour.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold">{labourTypes.find(t => t.value === req.labour_type)?.label || req.labour_type}</h4>
                                <StatusBadge status={req.status} />
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm text-gray-600">
                                <p><strong>Order ID:</strong> {req.order_id}</p>
                                <p><strong>Workers:</strong> {req.num_workers}</p>
                                <p><strong>Days:</strong> {req.num_days}</p>
                                <p><strong>Rate:</strong> {formatCurrency(req.rate_per_day)}/day</p>
                                <p><strong>Total:</strong> {formatCurrency(req.total_amount)}</p>
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
        </Tabs>
      </div>

      {/* Receive Material Dialog */}
      <Dialog open={receiveDialog.open} onOpenChange={(open) => !open && setReceiveDialog({ open: false, request: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600" />
              Receive Material
            </DialogTitle>
            <DialogDescription>
              Confirm material receipt with GPS verification
            </DialogDescription>
          </DialogHeader>
          {receiveDialog.request && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p><strong>Material:</strong> {receiveDialog.request.material_name}</p>
                <p><strong>Order ID:</strong> {receiveDialog.request.order_id}</p>
                <p><strong>Requested Qty:</strong> {receiveDialog.request.quantity} {receiveDialog.request.unit}</p>
              </div>
              
              <div>
                <Label>Received Quantity *</Label>
                <Input 
                  data-testid="received-qty-input"
                  type="number"
                  value={receiveForm.received_qty}
                  onChange={(e) => setReceiveForm({...receiveForm, received_qty: e.target.value})}
                  max={receiveDialog.request.quantity}
                />
              </div>
              
              <div>
                <Label>GPS Location *</Label>
                <div className="flex items-center gap-2 mt-2">
                  {gpsLocation ? (
                    <div className="flex-1 bg-green-50 border border-green-200 p-3 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Location Captured</span>
                      </div>
                      <p className="text-xs text-green-600 mt-1">
                        {gpsLocation.latitude.toFixed(6)}, {gpsLocation.longitude.toFixed(6)}
                      </p>
                    </div>
                  ) : (
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={getGPSLocation}
                      disabled={gettingLocation}
                      className="flex-1"
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      {gettingLocation ? 'Getting Location...' : 'Capture GPS Location'}
                    </Button>
                  )}
                </div>
              </div>
              
              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={receiveForm.remarks}
                  onChange={(e) => setReceiveForm({...receiveForm, remarks: e.target.value})}
                  placeholder="Any notes about the delivery..."
                  rows={2}
                />
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">OTP Verification Required</p>
                    <p>After submission, an OTP will be sent to your registered email for final verification.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialog({ open: false, request: null })}>Cancel</Button>
            <Button 
              data-testid="initiate-receive-btn"
              onClick={handleInitiateReceive}
              disabled={!gpsLocation}
              className="bg-green-600 hover:bg-green-700"
            >
              <Send className="h-4 w-4 mr-2" />Submit & Get OTP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OTP Verification Dialog */}
      <Dialog open={otpDialog.open} onOpenChange={(open) => !open && setOtpDialog({ open: false, receipt: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              OTP Verification
            </DialogTitle>
            <DialogDescription>
              Enter the 6-digit OTP sent to your email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <Input 
                data-testid="otp-input"
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
            {otpDialog.receipt?.test_otp && (
              <div className="bg-blue-50 p-3 rounded-lg text-center">
                <p className="text-sm text-blue-700">
                  <strong>Demo OTP:</strong> {otpDialog.receipt.test_otp}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  (Shown because email service is not configured)
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtpDialog({ open: false, receipt: null })}>Cancel</Button>
            <Button 
              data-testid="verify-otp-btn"
              onClick={handleVerifyOTP}
              disabled={otpCode.length !== 6}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />Verify & Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
