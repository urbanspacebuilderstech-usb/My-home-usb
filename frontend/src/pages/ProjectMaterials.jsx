import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  ArrowLeft, Plus, Edit, Trash2, Lock, Unlock, Package, AlertTriangle
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ProjectMaterials() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [materialsLocked, setMaterialsLocked] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [user, setUser] = useState(null);
  
  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [unlockDialog, setUnlockDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');
  
  const [form, setForm] = useState({
    name: '',
    brand: '',
    specification: '',
    quantity: 1,
    unit: 'nos',
    estimated_rate: 0
  });

  useEffect(() => {
    fetchMaterials(false);
    axios.get(`${API}/auth/me`).then(r => setUser(r.data)).catch(() => {});
  }, [projectId]);

  const fetchMaterials = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const res = await axios.get(`${API}/projects/${projectId}/materials`);
      setProjectName(res.data.project_name);
      setProjectStatus(res.data.project_status);
      setMaterialsLocked(res.data.materials_locked);
      setMaterials(res.data.materials);
    } catch (error) {
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/materials`, form);
      toast.success('Material added');
      setAddDialog(false);
      resetForm();
      fetchMaterials(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add material');
    }
  };

  const handleEdit = async () => {
    try {
      await axios.patch(`${API}/projects/${projectId}/materials/${selectedMaterial.material_id}`, form);
      toast.success('Material updated');
      setEditDialog(false);
      resetForm();
      fetchMaterials(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update material');
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/projects/${projectId}/materials/${selectedMaterial.material_id}`);
      toast.success('Material deleted');
      setDeleteDialog(false);
      fetchMaterials(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete material');
    }
  };

  const handleUnlockRequest = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/request-material-unlock?reason=${encodeURIComponent(unlockReason)}`);
      toast.success('Unlock requested. Project sent for re-approval.');
      setUnlockDialog(false);
      setUnlockReason('');
      fetchMaterials(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request unlock');
    }
  };

  const openEditDialog = (material) => {
    setSelectedMaterial(material);
    setForm({
      name: material.name,
      brand: material.brand || '',
      specification: material.specification || '',
      quantity: material.quantity,
      unit: material.unit,
      estimated_rate: material.estimated_rate
    });
    setEditDialog(true);
  };

  const resetForm = () => {
    setForm({
      name: '',
      brand: '',
      specification: '',
      quantity: 1,
      unit: 'nos',
      estimated_rate: 0
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (loading && materials.length === 0) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Locked Alert */}
        {materialsLocked && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">Material brands are locked</p>
                  <p className="text-sm text-amber-600">This project has been approved. Material brands cannot be changed without re-approval.</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="border-amber-400 text-amber-700 hover:bg-amber-100"
                onClick={() => setUnlockDialog(true)}
                data-testid="request-unlock-btn"
              >
                <Unlock className="h-4 w-4 mr-2" /> Request Unlock
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Materials ({materials.length})</h2>
          {!materialsLocked && (
            <Button onClick={() => { resetForm(); setAddDialog(true); }} data-testid="add-material-btn">
              <Plus className="h-4 w-4 mr-2" /> Add Material
            </Button>
          )}
        </div>

        {/* Materials List */}
        {materials.length === 0 ? (
          <Card className="bg-gray-50">
            <CardContent className="p-8 text-center text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No materials specified yet</p>
              {!materialsLocked && (
                <Button variant="outline" className="mt-4" onClick={() => { resetForm(); setAddDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Add First Material
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {materials.map((material) => (
              <Card key={material.material_id} className="hover:shadow-md transition-shadow" data-testid={`material-card-${material.material_id}`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{material.name}</CardTitle>
                      {material.brand && (
                        <Badge variant="secondary" className="mt-1">{material.brand}</Badge>
                      )}
                    </div>
                    {!materialsLocked && (
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => openEditDialog(material)}
                          data-testid={`edit-material-${material.material_id}`}
                        >
                          <Edit className="h-4 w-4 text-amber-600" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => { setSelectedMaterial(material); setDeleteDialog(true); }}
                          data-testid={`delete-material-${material.material_id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {material.specification && (
                    <p className="text-sm text-gray-600 mb-2">{material.specification}</p>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{material.quantity} {material.unit}</span>
                    <span className="font-semibold text-green-600">{formatCurrency(material.estimated_rate)}/{material.unit}</span>
                  </div>
                  {material.from_package && (
                    <Badge variant="outline" className="mt-2 text-xs">From Package</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Material Dialog */}
      <Dialog open={addDialog || editDialog} onOpenChange={(open) => { setAddDialog(false); setEditDialog(false); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDialog ? 'Edit Material' : 'Add Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Material Name *</Label>
              <Input 
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Cement, Steel, Sand"
                data-testid="material-name-input"
              />
            </div>
            <div>
              <Label>Brand</Label>
              <Input 
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g., UltraTech, Tata Tiscon"
                data-testid="material-brand-input"
              />
            </div>
            <div>
              <Label>Specification</Label>
              <Input 
                value={form.specification}
                onChange={(e) => setForm({ ...form, specification: e.target.value })}
                placeholder="e.g., Grade 53, Fe 500D TMT"
                data-testid="material-spec-input"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Quantity</Label>
                <NumericInput 
                  
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
                  data-testid="material-qty-input"
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input 
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="bags, kg, cum"
                  data-testid="material-unit-input"
                />
              </div>
              <div>
                <Label>Rate/Unit</Label>
                <NumericInput 
                  
                  value={form.estimated_rate}
                  onChange={(e) => setForm({ ...form, estimated_rate: parseFloat(e.target.value) || 0 })}
                  data-testid="material-rate-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setEditDialog(false); resetForm(); }}>Cancel</Button>
            <Button onClick={editDialog ? handleEdit : handleAdd} disabled={!form.name} data-testid="save-material-btn">
              {editDialog ? 'Save Changes' : 'Add Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Material</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Are you sure you want to delete <strong>{selectedMaterial?.name}</strong>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-btn">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Request Dialog */}
      <Dialog open={unlockDialog} onOpenChange={setUnlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Material Unlock</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              This will send the project back for re-approval. Please provide a reason for the material changes.
            </p>
            <Label>Reason for unlock request *</Label>
            <Textarea 
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder="e.g., Need to change cement brand due to supply issues"
              rows={3}
              data-testid="unlock-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnlockDialog(false); setUnlockReason(''); }}>Cancel</Button>
            <Button onClick={handleUnlockRequest} disabled={!unlockReason.trim()} data-testid="confirm-unlock-btn">
              <Unlock className="h-4 w-4 mr-2" /> Request Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
