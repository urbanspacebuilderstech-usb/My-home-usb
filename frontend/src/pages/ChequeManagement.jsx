import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
  FileText, LogOut, Plus, CheckCircle, Clock, AlertTriangle, Edit,
  Building2, Calendar, DollarSign, ArrowLeft, RefreshCw, Search,
  XCircle, AlertCircle, Bell, Landmark
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CHEQUE_STATUSES = [
  { value: 'issued', label: 'Issued', color: 'bg-blue-100 text-blue-700' },
  { value: 'deposited', label: 'Deposited', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'cleared', label: 'Cleared', color: 'bg-green-100 text-green-700' },
  { value: 'bounced', label: 'Bounced', color: 'bg-red-100 text-red-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-700' },
  { value: 'post_dated', label: 'Post-Dated', color: 'bg-purple-100 text-purple-700' }
];

export default function ChequeManagement() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cheques, setCheques] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  
  const [addDialog, setAddDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [chequeForm, setChequeForm] = useState({
    cheque_number: '',
    bank_name: '',
    branch_name: '',
    account_number: '',
    ifsc_code: '',
    amount: '',
    cheque_date: '',
    cheque_type: 'incoming',
    party_name: '',
    party_type: 'client',
    project_id: '',
    is_post_dated: false,
    reminder_date: '',
    remarks: ''
  });
  
  const [statusForm, setStatusForm] = useState({
    status: '',
    deposit_date: '',
    clearance_date: '',
    bounce_reason: '',
    bounce_charges: '',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [userRes, chequesRes, remindersRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accountant/cheques`),
        axios.get(`${API}/accountant/cheques/reminders`),
        axios.get(`${API}/projects`)
      ]);
      
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied.');
        window.location.href = '/dashboard';
        return;
      }
      
      setUser(userRes.data);
      setCheques(chequesRes.data);
      setReminders(remindersRes.data);
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

  const openAddDialog = () => {
    setChequeForm({
      cheque_number: '',
      bank_name: '',
      branch_name: '',
      account_number: '',
      ifsc_code: '',
      amount: '',
      cheque_date: '',
      cheque_type: 'incoming',
      party_name: '',
      party_type: 'client',
      project_id: '',
      is_post_dated: false,
      reminder_date: '',
      remarks: ''
    });
    setAddDialog(true);
  };

  const openStatusDialog = (cheque) => {
    setSelectedCheque(cheque);
    setStatusForm({
      status: cheque.status,
      deposit_date: cheque.deposit_date?.split('T')[0] || '',
      clearance_date: cheque.clearance_date?.split('T')[0] || '',
      bounce_reason: cheque.bounce_reason || '',
      bounce_charges: cheque.bounce_charges?.toString() || '',
      remarks: cheque.remarks || ''
    });
    setStatusDialog(true);
  };

  const handleAddCheque = async () => {
    if (!chequeForm.cheque_number || !chequeForm.bank_name || !chequeForm.amount || !chequeForm.party_name) {
      toast.error('Please fill required fields');
      return;
    }

    try {
      const payload = {
        ...chequeForm,
        amount: parseFloat(chequeForm.amount),
        cheque_date: new Date(chequeForm.cheque_date).toISOString(),
        reminder_date: chequeForm.reminder_date ? new Date(chequeForm.reminder_date).toISOString() : null
      };

      await axios.post(`${API}/accountant/cheques`, payload);
      toast.success('Cheque record added');
      setAddDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add cheque');
    }
  };

  const handleUpdateStatus = async () => {
    try {
      const payload = {
        status: statusForm.status,
        deposit_date: statusForm.deposit_date ? new Date(statusForm.deposit_date).toISOString() : null,
        clearance_date: statusForm.clearance_date ? new Date(statusForm.clearance_date).toISOString() : null,
        bounce_reason: statusForm.bounce_reason || null,
        bounce_charges: parseFloat(statusForm.bounce_charges) || 0,
        remarks: statusForm.remarks || null
      };

      await axios.patch(`${API}/accountant/cheques/${selectedCheque.cheque_id}/status`, payload);
      toast.success('Cheque status updated');
      setStatusDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  const getStatusBadge = (status) => {
    const config = CHEQUE_STATUSES.find(s => s.value === status) || { label: status, color: 'bg-gray-100 text-gray-700' };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const filteredCheques = cheques.filter(c => {
    const matchesSearch = !searchTerm || 
      c.cheque_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.bank_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'incoming') return matchesSearch && c.cheque_type === 'incoming';
    if (activeTab === 'outgoing') return matchesSearch && c.cheque_type === 'outgoing';
    if (activeTab === 'pending') return matchesSearch && ['issued', 'deposited', 'post_dated'].includes(c.status);
    if (activeTab === 'bounced') return matchesSearch && c.status === 'bounced';
    return matchesSearch;
  });

  // Calculate statistics
  const stats = {
    total: cheques.length,
    incoming: cheques.filter(c => c.cheque_type === 'incoming').length,
    outgoing: cheques.filter(c => c.cheque_type === 'outgoing').length,
    pending: cheques.filter(c => ['issued', 'deposited', 'post_dated'].includes(c.status)).length,
    bounced: cheques.filter(c => c.status === 'bounced').length,
    cleared: cheques.filter(c => c.status === 'cleared').length,
    pendingAmount: cheques.filter(c => ['issued', 'deposited', 'post_dated'].includes(c.status)).reduce((sum, c) => sum + (c.amount || 0), 0),
    bouncedAmount: cheques.filter(c => c.status === 'bounced').reduce((sum, c) => sum + (c.amount || 0), 0)
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b px-4 py-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = '/accountant-dashboard'}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="bg-gradient-to-br from-blue-500 to-cyan-600 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Cheque Management</h1>
              <p className="text-xs text-gray-500">Track & Manage Cheques</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={openAddDialog} data-testid="add-cheque-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Cheque
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Reminders Alert */}
        {reminders.length > 0 && (
          <Card className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200" data-testid="reminders-alert">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800">Post-Dated Cheque Reminders</p>
                  <p className="text-sm text-amber-700">{reminders.length} cheque(s) due within the next 7 days</p>
                  <div className="mt-2 space-y-1">
                    {reminders.slice(0, 3).map(r => (
                      <div key={r.cheque_id} className="text-sm bg-white/50 rounded px-2 py-1">
                        <span className="font-medium">{r.cheque_number}</span> - {r.party_name} - {formatCurrency(r.amount)}
                        <span className="text-amber-600 ml-2">Due: {new Date(r.cheque_date).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => setActiveTab('all')}>
            <CardContent className="p-4 text-center">
              <FileText className="h-6 w-6 mx-auto mb-2 text-gray-600" />
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Cheques</p>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md bg-green-50" onClick={() => setActiveTab('incoming')}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{stats.incoming}</p>
              <p className="text-xs text-green-600">Incoming</p>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md bg-blue-50" onClick={() => setActiveTab('outgoing')}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{stats.outgoing}</p>
              <p className="text-xs text-blue-600">Outgoing</p>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md bg-amber-50" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-amber-600" />
              <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
              <p className="text-xs text-amber-600">Pending</p>
              <p className="text-xs font-semibold text-amber-700">{formatCurrency(stats.pendingAmount)}</p>
            </CardContent>
          </Card>
          
          <Card className="cursor-pointer hover:shadow-md bg-red-50" onClick={() => setActiveTab('bounced')}>
            <CardContent className="p-4 text-center">
              <XCircle className="h-5 w-5 mx-auto mb-1 text-red-600" />
              <p className="text-2xl font-bold text-red-700">{stats.bounced}</p>
              <p className="text-xs text-red-600">Bounced</p>
              <p className="text-xs font-semibold text-red-700">{formatCurrency(stats.bouncedAmount)}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-emerald-50">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
              <p className="text-2xl font-bold text-emerald-700">{stats.cleared}</p>
              <p className="text-xs text-emerald-600">Cleared</p>
            </CardContent>
          </Card>
        </div>

        {/* Cheques Table */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="incoming">Incoming</TabsTrigger>
                  <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="bounced">Bounced</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input 
                  placeholder="Search cheques..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="search-cheques"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">CHEQUE NO</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">BANK</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PARTY</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">PROJECT</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">TYPE</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">AMOUNT</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">DATE</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">STATUS</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCheques.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                        No cheques found
                      </td>
                    </tr>
                  ) : (
                    filteredCheques.map((cheque) => (
                      <tr key={cheque.cheque_id} className="hover:bg-gray-50" data-testid={`cheque-row-${cheque.cheque_id}`}>
                        <td className="px-4 py-3">
                          <p className="font-mono font-medium">{cheque.cheque_number}</p>
                          {cheque.is_post_dated && (
                            <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs mt-1">Post-Dated</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{cheque.bank_name}</p>
                          {cheque.branch_name && <p className="text-xs text-gray-500">{cheque.branch_name}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{cheque.party_name}</p>
                          <Badge variant="outline" className="text-xs mt-1">
                            {cheque.party_type === 'client' ? 'Client' : 'Vendor'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {cheque.project_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={cheque.cheque_type === 'incoming' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                            {cheque.cheque_type === 'incoming' ? 'IN' : 'OUT'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          <span className={cheque.cheque_type === 'incoming' ? 'text-green-600' : 'text-blue-600'}>
                            {formatCurrency(cheque.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(cheque.cheque_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStatusBadge(cheque.status)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="ghost" onClick={() => openStatusDialog(cheque)} data-testid={`update-status-${cheque.cheque_id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
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

      {/* Add Cheque Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" /> Add New Cheque
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Cheque Details */}
            <div>
              <h3 className="font-semibold mb-3">Cheque Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cheque Number *</Label>
                  <Input 
                    value={chequeForm.cheque_number}
                    onChange={(e) => setChequeForm({...chequeForm, cheque_number: e.target.value})}
                    placeholder="Enter cheque number"
                    data-testid="input-cheque-number"
                  />
                </div>
                <div>
                  <Label>Amount *</Label>
                  <Input 
                    type="number"
                    value={chequeForm.amount}
                    onChange={(e) => setChequeForm({...chequeForm, amount: e.target.value})}
                    placeholder="Enter amount"
                    data-testid="input-amount"
                  />
                </div>
                <div>
                  <Label>Cheque Date *</Label>
                  <Input 
                    type="date"
                    value={chequeForm.cheque_date}
                    onChange={(e) => setChequeForm({...chequeForm, cheque_date: e.target.value})}
                    data-testid="input-cheque-date"
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={chequeForm.cheque_type} onValueChange={(v) => setChequeForm({...chequeForm, cheque_type: v})}>
                    <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incoming">Incoming (Received)</SelectItem>
                      <SelectItem value="outgoing">Outgoing (Issued)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Landmark className="h-4 w-4" /> Bank Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bank Name *</Label>
                  <Input 
                    value={chequeForm.bank_name}
                    onChange={(e) => setChequeForm({...chequeForm, bank_name: e.target.value})}
                    placeholder="e.g., HDFC Bank"
                    data-testid="input-bank-name"
                  />
                </div>
                <div>
                  <Label>Branch Name</Label>
                  <Input 
                    value={chequeForm.branch_name}
                    onChange={(e) => setChequeForm({...chequeForm, branch_name: e.target.value})}
                    placeholder="e.g., Anna Nagar"
                  />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input 
                    value={chequeForm.account_number}
                    onChange={(e) => setChequeForm({...chequeForm, account_number: e.target.value})}
                    placeholder="Account number"
                  />
                </div>
                <div>
                  <Label>IFSC Code</Label>
                  <Input 
                    value={chequeForm.ifsc_code}
                    onChange={(e) => setChequeForm({...chequeForm, ifsc_code: e.target.value})}
                    placeholder="e.g., HDFC0001234"
                  />
                </div>
              </div>
            </div>

            {/* Party & Project */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Party & Project
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Party Name *</Label>
                  <Input 
                    value={chequeForm.party_name}
                    onChange={(e) => setChequeForm({...chequeForm, party_name: e.target.value})}
                    placeholder="Client or Vendor name"
                    data-testid="input-party-name"
                  />
                </div>
                <div>
                  <Label>Party Type</Label>
                  <Select value={chequeForm.party_type} onValueChange={(v) => setChequeForm({...chequeForm, party_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Project (Optional)</Label>
                  <Select value={chequeForm.project_id || 'none'} onValueChange={(v) => setChequeForm({...chequeForm, project_id: v === 'none' ? '' : v})}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Project</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Post-Dated Cheque */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <input 
                  type="checkbox"
                  id="is_post_dated"
                  checked={chequeForm.is_post_dated}
                  onChange={(e) => setChequeForm({...chequeForm, is_post_dated: e.target.checked})}
                  className="h-4 w-4 rounded"
                />
                <Label htmlFor="is_post_dated" className="cursor-pointer">This is a Post-Dated Cheque</Label>
              </div>
              
              {chequeForm.is_post_dated && (
                <div>
                  <Label>Reminder Date</Label>
                  <Input 
                    type="date"
                    value={chequeForm.reminder_date}
                    onChange={(e) => setChequeForm({...chequeForm, reminder_date: e.target.value})}
                  />
                </div>
              )}
            </div>

            {/* Remarks */}
            <div>
              <Label>Remarks</Label>
              <Textarea 
                value={chequeForm.remarks}
                onChange={(e) => setChequeForm({...chequeForm, remarks: e.target.value})}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCheque} className="bg-blue-600 hover:bg-blue-700" data-testid="save-cheque-btn">
              <CheckCircle className="h-4 w-4 mr-1" /> Save Cheque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Cheque Status</DialogTitle>
          </DialogHeader>
          
          {selectedCheque && (
            <div className="space-y-4">
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <p className="font-mono font-semibold">{selectedCheque.cheque_number}</p>
                  <p className="text-sm text-gray-600">{selectedCheque.bank_name}</p>
                  <p className="text-lg font-bold text-green-600 mt-2">{formatCurrency(selectedCheque.amount)}</p>
                </CardContent>
              </Card>
              
              <div>
                <Label>Status</Label>
                <Select value={statusForm.status} onValueChange={(v) => setStatusForm({...statusForm, status: v})}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHEQUE_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {statusForm.status === 'deposited' && (
                <div>
                  <Label>Deposit Date</Label>
                  <Input 
                    type="date"
                    value={statusForm.deposit_date}
                    onChange={(e) => setStatusForm({...statusForm, deposit_date: e.target.value})}
                  />
                </div>
              )}
              
              {statusForm.status === 'cleared' && (
                <div>
                  <Label>Clearance Date</Label>
                  <Input 
                    type="date"
                    value={statusForm.clearance_date}
                    onChange={(e) => setStatusForm({...statusForm, clearance_date: e.target.value})}
                  />
                </div>
              )}
              
              {statusForm.status === 'bounced' && (
                <>
                  <div>
                    <Label>Bounce Reason</Label>
                    <Select value={statusForm.bounce_reason} onValueChange={(v) => setStatusForm({...statusForm, bounce_reason: v})}>
                      <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Insufficient Funds">Insufficient Funds</SelectItem>
                        <SelectItem value="Signature Mismatch">Signature Mismatch</SelectItem>
                        <SelectItem value="Account Closed">Account Closed</SelectItem>
                        <SelectItem value="Date Issue">Date Issue</SelectItem>
                        <SelectItem value="Amount Mismatch">Amount Mismatch</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Bounce Charges</Label>
                    <Input 
                      type="number"
                      value={statusForm.bounce_charges}
                      onChange={(e) => setStatusForm({...statusForm, bounce_charges: e.target.value})}
                      placeholder="Enter bounce charges"
                    />
                  </div>
                </>
              )}
              
              <div>
                <Label>Remarks</Label>
                <Textarea 
                  value={statusForm.remarks}
                  onChange={(e) => setStatusForm({...statusForm, remarks: e.target.value})}
                  placeholder="Any notes..."
                  rows={2}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} className="bg-blue-600 hover:bg-blue-700" data-testid="update-status-btn">
              <CheckCircle className="h-4 w-4 mr-1" /> Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />
    </div>
  );
}
