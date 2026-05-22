import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
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
import {
  Plus,
  Search,
  HardHat,
  Phone,
  Mail,
  MapPin,
  Edit,
  X,
  IndianRupee,
  FileText,
  Users
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAYMENT_CYCLES = [
  { value: 'immediate', label: 'Immediate' },
  { value: '7_days', label: '7 Days' },
  { value: '15_days', label: '15 Days' },
  { value: '30_days', label: '30 Days' },
  { value: '45_days', label: '45 Days' },
  { value: '60_days', label: '60 Days' },
];
const LABOUR_SKILL_OPTIONS = [
  { value: 'skilled', label: 'Skilled Labour', default_cost: 1000 },
  { value: 'semi_skilled', label: 'Semi Skilled', default_cost: 800 },
  { value: 'non_skilled', label: 'Non Skilled', default_cost: 600 },
];

export default function ContractorManagement() {
  const [user, setUser] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [labourSkillTypes, setLabourSkillTypes] = useState([...LABOUR_SKILL_OPTIONS]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewContractor, setViewContractor] = useState(null);
  const [summary, setSummary] = useState(null);
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [newSkillInput, setNewSkillInput] = useState({ label: '', default_cost: 0 });
  const [showNewSkill, setShowNewSkill] = useState(false);

  const emptyForm = {
    name: '', contact_person: '', phone: '', email: '', address: '',
    contractor_type: '', bank_name: '', account_number: '', ifsc_code: '', upi_id: '',
    gst_number: '', gst_type: '', payment_cycle: '',
    labour_types: LABOUR_SKILL_OPTIONS.map(o => ({ type: o.value, label: o.label, per_day_cost: o.default_cost }))
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [cRes, catRes] = await Promise.all([
        axios.get(`${API}/contractors`),
        axios.get(`${API}/contractor-categories`)
      ]);
      setContractors(cRes.data);
      setCategories(catRes.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Contractor name required');
    try {
      if (editing) {
        await axios.patch(`${API}/contractors/${editing.contractor_id}`, form);
        toast.success('Updated');
      } else {
        await axios.post(`${API}/contractors`, form);
        toast.success('Created');
      }
      setShowForm(false); setEditing(null); setForm(emptyForm); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const openEdit = (c) => {
    setForm({
      name: c.name || '', contact_person: c.contact_person || '', phone: c.phone || '',
      email: c.email || '', address: c.address || '', contractor_type: c.contractor_type || '',
      bank_name: c.bank_name || '', account_number: c.account_number || '',
      ifsc_code: c.ifsc_code || '', upi_id: c.upi_id || '',
      gst_number: c.gst_number || '', gst_type: c.gst_type || '', payment_cycle: c.payment_cycle || '',
      labour_types: c.labour_types?.length > 0 ? c.labour_types :
        LABOUR_SKILL_OPTIONS.map(o => ({ type: o.value, label: o.label, per_day_cost: o.default_cost }))
    });
    setEditing(c); setShowForm(true);
  };

  const openView = async (c) => {
    setViewContractor(c);
    try {
      const res = await axios.get(`${API}/contractors/${c.contractor_id}/summary`);
      setSummary(res.data);
    } catch { setSummary({ stats: {}, work_orders: [], recent_attendance: [] }); }
  };

  const addCategory = async () => {
    if (!newCatInput.trim()) return;
    try {
      const res = await axios.post(`${API}/contractor-categories`, { name: newCatInput.trim() });
      setCategories([...categories, res.data]);
      setForm({ ...form, contractor_type: res.data.name });
      setNewCatInput(''); setShowCatInput(false);
      toast.success('Category added');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const updateLabourType = (idx, field, val) => {
    const types = [...form.labour_types];
    types[idx] = { ...types[idx], [field]: field === 'per_day_cost' ? parseFloat(val) || 0 : val };
    setForm({ ...form, labour_types: types });
  };

  const removeLabourType = (idx) => {
    setForm({ ...form, labour_types: form.labour_types.filter((_, i) => i !== idx) });
  };

  const addNewSkillType = () => {
    if (!newSkillInput.label.trim()) return;
    const typeVal = newSkillInput.label.toLowerCase().replace(/\s+/g, '_');
    const newType = { type: typeVal, label: newSkillInput.label, per_day_cost: newSkillInput.default_cost || 0 };
    setForm({ ...form, labour_types: [...form.labour_types, newType] });
    setLabourSkillTypes([...labourSkillTypes, { value: typeVal, label: newSkillInput.label, default_cost: newSkillInput.default_cost }]);
    setNewSkillInput({ label: '', default_cost: 0 }); setShowNewSkill(false);
  };

  const filtered = contractors.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.contact_person?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || c.contractor_type === filterCat;
    return matchSearch && matchCat;
  });

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contractor Management</h1>
            <p className="text-sm text-gray-500">{contractors.length} contractors registered</p>
          </div>
          <Button data-testid="create-contractor-btn" onClick={() => { setForm(emptyForm); setEditing(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Contractor
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search contractors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="contractor-search" />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-48" data-testid="contractor-cat-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-gray-500">No contractors found.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <Card key={c.contractor_id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openView(c)} data-testid={`contractor-card-${c.contractor_id}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-5 w-5 text-orange-600 flex-shrink-0" />
                      <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                    </div>
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(c); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {c.contractor_type && <Badge variant="outline" className="mb-2 text-xs">{c.contractor_type}</Badge>}
                  <div className="space-y-1 text-xs text-gray-500">
                    {c.contact_person && <p>{c.contact_person}</p>}
                    {c.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</p>}
                  </div>
                  {c.labour_types?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.labour_types.map((lt, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{lt.label}: {lt.per_day_cost}/day</Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                    <span>{c.payment_cycle?.replace('_', ' ') || '-'}</span>
                    {c.gst_number && <span className="font-mono text-[10px]">GST</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditing(null); } }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Contractor' : 'New Contractor'}</DialogTitle>
              <DialogDescription>Fill in contractor details.</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="basic" className="mt-2">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="basic">Basic Details</TabsTrigger>
                <TabsTrigger value="labour">Labour Types</TabsTrigger>
                <TabsTrigger value="account">Account & GST</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Contractor Name *</Label>
                    <Input data-testid="contractor-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label>Contractor Type</Label>
                    {!showCatInput ? (
                      <Select value={form.contractor_type} onValueChange={v => { if (v === '__new__') { setShowCatInput(true); } else { setForm({ ...form, contractor_type: v }); } }}>
                        <SelectTrigger data-testid="contractor-type-select">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__new__" className="text-blue-600 font-medium">+ Add New Category</SelectItem>
                          {categories.map(c => <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <Input placeholder="New category" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
                        <Button size="sm" onClick={addCategory}>Add</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowCatInput(false)}><X className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Address</Label><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} /></div>
                </div>
              </TabsContent>

              <TabsContent value="labour" className="space-y-4 mt-4">
                <p className="text-sm text-gray-500">Define types of labourers and their per-day cost.</p>
                <div className="space-y-3">
                  {form.labour_types.map((lt, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="flex-1">
                        <Label className="text-xs">Labour Type</Label>
                        <Input value={lt.label} onChange={e => updateLabourType(i, 'label', e.target.value)} className="h-8" />
                      </div>
                      <div className="w-32">
                        <Label className="text-xs">Per Day Cost</Label>
                        <Input type="number" value={lt.per_day_cost} onChange={e => updateLabourType(i, 'per_day_cost', e.target.value)} className="h-8" />
                      </div>
                      <Button variant="ghost" size="sm" className="mt-4 text-red-500" onClick={() => removeLabourType(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {!showNewSkill ? (
                  <Button variant="outline" size="sm" onClick={() => setShowNewSkill(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Labour Type
                  </Button>
                ) : (
                  <div className="flex gap-2 items-end bg-blue-50 p-3 rounded-lg">
                    <div className="flex-1">
                      <Label className="text-xs">New Type Name</Label>
                      <Input placeholder="e.g. Helper" value={newSkillInput.label} onChange={e => setNewSkillInput({ ...newSkillInput, label: e.target.value })} className="h-8" />
                    </div>
                    <div className="w-32">
                      <Label className="text-xs">Per Day Cost</Label>
                      <Input type="number" value={newSkillInput.default_cost} onChange={e => setNewSkillInput({ ...newSkillInput, default_cost: parseFloat(e.target.value) || 0 })} className="h-8" />
                    </div>
                    <Button size="sm" onClick={addNewSkillType}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowNewSkill(false)}><X className="h-4 w-4" /></Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="account" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
                  <div><Label>Account Number</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} /></div>
                  <div><Label>IFSC Code</Label><Input value={form.ifsc_code} onChange={e => setForm({ ...form, ifsc_code: e.target.value })} /></div>
                  <div><Label>UPI ID</Label><Input value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })} /></div>
                  <div><Label>GST Number</Label><Input value={form.gst_number} onChange={e => setForm({ ...form, gst_number: e.target.value })} /></div>
                  <div><Label>GST Type</Label>
                    <Select value={form.gst_type} onValueChange={v => setForm({ ...form, gst_type: v })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="composition">Composition</SelectItem>
                        <SelectItem value="unregistered">Unregistered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Payment Cycle</Label>
                    <Select value={form.payment_cycle} onValueChange={v => setForm({ ...form, payment_cycle: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_CYCLES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
              <Button data-testid="save-contractor-btn" onClick={handleSubmit}>{editing ? 'Update' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Detail Dialog */}
        <Dialog open={!!viewContractor} onOpenChange={v => { if (!v) { setViewContractor(null); setSummary(null); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {viewContractor && (
              <>
                <DialogHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <DialogTitle className="text-xl">{viewContractor.name}</DialogTitle>
                      <DialogDescription asChild>
                        <div className="flex items-center gap-2 mt-1">
                          {viewContractor.contractor_type && <Badge variant="outline">{viewContractor.contractor_type}</Badge>}
                        </div>
                      </DialogDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setViewContractor(null); openEdit(viewContractor); }}>
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                  </div>
                </DialogHeader>
                <Tabs defaultValue="details" className="mt-4">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="details">Details & Labour</TabsTrigger>
                    <TabsTrigger value="workorders">Work Orders</TabsTrigger>
                    <TabsTrigger value="payments">Payment Summary</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-700">Contact</h4>
                        <div className="space-y-2 text-sm">
                          {viewContractor.contact_person && <p><span className="text-gray-500">Person:</span> {viewContractor.contact_person}</p>}
                          {viewContractor.phone && <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-gray-400" />{viewContractor.phone}</p>}
                          {viewContractor.email && <p className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-gray-400" />{viewContractor.email}</p>}
                          {viewContractor.address && <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" />{viewContractor.address}</p>}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-700">Labour Types</h4>
                        <div className="space-y-2">
                          {viewContractor.labour_types?.map((lt, i) => (
                            <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 text-sm">
                              <span>{lt.label}</span>
                              <Badge variant="secondary">{lt.per_day_cost}/day</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="workorders" className="mt-4">
                    {summary?.work_orders?.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50"><tr>
                            <th className="px-3 py-2 text-left">WO ID</th>
                            <th className="px-3 py-2 text-left">Project</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            <th className="px-3 py-2 text-left">Date</th>
                          </tr></thead>
                          <tbody>{summary.work_orders.map(wo => (
                            <tr key={wo.work_order_id} className="border-t">
                              <td className="px-3 py-2 font-mono text-xs">{wo.work_order_id}</td>
                              <td className="px-3 py-2">{wo.project_name || '-'}</td>
                              <td className="px-3 py-2 text-right">{wo.total_amount?.toLocaleString('en-IN')}</td>
                              <td className="px-3 py-2 text-center"><Badge variant="outline">{wo.status}</Badge></td>
                              <td className="px-3 py-2 text-xs">{wo.created_at?.split('T')[0]}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <p className="text-gray-400 text-center py-8">No work orders yet.</p>}
                  </TabsContent>

                  <TabsContent value="payments" className="mt-4">
                    {summary ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-blue-600">{summary.stats.total_work_orders || 0}</p>
                            <p className="text-xs text-gray-500">Work Orders</p>
                          </CardContent></Card>
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-green-600">{(summary.stats.total_work_value || 0).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-500">Total Value</p>
                          </CardContent></Card>
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-emerald-600">{(summary.stats.total_paid || 0).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-500">Paid</p>
                          </CardContent></Card>
                          <Card><CardContent className="p-3 text-center">
                            <p className="text-2xl font-bold text-red-600">{(summary.stats.pending_payment || 0).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-gray-500">Pending</p>
                          </CardContent></Card>
                        </div>
                      </div>
                    ) : <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>}
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
