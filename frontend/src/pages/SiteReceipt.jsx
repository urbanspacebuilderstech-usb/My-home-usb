import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Building2, LogOut, Upload, MapPin, Camera, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SiteReceipt() {
  const [user, setUser] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [location, setLocation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    work_order_id: '',
    po_id: '',
    quantity_received: '',
    lorry_image_id: '',
    material_image_ids: []
  });

  useEffect(() => {
    fetchData();
    getLocation();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      const [userRes, posRes, woRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/purchase-orders`),
        axios.get(`${API}/work-orders`)
      ]);
      setUser(userRes.data);
      setPurchaseOrders(posRes.data.filter(po => po.status === 'pending'));
      setWorkOrders(woRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          console.error('Location error:', error);
          toast.error('Could not get location. Please enable GPS.');
        }
      );
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

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedIds = [];

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post(`${API}/site-receipts/upload-image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        uploadedIds.push(response.data.file_id);
      }

      if (uploadedIds.length > 0) {
        setFormData(prev => ({
          ...prev,
          lorry_image_id: prev.lorry_image_id || uploadedIds[0],
          material_image_ids: [...prev.material_image_ids, ...uploadedIds.slice(1)]
        }));
        toast.success(`${uploadedIds.length} image(s) uploaded`);
      }
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!location) {
      toast.error('GPS location is required');
      return;
    }

    if (!formData.lorry_image_id) {
      toast.error('At least one image is required');
      return;
    }

    try {
      await axios.post(`${API}/site-receipts`, {
        work_order_id: formData.work_order_id,
        po_id: formData.po_id,
        quantity_received: parseFloat(formData.quantity_received),
        latitude: location.latitude,
        longitude: location.longitude,
        captured_at: new Date().toISOString(),
        lorry_image_id: formData.lorry_image_id,
        material_image_ids: formData.material_image_ids
      });
      
      toast.success('Site receipt submitted successfully');
      setDialogOpen(false);
      setFormData({
        work_order_id: '',
        po_id: '',
        quantity_received: '',
        lorry_image_id: '',
        material_image_ids: []
      });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit receipt');
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canSubmit = user.role === 'site_engineer' || user.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="My Home USB" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{mixBlendMode: "multiply"}} />
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Home USB</h1>
              <p className="text-xs text-gray-500">Project Management System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/work-orders'}>
              Work Orders
            </Button>
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.role.replace('_', ' ').toUpperCase()}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 data-testid="site-receipt-title" className="text-3xl font-bold text-gray-900">Site Receipt</h2>
            <p className="text-gray-600 mt-1">Record material deliveries with GPS verification</p>
          </div>
          {canSubmit && purchaseOrders.length > 0 && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="new-receipt-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                  <Upload className="h-4 w-4" />New Receipt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Submit Site Receipt</DialogTitle>
                  <DialogDescription>Record material delivery with GPS and photos</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Purchase Order</Label>
                    <Select
                      value={formData.po_id}
                      onValueChange={(v) => {
                        const po = purchaseOrders.find(p => p.po_id === v);
                        setFormData({
                          ...formData, 
                          po_id: v,
                          work_order_id: po?.work_order_id || ''
                        });
                      }}
                    >
                      <SelectTrigger data-testid="receipt-po-select">
                        <SelectValue placeholder="Select PO" />
                      </SelectTrigger>
                      <SelectContent>
                        {purchaseOrders.map(po => (
                          <SelectItem key={po.po_id} value={po.po_id}>
                            {po.po_id} - {po.item_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Quantity Received</Label>
                    <Input
                      data-testid="receipt-quantity-input"
                      type="number"
                      value={formData.quantity_received}
                      onChange={(e) => setFormData({...formData, quantity_received: e.target.value})}
                      required
                    />
                  </div>

                  {/* GPS Location */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className={`h-5 w-5 ${location ? 'text-green-600' : 'text-red-600'}`} />
                      <span className="font-medium">GPS Location</span>
                    </div>
                    {location ? (
                      <p className="text-sm text-gray-600">
                        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                      </p>
                    ) : (
                      <div>
                        <p className="text-sm text-red-600 mb-2">Location not available</p>
                        <Button type="button" size="sm" variant="outline" onClick={getLocation}>
                          Retry GPS
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Image Upload */}
                  <div>
                    <Label>Upload Photos</Label>
                    <div className="mt-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        <Camera className="h-4 w-4" />
                        {uploading ? 'Uploading...' : 'Select Images'}
                      </Button>
                    </div>
                    {(formData.lorry_image_id || formData.material_image_ids.length > 0) && (
                      <p className="text-sm text-green-600 mt-2">
                        ✓ {1 + formData.material_image_ids.length} image(s) uploaded
                      </p>
                    )}
                  </div>

                  <Button 
                    data-testid="submit-receipt-btn" 
                    type="submit" 
                    className="w-full"
                    disabled={!location || !formData.lorry_image_id}
                  >
                    Submit Receipt
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-yellow-600" />
                <span className="text-2xl font-bold text-yellow-700">{purchaseOrders.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">GPS Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MapPin className={`h-6 w-6 ${location ? 'text-green-600' : 'text-red-600'}`} />
                <span className={`text-lg font-bold ${location ? 'text-green-700' : 'text-red-700'}`}>
                  {location ? 'Active' : 'Inactive'}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Your Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-amber-700">
                {user.role.replace('_', ' ').toUpperCase()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending POs */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">PO ID</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Expected Delivery</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {purchaseOrders.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                        No pending deliveries
                      </td>
                    </tr>
                  ) : (
                    purchaseOrders.map((po) => (
                      <tr key={po.po_id} data-testid={`po-row-${po.po_id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-semibold text-amber-600">{po.po_id}</td>
                        <td className="px-6 py-4">{po.item_name}</td>
                        <td className="px-6 py-4">{po.quantity}</td>
                        <td className="px-6 py-4">{new Date(po.expected_delivery).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary">{po.status}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
