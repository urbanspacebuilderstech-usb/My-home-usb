import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Plus, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function WorkOrders() {
  const [user, setUser] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    project_id: '',
    boq_id: '',
    requested_quantity: '',
    purpose: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
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

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
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
        purpose: formData.purpose
      };

      const response = await axios.post(`${API}/work-orders`, woData);
      await axios.patch(`${API}/work-orders/${response.data.work_order_id}/submit`);
      toast.success('Work order submitted');
      setDialogOpen(false);
      setFormData({ project_id: '', boq_id: '', requested_quantity: '', purpose: '' });
      fetchData(false);
    } catch (error) {
      toast.error('Failed to create work order');
    }
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.project_id === projectId);
    return project?.name || projectId;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'submitted': return 'bg-yellow-100 text-yellow-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'closed': return 'bg-amber-50 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canCreate = user.role === 'project_manager' || user.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 data-testid="work-orders-title" className="text-3xl font-bold text-gray-900">Work Orders</h2>
            <p className="text-gray-600 mt-1">Manage and track all work orders</p>
          </div>
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-wo-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                  <Plus className="h-4 w-4" />Create Work Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Work Order</DialogTitle>
                  <DialogDescription>Create a new work order against BOQ items</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Project</Label>
                    <Select 
                      value={formData.project_id} 
                      onValueChange={(v) => { 
                        setFormData({...formData, project_id: v, boq_id: ''}); 
                        fetchBOQ(v); 
                      }}
                    >
                      <SelectTrigger data-testid="wo-project-select">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map(p => (
                          <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.project_id && (
                    <div>
                      <Label>BOQ Item</Label>
                      <Select 
                        value={formData.boq_id} 
                        onValueChange={(v) => setFormData({...formData, boq_id: v})}
                      >
                        <SelectTrigger data-testid="wo-boq-select">
                          <SelectValue placeholder="Select BOQ item" />
                        </SelectTrigger>
                        <SelectContent>
                          {boqItems.map(b => (
                            <SelectItem key={b.boq_id} value={b.boq_id}>
                              {b.item_name} - {b.unit} (₹{b.unit_rate}/unit)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Requested Quantity</Label>
                    <NumericInput 
                      data-testid="wo-quantity-input"
                       
                      value={formData.requested_quantity} 
                      onChange={(e) => setFormData({...formData, requested_quantity: e.target.value})} 
                      required 
                    />
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Input 
                      data-testid="wo-purpose-input"
                      value={formData.purpose} 
                      onChange={(e) => setFormData({...formData, purpose: e.target.value})} 
                      placeholder="Describe the purpose of this work order"
                      required 
                    />
                  </div>
                  <Button data-testid="submit-wo-btn" type="submit" className="w-full">Submit Work Order</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{workOrders.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-700">
                {workOrders.filter(wo => wo.status === 'submitted').length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-700">
                {workOrders.filter(wo => wo.status === 'approved').length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-700">
                {workOrders.filter(wo => wo.status === 'rejected').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Work Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Work Order</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Purpose</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Est. Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workOrders.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                        No work orders found
                      </td>
                    </tr>
                  ) : (
                    workOrders.map((wo) => (
                      <tr key={wo.work_order_id} data-testid={`wo-row-${wo.work_order_id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className="font-semibold text-amber-600">{wo.work_order_id}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{getProjectName(wo.project_id)}</td>
                        <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{wo.purpose}</td>
                        <td className="px-6 py-4 font-medium">{wo.requested_quantity}</td>
                        <td className="px-6 py-4 font-semibold">₹{wo.estimated_cost?.toLocaleString() || 0}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(wo.status)}`}>
                            {wo.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
                          {new Date(wo.created_at).toLocaleDateString()}
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
