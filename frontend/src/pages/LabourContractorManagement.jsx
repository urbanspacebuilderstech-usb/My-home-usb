import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  Users, ArrowLeft, Plus, Trash2, Edit, Phone, Mail, Building2, 
  Banknote, X
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WORK_TYPES = [
  'Masonry', 'Plumbing', 'Electrical', 'Carpentry', 'Painting',
  'Flooring', 'Roofing', 'HVAC', 'Civil', 'Finishing', 'Tiling', 'Waterproofing'
];

export default function LabourContractorManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contractors, setContractors] = useState([]);
  
  const [editDialog, setEditDialog] = useState(false);
  const [editingContractor, setEditingContractor] = useState(null);
  const [form, setForm] = useState({
    name: '',
    work_types: [],
    phone: '',
    email: '',
    address: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    rate_structure: {}
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, contractorsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/labour-contractors`)
      ]);
      
      if (!['planning', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Only Planning can access this page');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setContractors(contractorsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  const resetForm = () => {
    setForm({
      name: '',
      work_types: [],
      phone: '',
      email: '',
      address: '',
      bank_name: '',
      account_number: '',
      ifsc_code: '',
      rate_structure: {}
    });
    setEditingContractor(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setEditDialog(true);
  };

  const openEditDialog = (contractor) => {
    setEditingContractor(contractor);
    setForm({
      name: contractor.name || '',
      work_types: contractor.work_types || [],
      phone: contractor.phone || '',
      email: contractor.email || '',
      address: contractor.address || '',
      bank_name: contractor.bank_name || '',
      account_number: contractor.account_number || '',
      ifsc_code: contractor.ifsc_code || '',
      rate_structure: contractor.rate_structure || {}
    });
    setEditDialog(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error('Please enter contractor name');
      return;
    }

    try {
      if (editingContractor) {
        await axios.patch(`${API}/labour-contractors/${editingContractor.contractor_id}`, form);
        toast.success('Contractor updated');
      } else {
        await axios.post(`${API}/labour-contractors`, form);
        toast.success('Contractor created');
      }
      setEditDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to save contractor');
    }
  };

  const handleDelete = async (contractorId) => {
    if (!window.confirm('Are you sure you want to delete this contractor?')) return;
    
    try {
      await axios.delete(`${API}/labour-contractors/${contractorId}`);
      toast.success('Contractor deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete contractor');
    }
  };

  const toggleWorkType = (workType) => {
    const types = form.work_types.includes(workType)
      ? form.work_types.filter(t => t !== workType)
      : [...form.work_types, workType];
    setForm({ ...form, work_types: types });
  };

  const updateRate = (workType, rate) => {
    setForm({
      ...form,
      rate_structure: {
        ...form.rate_structure,
        [workType]: parseFloat(rate) || 0
      }
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (loading && !user) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <AppHeader user={user} />

      <div className="max-w-6xl mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{contractors.length}</p>
              <p className="text-sm text-gray-500">Total Contractors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {new Set(contractors.flatMap(c => c.work_types || [])).size}
              </p>
              <p className="text-sm text-gray-500">Work Types</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{contractors.filter(c => c.is_active).length}</p>
              <p className="text-sm text-gray-500">Active</p>
            </CardContent>
          </Card>
        </div>

        {/* Contractors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contractors.map((contractor) => (
            <Card key={contractor.contractor_id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{contractor.name}</CardTitle>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(contractor.work_types || []).map((type) => (
                        <Badge key={type} variant="secondary" className="text-xs">{type}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(contractor)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(contractor.contractor_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {contractor.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="h-3 w-3" /> {contractor.phone}
                    </div>
                  )}
                  {contractor.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-3 w-3" /> {contractor.email}
                    </div>
                  )}
                  {contractor.bank_name && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Banknote className="h-3 w-3" /> {contractor.bank_name}
                    </div>
                  )}
                  
                  {/* Rate Structure */}
                  {contractor.rate_structure && Object.keys(contractor.rate_structure).length > 0 && (
                    <div className="pt-2 mt-2 border-t">
                      <p className="text-xs font-medium text-gray-500 mb-1">Daily Rates:</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(contractor.rate_structure).map(([type, rate]) => (
                          <span key={type} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                            {type}: {formatCurrency(rate)}/day
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {contractors.length === 0 && (
            <Card className="col-span-full p-8 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No contractors added yet</p>
              <Button className="mt-4" onClick={openCreateDialog}>Add First Contractor</Button>
            </Card>
          )}
        </div>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContractor ? 'Edit Contractor' : 'Add Labour Contractor'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Contractor Name *</Label>
                <Input 
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input 
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 9876543210"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input 
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Address"
                />
              </div>
            </div>

            {/* Work Types */}
            <div>
              <Label>Work Types</Label>
              <p className="text-xs text-gray-500 mb-2">Select the types of work this contractor can do</p>
              <div className="flex flex-wrap gap-2">
                {WORK_TYPES.map((type) => (
                  <Badge 
                    key={type}
                    variant={form.work_types.includes(type) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleWorkType(type)}
                  >
                    {type}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Rate Structure */}
            {form.work_types.length > 0 && (
              <div>
                <Label>Daily Rates (₹)</Label>
                <p className="text-xs text-gray-500 mb-2">Set daily rates for each work type</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {form.work_types.map((type) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-sm font-medium w-24 truncate">{type}:</span>
                      <Input 
                        type="number"
                        value={form.rate_structure[type] || ''}
                        onChange={(e) => updateRate(type, e.target.value)}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bank Details */}
            <div className="border-t pt-4">
              <Label className="text-base">Bank Details</Label>
              <p className="text-xs text-gray-500 mb-3">For payment processing</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Bank Name</Label>
                  <Input 
                    value={form.bank_name}
                    onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    placeholder="Bank name"
                  />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input 
                    value={form.account_number}
                    onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                    placeholder="Account number"
                  />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input 
                    value={form.ifsc_code}
                    onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })}
                    placeholder="IFSC code"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-secondary hover:bg-secondary/90">
              {editingContractor ? 'Update' : 'Add'} Contractor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
