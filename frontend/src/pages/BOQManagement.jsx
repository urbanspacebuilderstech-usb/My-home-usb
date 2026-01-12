import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Building2, LogOut, Plus, ArrowLeft, Lock, Unlock, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BOQManagement() {
  const { projectId } = useParams();
  const [user, setUser] = useState(null);
  const [project, setProject] = useState(null);
  const [boqItems, setBoqItems] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
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
      const [userRes, projRes, boqRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/projects/${projectId}`),
        axios.get(`${API}/boq/${projectId}`)
      ]);
      setUser(userRes.data);
      setProject(projRes.data);
      setBoqItems(boqRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const resetForm = () => {
    setFormData({ item_name: '', category: 'material', unit: '', quantity: '', unit_rate: '' });
    setEditingItem(null);
  };

  const openEditDialog = (item) => {
    if (item.locked) {
      toast.error('Cannot edit locked BOQ item');
      return;
    }
    setEditingItem(item);
    setFormData({
      item_name: item.item_name,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity.toString(),
      unit_rate: item.unit_rate.toString()
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const quantity = parseFloat(formData.quantity);
      const unitRate = parseFloat(formData.unit_rate);
      
      if (editingItem) {
        await axios.patch(`${API}/boq/${editingItem.boq_id}`, {
          item_name: formData.item_name,
          quantity: quantity,
          unit_rate: unitRate
        });
        toast.success('BOQ item updated successfully');
      } else {
        await axios.post(`${API}/boq`, {
          project_id: projectId,
          item_name: formData.item_name,
          category: formData.category,
          unit: formData.unit,
          quantity: quantity,
          unit_rate: unitRate,
          total_cost: quantity * unitRate
        });
        toast.success('BOQ item added successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (editingItem ? 'Failed to update' : 'Failed to add') + ' BOQ item');
    }
  };

  const handleDelete = async (boqId) => {
    const item = boqItems.find(b => b.boq_id === boqId);
    if (item?.locked) {
      toast.error('Cannot delete locked BOQ item');
      return;
    }
    if (!confirm('Are you sure you want to delete this BOQ item?')) return;
    try {
      await axios.delete(`${API}/boq/${boqId}`);
      toast.success('BOQ item deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete BOQ item');
    }
  };

  const handleToggleLock = async (boqId, currentLocked) => {
    try {
      await axios.patch(`${API}/boq/${boqId}`, { locked: !currentLocked });
      toast.success(currentLocked ? 'BOQ item unlocked' : 'BOQ item locked');
      fetchData();
    } catch (error) {
      toast.error('Failed to update lock status');
    }
  };

  if (!user || !project) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const canEdit = user.role === 'planning' || user.role === 'super_admin';
  const totalBudget = boqItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);
  const materialTotal = boqItems.filter(i => i.category === 'material').reduce((sum, i) => sum + (i.total_cost || 0), 0);
  const labourTotal = boqItems.filter(i => i.category === 'labour').reduce((sum, i) => sum + (i.total_cost || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">ConstructionOS</h1>
              <p className="text-xs text-gray-500">Project Management System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/projects'}>
              Projects
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

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.href = `/projects/${projectId}`}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 data-testid="boq-title" className="text-3xl font-bold text-gray-900">Bill of Quantities</h2>
            <p className="text-gray-600 mt-1">{project.name}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Budget</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">₹{(totalBudget / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Material Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">₹{(materialTotal / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Labour Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">₹{(labourTotal / 100000).toFixed(2)}L</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-700">{boqItems.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* BOQ Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>BOQ Items</CardTitle>
            {canEdit && (
              <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button data-testid="add-boq-btn" className="gap-2 bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4" />Add BOQ Item
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingItem ? 'Edit BOQ Item' : 'Add BOQ Item'}</DialogTitle>
                    <DialogDescription>{editingItem ? 'Update the BOQ item details' : 'Add a new item to the Bill of Quantities'}</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label>Item Name</Label>
                      <Input
                        data-testid="boq-item-name"
                        value={formData.item_name}
                        onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                        placeholder="e.g., Cement, Steel, Labour"
                        required
                      />
                    </div>
                    {!editingItem && (
                      <>
                        <div>
                          <Label>Category</Label>
                          <Select
                            value={formData.category}
                            onValueChange={(v) => setFormData({...formData, category: v})}
                          >
                            <SelectTrigger data-testid="boq-category-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="labour">Labour</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Unit</Label>
                          <Input
                            data-testid="boq-unit-input"
                            value={formData.unit}
                            onChange={(e) => setFormData({...formData, unit: e.target.value})}
                            placeholder="e.g., bags, tons, days"
                            required
                          />
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Quantity</Label>
                        <Input
                          data-testid="boq-quantity-input"
                          type="number"
                          value={formData.quantity}
                          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                          required
                        />
                      </div>
                      <div>
                        <Label>Unit Rate (₹)</Label>
                        <Input
                          data-testid="boq-rate-input"
                          type="number"
                          value={formData.unit_rate}
                          onChange={(e) => setFormData({...formData, unit_rate: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    {formData.quantity && formData.unit_rate && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-gray-600">Total Cost:</p>
                        <p className="text-xl font-bold text-blue-600">
                          ₹{(parseFloat(formData.quantity) * parseFloat(formData.unit_rate)).toLocaleString()}
                        </p>
                      </div>
                    )}
                    <Button data-testid="submit-boq-btn" type="submit" className="w-full">
                      {editingItem ? 'Update BOQ Item' : 'Add BOQ Item'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Total Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    {canEdit && <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {boqItems.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
                        No BOQ items defined yet
                      </td>
                    </tr>
                  ) : (
                    boqItems.map((item) => (
                      <tr key={item.boq_id} data-testid={`boq-row-${item.boq_id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{item.item_name}</td>
                        <td className="px-6 py-4">
                          <Badge variant={item.category === 'material' ? 'default' : 'secondary'}>
                            {item.category}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">{item.unit}</td>
                        <td className="px-6 py-4">{item.quantity}</td>
                        <td className="px-6 py-4">₹{item.unit_rate.toLocaleString()}</td>
                        <td className="px-6 py-4 font-semibold text-blue-600">₹{item.total_cost.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          {item.locked ? (
                            <span className="flex items-center gap-1 text-red-600">
                              <Lock className="h-4 w-4" /> Locked
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600">
                              <Unlock className="h-4 w-4" /> Open
                            </span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <Button
                                data-testid={`edit-boq-${item.boq_id}`}
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(item)}
                                disabled={item.locked}
                              >
                                <Edit className={`h-4 w-4 ${item.locked ? 'text-gray-300' : 'text-blue-600'}`} />
                              </Button>
                              <Button
                                data-testid={`delete-boq-${item.boq_id}`}
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(item.boq_id)}
                                disabled={item.locked}
                              >
                                <Trash2 className={`h-4 w-4 ${item.locked ? 'text-gray-300' : 'text-red-500'}`} />
                              </Button>
                              <Button
                                data-testid={`lock-boq-${item.boq_id}`}
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleLock(item.boq_id, item.locked)}
                              >
                                {item.locked ? (
                                  <Unlock className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Lock className="h-4 w-4 text-orange-600" />
                                )}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {boqItems.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr>
                      <td colSpan="5" className="px-6 py-3 text-right font-semibold">Total BOQ Budget:</td>
                      <td className="px-6 py-3 font-bold text-blue-700">₹{totalBudget.toLocaleString()}</td>
                      <td colSpan={canEdit ? 2 : 1}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
