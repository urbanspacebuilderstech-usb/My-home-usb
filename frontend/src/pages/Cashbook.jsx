import { useState, useEffect } from 'react';
import axios from 'axios';
import { DollarSign, TrendingDown, Wallet, Plus, CreditCard, Banknote, Building2, Smartphone, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AppHeader } from '../components/AppHeader';
import MobileBottomNav from '../components/MobileBottomNav';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (n) => {
  if (!n && n !== 0) return '₹0';
  const num = Number(n);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export default function Cashbook() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('income');
  const [filterProject, setFilterProject] = useState('all');
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [expForm, setExpForm] = useState({
    project_id: '', category: 'other', description: '', amount: '',
    payment_method: 'cash', vendor_name: '', remarks: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, cbRes, notifsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/cashbook`).catch(() => ({ data: null })),
        axios.get(`${API}/notifications`).catch(() => ({ data: [] })),
      ]);
      setUser(userRes.data);
      setData(cbRes.data);
      setUnreadNotifs((notifsRes.data || []).filter(n => !n.read).length);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/cashbook/manual-expense`, {
        ...expForm, amount: Number(expForm.amount)
      });
      toast.success('Expense recorded');
      setAddExpenseOpen(false);
      setExpForm({ project_id: '', category: 'other', description: '', amount: '', payment_method: 'cash', vendor_name: '', remarks: '' });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  if (loading && !user) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return null;

  const summary = data?.summary || {};
  const projects = data?.projects || [];
  const incomes = data?.income || [];
  const expenses = [...(data?.expenses || []), ...(data?.labour_expenses || []).map(l => ({
    ...l, expense_id: l.labour_expense_id, amount: l.total_amount, category: 'labour', description: `Labour - ${l.labour_type || 'General'}`
  })), ...(data?.material_expenses || []).map(m => ({
    ...m, expense_id: m.request_id, amount: m.estimated_price, category: 'material', description: `Material - ${m.material_name || 'General'}`
  }))];

  const modeIcons = { cash: Banknote, cheque: CreditCard, bank_transfer: Building2, upi: Smartphone };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="cashbook-page">
      <AppHeader user={user} unreadNotifs={unreadNotifs} />
      <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6">
        {/* Title + Actions */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="cashbook-title">Cashbook</h2>
          <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 bg-secondary hover:bg-secondary/90" data-testid="add-expense-btn">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">Manual Expense</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Manual Expense</DialogTitle></DialogHeader>
              <form onSubmit={handleAddExpense} className="space-y-3">
                <div><Label>Project</Label>
                  <Select value={expForm.project_id} onValueChange={(v) => setExpForm({...expForm, project_id: v})}>
                    <SelectTrigger data-testid="exp-project-select"><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>{projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Category</Label>
                  <Select value={expForm.category} onValueChange={(v) => setExpForm({...expForm, category: v})}>
                    <SelectTrigger data-testid="exp-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="labour">Labour</SelectItem>
                      <SelectItem value="vendor">Vendor/Supplier</SelectItem>
                      <SelectItem value="petty_cash">Petty Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Input data-testid="exp-desc-input" value={expForm.description} onChange={(e) => setExpForm({...expForm, description: e.target.value})} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (₹)</Label><NumericInput data-testid="exp-amount-input" value={expForm.amount} onChange={(e) => setExpForm({...expForm, amount: e.target.value})} required /></div>
                  <div><Label>Payment Method</Label>
                    <Select value={expForm.payment_method} onValueChange={(v) => setExpForm({...expForm, payment_method: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="savings_account">Savings A/c</SelectItem>
                        <SelectItem value="escrow">Escrow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Vendor Name (optional)</Label><Input value={expForm.vendor_name} onChange={(e) => setExpForm({...expForm, vendor_name: e.target.value})} /></div>
                <Button type="submit" className="w-full" data-testid="submit-expense-btn" disabled={!expForm.project_id || !expForm.amount}>Record Expense</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Card data-testid="cb-total-income" className="border-l-4 border-l-green-500">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-500" /><span className="text-xs font-semibold text-gray-500">Total Income</span></div>
              <p className="text-lg font-extrabold text-green-700">{fmt(summary.total_income)}</p>
            </CardContent>
          </Card>
          <Card data-testid="cb-total-expense" className="border-l-4 border-l-red-500">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-4 w-4 text-red-500" /><span className="text-xs font-semibold text-gray-500">Total Expense</span></div>
              <p className="text-lg font-extrabold text-red-700">{fmt(summary.total_expense)}</p>
            </CardContent>
          </Card>
          <Card data-testid="cb-balance" className="border-l-4 border-l-amber-500">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-amber-500" /><span className="text-xs font-semibold text-gray-500">Balance</span></div>
              <p className={`text-lg font-extrabold ${summary.balance >= 0 ? 'text-amber-700' : 'text-red-700'}`}>{fmt(summary.balance)}</p>
            </CardContent>
          </Card>
          <Card data-testid="cb-modes">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Income by Mode</p>
              <div className="space-y-1">
                {Object.entries(summary.income_by_mode || {}).map(([mode, amt]) => {
                  const Icon = modeIcons[mode] || Banknote;
                  return (
                    <div key={mode} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-500 capitalize"><Icon className="h-3 w-3" />{mode.replace('_', ' ')}</span>
                      <span className="font-bold text-gray-700">{fmt(amt)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-3">
            <TabsList data-testid="cashbook-tabs">
              <TabsTrigger value="income">Income ({incomes.length})</TabsTrigger>
              <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
            </TabsList>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-48" data-testid="project-filter"><SelectValue placeholder="All Projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="income">
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Project</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Mode</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Remarks</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incomes.filter(i => filterProject === 'all' || i.project_id === filterProject).length === 0 ? (
                      <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400 text-sm">No income records</td></tr>
                    ) : incomes.filter(i => filterProject === 'all' || i.project_id === filterProject).map((inc) => (
                      <tr key={inc.income_id} className="hover:bg-gray-50/50" data-testid={`income-row-${inc.income_id}`}>
                        <td className="px-4 py-3 text-sm text-gray-500">{inc.payment_date || inc.created_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{inc.project_name}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{inc.payment_mode?.replace('_', ' ')}</Badge></td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-green-600">{fmt(inc.amount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-400 truncate max-w-[200px]">{inc.remarks || '-'}</td>
                        <td className="px-4 py-3 text-center"><Badge className="bg-green-100 text-green-800 text-[10px]">{inc.status || 'verified'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="expenses">
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Project</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {expenses.filter(e => filterProject === 'all' || e.project_id === filterProject).length === 0 ? (
                      <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400 text-sm">No expense records</td></tr>
                    ) : expenses.filter(e => filterProject === 'all' || e.project_id === filterProject).map((exp) => (
                      <tr key={exp.expense_id} className="hover:bg-gray-50/50" data-testid={`expense-row-${exp.expense_id}`}>
                        <td className="px-4 py-3 text-sm text-gray-500">{exp.created_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{exp.project_name}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{exp.category}</Badge></td>
                        <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[200px]">{exp.description}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{fmt(exp.amount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{exp.vendor_name || '-'}</td>
                        <td className="px-4 py-3 text-center"><Badge variant="outline" className="text-[10px] capitalize">{exp.payment_method?.replace('_', ' ') || 'cash'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
      <MobileBottomNav user={user} />
    </div>
  );
}
