import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Building2, LogOut, Package, Truck, Clock, CheckCircle, XCircle, 
  DollarSign, Plus, Trash2, Check, AlertCircle, Eye, FileText,
  ArrowRight, CreditCard, TrendingUp, Send, MapPin, Phone, User,
  Wallet, Building, Receipt, BarChart3, Users
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Status flow for display
const STATUS_FLOW = [
  { id: 'requested', label: 'Requested', color: 'bg-gray-100 text-gray-700' },
  { id: 'planning_approved', label: 'Planning Approved', color: 'bg-amber-50 text-amber-700' },
  { id: 'vendor_selected', label: 'Vendor Selected', color: 'bg-purple-100 text-purple-700' },
  { id: 'waiting_payment', label: 'Waiting Payment', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'payment_approved', label: 'Payment Approved', color: 'bg-green-100 text-green-700' },
  { id: 'po_generated', label: 'PO Generated', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'in_transit', label: 'In Transit', color: 'bg-orange-100 text-orange-700' },
  { id: 'received_partial', label: 'Partial Receipt', color: 'bg-amber-100 text-amber-700' },
  { id: 'received_completed', label: 'Received', color: 'bg-emerald-100 text-emerald-700' },
];

const LABOUR_CATEGORIES = [
  { id: 'civil', label: 'Civil' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'welder', label: 'Welder' },
  { id: 'carpenter', label: 'Carpenter' },
  { id: 'tiles_granite', label: 'Tiles & Granite' },
  { id: 'painting', label: 'Painting' },
  { id: 'nmr', label: 'NMR' },
];

