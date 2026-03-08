import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
  Building2, LogOut, Plus, CheckCircle, Clock, AlertTriangle, XCircle,
  ArrowLeft, RefreshCw, DollarSign, FileText, Lock, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' }
];

export default function IndirectCostManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  
  const [createDialog, setCreateDialog] = useState(false);
  const [approveDialog, setApproveDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedCost, setSelectedCost] = useState(null);
  
  const [createForm, setCreateForm] = useState({
    category: '',
    description: '',
    amount: '',
    payment_method: 'bank_transfer',
    vendor_name: '',
    invoice_number: '',
    invoice_date: '',
    remarks: ''
  });
  
  const [confirmForm, setConfirmForm] = useState({
    payment_date: '',
    reference_number: '',
    remarks: ''
  });
  
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, costsRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/financial/indirect-costs`),
        axios.get(`${API}/financial/indirect-cost-categories`)
      ]);
      
      if (!['accountant', 'super_admin', 'general_manager'].includes(userRes.data.role)) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setCosts(costsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      if (error.response?.status === 401) {
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch (e) {}
    window.location.href = '/login';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  };

  const handleCreateCost = async () => {
    if (!createForm.category || !createForm.description || !createForm.amount) {
      toast.error('Category, description, and amount are required');
      return;
    }

    try {
      const payload = {
        ...createForm,
        amount: parseFloat(createForm.amount),
        invoice_date: createForm.invoice_date ? new Date(createForm.invoice_date).toISOString() : null
      };

      await axios.post(`${API}/financial/indirect-costs`, payload);
      toast.success('Indirect cost created. Pending approval.');
      setCreateDialog(false);
      setCreateForm({
        category: '',
        description: '',
        amount: '',
        payment_method: 'bank_transfer',
        vendor_name: '',
        invoice_number: '',
        invoice_date: '',
        remarks: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create entry');
    }
  };

  const handleApprove = async (approved) => {
    try {
      await axios.patch(`${API}/financial/indirect-costs/${selectedCost.indirect_cost_id}/approve`, {
        approved,
        rejection_reason: approved ? null : rejectionReason
      });
      toast.success(approved ? 'Approved successfully' : 'Rejected');
      setApproveDialog(false);
      setSelectedCost(null);
      setRejectionReason('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process');
    }
  };

  const handleConfirmPayment = async () => {
    if (!confirmForm.reference_number || !confirmForm.payment_date) {
      toast.error('Payment date and reference number are required');
      return;
    }

    try {
      await axios.patch(`${API}/financial/indirect-costs/${selectedCost.indirect_cost_id}/confirm`, {
        payment_date: new Date(confirmForm.payment_date).toISOString(),
        reference_number: confirmForm.reference_number,
        remarks: confirmForm.remarks
      });
      toast.success('Payment confirmed and locked');
      setConfirmDialog(false);
      setSelectedCost(null);
      setConfirmForm({ payment_date: '', reference_number: '', remarks: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm payment');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending Approval', class: 'bg-yellow-100 text-yellow-700', icon: Clock },
      approved: { label: 'Approved', class: 'bg-amber-50 text-amber-700', icon: ThumbsUp },
      rejected: { label: 'Rejected', class: 'bg-red-100 text-red-700', icon: XCircle },
      confirmed: { label: 'Confirmed', class: 'bg-green-100 text-green-700', icon: Lock }
    };
    const c = config[status] || { label: status, class: 'bg-gray-100 text-gray-700', icon: Clock };
    const Icon = c.icon;
    return (
      <Badge className={`${c.class} flex items-center gap-1`}>
        <Icon className="h-3 w-3" /> {c.label}
      </Badge>
    );
  };

  const getCategoryLabel = (value) => {
    const cat = categories.find(c => c.value === value);
    return cat ? cat.label : value;
  };

  const filteredCosts = costs.filter(c => {
    if (activeTab === 'pending') return c.status === 'pending';
    if (activeTab === 'approved') return c.status === 'approved';
    if (activeTab === 'confirmed') return c.status === 'confirmed';
    if (activeTab === 'rejected') return c.status === 'rejected';
    return true;
  });

  const stats = {
    pending: costs.filter(c => c.status === 'pending').length,
    approved: costs.filter(c => c.status === 'approved').length,
    confirmed: costs.filter(c => c.status === 'confirmed').length,
    rejected: costs.filter(c => c.status === 'rejected').length,
    totalConfirmed: costs.filter(c => c.status === 'confirmed').reduce((sum, c) => sum + (c.amount || 0), 0)
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  const canCreate = user?.role === 'accountant';
  const canApprove = ['super_admin', 'general_manager'].includes(user?.role);
  const canConfirm = user?.role === 'accountant';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-yellow-50 border-yellow-200 cursor-pointer" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-1 text-yellow-600" />
              <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
              <p className="text-xs text-yellow-600">Pending Approval</p>
            </CardContent>
          </Card>
          
          <Card className="bg-amber-50 border-blue-200 cursor-pointer" onClick={() => setActiveTab('approved')}>
            <CardContent className="p-4 text-center">
              <ThumbsUp className="h-6 w-6 mx-auto mb-1 text-amber-600" />
              <p className="text-2xl font-bold text-amber-700">{stats.approved}</p>
              <p className="text-xs text-amber-600">Approved</p>
            </CardContent>
          </Card>
          
          <Card className="bg-green-50 border-green-200 cursor-pointer" onClick={() => setActiveTab('confirmed')}>
            <CardContent className="p-4 text-center">
              <Lock className="h-6 w-6 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold text-green-700">{stats.confirmed}</p>
              <p className="text-xs text-green-600">Confirmed</p>
            </CardContent>
          </Card>
          
          <Card className="bg-red-50 border-red-200 cursor-pointer" onClick={() => setActiveTab('rejected')}>
            <CardContent className="p-4 text-center">
              <XCircle className="h-6 w-6 mx-auto mb-1 text-red-600" />
              <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
              <p className="text-xs text-red-600">Rejected</p>
            </CardContent>
          </Card>
          
          <Card className="bg-violet-50 border-violet-200">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-6 w-6 mx-auto mb-1 text-violet-600" />
              <p className="text-xl font-bold text-violet-700">{formatCurrency(stats.totalConfirmed)}</p>
              <p className="text-xs text-violet-600">Total Confirmed</p>
            </CardContent>
          </Card>
        </div>

        {/* Costs Table */}
        <Card>
          <CardHeader className="border-b">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({stats.approved})</TabsTrigger>
                <TabsTrigger value="confirmed">Confirmed ({stats.confirmed})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CATEGORY</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">VENDOR</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CREATED BY</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCosts.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        No entries found
                      </td>
                    </tr>
                  ) : (
                    filteredCosts.map((cost) => (
                      <tr key={cost.indirect_cost_id} className="hover:bg-gray-50" data-testid={`cost-row-${cost.indirect_cost_id}`}>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{getCategoryLabel(cost.category)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{cost.description}</p>
                          {cost.invoice_number && (
                            <p className="text-xs text-gray-500">Inv: {cost.invoice_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{cost.vendor_name || '-'}</td>
                        <td className="px-4 py-3 text-right font-bold text-violet-600">{formatCurrency(cost.amount)}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(cost.status)}</td>
                        <td className="px-4 py-3 text-sm">{cost.created_by_name}</td>
                        <td className="px-4 py-3 text-center">
                          {cost.status === 'pending' && canApprove && (
                            <Button 
                              size="sm" 
                              onClick={() => { setSelectedCost(cost); setApproveDialog(true); }}
                              data-testid={`approve-btn-${cost.indirect_cost_id}`}
                            >
                              Review
                            </Button>
                          )}
                          {cost.status === 'approved' && canConfirm && (
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => { setSelectedCost(cost); setConfirmDialog(true); }}
                              data-testid={`confirm-btn-${cost.indirect_cost_id}`}
                            >
                              Confirm Payment
                            </Button>
                          )}
                          {cost.status === 'confirmed' && (
                            <span className="text-xs text-green-600 flex items-center justify-center gap-1">
                              <Lock className="h-3 w-3" /> Locked
                            </span>
                          )}
                          {cost.status === 'rejected' && (
                            <span className="text-xs text-red-600">{cost.rejection_reason || 'Rejected'}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Indirect Cost Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Indirect Cost (Overhead)</DialogTitle>
            <DialogDescription>
              This entry requires approval from Super Admin or GM before payment can be processed.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select value={createForm.category} onValueChange={(v) => setCreateForm({...createForm, category: v})}>
                <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Description *</Label>
              <Input 
                value={createForm.description}
                onChange={(e) => setCreateForm({...createForm, description: e.target.value})}
                placeholder="E.g., Office rent for January 2026"
                data-testid="input-description"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount *</Label>
                <Input 
                  type="number"
                  value={createForm.amount}
                  onChange={(e) => setCreateForm({...createForm, amount: e.target.value})}
                  placeholder="Enter amount"
                  data-testid="input-amount"
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={createForm.payment_method} onValueChange={(v) => setCreateForm({...createForm, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Vendor/Payee Name</Label>
              <Input 
                value={createForm.vendor_name}
                onChange={(e) => setCreateForm({...createForm, vendor_name: e.target.value})}
                placeholder="Name of vendor or payee"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Invoice Number</Label>
                <Input 
                  value={createForm.invoice_number}
                  onChange={(e) => setCreateForm({...createForm, invoice_number: e.target.value})}
                  placeholder="Invoice #"
                />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input 
                  type="date"
                  value={createForm.invoice_date}
                  onChange={(e) => setCreateForm({...createForm, invoice_date: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Textarea 
                value={createForm.remarks}
                onChange={(e) => setCreateForm({...createForm, remarks: e.target.value})}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateCost} className="bg-violet-600 hover:bg-violet-700" data-testid="submit-indirect-cost">
              <Plus className="h-4 w-4 mr-1" /> Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Dialog */}
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Indirect Cost</DialogTitle>
          </DialogHeader>
          
          {selectedCost && (
            <div className="space-y-4">
              <Card className="bg-violet-50 border-violet-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{getCategoryLabel(selectedCost.category)}</p>
                  <p className="text-sm text-gray-600">{selectedCost.description}</p>
                  <p className="text-2xl font-bold text-violet-700 mt-2">{formatCurrency(selectedCost.amount)}</p>
                  {selectedCost.vendor_name && (
                    <p className="text-sm text-gray-500">Vendor: {selectedCost.vendor_name}</p>
                  )}
                </CardContent>
              </Card>
              
              <div>
                <Label>Rejection Reason (if rejecting)</Label>
                <Textarea 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Required if rejecting..."
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setApproveDialog(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => handleApprove(false)}
              disabled={!rejectionReason}
              data-testid="reject-btn"
            >
              <ThumbsDown className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handleApprove(true)}
              data-testid="approve-btn"
            >
              <ThumbsUp className="h-4 w-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Payment Dialog */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Once confirmed, this entry will be locked and cannot be modified.
            </DialogDescription>
          </DialogHeader>
          
          {selectedCost && (
            <div className="space-y-4">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <p className="font-semibold">{selectedCost.description}</p>
                  <p className="text-2xl font-bold text-green-700 mt-2">{formatCurrency(selectedCost.amount)}</p>
                </CardContent>
              </Card>
              
              <div>
                <Label>Payment Date *</Label>
                <Input 
                  type="date"
                  value={confirmForm.payment_date}
                  onChange={(e) => setConfirmForm({...confirmForm, payment_date: e.target.value})}
                  data-testid="input-payment-date"
                />
              </div>
              
              <div>
                <Label>Reference / Transaction ID *</Label>
                <Input 
                  value={confirmForm.reference_number}
                  onChange={(e) => setConfirmForm({...confirmForm, reference_number: e.target.value})}
                  placeholder="Enter transaction reference"
                  data-testid="input-reference"
                />
              </div>
              
              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={confirmForm.remarks}
                  onChange={(e) => setConfirmForm({...confirmForm, remarks: e.target.value})}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmPayment} className="bg-green-600 hover:bg-green-700" data-testid="confirm-payment-btn">
              <Lock className="h-4 w-4 mr-1" /> Confirm & Lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
