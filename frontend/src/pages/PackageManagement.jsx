import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Package, Plus, Trash2, Edit, ArrowLeft, Building2, Layers, Users, 
  DollarSign, Save, X
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BUILDING_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'villa', label: 'Villa' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'office', label: 'Office' }
];

const UNITS = ['nos', 'sqft', 'rft', 'cft', 'kg', 'ton', 'bag', 'load', 'trip', 'lumpsum'];

export default function PackageManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [materials, setMaterials] = useState([]);
  
  const [editDialog, setEditDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [activeTab, setActiveTab] = useState('scope');
  
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    building_types: [],
    base_rate_per_sqft: 0,
    scope_items: [],
    material_items: [],
    labour_items: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, packagesRes, materialsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/packages`),
        axios.get(`${API}/materials`).catch(() => ({ data: [] }))
      ]);
      
      if (!['super_admin', 'general_manager'].includes(userRes.data.role)) {
        toast.error('Only Super Admin and GM can access Package Management');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setPackages(packagesRes.data);
      setMaterials(materialsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      code: '',
      description: '',
      building_types: [],
      base_rate_per_sqft: 0,
      scope_items: [],
      material_items: [],
      labour_items: []
    });
    setEditingPackage(null);
    setActiveTab('scope');
  };

  const openCreateDialog = () => {
    resetForm();
    setEditDialog(true);
  };

  const openEditDialog = (pkg) => {
    setEditingPackage(pkg);
    setForm({
      name: pkg.name,
      code: pkg.code,
      description: pkg.description || '',
      building_types: pkg.building_types || [],
      base_rate_per_sqft: pkg.base_rate_per_sqft || 0,
      scope_items: pkg.scope_items || [],
      material_items: pkg.material_items || [],
      labour_items: pkg.labour_items || []
    });
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast.error('Please enter package name and code');
      return;
    }

    try {
      if (editingPackage) {
        await axios.patch(`${API}/packages/${editingPackage.package_id}`, form);
        toast.success('Package updated');
      } else {
        await axios.post(`${API}/packages`, form);
        toast.success('Package created');
      }
      setEditDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save package');
    }
  };

  const handleDelete = async (packageId) => {
    if (!window.confirm('Are you sure you want to delete this package?')) return;
    
    try {
      await axios.delete(`${API}/packages/${packageId}`);
      toast.success('Package deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete package');
    }
  };

  // Scope Item handlers
  const addScopeItem = () => {
    setForm({
      ...form,
      scope_items: [...form.scope_items, { name: '', quantity: 1, unit: 'nos', unit_rate: 0 }]
    });
  };

  const updateScopeItem = (index, field, value) => {
    const items = [...form.scope_items];
    items[index][field] = value;
    if (field === 'quantity' || field === 'unit_rate') {
      items[index].total = (parseFloat(items[index].quantity) || 0) * (parseFloat(items[index].unit_rate) || 0);
    }
    setForm({ ...form, scope_items: items });
  };

  const removeScopeItem = (index) => {
    setForm({ ...form, scope_items: form.scope_items.filter((_, i) => i !== index) });
  };

  // Material Item handlers
  const addMaterialItem = () => {
    setForm({
      ...form,
      material_items: [...form.material_items, { name: '', brand: '', specification: '', quantity: 1, unit: 'nos', estimated_rate: 0 }]
    });
  };

  const updateMaterialItem = (index, field, value) => {
    const items = [...form.material_items];
    items[index][field] = value;
    setForm({ ...form, material_items: items });
  };

  const removeMaterialItem = (index) => {
    setForm({ ...form, material_items: form.material_items.filter((_, i) => i !== index) });
  };

  // Labour Item handlers
  const addLabourItem = () => {
    setForm({
      ...form,
      labour_items: [...form.labour_items, { work_type: '', estimated_days: 0, daily_rate: 0, workers_count: 1 }]
    });
  };

  const updateLabourItem = (index, field, value) => {
    const items = [...form.labour_items];
    items[index][field] = value;
    setForm({ ...form, labour_items: items });
  };

  const removeLabourItem = (index) => {
    setForm({ ...form, labour_items: form.labour_items.filter((_, i) => i !== index) });
  };

  const calculateScopeTotal = () => {
    return form.scope_items.reduce((sum, item) => sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0)), 0);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{packages.length}</p>
              <p className="text-sm text-gray-500">Total Packages</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{packages.filter(p => p.is_active).length}</p>
              <p className="text-sm text-gray-500">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{packages.reduce((sum, p) => sum + (p.scope_items?.length || 0), 0)}</p>
              <p className="text-sm text-gray-500">Scope Items</p>
            </CardContent>
          </Card>
        </div>

        {/* Packages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <Card key={pkg.package_id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-lg font-bold">{pkg.code}</Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(pkg)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(pkg.package_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-lg">{pkg.name}</CardTitle>
                {pkg.description && <CardDescription>{pkg.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Layers className="h-3 w-3" /> Scope Items</span>
                    <span className="font-medium">{pkg.scope_items?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Package className="h-3 w-3" /> Materials</span>
                    <span className="font-medium">{pkg.material_items?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" /> Labour Items</span>
                    <span className="font-medium">{pkg.labour_items?.length || 0}</span>
                  </div>
                  {pkg.base_rate_per_sqft > 0 && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-gray-500">Rate/Sqft</span>
                      <span className="font-bold text-green-600">{formatCurrency(pkg.base_rate_per_sqft)}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 pt-2">
                    {(pkg.building_types || []).map((type) => (
                      <Badge key={type} variant="secondary" className="text-xs">{type}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {packages.length === 0 && (
            <Card className="col-span-full p-8 text-center text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No packages created yet</p>
              <Button className="mt-4" onClick={openCreateDialog}>Create First Package</Button>
            </Card>
          )}
        </div>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPackage ? 'Edit Package' : 'Create Package'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Package Code *</Label>
                <Input 
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="A, B, C"
                  maxLength={3}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Package Name *</Label>
                <Input 
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Package A - Basic"
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea 
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Package description..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Building Types</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {BUILDING_TYPES.map((type) => (
                    <Badge 
                      key={type.value}
                      variant={form.building_types.includes(type.value) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const types = form.building_types.includes(type.value)
                          ? form.building_types.filter(t => t !== type.value)
                          : [...form.building_types, type.value];
                        setForm({ ...form, building_types: types });
                      }}
                    >
                      {type.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Base Rate per Sqft (Optional)</Label>
                <Input 
                  type="number"
                  value={form.base_rate_per_sqft}
                  onChange={(e) => setForm({ ...form, base_rate_per_sqft: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">If set, project value = sqft × rate</p>
              </div>
            </div>

            {/* Tabs for Items */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="scope">Scope ({form.scope_items.length})</TabsTrigger>
                <TabsTrigger value="materials">Materials ({form.material_items.length})</TabsTrigger>
                <TabsTrigger value="labour">Labour ({form.labour_items.length})</TabsTrigger>
              </TabsList>

              {/* Scope Items Tab */}
              <TabsContent value="scope" className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Scope of Work Items</p>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-green-600">Total: {formatCurrency(calculateScopeTotal())}</span>
                    <Button size="sm" onClick={addScopeItem}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                  </div>
                </div>
                {form.scope_items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                    <Input 
                      className="col-span-4"
                      value={item.name}
                      onChange={(e) => updateScopeItem(index, 'name', e.target.value)}
                      placeholder="Item name"
                    />
                    <Input 
                      className="col-span-2"
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateScopeItem(index, 'quantity', e.target.value)}
                      placeholder="Qty"
                    />
                    <Select value={item.unit} onValueChange={(v) => updateScopeItem(index, 'unit', v)}>
                      <SelectTrigger className="col-span-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input 
                      className="col-span-2"
                      type="number"
                      value={item.unit_rate}
                      onChange={(e) => updateScopeItem(index, 'unit_rate', e.target.value)}
                      placeholder="Rate"
                    />
                    <span className="col-span-1 text-right text-sm font-medium">
                      {formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0))}
                    </span>
                    <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeScopeItem(index)}>
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </TabsContent>

              {/* Materials Tab */}
              <TabsContent value="materials" className="space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Material Brand Specifications</p>
                    <p className="text-xs text-gray-500">Define which brands/quality to use for this package tier</p>
                  </div>
                  <Button size="sm" onClick={addMaterialItem}><Plus className="h-3 w-3 mr-1" /> Add Material</Button>
                </div>
                
                {form.material_items.length === 0 && (
                  <div className="text-center py-8 border rounded-lg border-dashed">
                    <Package className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">No materials added yet</p>
                    <p className="text-xs text-gray-400">Add materials with brand specifications for this package</p>
                  </div>
                )}
                
                {form.material_items.map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Material Selection from Master */}
                        <div>
                          <Label className="text-xs text-gray-500">Material *</Label>
                          <Select 
                            value={item.material_id || ''} 
                            onValueChange={(v) => {
                              const selectedMaterial = materials.find(m => m.material_id === v);
                              updateMaterialItem(index, 'material_id', v);
                              if (selectedMaterial) {
                                updateMaterialItem(index, 'name', selectedMaterial.name);
                                updateMaterialItem(index, 'unit', selectedMaterial.unit || 'nos');
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select material" />
                            </SelectTrigger>
                            <SelectContent>
                              {materials.map(m => (
                                <SelectItem key={m.material_id} value={m.material_id}>
                                  {m.name} ({m.category})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Brand */}
                        <div>
                          <Label className="text-xs text-gray-500">Brand *</Label>
                          <Input 
                            value={item.brand || ''}
                            onChange={(e) => updateMaterialItem(index, 'brand', e.target.value)}
                            placeholder="e.g., Ultratech, Asian Paints"
                          />
                        </div>
                        
                        {/* Specification */}
                        <div>
                          <Label className="text-xs text-gray-500">Specification/Grade</Label>
                          <Input 
                            value={item.specification || ''}
                            onChange={(e) => updateMaterialItem(index, 'specification', e.target.value)}
                            placeholder="e.g., Grade 53, Premium"
                          />
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="icon" className="ml-2 text-red-500 hover:text-red-700" onClick={() => removeMaterialItem(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {/* Summary Row */}
                    {item.name && item.brand && (
                      <div className="pt-2 border-t flex items-center gap-2">
                        <Badge variant="outline" className="bg-white">{item.name}</Badge>
                        <span className="text-gray-400">→</span>
                        <Badge className="bg-amber-50 text-amber-700">{item.brand}</Badge>
                        {item.specification && (
                          <Badge variant="secondary">{item.specification}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {form.material_items.length > 0 && (
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">Package Material Summary</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.material_items.filter(m => m.name && m.brand).map((item, idx) => (
                        <span key={idx} className="text-xs bg-white px-2 py-1 rounded border">
                          {item.name}: <strong>{item.brand}</strong> {item.specification && `(${item.specification})`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Labour Tab */}
              <TabsContent value="labour" className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Labour Scope</p>
                  <Button size="sm" onClick={addLabourItem}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                </div>
                {form.labour_items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                    <Input 
                      className="col-span-4"
                      value={item.work_type}
                      onChange={(e) => updateLabourItem(index, 'work_type', e.target.value)}
                      placeholder="Work type (masonry, plumbing...)"
                    />
                    <Input 
                      className="col-span-2"
                      type="number"
                      value={item.estimated_days}
                      onChange={(e) => updateLabourItem(index, 'estimated_days', e.target.value)}
                      placeholder="Days"
                    />
                    <Input 
                      className="col-span-2"
                      type="number"
                      value={item.daily_rate}
                      onChange={(e) => updateLabourItem(index, 'daily_rate', e.target.value)}
                      placeholder="Daily Rate"
                    />
                    <Input 
                      className="col-span-2"
                      type="number"
                      value={item.workers_count}
                      onChange={(e) => updateLabourItem(index, 'workers_count', parseInt(e.target.value) || 1)}
                      placeholder="Workers"
                    />
                    <Button variant="ghost" size="icon" className="col-span-2" onClick={() => removeLabourItem(index)}>
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4 mr-2" /> {editingPackage ? 'Update' : 'Create'} Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
