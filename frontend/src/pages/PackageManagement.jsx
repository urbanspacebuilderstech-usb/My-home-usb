import React, { useState, useEffect, useCallback } from 'react';
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
  Package, Plus, Trash2, Edit, Lock, Copy, ArrowLeft,
  Layers, Users, Save, X, GripVertical, Eye, FileText,
  ChevronDown, ChevronUp, Building2
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableList, SortableTableRow, DragHandle } from '../components/SortableList';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const FLOOR_CONFIGS = ['G+1', 'G+2', 'G+3'];
const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

// ============ SORTABLE ROW COMPONENT ============
function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : 'auto' };
  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? 'bg-amber-50' : ''}>
      <td className="px-1 py-1 w-8 cursor-grab" {...attributes} {...listeners}><GripVertical className="h-4 w-4 text-gray-400" /></td>
      {children}
    </tr>
  );
}

export default function PackageManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [brands, setBrands] = useState([]);
  const navigate = useNavigate();

  // Package form
  const [editDialog, setEditDialog] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', tag: '', description: '', base_rate_per_sqft: 0, building_types: [], scope_items: [], material_items: [], labour_items: [] });
  const [activeTab, setActiveTab] = useState('materials');

  // Brand dialog
  const [brandDialog, setBrandDialog] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');

  // Rough Estimate
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [estimates, setEstimates] = useState([]);
  const [estDialog, setEstDialog] = useState(false);
  const [editingEst, setEditingEst] = useState(null);
  const [estForm, setEstForm] = useState({ name: '', floor_config: 'G+1', items: [] });

  // Duplicate
  const [dupDialog, setDupDialog] = useState(false);
  const [dupPkg, setDupPkg] = useState(null);
  const [dupName, setDupName] = useState('');
  const [dupTag, setDupTag] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, pkgRes, brandRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/packages`),
        axios.get(`${API}/brands`)
      ]);
      if (!['super_admin', 'general_manager', 'planning'].includes(userRes.data.role)) {
        toast.error('Access denied'); window.location.href = '/dashboard'; return;
      }
      setUser(userRes.data);
      setPackages(pkgRes.data || []);
      setBrands(brandRes.data || []);
    } catch (e) {
      if (e.response?.status === 401) window.location.href = '/login';
    } finally { setLoading(false); }
  };
  useAutoRefresh(fetchData, 15000);

  const fetchEstimates = async (pkgId) => {
    try {
      const res = await axios.get(`${API}/packages/${pkgId}/rough-estimates`);
      setEstimates(res.data || []);
    } catch { setEstimates([]); }
  };

  // ============ PACKAGE HANDLERS ============
  const openCreate = () => {
    setEditingPackage(null);
    setForm({ name: '', code: '', tag: '', description: '', base_rate_per_sqft: 0, building_types: [], scope_items: [], material_items: [], labour_items: [] });
    setActiveTab('materials');
    setEditDialog(true);
  };
  const openEdit = (pkg) => {
    if (pkg.is_locked) { toast.error('Package is locked. Duplicate to make changes.'); return; }
    setEditingPackage(pkg);
    setForm({
      name: pkg.name || '', code: pkg.code || '', tag: pkg.tag || '',
      description: pkg.description || '', base_rate_per_sqft: pkg.base_rate_per_sqft || 0,
      building_types: pkg.building_types || [], scope_items: pkg.scope_items || [],
      material_items: pkg.material_items || [], labour_items: pkg.labour_items || []
    });
    setActiveTab('materials');
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error('Package name and code are required'); return; }
    try {
      const payload = { ...form, tag: form.tag };
      if (editingPackage) {
        await axios.patch(`${API}/packages/${editingPackage.package_id}`, payload);
        toast.success('Package updated');
      } else {
        await axios.post(`${API}/packages`, payload);
        toast.success('Package created');
      }
      setEditDialog(false); fetchData(false);
    } catch (e) { toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this package?')) return;
    try { await axios.delete(`${API}/packages/${id}`); toast.success('Deleted'); fetchData(false); } catch { toast.error('Failed'); }
  };

  const handleLock = async (id) => {
    if (!confirm('Lock this package? It can only be duplicated after locking.')) return;
    try { await axios.post(`${API}/packages/${id}/lock`); toast.success('Package locked'); fetchData(false); } catch { toast.error('Failed'); }
  };

  const handleDuplicate = async () => {
    if (!dupName) { toast.error('Enter a name for the copy'); return; }
    try {
      await axios.post(`${API}/packages/${dupPkg.package_id}/duplicate`, { new_name: dupName, new_tag: dupTag });
      toast.success('Package duplicated'); setDupDialog(false); fetchData(false);
    } catch { toast.error('Failed'); }
  };

  // ============ MATERIAL/BRAND HANDLERS ============
  const addMaterial = () => {
    setForm({ ...form, material_items: [...form.material_items, { item_id: `pmi_${Date.now()}`, name: '', brand: '', specification: '', quantity: 1, unit: 'nos', estimated_rate: 0 }] });
  };
  const updateMaterial = (i, field, val) => {
    const items = [...form.material_items]; items[i] = { ...items[i], [field]: val }; setForm({ ...form, material_items: items });
  };
  const removeMaterial = (i) => { setForm({ ...form, material_items: form.material_items.filter((_, idx) => idx !== i) }); };

  const createBrand = async () => {
    if (!newBrandName.trim()) return;
    try {
      const res = await axios.post(`${API}/brands`, { name: newBrandName.trim(), category: 'general' });
      if (!res.data.exists) setBrands([...brands, res.data]);
      toast.success(`Brand "${newBrandName}" added`);
      setBrandDialog(false); setNewBrandName('');
    } catch { toast.error('Failed'); }
  };

  // ============ ROUGH ESTIMATE HANDLERS ============
  const openPkgEstimates = (pkg) => { setSelectedPkg(pkg); fetchEstimates(pkg.package_id); };
  const backToPackages = () => { setSelectedPkg(null); setEstimates([]); };

  const openCreateEstimate = () => {
    setEditingEst(null);
    setEstForm({ name: '', floor_config: 'G+1', items: [{ name: '', unit: 'nos', amount: 0, qty: 0, total: 0, remarks: '' }] });
    setEstDialog(true);
  };
  const openEditEstimate = (est) => {
    setEditingEst(est);
    setEstForm({ name: est.name, floor_config: est.floor_config, items: est.items?.map(it => ({ name: it.name, unit: it.unit, amount: it.amount, qty: it.qty, total: it.total, remarks: it.remarks })) || [] });
    setEstDialog(true);
  };

  const addEstItem = () => {
    setEstForm({ ...estForm, items: [...estForm.items, { name: '', unit: 'nos', amount: 0, qty: 0, total: 0, remarks: '' }] });
  };
  const updateEstItem = (i, field, val) => {
    const items = [...estForm.items];
    items[i] = { ...items[i], [field]: val };
    if (field === 'amount' || field === 'qty') items[i].total = (parseFloat(items[i].amount) || 0) * (parseFloat(items[i].qty) || 0);
    setEstForm({ ...estForm, items });
  };
  const removeEstItem = (i) => { setEstForm({ ...estForm, items: estForm.items.filter((_, idx) => idx !== i) }); };

  const handleSaveEstimate = async () => {
    if (!estForm.name) { toast.error('Name is required'); return; }
    try {
      if (editingEst) {
        await axios.patch(`${API}/rough-estimates/${editingEst.estimate_id}`, { name: estForm.name, items: estForm.items });
        toast.success('Estimate updated');
      } else {
        await axios.post(`${API}/rough-estimates`, { package_id: selectedPkg.package_id, name: estForm.name, floor_config: estForm.floor_config, items: estForm.items });
        toast.success('Estimate created');
      }
      setEstDialog(false); fetchEstimates(selectedPkg.package_id);
    } catch { toast.error('Failed'); }
  };

  const handleDeleteEstimate = async (id) => {
    if (!confirm('Delete this estimate?')) return;
    try { await axios.delete(`${API}/rough-estimates/${id}`); toast.success('Deleted'); fetchEstimates(selectedPkg.package_id); } catch { toast.error('Failed'); }
  };

  // ============ DRAG HANDLERS ============
  const handleMaterialDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = form.material_items;
    const oldIndex = items.findIndex(it => (it.item_id || it.name + items.indexOf(it)) === active.id);
    const newIndex = items.findIndex(it => (it.item_id || it.name + items.indexOf(it)) === over.id);
    if (oldIndex !== -1 && newIndex !== -1) setForm({ ...form, material_items: arrayMove(items, oldIndex, newIndex) });
  };

  const estTotal = estForm.items.reduce((s, it) => s + ((parseFloat(it.amount) || 0) * (parseFloat(it.qty) || 0)), 0);

  if (loading && !user) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" /></div>;

  // ============ ROUGH ESTIMATES VIEW ============
  if (selectedPkg) return (
    <div className="min-h-screen bg-gray-50" data-testid="rough-estimates-view">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={backToPackages} data-testid="back-to-packages"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
          <div>
            <h1 className="text-xl font-bold">{selectedPkg.name}</h1>
            <div className="flex items-center gap-2">
              {selectedPkg.tag && <Badge className="bg-amber-100 text-amber-700">{selectedPkg.tag}</Badge>}
              <span className="text-sm text-gray-500">{fmt(selectedPkg.base_rate_per_sqft)}/sq.ft</span>
            </div>
          </div>
          <Button onClick={openCreateEstimate} className="ml-auto bg-amber-600 hover:bg-amber-700" data-testid="create-estimate-btn"><Plus className="h-4 w-4 mr-1" />New Rough Estimate</Button>
        </div>

        {estimates.length === 0 ? (
          <Card className="p-8 text-center text-gray-500"><FileText className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No rough estimates yet</p><Button className="mt-3" onClick={openCreateEstimate}>Create First Estimate</Button></Card>
        ) : (
          <div className="space-y-4">
            {FLOOR_CONFIGS.map(fc => {
              const fcEstimates = estimates.filter(e => e.floor_config === fc);
              if (fcEstimates.length === 0) return null;
              return (
                <div key={fc}>
                  <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-2"><Building2 className="h-4 w-4" />{fc} Estimates</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fcEstimates.map(est => (
                      <Card key={est.estimate_id} className="hover:shadow-md transition-shadow" data-testid={`estimate-card-${est.estimate_id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base">{est.name}</CardTitle>
                              <Badge variant="outline" className="mt-1">{est.floor_config}</Badge>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEditEstimate(est)} data-testid={`edit-est-${est.estimate_id}`}><Edit className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDeleteEstimate(est.estimate_id)} data-testid={`delete-est-${est.estimate_id}`}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between text-gray-500"><span>Items</span><span className="font-medium">{est.items?.length || 0}</span></div>
                            <div className="flex justify-between border-t pt-1"><span className="font-semibold">Total Value</span><span className="font-bold text-green-700">{fmt(est.total_value)}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Estimate Dialog */}
      <Dialog open={estDialog} onOpenChange={setEstDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingEst ? 'Edit' : 'New'} Rough Estimate</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Estimate Name *</Label><Input value={estForm.name} onChange={e => setEstForm({ ...estForm, name: e.target.value })} placeholder="e.g., Basic G+1 Estimate" data-testid="est-name-input" /></div>
              <div><Label>Floor Config</Label>
                <Select value={estForm.floor_config} onValueChange={v => setEstForm({ ...estForm, floor_config: v })} disabled={!!editingEst}>
                  <SelectTrigger data-testid="floor-config-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{FLOOR_CONFIGS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-sm">Line Items</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-green-700">Total: {fmt(estTotal)}</span>
                <Button size="sm" onClick={addEstItem} data-testid="add-est-item"><Plus className="h-3 w-3 mr-1" />Add Item</Button>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold w-8">S.No</th>
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 text-left text-xs font-semibold">Name</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold w-20">Unit</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold w-24">Amount</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold w-20">Qty</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold w-28">Total</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold">Remarks</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <SortableList
                    items={estForm.items.map((_, i) => `est-${i}`)}
                    onReorder={(newIds) => {
                      const newItems = newIds.map(id => estForm.items[parseInt(id.split('-')[1])]);
                      setEstForm({ ...estForm, items: newItems });
                    }}
                  >
                  {estForm.items.map((item, i) => (
                    <SortableTableRow key={`est-${i}`} id={`est-${i}`} className="hover:bg-gray-50/50">
                      {({ listeners, attributes }) => (
                        <>
                      <td className="px-1 py-1.5"><DragHandle listeners={listeners} attributes={attributes} /></td>
                      <td className="px-1 py-1"><Input value={item.name} onChange={e => updateEstItem(i, 'name', e.target.value)} className="h-8" placeholder="Item name" /></td>
                      <td className="px-1 py-1"><Input value={item.unit} onChange={e => updateEstItem(i, 'unit', e.target.value)} className="h-8" /></td>
                      <td className="px-1 py-1"><NumericInput value={item.amount} onChange={e => updateEstItem(i, 'amount', e.target.value)} className="h-8 text-right" /></td>
                      <td className="px-1 py-1"><NumericInput value={item.qty} onChange={e => updateEstItem(i, 'qty', e.target.value)} className="h-8 text-right" /></td>
                      <td className="px-2 py-1.5 text-right font-semibold text-green-700">{fmt((parseFloat(item.amount) || 0) * (parseFloat(item.qty) || 0))}</td>
                      <td className="px-1 py-1"><Input value={item.remarks} onChange={e => updateEstItem(i, 'remarks', e.target.value)} className="h-8" placeholder="Remarks" /></td>
                      <td className="px-1 py-1"><Button size="sm" variant="ghost" onClick={() => removeEstItem(i)}><X className="h-4 w-4 text-red-500" /></Button></td>
                        </>
                      )}
                    </SortableTableRow>
                  ))}
                  </SortableList>
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEstDialog(false)}>Cancel</Button><Button onClick={handleSaveEstimate} className="bg-amber-600 hover:bg-amber-700" data-testid="save-estimate-btn"><Save className="h-4 w-4 mr-1" />{editingEst ? 'Update' : 'Save'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );

  // ============ PACKAGES LIST VIEW ============
  return (
    <div className="min-h-screen bg-gray-50" data-testid="package-management">
      <AppHeader user={user} />
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="packages-title">Packages</h1>
            <p className="text-sm text-gray-500">Manage construction packages, materials & rough estimates</p>
          </div>
          {packages.length < 4 && (
            <Button onClick={openCreate} className="bg-amber-600 hover:bg-amber-700" data-testid="create-package-btn"><Plus className="h-4 w-4 mr-1" />New Package</Button>
          )}
        </div>

        {/* 2x2 Package Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {packages.map(pkg => (
            <Card key={pkg.package_id} className={`hover:shadow-lg transition-shadow ${pkg.is_locked ? 'border-amber-300 bg-amber-50/30' : ''}`} data-testid={`package-card-${pkg.package_id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-lg font-bold">{pkg.code}</Badge>
                    {pkg.tag && <Badge className="bg-amber-100 text-amber-700">{pkg.tag}</Badge>}
                    {pkg.is_locked && <Lock className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div className="flex gap-1">
                    {!pkg.is_locked && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)} data-testid={`edit-pkg-${pkg.package_id}`}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleLock(pkg.package_id)} data-testid={`lock-pkg-${pkg.package_id}`}><Lock className="h-4 w-4 text-gray-400" /></Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => { setDupPkg(pkg); setDupName(`${pkg.name} (Copy)`); setDupTag(pkg.tag || ''); setDupDialog(true); }} data-testid={`dup-pkg-${pkg.package_id}`}><Copy className="h-4 w-4" /></Button>
                    {!pkg.is_locked && <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(pkg.package_id)} data-testid={`del-pkg-${pkg.package_id}`}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
                <CardTitle className="text-lg">{pkg.name}</CardTitle>
                {pkg.description && <CardDescription className="line-clamp-2">{pkg.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {pkg.base_rate_per_sqft > 0 && (
                    <div className="flex justify-between items-center p-2 bg-green-50 rounded-lg">
                      <span className="font-medium text-green-800">Per Sq.ft Rate</span>
                      <span className="text-lg font-bold text-green-700">{fmt(pkg.base_rate_per_sqft)}</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Package className="h-3 w-3" /> Materials</span><span className="font-medium">{pkg.material_items?.length || 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Layers className="h-3 w-3" /> Scope Items</span><span className="font-medium">{pkg.scope_items?.length || 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" /> Labour Items</span><span className="font-medium">{pkg.labour_items?.length || 0}</span></div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <Button variant="outline" size="sm" className="w-full" onClick={() => openPkgEstimates(pkg)} data-testid={`view-estimates-${pkg.package_id}`}>
                    <FileText className="h-4 w-4 mr-1" /> View Rough Estimates
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {packages.length === 0 && (
            <Card className="col-span-full p-8 text-center text-gray-500"><Package className="h-12 w-12 mx-auto mb-4 opacity-40" /><p>No packages created yet</p><Button className="mt-3" onClick={openCreate}>Create First Package</Button></Card>
          )}
        </div>
      </div>

      {/* CREATE/EDIT PACKAGE DIALOG */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPackage ? 'Edit Package' : 'Create Package'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><Label>Package Code *</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="A" maxLength={5} data-testid="pkg-code" /></div>
              <div className="sm:col-span-2"><Label>Package Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Value for Money" data-testid="pkg-name" /></div>
              <div><Label>Tag</Label><Input value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} placeholder="1899" data-testid="pkg-tag" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Per Sq.ft Rate</Label><NumericInput value={form.base_rate_per_sqft} onChange={e => setForm({ ...form, base_rate_per_sqft: parseFloat(e.target.value) || 0 })} data-testid="pkg-rate" /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description" /></div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="materials">Materials ({form.material_items.length})</TabsTrigger>
                <TabsTrigger value="scope">Scope ({form.scope_items.length})</TabsTrigger>
                <TabsTrigger value="labour">Labour ({form.labour_items.length})</TabsTrigger>
              </TabsList>

              {/* MATERIALS TAB */}
              <TabsContent value="materials" className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Materials with Brands</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setBrandDialog(true)} data-testid="create-brand-btn"><Plus className="h-3 w-3 mr-1" />New Brand</Button>
                    <Button size="sm" onClick={addMaterial} data-testid="add-material-btn"><Plus className="h-3 w-3 mr-1" />Add Material</Button>
                  </div>
                </div>
                {form.material_items.length === 0 ? (
                  <div className="text-center py-6 border rounded-lg border-dashed"><Package className="h-8 w-8 mx-auto text-gray-400 mb-2" /><p className="text-sm text-gray-500">No materials added</p></div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-1 py-2 w-8"></th>
                          <th className="px-2 py-2 text-left text-xs font-semibold">S.No</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold">Material Name</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold">Brand</th>
                          <th className="px-2 py-2 text-left text-xs font-semibold">Specification</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMaterialDragEnd}>
                        <SortableContext items={form.material_items.map((it, idx) => it.item_id || `mat_${idx}`)} strategy={verticalListSortingStrategy}>
                          <tbody className="divide-y">
                            {form.material_items.map((item, i) => (
                              <SortableRow key={item.item_id || `mat_${i}`} id={item.item_id || `mat_${i}`}>
                                <td className="px-2 py-1 text-gray-500">{i + 1}</td>
                                <td className="px-1 py-1"><Input value={item.name} onChange={e => updateMaterial(i, 'name', e.target.value)} className="h-8" placeholder="Cement, Steel, etc." data-testid={`mat-name-${i}`} /></td>
                                <td className="px-1 py-1">
                                  <Select value={item.brand || ''} onValueChange={v => updateMaterial(i, 'brand', v)}>
                                    <SelectTrigger className="h-8" data-testid={`mat-brand-${i}`}><SelectValue placeholder="Select brand" /></SelectTrigger>
                                    <SelectContent>
                                      {brands.map(b => <SelectItem key={b.brand_id} value={b.name}>{b.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-1 py-1"><Input value={item.specification || ''} onChange={e => updateMaterial(i, 'specification', e.target.value)} className="h-8" placeholder="Grade/Spec" /></td>
                                <td className="px-1 py-1"><Button size="sm" variant="ghost" onClick={() => removeMaterial(i)}><X className="h-4 w-4 text-red-500" /></Button></td>
                              </SortableRow>
                            ))}
                          </tbody>
                        </SortableContext>
                      </DndContext>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* SCOPE TAB */}
              <TabsContent value="scope" className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-green-600">Total: {fmt(form.scope_items.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_rate) || 0)), 0))}</span>
                  <Button size="sm" onClick={() => setForm({ ...form, scope_items: [...form.scope_items, { item_id: `psi_${Date.now()}`, name: '', quantity: 1, unit: 'nos', unit_rate: 0 }] })}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                {form.scope_items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                    <Input className="col-span-4" value={item.name} onChange={e => { const items = [...form.scope_items]; items[i].name = e.target.value; setForm({ ...form, scope_items: items }); }} placeholder="Item name" />
                    <NumericInput className="col-span-2" value={item.quantity} onChange={e => { const items = [...form.scope_items]; items[i].quantity = e.target.value; setForm({ ...form, scope_items: items }); }} />
                    <Input className="col-span-2" value={item.unit} onChange={e => { const items = [...form.scope_items]; items[i].unit = e.target.value; setForm({ ...form, scope_items: items }); }} />
                    <NumericInput className="col-span-2" value={item.unit_rate} onChange={e => { const items = [...form.scope_items]; items[i].unit_rate = e.target.value; setForm({ ...form, scope_items: items }); }} />
                    <span className="col-span-1 text-right text-sm font-medium">{fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0))}</span>
                    <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setForm({ ...form, scope_items: form.scope_items.filter((_, idx) => idx !== i) })}><X className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ))}
              </TabsContent>

              {/* LABOUR TAB */}
              <TabsContent value="labour" className="space-y-3">
                <div className="flex justify-end"><Button size="sm" onClick={() => setForm({ ...form, labour_items: [...form.labour_items, { item_id: `pli_${Date.now()}`, work_type: '', estimated_days: 0, daily_rate: 0, workers_count: 1 }] })}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
                {form.labour_items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                    <Input className="col-span-4" value={item.work_type} onChange={e => { const items = [...form.labour_items]; items[i].work_type = e.target.value; setForm({ ...form, labour_items: items }); }} placeholder="Masonry, Plumbing..." />
                    <NumericInput className="col-span-2" value={item.estimated_days} onChange={e => { const items = [...form.labour_items]; items[i].estimated_days = e.target.value; setForm({ ...form, labour_items: items }); }} placeholder="Days" />
                    <NumericInput className="col-span-2" value={item.daily_rate} onChange={e => { const items = [...form.labour_items]; items[i].daily_rate = e.target.value; setForm({ ...form, labour_items: items }); }} placeholder="Daily Rate" />
                    <NumericInput className="col-span-2" value={item.workers_count} onChange={e => { const items = [...form.labour_items]; items[i].workers_count = e.target.value; setForm({ ...form, labour_items: items }); }} placeholder="Workers" />
                    <Button variant="ghost" size="icon" className="col-span-2" onClick={() => setForm({ ...form, labour_items: form.labour_items.filter((_, idx) => idx !== i) })}><X className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button><Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-700" data-testid="save-package-btn"><Save className="h-4 w-4 mr-1" />{editingPackage ? 'Update' : 'Create'} Package</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BRAND DIALOG */}
      <Dialog open={brandDialog} onOpenChange={setBrandDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create New Brand</DialogTitle><DialogDescription>Add a brand for material selection</DialogDescription></DialogHeader>
          <div><Label>Brand Name</Label><Input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="e.g., Zuari, Dalmia" data-testid="new-brand-input" onKeyDown={e => e.key === 'Enter' && createBrand()} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setBrandDialog(false)}>Cancel</Button><Button onClick={createBrand} className="bg-amber-600 hover:bg-amber-700" data-testid="save-brand-btn">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DUPLICATE DIALOG */}
      <Dialog open={dupDialog} onOpenChange={setDupDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Duplicate Package</DialogTitle><DialogDescription>Create an editable copy of "{dupPkg?.name}"</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>New Name *</Label><Input value={dupName} onChange={e => setDupName(e.target.value)} data-testid="dup-name" /></div>
            <div><Label>Tag</Label><Input value={dupTag} onChange={e => setDupTag(e.target.value)} data-testid="dup-tag" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDupDialog(false)}>Cancel</Button><Button onClick={handleDuplicate} className="bg-amber-600 hover:bg-amber-700" data-testid="confirm-dup-btn">Duplicate</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav user={user} />
    </div>
  );
}
