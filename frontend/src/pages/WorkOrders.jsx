import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WorkOrders() {
  const [user, setUser] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    project_id: '',
    boq_id: '',
    requested_quantity: '',
    purpose: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [userRes, woRes, projRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/work-orders`),
        axios.get(`${API}/projects`)
      ]);
      setUser(userRes.data);
      setWorkOrders(woRes.data);
      setProjects(projRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const fetchBOQ = async (projectId) => {
    try {
      const response = await axios.get(`${API}/boq/${projectId}`);
      setBoqItems(response.data);
    } catch (error) {
      console.error('Failed to fetch BOQ:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const boqItem = boqItems.find(b => b.boq_id === formData.boq_id);
      const woData = {
        project_id: formData.project_id,
        boq_id: formData.boq_id,
        requested_quantity: parseFloat(formData.requested_quantity),
        estimated_cost: boqItem.unit_rate * parseFloat(formData.requested_quantity),
        purpose: formData.purpose,
        status: 'draft'
      };

      const response = await axios.post(`${API}/work-orders`, woData);
      await axios.patch(`${API}/work-orders/${response.data.work_order_id}/submit`);
      toast.success('Work order submitted');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to create work order');
    }
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const canCreate = user.role === 'project_manager' || user.role === 'super_admin';

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 data-testid="work-orders-title" className="text-3xl font-bold">Work Orders</h1>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-wo-btn" className="gap-2"><Plus className="h-4 w-4" />Create Work Order</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Project</Label>
                    <Select value={formData.project_id} onValueChange={(v) => { setFormData({...formData, project_id: v}); fetchBOQ(v); }}>
                      <SelectTrigger data-testid="wo-project-select"><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {formData.project_id && (
                    <div>
                      <Label>BOQ Item</Label>
                      <Select value={formData.boq_id} onValueChange={(v) => setFormData({...formData, boq_id: v})}>
                        <SelectTrigger data-testid="wo-boq-select"><SelectValue placeholder="Select BOQ item" /></SelectTrigger>
                        <SelectContent>{boqItems.map(b => <SelectItem key={b.boq_id} value={b.boq_id}>{b.item_name} - {b.unit}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Requested Quantity</Label>
                    <Input data-testid="wo-quantity-input" type="number" value={formData.requested_quantity} onChange={(e) => setFormData({...formData, requested_quantity: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Input data-testid="wo-purpose-input" value={formData.purpose} onChange={(e) => setFormData({...formData, purpose: e.target.value})} required />
                  </div>
                  <Button data-testid="submit-wo-btn" type="submit">Submit Work Order</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="space-y-4">
          {workOrders.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No work orders found</Card>
          ) : (
            workOrders.map((wo) => (
              <Card key={wo.work_order_id} data-testid={`wo-${wo.work_order_id}`} className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-lg">WO-{wo.work_order_id}</h3>
                    <p className="text-muted-foreground">Project: {wo.project_id}</p>
                    <p className="text-sm mt-2">{wo.purpose}</p>
                    <p className="text-sm font-semibold mt-2">Quantity: {wo.requested_quantity} | Estimated: ₹{wo.estimated_cost.toLocaleString()}</p>
                  </div>
                  <Badge data-testid={`wo-status-${wo.work_order_id}`}>{wo.status}</Badge>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}