import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Procurement() {
  const [user, setUser] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    work_order_id: '',
    vendor_id: '',
    expected_delivery: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, woRes, vendorsRes, posRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/work-orders`),
        axios.get(`${API}/vendors`),
        axios.get(`${API}/purchase-orders`)
      ]);
      setUser(userRes.data);
      setWorkOrders(woRes.data.filter(wo => wo.status === 'approved'));
      setVendors(vendorsRes.data);
      setPurchaseOrders(posRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const wo = workOrders.find(w => w.work_order_id === formData.work_order_id);
      const poData = {
        work_order_id: formData.work_order_id,
        vendor_id: formData.vendor_id,
        item_name: wo.boq_id,
        quantity: wo.requested_quantity,
        expected_delivery: new Date(formData.expected_delivery).toISOString()
      };

      await axios.post(`${API}/purchase-orders`, poData);
      toast.success('Purchase order created');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to create PO');
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 data-testid="procurement-title" className="text-3xl font-bold">Procurement</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-po-btn" className="gap-2"><Plus className="h-4 w-4" />Create PO</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Approved Work Order</Label>
                  <Select value={formData.work_order_id} onValueChange={(v) => setFormData({...formData, work_order_id: v})}>
                    <SelectTrigger data-testid="po-wo-select"><SelectValue placeholder="Select work order" /></SelectTrigger>
                    <SelectContent>{workOrders.map(wo => <SelectItem key={wo.work_order_id} value={wo.work_order_id}>WO-{wo.work_order_id}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vendor</Label>
                  <Select value={formData.vendor_id} onValueChange={(v) => setFormData({...formData, vendor_id: v})}>
                    <SelectTrigger data-testid="po-vendor-select"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>{vendors.map(v => <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <Input data-testid="po-delivery-input" type="date" value={formData.expected_delivery} onChange={(e) => setFormData({...formData, expected_delivery: e.target.value})} required />
                </div>
                <Button data-testid="submit-po-btn" type="submit">Create PO</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          {purchaseOrders.map((po) => (
            <Card key={po.po_id} data-testid={`po-${po.po_id}`} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg">PO-{po.po_id}</h3>
                  <p className="text-muted-foreground">Item: {po.item_name} | Qty: {po.quantity}</p>
                  <p className="text-sm mt-1">Expected: {new Date(po.expected_delivery).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">Status: {po.status}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}