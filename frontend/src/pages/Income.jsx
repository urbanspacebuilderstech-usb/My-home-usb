import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  LogOut,
  Plus,
  Trash2,
  Filter,
  Calendar,
  IndianRupee,
  Banknote,
  CreditCard,
  Wallet,
  PiggyBank,
  ArrowUpCircle,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Income({ embedded = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [addIncomeDialog, setAddIncomeDialog] = useState(false);
  
  // Filters
  const [filterProject, setFilterProject] = useState('all');
  const [filterMode, setFilterMode] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  // Form data
  const [incomeForm, setIncomeForm] = useState({
    project_id: '',
    amount: '',
    payment_mode: 'cash',
    payment_date: new Date().toISOString().split('T')[0],
    cheque_number: '',
    bank_name: '',
    reference_number: '',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchFilteredIncome();
  }, [filterProject, filterMode, filterStartDate, filterEndDate]);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, summaryRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/income/summary`),
        axios.get(`${API}/projects`)
      ]);
      
      setUser(userRes.data);
      setSummary(summaryRes.data);
      setProjects(projectsRes.data);
      
      await fetchFilteredIncome();
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load income data');
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  const fetchFilteredIncome = async () => {
    try {
      let url = `${API}/income?`;
      const params = [];
      
      if (filterProject && filterProject !== 'all') {
        params.push(`project_id=${filterProject}`);
      }
      if (filterMode && filterMode !== 'all') {
        params.push(`payment_mode=${filterMode}`);
      }
      if (filterStartDate) {
        params.push(`start_date=${filterStartDate}`);
      }
      if (filterEndDate) {
        params.push(`end_date=${filterEndDate}`);
      }
      
      url += params.join('&');
      
      const response = await axios.get(url);
      setIncomeEntries(response.data);
    } catch (error) {
      console.error('Failed to fetch income entries');
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

  const handleAddIncome = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/income`, {
        project_id: incomeForm.project_id,
        amount: parseFloat(incomeForm.amount) || 0,
        payment_mode: incomeForm.payment_mode,
        payment_date: incomeForm.payment_date,
        cheque_number: incomeForm.cheque_number || null,
        bank_name: incomeForm.bank_name || null,
        reference_number: incomeForm.reference_number || null,
        remarks: incomeForm.remarks || null
      });
      toast.success('Income recorded successfully');
      setAddIncomeDialog(false);
      setIncomeForm({
        project_id: '',
        amount: '',
        payment_mode: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        cheque_number: '',
        bank_name: '',
        reference_number: '',
        remarks: ''
      });
      fetchData(false);
    } catch (error) {
      toast.error('Failed to record income');
    }
  };

  const handleDeleteIncome = async (incomeId) => {
    if (!confirm('Delete this income entry?')) return;
    try {
      await axios.delete(`${API}/income/${incomeId}`);
      toast.success('Income entry deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete income entry');
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    }
    return `₹${amount?.toLocaleString() || 0}`;
  };

  const getPaymentModeLabel = (mode) => {
    const labels = {
      'cash': 'Cash',
      'cheque': 'Cheque',
      'bank_transfer': 'Bank Transfer',
      'escrow': 'Escrow',
      'petty_cash': 'Petty Cash'
    };
    return labels[mode] || mode;
  };

  const getPaymentModeIcon = (mode) => {
    switch (mode) {
      case 'cash': return <Banknote className="h-4 w-4 text-green-600" />;
      case 'cheque': return <CreditCard className="h-4 w-4 text-amber-600" />;
      case 'bank_transfer': return <ArrowUpCircle className="h-4 w-4 text-purple-600" />;
      case 'escrow': return <Wallet className="h-4 w-4 text-orange-600" />;
      case 'petty_cash': return <PiggyBank className="h-4 w-4 text-cyan-600" />;
      default: return <IndianRupee className="h-4 w-4" />;
    }
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'accountant' || user?.role === 'project_manager';

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading income data...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Please login to continue</div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50'}>
      {/* Navigation */}
      {!embedded && <AppHeader user={user} />}

      <div className={embedded ? '' : 'max-w-7xl mx-auto px-6 py-8'}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 data-testid="income-module-title" className="text-3xl font-bold text-gray-900">
              Income Module
            </h2>
            <p className="text-gray-600">Track all payment receipts across projects</p>
          </div>
          {canManage && (
            <Dialog open={addIncomeDialog} onOpenChange={setAddIncomeDialog}>
              <DialogTrigger asChild>
                <Button data-testid="add-income-btn" className="gap-2 bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4" />
                  Add Income
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Record Income</DialogTitle>
                  <DialogDescription>Add a new payment receipt</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddIncome} className="space-y-4">
                  <div>
                    <Label>Project</Label>
                    <Select
                      value={incomeForm.project_id}
                      onValueChange={(value) => setIncomeForm({...incomeForm, project_id: value})}
                    >
                      <SelectTrigger data-testid="income-project-select">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map(p => (
                          <SelectItem key={p.project_id} value={p.project_id}>
                            {p.name} - {p.client_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Amount (₹)</Label>
                      <NumericInput
                        data-testid="income-amount-input"
                        
                        value={incomeForm.amount}
                        onChange={(e) => setIncomeForm({...incomeForm, amount: e.target.value})}
                        placeholder="e.g., 500000"
                        required
                      />
                    </div>
                    <div>
                      <Label>Payment Date</Label>
                      <Input
                        data-testid="income-date-input"
                        type="date"
                        value={incomeForm.payment_date}
                        onChange={(e) => setIncomeForm({...incomeForm, payment_date: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Mode of Payment</Label>
                    <Select
                      value={incomeForm.payment_mode}
                      onValueChange={(value) => setIncomeForm({...incomeForm, payment_mode: value})}
                    >
                      <SelectTrigger data-testid="income-mode-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="savings_account">Savings A/c</SelectItem>
                        <SelectItem value="escrow">Escrow</SelectItem>
                        <SelectItem value="petty_cash">Petty Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {incomeForm.payment_mode === 'cheque' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Cheque Number</Label>
                        <Input
                          data-testid="income-cheque-input"
                          value={incomeForm.cheque_number}
                          onChange={(e) => setIncomeForm({...incomeForm, cheque_number: e.target.value})}
                          placeholder="e.g., 123456"
                        />
                      </div>
                      <div>
                        <Label>Bank Name</Label>
                        <Input
                          data-testid="income-bank-input"
                          value={incomeForm.bank_name}
                          onChange={(e) => setIncomeForm({...incomeForm, bank_name: e.target.value})}
                          placeholder="e.g., HDFC Bank"
                        />
                      </div>
                    </div>
                  )}
                  
                  {(incomeForm.payment_mode === 'bank_transfer' || incomeForm.payment_mode === 'escrow') && (
                    <div>
                      <Label>Reference / Transaction ID</Label>
                      <Input
                        data-testid="income-ref-input"
                        value={incomeForm.reference_number}
                        onChange={(e) => setIncomeForm({...incomeForm, reference_number: e.target.value})}
                        placeholder="e.g., TXN123456789"
                      />
                    </div>
                  )}
                  
                  <div>
                    <Label>Remarks (Optional)</Label>
                    <Input
                      data-testid="income-remarks-input"
                      value={incomeForm.remarks}
                      onChange={(e) => setIncomeForm({...incomeForm, remarks: e.target.value})}
                      placeholder="e.g., Advance payment for foundation"
                    />
                  </div>
                  
                  <Button data-testid="submit-income-btn" type="submit" className="w-full bg-green-600 hover:bg-green-700">
                    Record Income
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <IndianRupee className="h-3 w-3" />Total Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-green-700">{formatCurrency(summary?.total_income)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Banknote className="h-3 w-3" />Cash
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-emerald-700">{formatCurrency(summary?.cash)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <CreditCard className="h-3 w-3" />Cheque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-amber-700">{formatCurrency(summary?.cheque)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <ArrowUpCircle className="h-3 w-3" />Bank Transfer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-purple-700">{formatCurrency(summary?.bank_transfer)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Wallet className="h-3 w-3" />Escrow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-orange-700">{formatCurrency(summary?.escrow)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <PiggyBank className="h-3 w-3" />Petty Cash
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-cyan-700">{formatCurrency(summary?.petty_cash)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter by
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Project</Label>
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger data-testid="filter-project-select">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs">Payment Mode</Label>
                <Select value={filterMode} onValueChange={setFilterMode}>
                  <SelectTrigger data-testid="filter-mode-select">
                    <SelectValue placeholder="All Modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="savings_account">Savings A/c</SelectItem>
                    <SelectItem value="escrow">Escrow</SelectItem>
                    <SelectItem value="petty_cash">Petty Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input
                  data-testid="filter-start-date"
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              
              <div>
                <Label className="text-xs">End Date</Label>
                <Input
                  data-testid="filter-end-date"
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Income Table */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-lg">
              Income Entries ({incomeEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Project</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Mode</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Payment Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                    {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {incomeEntries.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                        No income entries found. Click "Add Income" to record payments.
                      </td>
                    </tr>
                  ) : (
                    incomeEntries.map((entry, index) => (
                      <tr key={entry.income_id} data-testid={`income-row-${entry.income_id}`} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm">{index + 1}</td>
                        <td className="px-4 py-4">
                          <span 
                            className="font-medium text-amber-600 cursor-pointer hover:underline"
                            onClick={() => window.location.href = `/projects/${entry.project_id}`}
                          >
                            {entry.project_name}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getPaymentModeIcon(entry.payment_mode)}
                            <Badge variant="outline" className="text-xs">
                              {getPaymentModeLabel(entry.payment_mode)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-green-600">
                          ₹{entry.amount?.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-center text-sm">
                          {entry.payment_date ? new Date(entry.payment_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {entry.cheque_number && (
                            <span className="text-gray-600">Chq: {entry.cheque_number}</span>
                          )}
                          {entry.reference_number && (
                            <span className="text-gray-600">Ref: {entry.reference_number}</span>
                          )}
                          {!entry.cheque_number && !entry.reference_number && '-'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 max-w-[150px] truncate">
                          {entry.remarks || '-'}
                        </td>
                        {canManage && (
                          <td className="px-4 py-4 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteIncome(entry.income_id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {incomeEntries.length > 0 && (
                  <tfoot className="bg-green-50 border-t-2">
                    <tr>
                      <td colSpan="3" className="px-4 py-3 text-right font-bold">Total:</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">
                        ₹{incomeEntries.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}
                      </td>
                      <td colSpan={canManage ? 4 : 3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      {!embedded && <MobileBottomNav user={user} />}
    </div>
  );
}
