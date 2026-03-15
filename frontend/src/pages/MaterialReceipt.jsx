import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';import { 
  Package, Truck, CheckCircle, XCircle, MapPin, Camera, Phone, 
  Clock, AlertCircle, Navigation, QrCode, ShieldCheck, Eye, 
  LogOut, Mail, RefreshCw, Loader2
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], 16);
  }, [lat, lng, map]);
  return null;
}

function LocationMap({ lat, lng, height = '180px', label }) {
  if (!lat || !lng) return null;
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height }} data-testid="location-map">
      <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]}>
          <Popup>{label || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}</Popup>
        </Marker>
        <RecenterMap lat={lat} lng={lng} />
      </MapContainer>
    </div>
  );
}

export default function MaterialReceipt() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transitOrders, setTransitOrders] = useState([]);
  const [receivedOrders, setReceivedOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  
  const [receiptDialog, setReceiptDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiptForm, setReceiptForm] = useState({ received_qty: '', otp: '', remarks: '', photo_id: null });
  const [gpsLocation, setGpsLocation] = useState({ lat: null, lng: null, loading: false, error: null });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpStatus, setOtpStatus] = useState(null);
  const fileInputRef = useRef(null);
  
  const [viewDialog, setViewDialog] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, transitRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/procurement/transit`)
      ]);
      setUser(userRes.data);
      const orders = transitRes.data || [];
      setTransitOrders(orders.filter(o => o.status === 'in_transit'));
      setReceivedOrders(orders.filter(o => ['received_partial', 'received_completed'].includes(o.status)));
    } catch (error) {
      if (error.response?.status === 403) toast.error('Access denied');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    window.location.href = '/login';
  };

  const getGPSLocation = () => {
    if (!navigator.geolocation) {
      setGpsLocation(prev => ({ ...prev, error: 'Geolocation not supported' }));
      return;
    }
    setGpsLocation(prev => ({ ...prev, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, loading: false, error: null });
        toast.success('GPS location captured');
      },
      () => {
        setGpsLocation(prev => ({ ...prev, loading: false, error: 'Failed to get location. Please enable GPS.' }));
        toast.error('Failed to get GPS location');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'material-receipt');
      if (selectedOrder?.project_id) formData.append('project_id', selectedOrder.project_id);
      const res = await axios.post(`${API}/files/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReceiptForm(prev => ({ ...prev, photo_id: res.data.file_id }));
      toast.success('Photo uploaded with location data');
    } catch { toast.error('Failed to upload photo'); }
  };

  const requestOtpEmail = async () => {
    if (!selectedOrder) return;
    setOtpSending(true);
    try {
      const res = await axios.post(`${API}/procurement/v2/resend-otp/${selectedOrder.request_id}`);
      if (res.data.otp_sent) {
        setOtpStatus('sent');
        toast.success('OTP sent to your email!');
      } else {
        setOtpStatus('fallback');
        if (res.data.test_otp) {
          setReceiptForm(prev => ({ ...prev, otp: res.data.test_otp }));
          toast.info('Email unavailable. OTP auto-filled for verification.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send OTP');
      setOtpStatus('error');
    }
    setOtpSending(false);
  };

  const openReceiptDialog = (order) => {
    setSelectedOrder(order);
    setReceiptForm({ received_qty: order.quantity?.toString() || '', otp: '', remarks: '', photo_id: null });
    setGpsLocation({ lat: null, lng: null, loading: false, error: null });
    setPhotoPreview(null);
    setOtpStatus(null);
    setReceiptDialog(true);
    getGPSLocation();
  };

  const handleSubmitReceipt = async () => {
    if (!receiptForm.otp) return toast.error('Please enter the OTP');
    if (!receiptForm.received_qty) return toast.error('Please enter received quantity');
    if (!gpsLocation.lat || !gpsLocation.lng) return toast.error('GPS location is required');
    try {
      await axios.post(`${API}/procurement/v2/receive/${selectedOrder.request_id}`, {
        received_qty: parseFloat(receiptForm.received_qty),
        otp: receiptForm.otp,
        gps_lat: gpsLocation.lat, gps_lng: gpsLocation.lng,
        photo_id: receiptForm.photo_id, remarks: receiptForm.remarks
      });
      toast.success('Material received successfully!');
      setReceiptDialog(false);
      fetchData(false);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(detail === 'Invalid OTP' ? 'Invalid OTP. Please check and try again.' : detail || 'Failed to submit receipt');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-2 rounded-lg">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Material Receipt</h1>
              <p className="text-xs text-gray-500">Site Engineer Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => window.location.href = '/site-engineer'}>
              Back to Dashboard
            </Button>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500 uppercase">{user?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-btn">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-orange-600 mb-2">
                <Truck className="h-5 w-5" />
                <span className="text-sm font-medium">In Transit</span>
              </div>
              <p className="text-3xl font-bold text-orange-700" data-testid="transit-count">{transitOrders.length}</p>
              <p className="text-xs text-orange-600 mt-1">Awaiting receipt</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Received</span>
              </div>
              <p className="text-3xl font-bold text-green-700" data-testid="received-count">{receivedOrders.length}</p>
              <p className="text-xs text-green-600 mt-1">Completed receipts</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button variant={activeTab === 'pending' ? 'default' : 'outline'} onClick={() => setActiveTab('pending')} className="gap-2" data-testid="pending-tab">
            <Truck className="h-4 w-4" /> Pending Receipt ({transitOrders.length})
          </Button>
          <Button variant={activeTab === 'received' ? 'default' : 'outline'} onClick={() => setActiveTab('received')} className="gap-2" data-testid="received-tab">
            <CheckCircle className="h-4 w-4" /> Received ({receivedOrders.length})
          </Button>
        </div>

        {/* Pending Orders */}
        {activeTab === 'pending' && (
          <div className="space-y-4" data-testid="pending-orders-list">
            {transitOrders.length === 0 ? (
              <Card className="p-12 text-center" data-testid="no-pending-orders">
                <Truck className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-600">No Pending Deliveries</h3>
                <p className="text-gray-500 mt-2">Materials in transit will appear here</p>
              </Card>
            ) : (
              transitOrders.map((order) => (
                <Card key={order.request_id} className="overflow-hidden" data-testid={`order-card-${order.request_id}`}>
                  <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      <span className="font-semibold">In Transit</span>
                    </div>
                    <Badge className="bg-white text-orange-600">{order.order_id}</Badge>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold">{order.material_name}</h3>
                        <p className="text-sm text-gray-600 mt-1">Project: {order.project_name || order.project_id}</p>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div><p className="text-xs text-gray-500">Quantity</p><p className="font-semibold">{order.quantity} {order.unit}</p></div>
                          <div><p className="text-xs text-gray-500">Vendor</p><p className="font-semibold">{order.vendor_name}</p></div>
                        </div>
                        <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
                          {order.vehicle_number && <span className="flex items-center gap-1"><Truck className="h-4 w-4" /> {order.vehicle_number}</span>}
                          {order.driver_phone && <span className="flex items-center gap-1"><Phone className="h-4 w-4" /> {order.driver_phone}</span>}
                        </div>
                        {order.dispatched_at && (
                          <p className="text-xs text-gray-500 mt-2"><Clock className="h-3 w-3 inline mr-1" />Dispatched: {new Date(order.dispatched_at).toLocaleString('en-IN')}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button onClick={() => openReceiptDialog(order)} className="gap-2 bg-green-600 hover:bg-green-700" data-testid={`receive-btn-${order.request_id}`}>
                          <CheckCircle className="h-4 w-4" /> Receive Material
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setViewOrder(order); setViewDialog(true); }} data-testid={`view-btn-${order.request_id}`}>
                          <Eye className="h-4 w-4 mr-1" /> View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Received Orders */}
        {activeTab === 'received' && (
          <div className="space-y-4" data-testid="received-orders-list">
            {receivedOrders.length === 0 ? (
              <Card className="p-12 text-center" data-testid="no-received-orders">
                <CheckCircle className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-600">No Received Materials</h3>
                <p className="text-gray-500 mt-2">Completed receipts will appear here</p>
              </Card>
            ) : (
              receivedOrders.map((order) => (
                <Card key={order.request_id} className="overflow-hidden" data-testid={`received-card-${order.request_id}`}>
                  <div className={`${order.status === 'received_completed' ? 'bg-green-500' : 'bg-yellow-500'} text-white px-4 py-2 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-semibold">{order.status === 'received_completed' ? 'Fully Received' : 'Partially Received'}</span>
                    </div>
                    <Badge className="bg-white text-gray-700">{order.order_id}</Badge>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="text-lg font-bold">{order.material_name}</h3>
                    <p className="text-sm text-gray-600">Project: {order.project_name}</p>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div><p className="text-xs text-gray-500">Ordered</p><p className="font-semibold">{order.quantity} {order.unit}</p></div>
                      <div><p className="text-xs text-gray-500">Received</p><p className="font-semibold text-green-600">{order.received_qty} {order.unit}</p></div>
                      <div><p className="text-xs text-gray-500">Shortfall</p>
                        <p className={`font-semibold ${order.quantity - order.received_qty > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {order.quantity - order.received_qty} {order.unit}
                        </p>
                      </div>
                    </div>

                    {/* GPS Map for received orders */}
                    {order.receipt_gps_lat && order.receipt_gps_lng && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Receipt Location
                        </p>
                        <LocationMap lat={order.receipt_gps_lat} lng={order.receipt_gps_lng} height="150px" label={`Received: ${order.material_name}`} />
                        <p className="text-xs text-gray-400 mt-1">{order.receipt_gps_lat.toFixed(6)}, {order.receipt_gps_lng.toFixed(6)}</p>
                      </div>
                    )}

                    {order.received_at && (
                      <p className="text-xs text-gray-500 mt-4">
                        <CheckCircle className="h-3 w-3 inline mr-1 text-green-500" />
                        Received: {new Date(order.received_at).toLocaleString('en-IN')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Receipt Dialog with Map */}
      <Dialog open={receiptDialog} onOpenChange={setReceiptDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Material Receipt Verification
            </DialogTitle>
            <DialogDescription>
              Verify and confirm receipt of: {selectedOrder?.material_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Order Summary */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-gray-500">Order ID</p><p className="font-semibold">{selectedOrder?.order_id}</p></div>
                <div><p className="text-gray-500">Vendor</p><p className="font-semibold">{selectedOrder?.vendor_name}</p></div>
                <div><p className="text-gray-500">Expected Qty</p><p className="font-semibold">{selectedOrder?.quantity} {selectedOrder?.unit}</p></div>
                <div><p className="text-gray-500">Vehicle</p><p className="font-semibold">{selectedOrder?.vehicle_number || '-'}</p></div>
              </div>
            </div>

            {/* Email OTP Section */}
            <div className="border-2 border-blue-200 rounded-lg p-4 bg-amber-50">
              <Label className="text-amber-700 font-semibold flex items-center gap-2">
                <QrCode className="h-4 w-4" /> OTP Verification *
              </Label>
              
              <div className="flex gap-2 mt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={requestOtpEmail} 
                  disabled={otpSending}
                  className="gap-1 border-blue-300 text-amber-700 hover:bg-amber-50"
                  data-testid="send-otp-email-btn"
                >
                  {otpSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {otpSending ? 'Sending...' : otpStatus === 'sent' ? 'Resend OTP' : 'Send OTP to Email'}
                </Button>
                {otpStatus === 'sent' && (
                  <Badge className="bg-green-100 text-green-700 border-green-300">OTP Sent</Badge>
                )}
              </div>

              <Input
                data-testid="receipt-otp-input"
                type="text"
                maxLength={6}
                value={receiptForm.otp}
                onChange={(e) => setReceiptForm(prev => ({ ...prev, otp: e.target.value }))}
                placeholder="Enter 6-digit OTP"
                className="mt-3 text-center text-2xl tracking-widest font-mono"
              />
              <p className="text-xs text-amber-600 mt-2">
                {otpStatus === 'sent' 
                  ? 'Check your email for the OTP code' 
                  : otpStatus === 'fallback'
                  ? 'OTP auto-filled (email service unavailable)'
                  : 'Click "Send OTP to Email" to receive verification code'}
              </p>
            </div>

            {/* Received Quantity */}
            <div>
              <Label>Received Quantity *</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  data-testid="received-qty-input"
                  type="number"
                  value={receiptForm.received_qty}
                  onChange={(e) => setReceiptForm(prev => ({ ...prev, received_qty: e.target.value }))}
                  placeholder="Enter received qty"
                  max={selectedOrder?.quantity}
                />
                <span className="text-gray-500">{selectedOrder?.unit}</span>
              </div>
              {receiptForm.received_qty && parseFloat(receiptForm.received_qty) < selectedOrder?.quantity && (
                <p className="text-xs text-orange-600 mt-1">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Partial receipt: {selectedOrder?.quantity - parseFloat(receiptForm.received_qty)} {selectedOrder?.unit} short
                </p>
              )}
            </div>

            {/* GPS Location with Map */}
            <div>
              <Label className="flex items-center justify-between">
                <span>GPS Location *</span>
                <Button type="button" variant="outline" size="sm" onClick={getGPSLocation} disabled={gpsLocation.loading} data-testid="get-location-btn">
                  <Navigation className="h-4 w-4 mr-1" />
                  {gpsLocation.loading ? 'Getting...' : 'Get Location'}
                </Button>
              </Label>
              
              {gpsLocation.lat && gpsLocation.lng ? (
                <div className="mt-2 space-y-2">
                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm font-medium">Location Captured</span>
                    <span className="text-xs text-green-600 ml-auto">{gpsLocation.lat.toFixed(6)}, {gpsLocation.lng.toFixed(6)}</span>
                  </div>
                  <LocationMap lat={gpsLocation.lat} lng={gpsLocation.lng} label="Receipt Location" />
                </div>
              ) : gpsLocation.error ? (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{gpsLocation.error}</p>
                </div>
              ) : (
                <div className="mt-2 p-3 bg-gray-100 border rounded-lg">
                  <p className="text-sm text-gray-500">Click "Get Location" to capture GPS coordinates</p>
                </div>
              )}
            </div>

            {/* Photo Upload */}
            <div>
              <Label>Upload Photo (Optional)</Label>
              <div className="mt-2">
                <input
                  type="file" accept="image/*" capture="environment"
                  ref={fileInputRef} onChange={handlePhotoUpload} className="hidden"
                  data-testid="photo-upload-input"
                />
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Receipt" className="w-full h-40 object-cover rounded-lg" />
                    <Button variant="outline" size="sm" className="absolute top-2 right-2"
                      onClick={() => { setPhotoPreview(null); setReceiptForm(prev => ({ ...prev, photo_id: null })); }}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full h-20 border-dashed"
                    onClick={() => fileInputRef.current?.click()} data-testid="take-photo-btn">
                    <div className="text-center">
                      <Camera className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-sm text-gray-500 mt-1">Tap to take photo</p>
                    </div>
                  </Button>
                )}
              </div>
            </div>

            {/* Remarks */}
            <div>
              <Label>Remarks (Optional)</Label>
              <Textarea
                value={receiptForm.remarks}
                onChange={(e) => setReceiptForm(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Any observations about the delivery..."
                rows={2} className="mt-1"
                data-testid="receipt-remarks"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialog(false)}>Cancel</Button>
            <Button 
              data-testid="confirm-receipt-btn"
              onClick={handleSubmitReceipt}
              className="bg-green-600 hover:bg-green-700 gap-2"
              disabled={!gpsLocation.lat || !receiptForm.otp || !receiptForm.received_qty}
            >
              <CheckCircle className="h-4 w-4" /> Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Order Dialog with Map */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {viewOrder && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500">Order ID</p><p className="font-semibold">{viewOrder.order_id}</p></div>
                <div><p className="text-xs text-gray-500">Status</p><Badge>{viewOrder.status}</Badge></div>
                <div><p className="text-xs text-gray-500">Material</p><p className="font-semibold">{viewOrder.material_name}</p></div>
                <div><p className="text-xs text-gray-500">Quantity</p><p className="font-semibold">{viewOrder.quantity} {viewOrder.unit}</p></div>
                <div><p className="text-xs text-gray-500">Vendor</p><p className="font-semibold">{viewOrder.vendor_name}</p></div>
                <div><p className="text-xs text-gray-500">Total Amount</p><p className="font-semibold">Rs. {viewOrder.total_amount?.toLocaleString()}</p></div>
                <div><p className="text-xs text-gray-500">Vehicle Number</p><p className="font-semibold">{viewOrder.vehicle_number || '-'}</p></div>
                <div><p className="text-xs text-gray-500">Driver Phone</p><p className="font-semibold">{viewOrder.driver_phone || '-'}</p></div>
              </div>

              {/* Receipt location map for received orders */}
              {viewOrder.receipt_gps_lat && viewOrder.receipt_gps_lng && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> Receipt Location</p>
                  <LocationMap lat={viewOrder.receipt_gps_lat} lng={viewOrder.receipt_gps_lng} label={`Received: ${viewOrder.material_name}`} />
                </div>
              )}

              {viewOrder.dispatched_at && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-gray-500">Dispatched At</p>
                  <p className="font-semibold">{new Date(viewOrder.dispatched_at).toLocaleString('en-IN')}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
