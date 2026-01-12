import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Plus } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BOQManagement() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [boqItems, setBoqItems] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    item_name: '',
    category: 'material',
    unit: '',
    quantity: '',
    unit_rate: ''
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      const [userRes, boqRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/boq/${projectId}`)
      ]);
      setUser(userRes.data);
      setBoqItems(boqRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const quantity = parseFloat(formData.quantity);
      const unit_rate = parseFloat(formData.unit_rate);
      const boqData = {
        project_id: projectId,
        item_name: formData.item_name,
        category: formData.category,
        unit: formData.unit,
        quantity,
        unit_rate,
        total_cost: quantity * unit_rate
      };

      await axios.post(`${API}/boq`, boqData);
      toast.success('BOQ item created');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to create BOQ item');
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canCreate = user.role === 'planning';

  return (
    <div className="flex min-h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />
      <div className="flex-1 md:ml-64 p-4 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 data-testid="boq-title" className="text-3xl font-bold">Bill of Quantities</h1>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-boq-btn" className="gap-2">
                  <Plus className="h-4 w-4" />Add BOQ Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add BOQ Item</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Item Name</Label>
                    <Input data-testid="boq-item-name" value={formData.item_name} onChange={(e) => setFormData({...formData, item_name: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                      <SelectTrigger data-testid="boq-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="material">Material</SelectItem>
                        <SelectItem value="labour">Labour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Unit</Label>
                      <Input data-testid="boq-unit" value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} required />
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input data-testid="boq-quantity" type="number" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: e.target.value})} required />
                    </div>
                    <div>
                      <Label>Unit Rate</Label>
                      <Input data-testid="boq-unit-rate" type="number" value={formData.unit_rate} onChange={(e) => setFormData({...formData, unit_rate: e.target.value})} required />
                    </div>
                  </div>
                  <Button data-testid="submit-boq-btn" type="submit">Create BOQ Item</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr className="border-b">
                    <th className="p-4 text-left font-semibold">Item Name</th>
                    <th className="p-4 text-left font-semibold">Category</th>
                    <th className="p-4 text-left font-semibold">Quantity</th>
                    <th className="p-4 text-left font-semibold">Unit Rate</th>
                    <th className="p-4 text-left font-semibold">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {boqItems.map((item) => (
                    <tr key={item.boq_id} data-testid={`boq-item-${item.boq_id}`} className="border-b hover:bg-muted/50">
                      <td className="p-4">{item.item_name}</td>
                      <td className="p-4 capitalize">{item.category}</td>
                      <td className="p-4">{item.quantity} {item.unit}</td>
                      <td className="p-4">₹{item.unit_rate.toLocaleString()}</td>
                      <td className="p-4 font-bold">₹{item.total_cost.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}