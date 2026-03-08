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
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { 
  HelpCircle, LogOut, Plus, CheckCircle, Clock, AlertTriangle, XCircle,
  ArrowLeft, RefreshCw, DollarSign, Lock, ArrowUpRight, ArrowDownRight
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

export default function SuspenseAccount() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  
  const [createDialog, setCreateDialog] = useState(false);
  const [allocateDialog, setAllocateDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  
  const [createForm, setCreateForm] = useState({
    amount: '',
    transaction_type: 'income',
    description: '',
    source: '',
    reference_number: '',
    payment_method: 'bank_transfer',
    remarks: ''
  });
  
  const [allocateForm, setAllocateForm] = useState({
    approved: true,
    allocated_to: '',
    allocation_category: '',
    allocation_reason: '',
    rejection_reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, entriesRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/financial/suspense`),
        axios.get(`${API}/projects`)
      ]);
      
      if (!['accountant', 'super_admin', 'general_manager'].includes(userRes.data.role)) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setEntries(entriesRes.data);
      setProjects(projectsRes.data);
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

  const handleCreateEntry = async () => {
    if (!createForm.amount || !createForm.description) {
      toast.error('Amount and description are required');
      return;
    }

    try {
      await axios.post(`${API}/financial/suspense`, {
        ...createForm,
        amount: parseFloat(createForm.amount)
      });
      toast.success('Suspense entry created. Requires Super Admin approval for allocation.');
      setCreateDialog(false);
      setCreateForm({
        amount: '',
        transaction_type: 'income',
        description: '',
        source: '',
        reference_number: '',
        payment_method: 'bank_transfer',
        remarks: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create entry');
    }
  };

  const handleAllocate = async () => {
    if (allocateForm.approved && !allocateForm.allocated_to) {
      toast.error('Allocation target is required');
      return;
    }
    if (!allocateForm.approved && !allocateForm.rejection_reason) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await axios.patch(`${API}/financial/suspense/${selectedEntry.suspense_id}/allocate`, allocateForm);
      toast.success(allocateForm.approved ? 'Entry allocated successfully' : 'Entry rejected');
      setAllocateDialog(false);
      setSelectedEntry(null);
      setAllocateForm({
        approved: true,
        allocated_to: '',
        allocation_category: '',
        allocation_reason: '',
        rejection_reason: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending Allocation', class: 'bg-yellow-100 text-yellow-700', icon: Clock },
      allocated: { label: 'Allocated', class: 'bg-green-100 text-green-700', icon: CheckCircle },
      rejected: { label: 'Rejected', class: 'bg-red-100 text-red-700', icon: XCircle }
    };
    const c = config[status] || { label: status, class: 'bg-gray-100 text-gray-700', icon: Clock };
    const Icon = c.icon;
    return (
      <Badge className={`${c.class} flex items-center gap-1`}>
        <Icon className="h-3 w-3" /> {c.label}
      </Badge>
    );
  };

  const pendingEntries = entries.filter(e => e.status === 'pending');
  const allocatedEntries = entries.filter(e => e.status === 'allocated');
  const rejectedEntries = entries.filter(e => e.status === 'rejected');
  
  const pendingTotal = pendingEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-orange-600" />
      </div>
    );
  }

  const canCreate = user?.role === 'accountant';
  const canAllocate = user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <AppHeader user={user} />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Info Banner */}
        <Card className="mb-6 bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-800">Suspense Account Rules</p>
                <ul className="text-sm text-orange-700 mt-1 list-disc list-inside">
                  <li>Used for unclear transactions that cannot be immediately categorized</li>
                  <li>Requires Super Admin approval before allocation to proper account</li>
                  <li>Entries are locked after allocation</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-1 text-yellow-600" />
              <p className="text-2xl font-bold text-yellow-700">{pendingEntries.length}</p>
              <p className="text-xs text-yellow-600">Pending</p>
            </CardContent>
          </Card>
          
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-6 w-6 mx-auto mb-1 text-orange-600" />
              <p className="text-xl font-bold text-orange-700">{formatCurrency(pendingTotal)}</p>
              <p className="text-xs text-orange-600">Pending Amount</p>
            </CardContent>
          </Card>
          
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-600" />
              <p className="text-2xl font-bold text-green-700">{allocatedEntries.length}</p>
              <p className="text-xs text-green-600">Allocated</p>
            </CardContent>
          </Card>
          
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-4 text-center">
              <XCircle className="h-6 w-6 mx-auto mb-1 text-red-600" />
              <p className="text-2xl font-bold text-red-700">{rejectedEntries.length}</p>
              <p className="text-xs text-red-600">Rejected</p>
            </CardContent>
          </Card>
        </div>

        {/* Entries Table */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-orange-600" />
              Suspense Entries
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">TYPE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DESCRIPTION</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">SOURCE</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CREATED BY</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        No suspense entries
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.suspense_id} className="hover:bg-gray-50" data-testid={`suspense-row-${entry.suspense_id}`}>
                        <td className="px-4 py-3">
                          <Badge className={entry.transaction_type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                            {entry.transaction_type === 'income' ? (
                              <><ArrowUpRight className="h-3 w-3 mr-1" /> Income</>
                            ) : (
                              <><ArrowDownRight className="h-3 w-3 mr-1" /> Expense</>
                            )}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{entry.description}</p>
                          {entry.reference_number && (
                            <p className="text-xs text-gray-500">Ref: {entry.reference_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{entry.source || '-'}</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600">{formatCurrency(entry.amount)}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(entry.status)}</td>
                        <td className="px-4 py-3 text-sm">{entry.created_by_name}</td>
                        <td className="px-4 py-3 text-center">
                          {entry.status === 'pending' && canAllocate && (
                            <Button 
                              size="sm"
                              onClick={() => { setSelectedEntry(entry); setAllocateDialog(true); }}
                              data-testid={`allocate-btn-${entry.suspense_id}`}
                            >
                              Allocate
                            </Button>
                          )}
                          {entry.status === 'allocated' && (
                            <span className="text-xs text-green-600">
                              → {entry.allocated_to === 'indirect_cost' ? 'Indirect Cost' : projects.find(p => p.project_id === entry.allocated_to)?.name || entry.allocated_to}
                            </span>
                          )}
                          {entry.status === 'rejected' && (
                            <span className="text-xs text-red-600">{entry.rejection_reason}</span>
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

      {/* Create Suspense Entry Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Suspense Entry</DialogTitle>
            <DialogDescription>
              Create an entry for unclear transactions. Requires Super Admin approval for allocation.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Transaction Type *</Label>
                <Select value={createForm.transaction_type} onValueChange={(v) => setCreateForm({...createForm, transaction_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income (Received)</SelectItem>
                    <SelectItem value="expense">Expense (Paid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>
            
            <div>
              <Label>Description *</Label>
              <Input 
                value={createForm.description}
                onChange={(e) => setCreateForm({...createForm, description: e.target.value})}
                placeholder="Describe the unclear transaction"
                data-testid="input-description"
              />
            </div>
            
            <div>
              <Label>Source (Where did this come from?)</Label>
              <Input 
                value={createForm.source}
                onChange={(e) => setCreateForm({...createForm, source: e.target.value})}
                placeholder="E.g., Unknown bank deposit"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Reference Number</Label>
                <Input 
                  value={createForm.reference_number}
                  onChange={(e) => setCreateForm({...createForm, reference_number: e.target.value})}
                  placeholder="Transaction ref"
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
            <Button onClick={handleCreateEntry} className="bg-orange-600 hover:bg-orange-700" data-testid="submit-suspense">
              <Plus className="h-4 w-4 mr-1" /> Create Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocate Dialog */}
      <Dialog open={allocateDialog} onOpenChange={setAllocateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate Suspense Entry</DialogTitle>
            <DialogDescription>
              Approve and allocate to proper account, or reject if invalid.
            </DialogDescription>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              <Card className="bg-orange-50 border-orange-200">
                <CardContent className="p-4">
                  <Badge className={selectedEntry.transaction_type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {selectedEntry.transaction_type}
                  </Badge>
                  <p className="font-medium mt-2">{selectedEntry.description}</p>
                  <p className="text-2xl font-bold text-orange-700 mt-2">{formatCurrency(selectedEntry.amount)}</p>
                </CardContent>
              </Card>
              
              <div className="flex gap-2">
                <Button 
                  variant={allocateForm.approved ? 'default' : 'outline'}
                  onClick={() => setAllocateForm({...allocateForm, approved: true})}
                  className={allocateForm.approved ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  Approve & Allocate
                </Button>
                <Button 
                  variant={!allocateForm.approved ? 'destructive' : 'outline'}
                  onClick={() => setAllocateForm({...allocateForm, approved: false})}
                >
                  Reject
                </Button>
              </div>
              
              {allocateForm.approved ? (
                <>
                  <div>
                    <Label>Allocate To *</Label>
                    <Select value={allocateForm.allocated_to} onValueChange={(v) => setAllocateForm({...allocateForm, allocated_to: v})}>
                      <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indirect_cost">Indirect Cost (Overhead)</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.project_id} value={p.project_id}>Project: {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Allocation Category</Label>
                    <Input 
                      value={allocateForm.allocation_category}
                      onChange={(e) => setAllocateForm({...allocateForm, allocation_category: e.target.value})}
                      placeholder="E.g., Material, Labour, Misc"
                    />
                  </div>
                  
                  <div>
                    <Label>Reason for Allocation</Label>
                    <Textarea 
                      value={allocateForm.allocation_reason}
                      onChange={(e) => setAllocateForm({...allocateForm, allocation_reason: e.target.value})}
                      placeholder="Explain why this is allocated here..."
                      rows={2}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <Label>Rejection Reason *</Label>
                  <Textarea 
                    value={allocateForm.rejection_reason}
                    onChange={(e) => setAllocateForm({...allocateForm, rejection_reason: e.target.value})}
                    placeholder="Why is this being rejected?"
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocateDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleAllocate} 
              className={allocateForm.approved ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              data-testid="confirm-allocation"
            >
              <Lock className="h-4 w-4 mr-1" /> {allocateForm.approved ? 'Allocate & Lock' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
