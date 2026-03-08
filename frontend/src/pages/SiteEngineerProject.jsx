import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  HardHat, LogOut, ArrowLeft, Plus, Package, Users, MapPin, Building2,
  Clock, CheckCircle, XCircle, Truck, Camera, AlertTriangle, Send
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  requested: { label: 'Requested', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  planning_approved: { label: 'Planning OK', color: 'bg-amber-50 text-amber-800', icon: CheckCircle },
  procurement_approved: { label: 'Procurement OK', color: 'bg-purple-100 text-purple-800', icon: CheckCircle },
  accountant_approved: { label: 'Accounts OK', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  ready_for_delivery: { label: 'Ready', color: 'bg-cyan-100 text-cyan-800', icon: Truck },
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
      toast.error(error.response?.data?.detail || 'Failed to initiate receipt');
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
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
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
          <TabsList className="mb-3 sm:mb-6 w-full grid grid-cols-2">
            <TabsTrigger value="materials" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Package className="h-3 w-3 sm:h-4 sm:w-4" />
              Materials
            </TabsTrigger>
            <TabsTrigger value="labours" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              Labours
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
                        <Label className="text-xs sm:text-sm">Material *</Label>
                        <Select value={materialForm.material_id} onValueChange={(v) => setMaterialForm({...materialForm, material_id: v})}>
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
                      </div>
                      <div>
                        <Label className="text-xs sm:text-sm">Quantity *</Label>
                        <Input 
                          type="number"
                          value={materialForm.quantity}
                          onChange={(e) => setMaterialForm({...materialForm, quantity: e.target.value})}
                          placeholder="Enter quantity"
                          className="text-sm"
                        />
                      </div>
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
                          <Card key={req.request_id} className="border-l-4 border-l-orange-500">
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
                                  </div>
                                </div>
                                {canReceive(req.status) && (
                                  <Button 
                                    size="sm"
                                    onClick={() => openReceiveDialog(req)}
                                    className="gap-1 bg-green-600 hover:bg-green-700 text-xs whitespace-nowrap"
                                  >
                                    <Package className="h-3 w-3" />Receive
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
                      <div className="text-center py-6 text-gray-500">
                        <CheckCircle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No received materials</p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {receivedMaterials.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold truncate">{req.material_name}</h4>
                                <StatusBadge status={req.status} />
                              </div>
                              <div className="text-xs text-gray-600">
                                <p><strong>Qty:</strong> {req.quantity} {req.unit}</p>
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

          {/* LABOURS TAB */}
          <TabsContent value="labours">
            <Card>
              <CardHeader className="p-3 sm:p-6 flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg">Labours</CardTitle>
                  <CardDescription className="text-xs sm:text-sm hidden sm:block">Request and track orders</CardDescription>
                </div>
                <Dialog open={labourRequestDialog} onOpenChange={setLabourRequestDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1 bg-secondary hover:bg-secondary/90 text-xs sm:text-sm whitespace-nowrap">
                      <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">Request</span> Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] sm:max-w-lg mx-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Request Labour</DialogTitle>
                      <DialogDescription className="text-xs sm:text-sm">Submit a new labour request</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 sm:space-y-4">
                      <div>
                        <Label className="text-xs sm:text-sm">Labour Type *</Label>
                        <Select value={labourForm.labour_type} onValueChange={(v) => setLabourForm({...labourForm, labour_type: v})}>
                          <SelectTrigger className="text-xs sm:text-sm">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {labourTypes.map(t => (
                              <SelectItem key={t.value} value={t.value} className="text-xs sm:text-sm">{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Workers *</Label>
                          <Input 
                            type="number"
                            value={labourForm.num_workers}
                            onChange={(e) => setLabourForm({...labourForm, num_workers: e.target.value})}
                            placeholder="Count"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Days *</Label>
                          <Input 
                            type="number"
                            value={labourForm.num_days}
                            onChange={(e) => setLabourForm({...labourForm, num_days: e.target.value})}
                            placeholder="Days"
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Rate *</Label>
                          <Input 
                            type="number"
                            value={labourForm.rate_per_day}
                            onChange={(e) => setLabourForm({...labourForm, rate_per_day: e.target.value})}
                            placeholder="₹"
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="bg-amber-50 p-2 rounded-lg">
                        <p className="text-xs sm:text-sm font-medium text-amber-700">
                          Total: {formatCurrency((parseInt(labourForm.num_workers) || 0) * (parseInt(labourForm.num_days) || 0) * (parseFloat(labourForm.rate_per_day) || 0))}
                        </p>
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" size="sm" onClick={() => setLabourRequestDialog(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleLabourRequest}>
                        <Send className="h-3 w-3 mr-1" />Submit
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0">
                <Tabs value={labourSubTab} onValueChange={setLabourSubTab}>
                  <TabsList className="mb-3 w-full grid grid-cols-2 h-8">
                    <TabsTrigger value="orders" className="text-xs">My Orders ({myLabourOrders.length})</TabsTrigger>
                    <TabsTrigger value="approved" className="text-xs">Approved ({approvedLabour.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="orders">
                    {myLabourOrders.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        <Users className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No active orders</p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {myLabourOrders.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-blue-500">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold">{labourTypes.find(t => t.value === req.labour_type)?.label || req.labour_type}</h4>
                                <StatusBadge status={req.status} />
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs text-gray-600">
                                <p><strong>Workers:</strong> {req.num_workers}</p>
                                <p><strong>Days:</strong> {req.num_days}</p>
                                <p><strong>Rate:</strong> {formatCurrency(req.rate_per_day)}</p>
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
                      <div className="text-center py-6 text-gray-500">
                        <CheckCircle className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No approved requests</p>
                      </div>
                    ) : (
                      <div className="space-y-2 sm:space-y-3">
                        {approvedLabour.map(req => (
                          <Card key={req.request_id} className="border-l-4 border-l-green-500">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold">{labourTypes.find(t => t.value === req.labour_type)?.label}</h4>
                                <StatusBadge status={req.status} />
                              </div>
                              <p className="text-xs text-gray-600"><strong>Total:</strong> {formatCurrency(req.total_amount)}</p>
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
                <Input 
                  type="number"
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
    </div>
  );
}
