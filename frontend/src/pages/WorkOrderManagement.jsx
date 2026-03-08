import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  ClipboardList, ArrowLeft, Plus, Users, Package, Truck, X,
  CheckCircle, Clock, DollarSign, Play, AlertCircle
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WORK_TYPES = [
  'Masonry', 'Plumbing', 'Electrical', 'Carpentry', 'Painting',
  'Flooring', 'Roofing', 'HVAC', 'Civil', 'Finishing', 'Other'
];

export default function WorkOrderManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [siteEngineers, setSiteEngineers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  
  const [createDialog, setCreateDialog] = useState(false);
  const [orderType, setOrderType] = useState('labour');
  
  // Labour form
  const [labourForm, setLabourForm] = useState({
    project_id: '',
    work_type: '',
    contractor_id: '',
    number_of_days: '',
    number_of_workers: '1',
    daily_rate: '',
    assigned_to: '',
    remarks: '',
    stages: []
  });
  
  // Material form
  const [materialForm, setMaterialForm] = useState({
    project_id: '',
    material_name: '',
    brand: '',
    specification: '',
    vendor_id: '',
    quantity: '',
    unit: 'nos',
    unit_price: '',
    assigned_to: '',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, woRes, projRes, contRes, vendRes, engRes, matRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/work-orders`),
        axios.get(`${API}/projects`),
        axios.get(`${API}/labour-contractors`).catch(() => ({ data: [] })),
        axios.get(`${API}/vendor-master`).catch(() => ({ data: [] })),
        axios.get(`${API}/users?role=site_engineer`).catch(() => ({ data: [] })),
        axios.get(`${API}/materials`).catch(() => ({ data: [] }))
      ]);
      
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setWorkOrders(woRes.data);
      setProjects(projRes.data);
      setContractors(contRes.data);
      setVendors(vendRes.data);
      setSiteEngineers(Array.isArray(engRes.data) ? engRes.data : []);
      setMaterials(matRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkOrders = async (filter) => {
    try {
      let url = `${API}/work-orders`;
      if (filter === 'labour') url += '?order_type=labour';
      else if (filter === 'material') url += '?order_type=material';
      
      const res = await axios.get(url);
      setWorkOrders(res.data);
    } catch (error) {
      console.error('Error fetching work orders:', error);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'all') fetchWorkOrders(null);
    else if (tab === 'labour') fetchWorkOrders('labour');
    else if (tab === 'material') fetchWorkOrders('material');
  };

  const addStage = () => {
    setLabourForm({
      ...labourForm,
      stages: [...labourForm.stages, { stage_name: '', amount: '' }]
    });
  };

  const updateStage = (index, field, value) => {
    const stages = [...labourForm.stages];
    stages[index][field] = value;
    setLabourForm({ ...labourForm, stages });
  };

  const removeStage = (index) => {
    setLabourForm({
      ...labourForm,
      stages: labourForm.stages.filter((_, i) => i !== index)
    });
  };

  const handleCreateLabourOrder = async () => {
    if (!labourForm.project_id || !labourForm.work_type) {
      toast.error('Please select project and work type');
      return;
    }
    
    if (labourForm.stages.length === 0) {
      toast.error('Please add at least one stage');
      return;
    }

    try {
      const payload = {
        ...labourForm,
        number_of_days: parseFloat(labourForm.number_of_days) || 0,
        number_of_workers: parseInt(labourForm.number_of_workers) || 1,
        daily_rate: parseFloat(labourForm.daily_rate) || 0,
        stages: labourForm.stages.map(s => ({
          stage_name: s.stage_name,
          amount: parseFloat(s.amount) || 0
        }))
      };
      
      const res = await axios.post(`${API}/work-orders/labour`, payload);
      toast.success(`Work Order ${res.data.work_order_number} created!`);
      setCreateDialog(false);
      resetForms();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create work order');
    }
  };

  const handleCreateMaterialOrder = async () => {
    if (!materialForm.project_id || !materialForm.material_name) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      const payload = {
        ...materialForm,
        quantity: parseFloat(materialForm.quantity) || 0,
        unit_price: parseFloat(materialForm.unit_price) || 0
      };
      
      const res = await axios.post(`${API}/work-orders/material`, payload);
      toast.success(`Material Order ${res.data.work_order_number} created!`);
      setCreateDialog(false);
      resetForms();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create order');
    }
  };

  const resetForms = () => {
    setLabourForm({
      project_id: '', work_type: '', contractor_id: '', number_of_days: '',
      number_of_workers: '1', daily_rate: '', assigned_to: '', remarks: '', stages: []
    });
    setMaterialForm({
      project_id: '', material_name: '', brand: '', specification: '',
      vendor_id: '', quantity: '', unit: 'nos', unit_price: '', assigned_to: '', remarks: ''
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
      assigned: { label: 'Assigned', className: 'bg-amber-50 text-amber-700' },
      in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
      cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100' };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
  };

  const getStageStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
      in_progress: { label: 'In Progress', className: 'bg-amber-50 text-amber-700' },
      completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
      payment_requested: { label: 'Payment Requested', className: 'bg-orange-100 text-orange-700' },
      payment_approved: { label: 'Approved', className: 'bg-purple-100 text-purple-700' },
      paid: { label: 'Paid', className: 'bg-green-100 text-green-700' }
    };
    const c = config[status] || { label: status, className: 'bg-gray-100' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
  };

  const calculateStagesTotal = () => {
    return labourForm.stages.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-indigo-600">{workOrders.length}</p>
              <p className="text-sm text-gray-500">Total Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{workOrders.filter(w => w.order_type === 'labour').length}</p>
              <p className="text-sm text-gray-500">Labour</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{workOrders.filter(w => w.order_type === 'material').length}</p>
              <p className="text-sm text-gray-500">Material</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{workOrders.filter(w => w.status === 'in_progress').length}</p>
              <p className="text-sm text-gray-500">In Progress</p>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders List */}
        <Card>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <CardHeader className="border-b p-3 sm:p-4">
              <TabsList className="bg-transparent p-0">
                <TabsTrigger value="all" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none">
                  All
                </TabsTrigger>
                <TabsTrigger value="labour" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none">
                  Labour
                </TabsTrigger>
                <TabsTrigger value="material" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none">
                  Material
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="p-0">
              <div className="divide-y">
                {workOrders.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No work orders created yet</p>
                  </div>
                ) : (
                  workOrders.map((wo) => (
                    <div key={wo.work_order_id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {wo.order_type === 'labour' ? (
                              <Users className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Package className="h-4 w-4 text-green-600" />
                            )}
                            <span className="font-semibold">{wo.work_order_number}</span>
                            {getStatusBadge(wo.status)}
                          </div>
                          <p className="text-sm text-gray-600">
                            {wo.order_type === 'labour' ? wo.work_type : wo.material_name}
                            {wo.brand && <span className="text-gray-400"> - {wo.brand}</span>}
                          </p>
                          <p className="text-xs text-gray-400">Project: {wo.project_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(wo.total_amount)}</p>
                          {wo.assigned_to_name && (
                            <p className="text-xs text-gray-500">→ {wo.assigned_to_name}</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Stages for Labour Orders */}
                      {wo.order_type === 'labour' && wo.stages && wo.stages.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-medium text-gray-500 mb-2">Payment Stages:</p>
                          <div className="flex flex-wrap gap-2">
                            {wo.stages.map((stage, idx) => (
                              <div key={idx} className="bg-gray-100 rounded px-2 py-1 text-xs">
                                <span className="font-medium">{stage.stage_name}</span>
                                <span className="text-gray-500 mx-1">-</span>
                                <span className="text-green-600">{formatCurrency(stage.amount)}</span>
                                <span className="ml-2">{getStageStatusBadge(stage.status)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Create Work Order Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Work Order</DialogTitle>
            <DialogDescription>Create a new work order for labour or material</DialogDescription>
          </DialogHeader>

          {/* Order Type Selection */}
          <div className="flex gap-2 mb-4">
            <Button 
              variant={orderType === 'labour' ? 'default' : 'outline'}
              onClick={() => setOrderType('labour')}
              className="flex-1 gap-2"
            >
              <Users className="h-4 w-4" /> Labour
            </Button>
            <Button 
              variant={orderType === 'material' ? 'default' : 'outline'}
              onClick={() => setOrderType('material')}
              className="flex-1 gap-2"
            >
              <Package className="h-4 w-4" /> Material
            </Button>
          </div>

          {orderType === 'labour' ? (
            /* Labour Work Order Form */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project *</Label>
                  <Select value={labourForm.project_id} onValueChange={(v) => setLabourForm({ ...labourForm, project_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map(p => (
                        <SelectItem key={p.project_id} value={p.project_id}>
                          {p.name} ({p.package_name || 'No Package'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Work Type *</Label>
                  <Select value={labourForm.work_type} onValueChange={(v) => setLabourForm({ ...labourForm, work_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {WORK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Labour Contractor</Label>
                  <Select value={labourForm.contractor_id} onValueChange={(v) => setLabourForm({ ...labourForm, contractor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                    <SelectContent>
                      {contractors.map(c => <SelectItem key={c.contractor_id} value={c.contractor_id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assign to Site Engineer</Label>
                  <Select value={labourForm.assigned_to} onValueChange={(v) => setLabourForm({ ...labourForm, assigned_to: v })}>
                    <SelectTrigger><SelectValue placeholder="Select engineer" /></SelectTrigger>
                    <SelectContent>
                      {siteEngineers.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Days</Label>
                  <Input 
                    type="number"
                    value={labourForm.number_of_days}
                    onChange={(e) => setLabourForm({ ...labourForm, number_of_days: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Workers</Label>
                  <Input 
                    type="number"
                    value={labourForm.number_of_workers}
                    onChange={(e) => setLabourForm({ ...labourForm, number_of_workers: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Daily Rate (₹)</Label>
                  <Input 
                    type="number"
                    value={labourForm.daily_rate}
                    onChange={(e) => setLabourForm({ ...labourForm, daily_rate: e.target.value })}
                  />
                </div>
              </div>

              {/* Payment Stages */}
              <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <Label className="text-base">Payment Stages *</Label>
                    <p className="text-xs text-gray-500">Define payment milestones for this work</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green-600">Total: {formatCurrency(calculateStagesTotal())}</span>
                    <Button size="sm" variant="outline" onClick={addStage}>
                      <Plus className="h-3 w-3 mr-1" /> Add Stage
                    </Button>
                  </div>
                </div>
                
                {labourForm.stages.length === 0 ? (
                  <div className="text-center py-4 border-2 border-dashed rounded">
                    <AlertCircle className="h-6 w-6 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">Add payment stages to track progress</p>
                    <p className="text-xs text-gray-400">e.g., Stage 1: Rough Work - ₹10,000</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {labourForm.stages.map((stage, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                        <span className="text-sm font-medium text-gray-500 w-8">#{idx + 1}</span>
                        <Input 
                          value={stage.stage_name}
                          onChange={(e) => updateStage(idx, 'stage_name', e.target.value)}
                          placeholder="Stage name (e.g., Rough Work)"
                          className="flex-1"
                        />
                        <Input 
                          type="number"
                          value={stage.amount}
                          onChange={(e) => updateStage(idx, 'amount', e.target.value)}
                          placeholder="Amount"
                          className="w-32"
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeStage(idx)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={labourForm.remarks}
                  onChange={(e) => setLabourForm({ ...labourForm, remarks: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          ) : (
            /* Material Work Order Form */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project *</Label>
                  <Select value={materialForm.project_id} onValueChange={(v) => setMaterialForm({ ...materialForm, project_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects.map(p => (
                        <SelectItem key={p.project_id} value={p.project_id}>
                          {p.name} ({p.package_name || 'No Package'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Material *</Label>
                  <Input 
                    value={materialForm.material_name}
                    onChange={(e) => setMaterialForm({ ...materialForm, material_name: e.target.value })}
                    placeholder="e.g., Cement"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Brand</Label>
                  <Input 
                    value={materialForm.brand}
                    onChange={(e) => setMaterialForm({ ...materialForm, brand: e.target.value })}
                    placeholder="e.g., Ultratech"
                  />
                </div>
                <div>
                  <Label>Specification</Label>
                  <Input 
                    value={materialForm.specification}
                    onChange={(e) => setMaterialForm({ ...materialForm, specification: e.target.value })}
                    placeholder="e.g., Grade 53"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vendor</Label>
                  <Select value={materialForm.vendor_id} onValueChange={(v) => setMaterialForm({ ...materialForm, vendor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map(v => <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assign to Site Engineer</Label>
                  <Select value={materialForm.assigned_to} onValueChange={(v) => setMaterialForm({ ...materialForm, assigned_to: v })}>
                    <SelectTrigger><SelectValue placeholder="Select engineer" /></SelectTrigger>
                    <SelectContent>
                      {siteEngineers.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Quantity</Label>
                  <Input 
                    type="number"
                    value={materialForm.quantity}
                    onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input 
                    value={materialForm.unit}
                    onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Unit Price (₹)</Label>
                  <Input 
                    type="number"
                    value={materialForm.unit_price}
                    onChange={(e) => setMaterialForm({ ...materialForm, unit_price: e.target.value })}
                  />
                </div>
              </div>

              <Card className="bg-amber-50">
                <CardContent className="p-3">
                  <p className="text-sm text-amber-800">
                    Total: <strong>{formatCurrency((parseFloat(materialForm.quantity) || 0) * (parseFloat(materialForm.unit_price) || 0))}</strong>
                  </p>
                </CardContent>
              </Card>

              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={materialForm.remarks}
                  onChange={(e) => setMaterialForm({ ...materialForm, remarks: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button 
              onClick={orderType === 'labour' ? handleCreateLabourOrder : handleCreateMaterialOrder}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
