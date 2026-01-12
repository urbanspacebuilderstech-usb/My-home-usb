import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin, Camera, Upload } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SiteReceipt() {
  const [user, setUser] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useState(null);
  const [formData, setFormData] = useState({
    po_id: '',
    work_order_id: '',
    quantity_received: '',
    lorry_image: null,
    material_images: []
  });
  const [lorryPreview, setLorryPreview] = useState(null);
  const [materialPreviews, setMaterialPreviews] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, posRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/purchase-orders`)
      ]);
      setUser(userRes.data);
      setPurchaseOrders(posRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast.error('GPS not supported');
      return;
    }

    toast.loading('Capturing GPS location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString()
        });
        toast.success(`GPS captured: ${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
      },
      (error) => {
        toast.error('Failed to capture GPS');
        console.error('GPS error:', error);
      }
    );
  };

  const handleLorryImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFormData({ ...formData, lorry_image: file });
    setLorryPreview(URL.createObjectURL(file));
  };

  const handleMaterialImages = async (e) => {
    const files = Array.from(e.target.files);
    setFormData({ ...formData, material_images: files });
    setMaterialPreviews(files.map(f => URL.createObjectURL(f)));
  };

  const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(`${API}/site-receipts/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data.file_id;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!location) {
      toast.error('Please capture GPS location first');
      return;
    }

    if (!formData.lorry_image) {
      toast.error('Please upload lorry image');
      return;
    }

    try {
      toast.loading('Uploading images...');
      
      const lorryImageId = await uploadImage(formData.lorry_image);
      const materialImageIds = await Promise.all(
        formData.material_images.map(img => uploadImage(img))
      );

      const receiptData = {
        po_id: formData.po_id,
        work_order_id: formData.work_order_id,
        quantity_received: parseFloat(formData.quantity_received),
        latitude: location.latitude,
        longitude: location.longitude,
        captured_at: location.timestamp,
        lorry_image_id: lorryImageId,
        material_image_ids: materialImageIds
      };

      await axios.post(`${API}/site-receipts`, receiptData);
      toast.success('Site receipt submitted successfully');
      
      setFormData({
        po_id: '',
        work_order_id: '',
        quantity_received: '',
        lorry_image: null,
        material_images: []
      });
      setLocation(null);
      setLorryPreview(null);
      setMaterialPreviews([]);
    } catch (error) {
      console.error('Failed to submit receipt:', error);
      toast.error('Failed to submit site receipt');
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <h1 data-testid="site-receipt-title" className="text-3xl font-bold mb-8">Site Material Receipt</h1>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Record Material Arrival</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label>Purchase Order</Label>
                <Select 
                  value={formData.po_id} 
                  onValueChange={(v) => {
                    const po = purchaseOrders.find(p => p.po_id === v);
                    setFormData({...formData, po_id: v, work_order_id: po?.work_order_id || ''});
                  }}
                >
                  <SelectTrigger data-testid="po-select">
                    <SelectValue placeholder="Select PO" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map(po => (
                      <SelectItem key={po.po_id} value={po.po_id}>
                        PO-{po.po_id} - {po.item_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Quantity Received</Label>
                <Input
                  data-testid="quantity-received-input"
                  type="number"
                  value={formData.quantity_received}
                  onChange={(e) => setFormData({...formData, quantity_received: e.target.value})}
                  required
                />
              </div>

              <div>
                <Label className="block mb-2">GPS Location (MANDATORY)</Label>
                <Button
                  data-testid="capture-gps-btn"
                  type="button"
                  onClick={captureGPS}
                  className="w-full h-14 gap-2 text-lg font-bold"
                  variant={location ? "default" : "outline"}
                >
                  <MapPin className="h-6 w-6" />
                  {location 
                    ? `Location Captured: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
                    : 'Capture GPS Location'
                  }
                </Button>
              </div>

              <div>
                <Label>Lorry Image (MANDATORY)</Label>
                <Input
                  data-testid="lorry-image-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleLorryImage}
                  required
                />
                {lorryPreview && (
                  <img src={lorryPreview} alt="Lorry" className="mt-2 w-full h-48 object-cover rounded border" />
                )}
              </div>

              <div>
                <Label>Material Images</Label>
                <Input
                  data-testid="material-images-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleMaterialImages}
                />
                {materialPreviews.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {materialPreviews.map((preview, idx) => (
                      <img key={idx} src={preview} alt={`Material ${idx+1}`} className="w-full h-32 object-cover rounded border" />
                    ))}
                  </div>
                )}
              </div>

              <Button
                data-testid="submit-receipt-btn"
                type="submit"
                className="w-full h-14 text-lg font-bold"
              >
                <Upload className="h-5 w-5 mr-2" />
                Submit Site Receipt
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
