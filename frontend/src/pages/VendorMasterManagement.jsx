import { useState, useEffect } from 'react';
import axios from 'axios';
import { Building2, LogOut, Plus, Truck, Edit, Trash2, Search, Phone, Mail, MapPin } from 'lucide-react';
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PAYMENT_TERMS = [
  { value: 'full', label: 'Full Payment' },
  { value: 'advance', label: 'Advance Payment' },
  { value: 'credit', label: 'Credit' }
];

export default function VendorManagement() {
  const [user, setUser] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    gst_number: '',
    materials_supplied: [],
    payment_terms: 'full',
    credit_limit: 0,
    credit_days: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, vendorsRes, materialsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/vendor-master?active_only=false`),
        axios.get(`${API}/materials`)
      ]);
      setUser(userRes.data);
      setVendors(vendorsRes.data);
      setMaterials(materialsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load vendors');
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

  const handleOpenDialog = (vendor = null) => {
    if (vendor) {
      setEditingVendor(vendor);
      setFormData({
        name: vendor.name,
        contact_person: vendor.contact_person || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        address: vendor.address || '',
        gst_number: vendor.gst_number || '',
        materials_supplied: vendor.materials_supplied || [],
        payment_terms: vendor.payment_terms || 'full',
        credit_limit: vendor.credit_limit || 0,
        credit_days: vendor.credit_days || 0
      });
    } else {
      setEditingVendor(null);
      setFormData({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        gst_number: '',
        materials_supplied: [],
        payment_terms: 'full',
        credit_limit: 0,
        credit_days: 0
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingVendor) {
        await axios.patch(`${API}/vendor-master/${editingVendor.vendor_id}`, formData);
        toast.success('Vendor updated successfully');
      } else {
        await axios.post(`${API}/vendor-master`, formData);
        toast.success('Vendor created successfully');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save vendor');
    }
  };

  const handleDelete = async (vendorId) => {
    try {
      await axios.delete(`${API}/vendor-master/${vendorId}`);
      toast.success('Vendor deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete vendor');
    }
  };

  const filteredVendors = vendors.filter(v => {
    return v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           v.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           v.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getMaterialName = (materialId) => {
    const mat = materials.find(m => m.material_id === materialId);
    return mat ? mat.name : materialId;
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-semibold">Loading...</div>
      </div>
    );
  }

  const canManage = ['super_admin', 'procurement'].includes(user.role);
  const activeVendors = vendors.filter(v => v.is_active);
  const inactiveVendors = vendors.filter(v => !v.is_active);
  const creditVendors = vendors.filter(v => v.payment_terms === 'credit');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.webp" alt="My Home USB" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{mixBlendMode: "multiply"}} />
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Home USB</h1>
              <p className="text-xs text-gray-500">Vendor Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => window.location.href = '/dashboard'}>
              Dashboard
            </Button>
            <Button variant="ghost" onClick={() => window.location.href = '/settings'}>
              Settings
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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 data-testid="vendors-title" className="text-3xl font-bold text-gray-900">Vendor Management</h2>
            <p className="text-gray-600 mt-1">Manage your vendor master data</p>
          </div>
          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-vendor-btn" className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4" /> Add Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
                  <DialogDescription>
                    {editingVendor ? 'Update vendor details' : 'Create a new vendor in your master list'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Vendor Name *</Label>
                      <Input
                        data-testid="vendor-name-input"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="e.g., ABC Suppliers"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input
                        data-testid="vendor-contact-input"
                        value={formData.contact_person}
                        onChange={(e) => setFormData({...formData, contact_person: e.target.value})}
                        placeholder="e.g., John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        data-testid="vendor-phone-input"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        data-testid="vendor-email-input"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="vendor@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GST Number</Label>
                      <Input
                        data-testid="vendor-gst-input"
                        value={formData.gst_number}
                        onChange={(e) => setFormData({...formData, gst_number: e.target.value})}
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Terms</Label>
                      <Select
                        value={formData.payment_terms}
                        onValueChange={(v) => setFormData({...formData, payment_terms: v})}
                      >
                        <SelectTrigger data-testid="vendor-payment-terms-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_TERMS.map(pt => (
                            <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.payment_terms === 'credit' && (
                      <>
                        <div className="space-y-2">
                          <Label>Credit Limit</Label>
                          <Input
                            type="number"
                            data-testid="vendor-credit-limit-input"
                            value={formData.credit_limit}
                            onChange={(e) => setFormData({...formData, credit_limit: parseFloat(e.target.value) || 0})}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Credit Days</Label>
                          <Input
                            type="number"
                            data-testid="vendor-credit-days-input"
                            value={formData.credit_days}
                            onChange={(e) => setFormData({...formData, credit_days: parseInt(e.target.value) || 0})}
                            placeholder="30"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Textarea
                      data-testid="vendor-address-input"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder="Full address..."
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button data-testid="save-vendor-btn" type="submit">
                      {editingVendor ? 'Update' : 'Add'} Vendor
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Vendors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Truck className="h-6 w-6 text-purple-600" />
                <span className="text-2xl font-bold text-purple-700">{vendors.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-green-700">{activeVendors.length}</span>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Inactive</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-gray-700">{inactiveVendors.length}</span>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">On Credit</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-orange-700">{creditVendors.length}</span>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              data-testid="search-vendors"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Vendors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVendors.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Truck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No vendors found</p>
            </div>
          ) : (
            filteredVendors.map((vendor) => (
              <Card key={vendor.vendor_id} data-testid={`vendor-card-${vendor.vendor_id}`} className={`hover:shadow-md transition-shadow ${!vendor.is_active ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{vendor.name}</CardTitle>
                      {vendor.contact_person && (
                        <p className="text-sm text-gray-500">{vendor.contact_person}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={vendor.is_active ? 'default' : 'secondary'}>
                        {vendor.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vendor.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4" />
                      <span>{vendor.phone}</span>
                    </div>
                  )}
                  {vendor.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="h-4 w-4" />
                      <span>{vendor.email}</span>
                    </div>
                  )}
                  {vendor.address && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mt-0.5" />
                      <span className="line-clamp-2">{vendor.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Badge variant="outline" className="text-xs">
                      {PAYMENT_TERMS.find(pt => pt.value === vendor.payment_terms)?.label || vendor.payment_terms}
                    </Badge>
                    {vendor.gst_number && (
                      <Badge variant="outline" className="text-xs">
                        GST: {vendor.gst_number}
                      </Badge>
                    )}
                  </div>
                  {vendor.payment_terms === 'credit' && (
                    <div className="text-sm text-gray-600">
                      Credit: {vendor.credit_limit?.toLocaleString()} | {vendor.credit_days} days
                    </div>
                  )}
                  {canManage && (
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(vendor)}
                        data-testid={`edit-vendor-${vendor.vendor_id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`delete-vendor-${vendor.vendor_id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{vendor.name}"? This will deactivate the vendor.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(vendor.vendor_id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
