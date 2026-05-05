import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { Plus, Search, Building2, Phone, Mail, MapPin, Edit, Trash2, X, ChevronRight, IndianRupee, Package, FileText, CreditCard, Eye } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAYMENT_CYCLES = [
  { value: 'immediate', label: 'Immediate' },
  { value: '7_days', label: '7 Days' },
  { value: '15_days', label: '15 Days' },
  { value: '30_days', label: '30 Days' },
  { value: '45_days', label: '45 Days' },
  { value: '60_days', label: '60 Days' },
  { value: '90_days', label: '90 Days' },
];
const GST_TYPES = [
  { value: 'regular', label: 'Regular' },
  { value: 'composition', label: 'Composition' },
  { value: 'unregistered', label: 'Unregistered' },
];

export default function VendorMasterManagement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [viewVendor, setViewVendor] = useState(null);
  const [vendorSummary, setVendorSummary] = useState(null);
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  const emptyForm = {
    name: '', contact_person: '', phone: '', email: '', address: '',
    vendor_type: '', bank_name: '', account_number: '', ifsc_code: '', upi_id: '',
    brands: [], payment_cycle: '', gst_number: '', gst_type: '',
    materials_supplied: [], payment_terms: 'full', credit_limit: 0, credit_days: 0
  };
  const [form, setForm] = useState(emptyForm);
  const [brandInput, setBrandInput] = useState({ category: '', brand_names: '' });

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        axios.get(`${API}/vendor-master`),
        axios.get(`${API}/vendor-categories`)
      ]);
      setVendors(vRes.data);
      setCategories(cRes.data);
    } catch (e) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Vendor name is required');
    try {
      if (editingVendor) {
        await axios.patch(`${API}/vendor-master/${editingVendor.vendor_id}`, form);
        toast.success('Vendor updated');
      } else {
        await axios.post(`${API}/vendor-master`, form);
        toast.success('Vendor created');
      }
      setShowForm(false);
      setEditingVendor(null);
      setForm(emptyForm);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save vendor');
    }
  };

  const handleDelete = async (vendorId) => {
    const v = vendors.find(x => x.vendor_id === vendorId);
    if (!window.confirm(`Delete vendor "${v?.name || ''}"?\n\nThis will remove them from the active vendor list. Past purchase orders & payment history will stay intact.`)) return;
    try {
      await axios.delete(`${API}/vendor-master/${vendorId}`);
      toast.success('Vendor deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete vendor');
    }
  };

  const openEdit = (v) => {
    setForm({
      name: v.name || '', contact_person: v.contact_person || '', phone: v.phone || '',
      email: v.email || '', address: v.address || '', vendor_type: v.vendor_type || '',
      bank_name: v.bank_name || '', account_number: v.account_number || '',
      ifsc_code: v.ifsc_code || '', upi_id: v.upi_id || '',
      brands: v.brands || [], payment_cycle: v.payment_cycle || '',
      gst_number: v.gst_number || '', gst_type: v.gst_type || '',
      materials_supplied: v.materials_supplied || [], payment_terms: v.payment_terms || 'full',
      credit_limit: v.credit_limit || 0, credit_days: v.credit_days || 0
    });
    setEditingVendor(v);
    setShowForm(true);
  };

  const openView = async (v) => {
    setViewVendor(v);
    try {
      const res = await axios.get(`${API}/vendor-master/${v.vendor_id}/summary`);
      setVendorSummary(res.data);
    } catch {
      setVendorSummary({ stats: { total_orders: 0, total_order_value: 0, paid_amount: 0, pending_amount: 0, project_count: 0 }, orders: [], assignments: [], projects: [] });
    }
  };

  const addCategory = async () => {
    if (!newCatInput.trim()) return;
    try {
      const res = await axios.post(`${API}/vendor-categories`, { name: newCatInput.trim() });
      setCategories([...categories, res.data]);
      setForm({ ...form, vendor_type: res.data.name });
      setNewCatInput('');
      setShowCatInput(false);
      toast.success('Category added');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add category');
    }
  };

  const addBrand = () => {
    if (!brandInput.category || !brandInput.brand_names.trim()) return;
    const existing = form.brands.find(b => b.category === brandInput.category);
    const newBrands = brandInput.brand_names.split(',').map(b => b.trim()).filter(Boolean);
    if (existing) {
      setForm({
        ...form,
        brands: form.brands.map(b => b.category === brandInput.category
          ? { ...b, brand_names: [...new Set([...b.brand_names, ...newBrands])] }
          : b)
      });
    } else {
      setForm({ ...form, brands: [...form.brands, { category: brandInput.category, brand_names: newBrands }] });
    }
    setBrandInput({ category: '', brand_names: '' });
  };

  const removeBrand = (cat, brand) => {
    setForm({
      ...form,
      brands: form.brands.map(b => b.category === cat
        ? { ...b, brand_names: b.brand_names.filter(n => n !== brand) }
        : b).filter(b => b.brand_names.length > 0)
    });
  };

  const filtered = vendors.filter(v => {
    const matchSearch = !search || v.name?.toLowerCase().includes(search.toLowerCase()) || v.contact_person?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || v.vendor_type === filterCategory;
    return matchSearch && matchCat;
  });

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendor Management</h1>
            <p className="text-sm text-gray-500">{vendors.length} vendors registered</p>
          </div>
          <Button data-testid="create-vendor-btn" onClick={() => { setForm(emptyForm); setEditingVendor(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Create Vendor
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="vendor-search" />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48" data-testid="vendor-category-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Vendor Cards */}
        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-gray-500">No vendors found. Click "Create Vendor" to add one.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(v => (
              <Card key={v.vendor_id} data-testid={`vendor-card-${v.vendor_id}`} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openView(v)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      <h3 className="font-semibold text-gray-900 truncate">{v.name}</h3>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(v); }} data-testid={`edit-vendor-${v.vendor_id}`} title="Edit vendor">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => { e.stopPropagation(); handleDelete(v.vendor_id); }}
                        data-testid={`delete-vendor-${v.vendor_id}`}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Delete vendor"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {v.vendor_type && <Badge variant="outline" className="mb-2 text-xs">{v.vendor_type}</Badge>}
                  <div className="space-y-1 text-xs text-gray-500">
                    {v.contact_person && <p>{v.contact_person}</p>}
                    {v.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{v.phone}</p>}
                    {v.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{v.email}</p>}
                    {v.address && <p className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 flex-shrink-0" />{v.address}</p>}
                  </div>
                  {v.brands?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {v.brands.slice(0, 3).map((b, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{b.category}: {b.brand_names?.slice(0, 2).join(', ')}</Badge>
                      ))}
                      {v.brands.length > 3 && <Badge variant="secondary" className="text-[10px]">+{v.brands.length - 3} more</Badge>}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-gray-400">{v.payment_cycle?.replace('_', ' ') || v.payment_terms}</span>
                    {v.gst_number && <span className="text-green-600 font-mono text-[10px]">GST: {v.gst_number.slice(0, 6)}...</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditingVendor(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Create New Vendor'}</DialogTitle>
              <DialogDescription>Fill in vendor details below.</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="basic" className="mt-2">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="brands">Brands</TabsTrigger>
                <TabsTrigger value="gst">GST & Payment</TabsTrigger>
              </TabsList>

              {/* Basic Details */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Vendor Name *</Label>
                    <Input data-testid="vendor-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Vendor Type / Category</Label>
                    {!showCatInput ? (
                      <div className="flex gap-2">
                        <Select value={form.vendor_type} onValueChange={v => { if (v === '__new__') { setShowCatInput(true); } else { setForm({ ...form, vendor_type: v }); } }}>
                          <SelectTrigger data-testid="vendor-type-select" className="flex-1">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__" className="text-blue-600 font-medium">+ Add New Category</SelectItem>
                            {categories.map(c => <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input placeholder="New category name" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
                        <Button size="sm" onClick={addCategory}>Add</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowCatInput(false)}><X className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>Contact Person</Label>
                    <Input data-testid="vendor-contact" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input data-testid="vendor-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input data-testid="vendor-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <Textarea data-testid="vendor-address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} />
                  </div>
                </div>
              </TabsContent>

              {/* Account Details */}
              <TabsContent value="account" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Bank Name</Label>
                    <Input data-testid="vendor-bank" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input data-testid="vendor-accno" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} />
                  </div>
                  <div>
                    <Label>IFSC Code</Label>
                    <Input data-testid="vendor-ifsc" value={form.ifsc_code} onChange={e => setForm({ ...form, ifsc_code: e.target.value })} />
                  </div>
                  <div>
                    <Label>UPI ID</Label>
                    <Input data-testid="vendor-upi" value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} />
                  </div>
                  <div>
                    <Label>Credit Limit</Label>
                    <Input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Credit Days</Label>
                    <Input type="number" value={form.credit_days} onChange={e => setForm({ ...form, credit_days: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </TabsContent>

              {/* Brands & Materials */}
              <TabsContent value="brands" className="space-y-4 mt-4">
                <p className="text-sm text-gray-500">Add brands by material category.</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Material Category</Label>
                    <Select value={brandInput.category} onValueChange={v => setBrandInput({ ...brandInput, category: v })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Brand Names (comma separated)</Label>
                    <Input placeholder="e.g. Zuari, UltraTech" value={brandInput.brand_names} onChange={e => setBrandInput({ ...brandInput, brand_names: e.target.value })} onKeyDown={e => e.key === 'Enter' && addBrand()} />
                  </div>
                  <Button onClick={addBrand} size="sm"><Plus className="h-4 w-4" /></Button>
                </div>
                {form.brands.length > 0 ? (
                  <div className="space-y-3 mt-4">
                    {form.brands.map((b, i) => (
                      <div key={i} className="border rounded-lg p-3 bg-gray-50">
                        <p className="font-medium text-sm mb-1">{b.category}</p>
                        <div className="flex flex-wrap gap-1">
                          {b.brand_names.map((name, j) => (
                            <Badge key={j} variant="secondary" className="gap-1">
                              {name}
                              <X className="h-3 w-3 cursor-pointer" onClick={() => removeBrand(b.category, name)} />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No brands added yet.</p>
                )}
              </TabsContent>

              {/* GST & Payment */}
              <TabsContent value="gst" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>GST Number</Label>
                    <Input data-testid="vendor-gst" value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value })} />
                  </div>
                  <div>
                    <Label>GST Type</Label>
                    <Select value={form.gst_type} onValueChange={v => setForm({ ...form, gst_type: v })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {GST_TYPES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Payment Cycle</Label>
                    <Select value={form.payment_cycle} onValueChange={v => setForm({ ...form, payment_cycle: v })}>
                      <SelectTrigger data-testid="vendor-payment-cycle"><SelectValue placeholder="Select cycle" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_CYCLES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Payment Terms</Label>
                    <Select value={form.payment_terms} onValueChange={v => setForm({ ...form, payment_terms: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full Payment</SelectItem>
                        <SelectItem value="advance">Advance</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingVendor(null); }}>Cancel</Button>
              <Button data-testid="save-vendor-btn" onClick={handleSubmit}>{editingVendor ? 'Update Vendor' : 'Create Vendor'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Vendor Detail View */}
        <Dialog open={!!viewVendor} onOpenChange={v => { if (!v) { setViewVendor(null); setVendorSummary(null); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {viewVendor && (
              <>
                <DialogHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <DialogTitle className="text-xl">{viewVendor.name}</DialogTitle>
                      <DialogDescription className="flex items-center gap-2 mt-1">
                        {viewVendor.vendor_type && <Badge variant="outline">{viewVendor.vendor_type}</Badge>}
                        {viewVendor.gst_number && <span className="text-xs font-mono">GST: {viewVendor.gst_number}</span>}
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setViewVendor(null); openEdit(viewVendor); }}>
                        <Edit className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const id = viewVendor.vendor_id;
                          setViewVendor(null);
                          setVendorSummary(null);
                          await handleDelete(id);
                        }}
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        data-testid="delete-vendor-detail-btn"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <Tabs defaultValue="details" className="mt-4">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="brands">Brands & Materials</TabsTrigger>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-700">Contact</h4>
                        <div className="space-y-2 text-sm">
                          {viewVendor.contact_person && <p><span className="text-gray-500">Person:</span> {viewVendor.contact_person}</p>}
                          {viewVendor.phone && <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-gray-400" />{viewVendor.phone}</p>}
                          {viewVendor.email && <p className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-gray-400" />{viewVendor.email}</p>}
                          {viewVendor.address && <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" />{viewVendor.address}</p>}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-700">Payment & GST</h4>
                        <div className="space-y-2 text-sm">
                          <p><span className="text-gray-500">Payment Cycle:</span> {viewVendor.payment_cycle?.replace('_', ' ') || '-'}</p>
                          <p><span className="text-gray-500">Payment Terms:</span> {viewVendor.payment_terms}</p>
                          <p><span className="text-gray-500">Credit Limit:</span> {viewVendor.credit_limit?.toLocaleString('en-IN')}</p>
                          <p><span className="text-gray-500">GST Type:</span> {viewVendor.gst_type || '-'}</p>
                        </div>
                      </div>
                      {viewVendor.bank_name && (
                        <div className="col-span-2 space-y-3">
                          <h4 className="font-semibold text-sm text-gray-700">Bank Details</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50 p-3 rounded-lg">
                            <p><span className="text-gray-500">Bank:</span> {viewVendor.bank_name}</p>
                            <p><span className="text-gray-500">A/C No:</span> {viewVendor.account_number}</p>
                            <p><span className="text-gray-500">IFSC:</span> {viewVendor.ifsc_code}</p>
                            {viewVendor.upi_id && <p><span className="text-gray-500">UPI:</span> {viewVendor.upi_id}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="brands" className="mt-4">
                    {viewVendor.brands?.length > 0 ? (
                      <div className="space-y-3">
                        {viewVendor.brands.map((b, i) => (
                          <div key={i} className="border rounded-lg p-3">
                            <p className="font-medium text-sm mb-2">{b.category}</p>
                            <div className="flex flex-wrap gap-1">
                              {b.brand_names?.map((name, j) => <Badge key={j} variant="secondary">{name}</Badge>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-center py-8">No brands listed for this vendor.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="summary" className="mt-4">
                    {vendorSummary ? (
                      <div className="space-y-4">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-blue-600">{vendorSummary.stats.total_orders}</p>
                            <p className="text-xs text-gray-500">Total Orders</p>
                          </CardContent></Card>
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-green-600">{vendorSummary.stats.total_order_value?.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-500">Order Value</p>
                          </CardContent></Card>
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-emerald-600">{vendorSummary.stats.paid_amount?.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-500">Paid</p>
                          </CardContent></Card>
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-red-600">{vendorSummary.stats.pending_amount?.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-500">Pending</p>
                          </CardContent></Card>
                        </div>
                        {/* Orders */}
                        <h4 className="font-semibold text-sm text-gray-700 mt-4">Recent Orders</h4>
                        {vendorSummary.orders?.length > 0 ? (
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left">PO ID</th>
                                  <th className="px-3 py-2 text-left">Project</th>
                                  <th className="px-3 py-2 text-left">Amount</th>
                                  <th className="px-3 py-2 text-left">Status</th>
                                  <th className="px-3 py-2 text-left">Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vendorSummary.orders.map(o => (
                                  <tr key={o.po_id} className="border-t">
                                    <td className="px-3 py-2 font-mono text-xs">{o.po_id}</td>
                                    <td className="px-3 py-2">{o.project_name || '-'}</td>
                                    <td className="px-3 py-2">{o.total_amount?.toLocaleString('en-IN')}</td>
                                    <td className="px-3 py-2"><Badge variant="outline">{o.status}</Badge></td>
                                    <td className="px-3 py-2 text-xs">{o.created_at?.split('T')[0]}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-4">No orders yet.</p>
                        )}
                        {/* Projects */}
                        {vendorSummary.projects?.length > 0 && (
                          <>
                            <h4 className="font-semibold text-sm text-gray-700 mt-4">Associated Projects</h4>
                            <div className="flex flex-wrap gap-2">
                              {vendorSummary.projects.map(p => (
                                <Badge key={p.project_id} variant="secondary">{p.name || p.client_name || p.project_id}</Badge>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
      {user && <MobileBottomNav user={user} />}
    </div>
  );
}