export default function ProcurementBoardV2() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [dashboard, setDashboard] = useState({});
  const [requests, setRequests] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [transitOrders, setTransitOrders] = useState([]);
  const [creditLedger, setCreditLedger] = useState({ entries: [], total_outstanding: 0 });
  
  // Vendor Selection Dialog
  const [vendorDialog, setVendorDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [vendorForm, setVendorForm] = useState({
    vendor_id: '',
    vendor_name: '',
    unit_rate: '',
    transport_cost: '0',
    discount: '0',
    payment_type: 'advance',
    advance_amount: '',
    expected_delivery: ''
  });
  
  // Dispatch Dialog
  const [dispatchDialog, setDispatchDialog] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    estimated_arrival: ''
  });
  
  // Vendor Master Dialog
  const [vendorMasterDialog, setVendorMasterDialog] = useState(false);
  const [vendorCategory, setVendorCategory] = useState('material');
  const [vendorMasterForm, setVendorMasterForm] = useState({
    name: '',
    category: 'material',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    bank_name: '',
    bank_account_number: '',
    ifsc_code: '',
    payment_method: 'bank',
    upi_id: '',
    gst_number: '',
    pan_number: '',
    labour_category: '',
    location_coverage: '',
    rate_type: '',
    materials_supplied: [],
    tags: [],
    payment_terms: 'full',
    credit_limit: ''
  });
  
  // Credit Payment Dialog
  const [creditPayDialog, setCreditPayDialog] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [creditPayForm, setCreditPayForm] = useState({
    amount: '',
    payment_reference: '',
    remarks: ''
  });
  
  // View PO Dialog
  const [poDialog, setPoDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, dashboardRes, vendorsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/procurement/dashboard`),
        axios.get(`${API}/vendor-master`)
      ]);
      setUser(userRes.data);
      setDashboard(dashboardRes.data);
      setVendors(vendorsRes.data);
      await fetchRequests('pending');
      await fetchTransitOrders();
      await fetchCreditLedger();
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async (status) => {
    try {
      const res = await axios.get(`${API}/procurement/requests?status=${status}`);
      setRequests(res.data);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const fetchTransitOrders = async () => {
    try {
      const res = await axios.get(`${API}/procurement/transit`);
      setTransitOrders(res.data);
    } catch (error) {
      console.error('Error fetching transit orders:', error);
    }
  };

  const fetchCreditLedger = async () => {
    try {
      const res = await axios.get(`${API}/procurement/credit-ledger`);
      setCreditLedger(res.data);
    } catch (error) {
      console.error('Error fetching credit ledger:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'transit') {
      fetchTransitOrders();
    } else if (tab === 'credit') {
      fetchCreditLedger();
    } else {
      fetchRequests(tab);
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

  // Open vendor selection dialog
  const openVendorDialog = (request) => {
    setSelectedRequest(request);
    setVendorForm({
      vendor_id: request.vendor_id || '',
      vendor_name: request.vendor_name || '',
      unit_rate: request.unit_rate?.toString() || '',
      transport_cost: request.transport_cost?.toString() || '0',
      discount: request.discount?.toString() || '0',
      payment_type: request.payment_type || 'advance',
      advance_amount: request.advance_amount?.toString() || '',
      expected_delivery: request.expected_delivery || ''
    });
    setVendorDialog(true);
  };

  // Submit vendor selection
  const handleVendorSelection = async () => {
    if (!vendorForm.vendor_id || !vendorForm.unit_rate) {
      toast.error('Please select vendor and enter unit rate');
      return;
    }
    
    try {
      const vendor = vendors.find(v => v.vendor_id === vendorForm.vendor_id);
      await axios.post(`${API}/procurement/v2/select-vendor/${selectedRequest.request_id}`, {
        vendor_id: vendorForm.vendor_id,
        vendor_name: vendor?.name || vendorForm.vendor_name,
        unit_rate: parseFloat(vendorForm.unit_rate),
        transport_cost: parseFloat(vendorForm.transport_cost || 0),
        discount: parseFloat(vendorForm.discount || 0),
        payment_type: vendorForm.payment_type,
        advance_amount: vendorForm.payment_type === 'partial' ? parseFloat(vendorForm.advance_amount || 0) : null,
        expected_delivery: vendorForm.expected_delivery || null
      });
      
      toast.success('Vendor selected successfully');
      setVendorDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to select vendor');
    }
  };

  // Generate PO
  const handleGeneratePO = async (request) => {
    try {
      const res = await axios.post(`${API}/procurement/v2/generate-po/${request.request_id}`);
      toast.success(`PO Generated: ${res.data.po_number}`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate PO');
    }
  };

  // Open dispatch dialog
  const openDispatchDialog = (request) => {
    setSelectedRequest(request);
    setDispatchForm({
      vehicle_number: '',
      driver_name: '',
      driver_phone: '',
      estimated_arrival: ''
    });
    setDispatchDialog(true);
  };

  // Mark as dispatched
  const handleDispatch = async () => {
    if (!dispatchForm.vehicle_number) {
      toast.error('Please enter vehicle number');
      return;
    }
    
    try {
      const res = await axios.patch(`${API}/procurement/v2/dispatch/${selectedRequest.request_id}`, dispatchForm);
      toast.success(`Dispatched! OTP for receipt: ${res.data.otp}`);
      setDispatchDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark as dispatched');
    }
  };

  // Create vendor master entry
  const handleCreateVendor = async () => {
    if (!vendorMasterForm.name || !vendorMasterForm.phone) {
      toast.error('Name and phone are required');
      return;
    }
    
    try {
      await axios.post(`${API}/vendor-master/v2/create`, {
        ...vendorMasterForm,
        credit_limit: vendorMasterForm.credit_limit ? parseFloat(vendorMasterForm.credit_limit) : null
      });
      toast.success('Vendor created successfully');
      setVendorMasterDialog(false);
      setVendorMasterForm({
        name: '', category: 'material', contact_person: '', phone: '', email: '',
        address: '', bank_name: '', bank_account_number: '', ifsc_code: '',
        payment_method: 'bank', upi_id: '', gst_number: '', pan_number: '',
        labour_category: '', location_coverage: '', rate_type: '',
        materials_supplied: [], tags: [], payment_terms: 'full', credit_limit: ''
      });
      const vendorsRes = await axios.get(`${API}/vendor-master`);
      setVendors(vendorsRes.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create vendor');
    }
  };

  // Pay credit
  const handlePayCredit = async () => {
    if (!creditPayForm.amount || !creditPayForm.payment_reference) {
      toast.error('Amount and payment reference required');
      return;
    }
    
    try {
      await axios.post(`${API}/procurement/credit-ledger/${selectedCredit.entry_id}/pay`, {
        amount: parseFloat(creditPayForm.amount),
        payment_reference: creditPayForm.payment_reference,
        remarks: creditPayForm.remarks
      });
      toast.success('Payment recorded');
      setCreditPayDialog(false);
      fetchCreditLedger();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  // Calculate total
  const calculateTotal = () => {
    const qty = selectedRequest?.quantity || 0;
    const rate = parseFloat(vendorForm.unit_rate) || 0;
    const transport = parseFloat(vendorForm.transport_cost) || 0;
    const discount = parseFloat(vendorForm.discount) || 0;
    return (qty * rate) + transport - discount;
  };

  const getStatusBadge = (status) => {
    const statusConfig = STATUS_FLOW.find(s => s.id === status) || { label: status, color: 'bg-gray-100 text-gray-700' };
    return <Badge className={statusConfig.color}>{statusConfig.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="My Home USB" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{mixBlendMode: "multiply"}} />
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Home USB</h1>
              <p className="text-xs text-gray-500">Procurement Board</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500 uppercase">{user?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Clock className="h-5 w-5" />
                <span className="text-sm font-medium">Pending</span>
              </div>
              <p className="text-2xl font-bold text-amber-700">{dashboard.pending_requests || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <Package className="h-5 w-5" />
                <span className="text-sm font-medium">In Progress</span>
              </div>
              <p className="text-2xl font-bold text-purple-700">{dashboard.pricing_in_progress || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-yellow-600 mb-2">
                <Wallet className="h-5 w-5" />
                <span className="text-sm font-medium">Awaiting Payment</span>
              </div>
              <p className="text-2xl font-bold text-yellow-700">{dashboard.waiting_accounts || 0}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-orange-600 mb-2">
                <Truck className="h-5 w-5" />
                <span className="text-sm font-medium">In Transit</span>
              </div>
              <p className="text-2xl font-bold text-orange-700">{transitOrders.length}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-red-50 to-red-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <CreditCard className="h-5 w-5" />
                <span className="text-sm font-medium">Credit Outstanding</span>
              </div>
              <p className="text-2xl font-bold text-red-700">₹{(creditLedger.total_outstanding / 1000).toFixed(1)}K</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Delivered</span>
              </div>
              <p className="text-2xl font-bold text-green-700">{dashboard.delivered_orders || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <Dialog open={vendorMasterDialog} onOpenChange={setVendorMasterDialog}>
            <Button onClick={() => { setVendorCategory('material'); setVendorMasterDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Add Material Vendor
            </Button>
            <Button variant="outline" onClick={() => { setVendorCategory('labour'); setVendorMasterForm({...vendorMasterForm, category: 'labour'}); setVendorMasterDialog(true); }} className="gap-2">
              <Users className="h-4 w-4" /> Add Labour Contractor
            </Button>
            
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add {vendorCategory === 'labour' ? 'Labour Contractor' : 'Material Vendor'}</DialogTitle>
                <DialogDescription>Fill in vendor details below</DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2">
                  <Label>Vendor Name *</Label>
                  <Input
                    value={vendorMasterForm.name}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, name: e.target.value})}
                    placeholder="Enter vendor name"
                  />
                </div>
                
                <div>
                  <Label>Contact Person</Label>
                  <Input
                    value={vendorMasterForm.contact_person}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, contact_person: e.target.value})}
                    placeholder="Contact person name"
                  />
                </div>
                
                <div>
                  <Label>Phone *</Label>
                  <Input
                    value={vendorMasterForm.phone}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, phone: e.target.value})}
                    placeholder="+91 XXXXXXXXXX"
                  />
                </div>
                
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={vendorMasterForm.email}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, email: e.target.value})}
                    placeholder="email@example.com"
                  />
                </div>
                
                <div>
                  <Label>Address</Label>
                  <Input
                    value={vendorMasterForm.address}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, address: e.target.value})}
                    placeholder="Full address"
                  />
                </div>
                
                {vendorCategory === 'labour' && (
                  <>
                    <div>
                      <Label>Labour Category</Label>
                      <Select 
                        value={vendorMasterForm.labour_category} 
                        onValueChange={(v) => setVendorMasterForm({...vendorMasterForm, labour_category: v})}
                      >
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {LABOUR_CATEGORIES.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Rate Type</Label>
                      <Select 
                        value={vendorMasterForm.rate_type} 
                        onValueChange={(v) => setVendorMasterForm({...vendorMasterForm, rate_type: v})}
                      >
                        <SelectTrigger><SelectValue placeholder="Select rate type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per_day">Per Day</SelectItem>
                          <SelectItem value="per_sqft">Per Sqft</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Location Coverage</Label>
                      <Input
                        value={vendorMasterForm.location_coverage}
                        onChange={(e) => setVendorMasterForm({...vendorMasterForm, location_coverage: e.target.value})}
                        placeholder="e.g., Chennai, Bangalore"
                      />
                    </div>
                  </>
                )}
                
                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-semibold mb-3">Bank Details</h4>
                </div>
                
                <div>
                  <Label>Bank Name</Label>
                  <Input
                    value={vendorMasterForm.bank_name}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, bank_name: e.target.value})}
                    placeholder="Bank name"
                  />
                </div>
                
                <div>
                  <Label>Account Number</Label>
                  <Input
                    value={vendorMasterForm.bank_account_number}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, bank_account_number: e.target.value})}
                    placeholder="Account number"
                  />
                </div>
                
                <div>
                  <Label>IFSC Code</Label>
                  <Input
                    value={vendorMasterForm.ifsc_code}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, ifsc_code: e.target.value})}
                    placeholder="IFSC code"
                  />
                </div>
                
                <div>
                  <Label>Payment Method</Label>
                  <Select 
                    value={vendorMasterForm.payment_method} 
                    onValueChange={(v) => setVendorMasterForm({...vendorMasterForm, payment_method: v})}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {vendorMasterForm.payment_method === 'upi' && (
                  <div>
                    <Label>UPI ID</Label>
                    <Input
                      value={vendorMasterForm.upi_id}
                      onChange={(e) => setVendorMasterForm({...vendorMasterForm, upi_id: e.target.value})}
                      placeholder="vendor@upi"
                    />
                  </div>
                )}
                
                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-semibold mb-3">Tax & Compliance</h4>
                </div>
                
                <div>
                  <Label>GST Number</Label>
                  <Input
                    value={vendorMasterForm.gst_number}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, gst_number: e.target.value})}
                    placeholder="GST number (optional)"
                  />
                </div>
                
                <div>
                  <Label>PAN Number</Label>
                  <Input
                    value={vendorMasterForm.pan_number}
                    onChange={(e) => setVendorMasterForm({...vendorMasterForm, pan_number: e.target.value})}
                    placeholder="PAN number"
                  />
                </div>
                
                <div>
                  <Label>Payment Terms</Label>
                  <Select 
                    value={vendorMasterForm.payment_terms} 
                    onValueChange={(v) => setVendorMasterForm({...vendorMasterForm, payment_terms: v})}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Payment</SelectItem>
                      <SelectItem value="advance">Advance</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {vendorMasterForm.payment_terms === 'credit' && (
                  <div>
                    <Label>Credit Limit (₹)</Label>
                    <Input
                      type="number"
                      value={vendorMasterForm.credit_limit}
                      onChange={(e) => setVendorMasterForm({...vendorMasterForm, credit_limit: e.target.value})}
                      placeholder="Credit limit"
                    />
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setVendorMasterDialog(false)}>Cancel</Button>
                <Button onClick={handleCreateVendor}>Create Vendor</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b pb-4">
              <TabsList className="grid grid-cols-6 w-full max-w-3xl">
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="payment">Payment</TabsTrigger>
                <TabsTrigger value="transit">Transit</TabsTrigger>
                <TabsTrigger value="credit">Credit</TabsTrigger>
                <TabsTrigger value="vendors">Vendors</TabsTrigger>
              </TabsList>
            </CardHeader>
            
            {/* Pending Requests Tab */}
            <TabsContent value="pending" className="p-6">
              <h3 className="text-lg font-bold mb-4">Planning Approved - Ready for Procurement</h3>
              {requests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No pending requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((req) => (
                    <div key={req.request_id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-gray-500">{req.order_id}</span>
                            {getStatusBadge(req.status)}
                          </div>
                          <h4 className="font-semibold mt-1">{req.material_name}</h4>
                          <p className="text-sm text-gray-500">
                            Qty: {req.quantity} {req.unit} • Project: {req.project_name || req.project_id}
                          </p>
                          {req.stage && <p className="text-xs text-gray-400">Stage: {req.stage}</p>}
                        </div>
                        <Button onClick={() => openVendorDialog(req)} className="gap-2">
                          <ArrowRight className="h-4 w-4" /> Start Purchase
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            {/* Pricing / Vendor Selection Tab */}
            <TabsContent value="pricing" className="p-6">
              <h3 className="text-lg font-bold mb-4">Vendor Selection & Pricing</h3>
              {requests.filter(r => r.status === 'vendor_selected' || r.status === 'waiting_payment').length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No items in pricing stage</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.filter(r => ['vendor_selected', 'waiting_payment', 'payment_approved', 'po_generated'].includes(r.status)).map((req) => (
                    <div key={req.request_id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-gray-500">{req.order_id}</span>
                            {getStatusBadge(req.status)}
                            <Badge variant="outline">{req.payment_type}</Badge>
                          </div>
                          <h4 className="font-semibold mt-1">{req.material_name}</h4>
                          <p className="text-sm text-gray-500">
                            Vendor: {req.vendor_name} • ₹{req.total_amount?.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {req.status === 'payment_approved' && (
                            <Button onClick={() => handleGeneratePO(req)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                              <FileText className="h-4 w-4" /> Generate PO
                            </Button>
                          )}
                          {req.status === 'vendor_selected' && req.payment_type === 'credit' && (
                            <Button onClick={() => handleGeneratePO(req)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                              <FileText className="h-4 w-4" /> Generate PO (Credit)
                            </Button>
                          )}
                          {req.status === 'po_generated' && (
                            <Button onClick={() => openDispatchDialog(req)} className="gap-2 bg-orange-600 hover:bg-orange-700">
                              <Truck className="h-4 w-4" /> Mark Dispatched
                            </Button>
                          )}
                          <Button variant="outline" onClick={() => openVendorDialog(req)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {req.po_id && (
                        <div className="mt-2 p-2 bg-indigo-50 rounded text-sm">
                          <span className="font-medium">PO:</span> {req.po_id}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            {/* Payment Waiting Tab */}
            <TabsContent value="payment" className="p-6">
              <h3 className="text-lg font-bold mb-4">Waiting for Accounts Approval</h3>
              {requests.filter(r => r.status === 'waiting_payment').length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Wallet className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No items waiting for payment approval</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.filter(r => r.status === 'waiting_payment').map((req) => (
                    <div key={req.request_id} className="border rounded-lg p-4 bg-yellow-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-gray-500">{req.order_id}</span>
                            <Badge className="bg-yellow-100 text-yellow-700">Waiting Payment</Badge>
                            <Badge variant="outline">{req.payment_type}</Badge>
                          </div>
                          <h4 className="font-semibold mt-1">{req.material_name}</h4>
                          <p className="text-sm text-gray-600">
                            Vendor: {req.vendor_name} • Total: ₹{req.total_amount?.toLocaleString()}
                          </p>
                          {req.payment_type === 'partial' && (
                            <p className="text-sm text-orange-600">
                              Advance: ₹{req.advance_amount?.toLocaleString()} | Balance: ₹{req.balance_amount?.toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-yellow-700">₹{req.total_amount?.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">Pending Accounts Approval</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            {/* Transit Tab */}
            <TabsContent value="transit" className="p-6">
              <h3 className="text-lg font-bold mb-4">In Transit Orders</h3>
              {transitOrders.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Truck className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No orders in transit</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transitOrders.map((order) => (
                    <div key={order.request_id} className="border rounded-lg p-4 bg-orange-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-gray-500">{order.order_id}</span>
                            <Badge className="bg-orange-100 text-orange-700">In Transit</Badge>
                          </div>
                          <h4 className="font-semibold mt-1">{order.material_name}</h4>
                          <p className="text-sm text-gray-600">
                            Project: {order.project_name} • Qty: {order.quantity} {order.unit}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Truck className="h-4 w-4" /> {order.vehicle_number}
                            </span>
                            {order.driver_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-4 w-4" /> {order.driver_phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-orange-700">OTP: {order.receipt_otp}</p>
                          <p className="text-xs text-gray-500">For Site Engineer Receipt</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            {/* Credit Ledger Tab */}
            <TabsContent value="credit" className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Credit Ledger</h3>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">₹{creditLedger.total_outstanding?.toLocaleString()}</p>
                </div>
              </div>
              
              {creditLedger.entries?.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No credit entries</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Vendor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Project</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Balance</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {creditLedger.entries?.map((entry) => (
                        <tr key={entry.entry_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{entry.vendor_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{entry.project_name}</td>
                          <td className="px-4 py-3 text-right">₹{entry.credit_amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-green-600">₹{entry.paid_amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-semibold text-red-600">₹{entry.balance_amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={
                              entry.status === 'paid' ? 'bg-green-100 text-green-700' :
                              entry.status === 'partially_paid' ? 'bg-yellow-100 text-yellow-700' :
                              entry.status === 'overdue' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }>
                              {entry.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {entry.status !== 'paid' && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedCredit(entry);
                                  setCreditPayForm({ amount: '', payment_reference: '', remarks: '' });
                                  setCreditPayDialog(true);
                                }}
                              >
                                Pay
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            
            {/* Vendors Tab */}
            <TabsContent value="vendors" className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Vendor Master</h3>
                <div className="flex gap-2">
                  <Select defaultValue="all">
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Vendors</SelectItem>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="labour">Labour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendors.map((vendor) => (
                  <Card key={vendor.vendor_id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold">{vendor.name}</h4>
                          <Badge variant="outline" className="mt-1">
                            {vendor.category || 'material'}
                          </Badge>
                        </div>
                        <Badge className={vendor.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                          {vendor.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-gray-600">
                        {vendor.phone && (
                          <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4" /> {vendor.phone}
                          </p>
                        )}
                        {vendor.address && (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" /> {vendor.address}
                          </p>
                        )}
                        {vendor.payment_terms && (
                          <p className="flex items-center gap-2">
                            <Wallet className="h-4 w-4" /> {vendor.payment_terms}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Vendor Selection Dialog */}
      <Dialog open={vendorDialog} onOpenChange={setVendorDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vendor Selection & Pricing</DialogTitle>
            <DialogDescription>
              {selectedRequest?.material_name} - Qty: {selectedRequest?.quantity} {selectedRequest?.unit}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Select Vendor *</Label>
              <Select 
                value={vendorForm.vendor_id} 
                onValueChange={(v) => {
                  const vendor = vendors.find(vd => vd.vendor_id === v);
                  setVendorForm({...vendorForm, vendor_id: v, vendor_name: vendor?.name || ''});
                }}
              >
                <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map(v => (
                    <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit Rate (₹) *</Label>
                <Input
                  type="number"
                  value={vendorForm.unit_rate}
                  onChange={(e) => setVendorForm({...vendorForm, unit_rate: e.target.value})}
                  placeholder="Rate per unit"
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input value={selectedRequest?.quantity || ''} disabled className="bg-gray-100" />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Transport Cost (₹)</Label>
                <Input
                  type="number"
                  value={vendorForm.transport_cost}
                  onChange={(e) => setVendorForm({...vendorForm, transport_cost: e.target.value})}
                />
              </div>
              <div>
                <Label>Discount (₹)</Label>
                <Input
                  type="number"
                  value={vendorForm.discount}
                  onChange={(e) => setVendorForm({...vendorForm, discount: e.target.value})}
                />
              </div>
            </div>
            
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-2xl font-bold text-amber-700">₹{calculateTotal().toLocaleString()}</p>
            </div>
            
            <div>
              <Label>Payment Type *</Label>
              <Select 
                value={vendorForm.payment_type} 
                onValueChange={(v) => setVendorForm({...vendorForm, payment_type: v})}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance (Full Payment)</SelectItem>
                  <SelectItem value="partial">Partial Payment</SelectItem>
                  <SelectItem value="credit">Credit (Pay Later)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {vendorForm.payment_type === 'partial' && (
              <div>
                <Label>Advance Amount (₹)</Label>
                <Input
                  type="number"
                  value={vendorForm.advance_amount}
                  onChange={(e) => setVendorForm({...vendorForm, advance_amount: e.target.value})}
                  placeholder="Amount to pay upfront"
                />
                {vendorForm.advance_amount && (
                  <p className="text-sm text-orange-600 mt-1">
                    Balance: ₹{(calculateTotal() - parseFloat(vendorForm.advance_amount || 0)).toLocaleString()}
                  </p>
                )}
              </div>
            )}
            
            <div>
              <Label>Expected Delivery</Label>
              <Input
                type="date"
                value={vendorForm.expected_delivery}
                onChange={(e) => setVendorForm({...vendorForm, expected_delivery: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialog(false)}>Cancel</Button>
            <Button onClick={handleVendorSelection}>
              {vendorForm.payment_type === 'credit' ? 'Select & Proceed' : 'Select & Send for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog */}
      <Dialog open={dispatchDialog} onOpenChange={setDispatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Dispatched</DialogTitle>
            <DialogDescription>Enter dispatch details for {selectedRequest?.material_name}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Vehicle Number *</Label>
              <Input
                value={dispatchForm.vehicle_number}
                onChange={(e) => setDispatchForm({...dispatchForm, vehicle_number: e.target.value})}
                placeholder="TN XX XXXX"
              />
            </div>
            <div>
              <Label>Driver Name</Label>
              <Input
                value={dispatchForm.driver_name}
                onChange={(e) => setDispatchForm({...dispatchForm, driver_name: e.target.value})}
              />
            </div>
            <div>
              <Label>Driver Phone</Label>
              <Input
                value={dispatchForm.driver_phone}
                onChange={(e) => setDispatchForm({...dispatchForm, driver_phone: e.target.value})}
                placeholder="+91 XXXXXXXXXX"
              />
            </div>
            <div>
              <Label>Estimated Arrival</Label>
              <Input
                type="datetime-local"
                value={dispatchForm.estimated_arrival}
                onChange={(e) => setDispatchForm({...dispatchForm, estimated_arrival: e.target.value})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchDialog(false)}>Cancel</Button>
            <Button onClick={handleDispatch} className="bg-orange-600 hover:bg-orange-700">
              <Truck className="h-4 w-4 mr-2" /> Mark Dispatched
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Payment Dialog */}
      <Dialog open={creditPayDialog} onOpenChange={setCreditPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Credit Payment</DialogTitle>
            <DialogDescription>
              Vendor: {selectedCredit?.vendor_name} • Balance: ₹{selectedCredit?.balance_amount?.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Payment Amount (₹) *</Label>
              <Input
                type="number"
                value={creditPayForm.amount}
                onChange={(e) => setCreditPayForm({...creditPayForm, amount: e.target.value})}
                placeholder="Enter amount"
                max={selectedCredit?.balance_amount}
              />
            </div>
            <div>
              <Label>Payment Reference *</Label>
              <Input
                value={creditPayForm.payment_reference}
                onChange={(e) => setCreditPayForm({...creditPayForm, payment_reference: e.target.value})}
                placeholder="Transaction ID / Cheque No"
              />
            </div>
            <div>
              <Label>Remarks</Label>
              <Textarea
                value={creditPayForm.remarks}
                onChange={(e) => setCreditPayForm({...creditPayForm, remarks: e.target.value})}
                placeholder="Optional notes"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditPayDialog(false)}>Cancel</Button>
            <Button onClick={handlePayCredit}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
