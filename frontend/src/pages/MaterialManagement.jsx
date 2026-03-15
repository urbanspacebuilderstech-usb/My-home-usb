import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Plus, Package, Edit, Trash2, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UNITS = [
  'Nos', 'Kg', 'Ton', 'Bag', 'Load', 'CFT', 'SFT', 'RFT', 
  'Litre', 'Metre', 'Bundle', 'Box', 'Set', 'Pair', 'Roll'
];

const CATEGORY_COLORS = {
  cement: 'bg-gray-100 text-gray-800',
  sand: 'bg-yellow-100 text-yellow-800',
  steel: 'bg-slate-100 text-slate-800',
  bricks: 'bg-red-100 text-red-800',
  aggregate: 'bg-stone-100 text-stone-800',
  tiles: 'bg-amber-50 text-amber-800',
  electrical: 'bg-amber-100 text-amber-800',
  plumbing: 'bg-cyan-100 text-cyan-800',
  paint: 'bg-purple-100 text-purple-800',
  wood: 'bg-orange-100 text-orange-800',
  hardware: 'bg-zinc-100 text-zinc-800',
  other: 'bg-neutral-100 text-neutral-800'
};

export default function MaterialManagement() {
  const [user, setUser] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: '',
    description: '',
    hsn_code: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, materialsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/materials?active_only=false`),
        axios.get(`${API}/materials/categories`)
      ]);
      setUser(userRes.data);
      setMaterials(materialsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
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

  const handleOpenDialog = (material = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        name: material.name,
        category: material.category,
        unit: material.unit,
        description: material.description || '',
        hsn_code: material.hsn_code || ''
      });
    } else {
      setEditingMaterial(null);
      setFormData({
        name: '',
        category: '',
        unit: '',
        description: '',
        hsn_code: ''
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingMaterial) {
        await axios.patch(`${API}/materials/${editingMaterial.material_id}`, formData);
        toast.success('Material updated successfully');
      } else {
        await axios.post(`${API}/materials`, formData);
        toast.success('Material created successfully');
      }
      setDialogOpen(false);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save material');
    }
  };

  const handleDelete = async (materialId) => {
    try {
      await axios.delete(`${API}/materials/${materialId}`);
      toast.success('Material deleted');
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete material');
    }
  };

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || m.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category) => {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-semibold">Loading...</div>
      </div>
    );
  }

  const canManage = ['super_admin', 'planning', 'procurement'].includes(user.role);

  // Group materials by category
  const materialsByCategory = categories.reduce((acc, cat) => {
    acc[cat.value] = filteredMaterials.filter(m => m.category === cat.value);
    return acc;
  }, {});

  const activeMaterials = materials.filter(m => m.is_active);
  const inactiveMaterials = materials.filter(m => !m.is_active);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-8">
          <div>
            <h2 data-testid="materials-title" className="text-xl sm:text-3xl font-bold text-gray-900">Material Management</h2>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage your material master data</p>
          </div>
          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-material-btn" className="gap-2 bg-green-600 hover:bg-green-700 w-full sm:w-auto" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4" /> Add Material
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg mx-4 sm:mx-auto">
                <DialogHeader>
                  <DialogTitle>{editingMaterial ? 'Edit Material' : 'Add New Material'}</DialogTitle>
                  <DialogDescription>
                    {editingMaterial ? 'Update material details' : 'Create a new material in your master list'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Material Name *</Label>
                    <Input
                      data-testid="material-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g., OPC Cement 53 Grade"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(v) => setFormData({...formData, category: v})}
                        required
                      >
                        <SelectTrigger data-testid="material-category-select">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Unit *</Label>
                      <Select
                        value={formData.unit}
                        onValueChange={(v) => setFormData({...formData, unit: v})}
                        required
                      >
                        <SelectTrigger data-testid="material-unit-select">
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map(unit => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>HSN Code (for GST)</Label>
                    <Input
                      data-testid="material-hsn-input"
                      value={formData.hsn_code}
                      onChange={(e) => setFormData({...formData, hsn_code: e.target.value})}
                      placeholder="e.g., 2523"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      data-testid="material-description-input"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Additional details about the material..."
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button data-testid="save-material-btn" type="submit">
                      {editingMaterial ? 'Update' : 'Add'} Material
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Total</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-center gap-1 sm:gap-2">
                <Package className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
                <span className="text-lg sm:text-2xl font-bold text-green-700">{materials.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Active</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <span className="text-lg sm:text-2xl font-bold text-amber-700">{activeMaterials.length}</span>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Inactive</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <span className="text-lg sm:text-2xl font-bold text-gray-700">{inactiveMaterials.length}</span>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">Categories</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 sm:p-6 sm:pt-0">
              <span className="text-lg sm:text-2xl font-bold text-purple-700">{categories.length}</span>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              data-testid="search-materials"
              placeholder="Search materials..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500 hidden sm:block" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger data-testid="filter-category" className="w-full sm:w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Materials Table / Cards */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-sm sm:text-lg">Materials List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile Card View */}
            <div className="block sm:hidden divide-y divide-gray-200">
              {filteredMaterials.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">No materials found</div>
              ) : (
                filteredMaterials.map((material) => (
                  <div key={material.material_id} data-testid={`material-card-mobile-${material.material_id}`} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{material.name}</p>
                        {material.description && (
                          <p className="text-xs text-gray-500 truncate">{material.description}</p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 ml-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(material)} className="h-8 w-8 p-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="mx-4">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Material</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{material.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(material.material_id)} className="bg-red-600">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(material.category)}`}>
                        {material.category.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">{material.unit}</span>
                      <Badge variant={material.is_active ? 'default' : 'secondary'} className="text-xs">
                        {material.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Unit</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">HSN Code</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    {canManage && (
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                        No materials found
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((material) => (
                      <tr key={material.material_id} data-testid={`material-row-${material.material_id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-medium text-gray-900">{material.name}</div>
                            {material.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">{material.description}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(material.category)}`}>
                            {material.category.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{material.unit}</td>
                        <td className="px-6 py-4 text-gray-600">{material.hsn_code || '-'}</td>
                        <td className="px-6 py-4">
                          <Badge variant={material.is_active ? 'default' : 'secondary'}>
                            {material.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(material)}
                                data-testid={`edit-material-${material.material_id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    data-testid={`delete-material-${material.material_id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Material</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{material.name}"? This will deactivate the material.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(material.material_id)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        )}
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
