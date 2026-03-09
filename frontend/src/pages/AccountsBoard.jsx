import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import {
  Wallet, DollarSign, CreditCard, Building2, Eye, FileText,
  Download, ArrowUpRight, ArrowDownRight, TrendingUp, Banknote,
  Landmark, PiggyBank, CircleDollarSign, RefreshCw, Filter, Printer,
  ChevronDown, ChevronUp, X, Plus
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODE_LABELS = {
  cash: 'Cash',
  current_account: 'Current A/c',
  savings_account: 'Savings A/c',
  cheque: 'Cheque',
  petty_cash: 'Petty Cash',
  miscellaneous: 'Miscellaneous',
  direct_transfer: 'Cash DT',
  suspense_account: 'Suspense A/c'
};

const MODE_ICONS = {
  cash: Banknote, current_account: Landmark, savings_account: PiggyBank,
  cheque: FileText, petty_cash: Wallet, miscellaneous: CircleDollarSign,
  direct_transfer: ArrowUpRight, suspense_account: RefreshCw
};

const MODE_COLORS = {
  cash: 'bg-green-50 text-green-700 border-green-200',
  current_account: 'bg-blue-50 text-blue-700 border-blue-200',
  savings_account: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  cheque: 'bg-purple-50 text-purple-700 border-purple-200',
  petty_cash: 'bg-amber-50 text-amber-700 border-amber-200',
  miscellaneous: 'bg-gray-50 text-gray-700 border-gray-200',
  direct_transfer: 'bg-orange-50 text-orange-700 border-orange-200',
  suspense_account: 'bg-red-50 text-red-700 border-red-200'
};

const fmt = (n) => {
  if (n === undefined || n === null) return '0';
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} K`;
  return n.toLocaleString('en-IN');
};

const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

export default function AccountsBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [mainTab, setMainTab] = useState('income');
  const [expenseSubTab, setExpenseSubTab] = useState('all');
  const [modeDetailDialog, setModeDetailDialog] = useState(false);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedModeEntries, setSelectedModeEntries] = useState([]);
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [projectExpanded, setProjectExpanded] = useState(false);

  // Filters
  const [incomeFilter, setIncomeFilter] = useState({ project: '', mode: '', stage: '' });
  const [expenseFilter, setExpenseFilter] = useState({ project: '', type: '', way: '' });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [userRes, overviewRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accountant/overview`)
      ]);
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);
      setOverview(overviewRes.data);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const openModeDetail = (mode, type) => {
    setSelectedMode({ mode, type, label: MODE_LABELS[mode] || mode });
    const entries = type === 'income'
      ? (overview?.income_entries || []).filter(e => classifyMode(e.payment_mode) === mode)
      : (overview?.expense_entries || []).filter(e => classifyMode(e.payment_method || e.payment_mode) === mode);
    setSelectedModeEntries(entries);
    setModeDetailDialog(true);
  };

  const classifyMode = (mode) => {
    if (!mode) return 'cash';
    const m = mode.toLowerCase().replace(/\s+/g, '_');
    const map = {
      cash: 'cash', bank_transfer: 'current_account', neft: 'current_account',
      rtgs: 'current_account', imps: 'current_account', upi: 'current_account',
      cheque: 'cheque', petty_cash: 'petty_cash', savings: 'savings_account',
      savings_account: 'savings_account', current_account: 'current_account',
      miscellaneous: 'miscellaneous', direct_transfer: 'direct_transfer',
      dt: 'direct_transfer', suspense: 'suspense_account', suspense_account: 'suspense_account'
    };
    return map[m] || 'miscellaneous';
  };

  const handlePrintReceipt = (entry) => {
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Payment Receipt</title>
      <style>body{font-family:Arial;padding:40px;max-width:600px;margin:auto}
      h1{text-align:center;color:#333;border-bottom:2px solid #d97706;padding-bottom:10px}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
      .label{color:#666;font-weight:500}.value{font-weight:600}
      .amount{font-size:24px;text-align:center;color:#059669;margin:20px 0}
      .footer{text-align:center;margin-top:30px;color:#999;font-size:12px}
      @media print{button{display:none}}</style></head><body>
      <h1>My Home USB</h1>
      <p style="text-align:center;color:#666">Payment Receipt</p>
      <div class="amount">${fmtFull(entry.amount)}</div>
      <div class="row"><span class="label">Date</span><span class="value">${new Date(entry.payment_date || entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date(entry.payment_date || entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="row"><span class="label">Project</span><span class="value">${entry.project_name || 'N/A'}</span></div>
      <div class="row"><span class="label">Stage</span><span class="value">${entry.stage || entry.description || 'N/A'}</span></div>
      <div class="row"><span class="label">Mode</span><span class="value">${entry.payment_mode || entry.payment_method || 'Cash'}</span></div>
      <div class="row"><span class="label">Status</span><span class="value">${entry.status || 'Recorded'}</span></div>
      <div class="row"><span class="label">Transaction ID</span><span class="value">${entry.reference_number || entry.transaction_id || 'Cash'}</span></div>
      ${entry.cheque_number ? `<div class="row"><span class="label">Cheque No</span><span class="value">${entry.cheque_number}</span></div>` : ''}
      ${entry.remarks ? `<div class="row"><span class="label">Remarks</span><span class="value">${entry.remarks}</span></div>` : ''}
      <div class="footer">Generated on ${new Date().toLocaleString('en-IN')}<br>My Home USB - Urban Space Builders</div>
      <div style="text-align:center;margin-top:20px">
        <button onclick="window.print()" style="padding:8px 24px;background:#d97706;color:#fff;border:none;border-radius:6px;cursor:pointer">Print / Download PDF</button>
      </div>
      </body></html>
    `);
    w.document.close();
  };

  // Filtered data
  const filteredIncome = (overview?.income_entries || []).filter(e => {
    if (incomeFilter.project && e.project_id !== incomeFilter.project) return false;
    if (incomeFilter.mode && classifyMode(e.payment_mode) !== incomeFilter.mode) return false;
    if (incomeFilter.stage && !(e.stage || '').toLowerCase().includes(incomeFilter.stage.toLowerCase())) return false;
    return true;
  });

  const filteredExpenses = (overview?.expense_entries || []).filter(e => {
    if (expenseSubTab !== 'all' && e.expense_type !== expenseSubTab) return false;
    if (expenseFilter.project && e.project_id !== expenseFilter.project) return false;
    if (expenseFilter.type && e.expense_type !== expenseFilter.type) return false;
    if (expenseFilter.way === 'manual' && e.auto_synced !== false) return false;
    if (expenseFilter.way === 'approval' && !e.approved_by) return false;
    return true;
  });

  const projects = overview?.project_wise || [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex items-center justify-center h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </div>
    );
  }

  const inc = overview?.income_by_mode || {};
  const exp = overview?.expense_by_mode || {};
  const totals = overview?.totals || {};

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-4" data-testid="accounts-board">
      <AppHeader />
      <main className="max-w-[1400px] mx-auto px-3 md:px-6 pt-2 pb-4">

        {/* Overview Financial Summary Row */}
        <Card className="mb-4 border-l-4 border-l-amber-500">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-amber-600" /> Financial Overview
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-green-600 font-semibold">Income: {fmtFull(totals.total_income)}</span>
                <span className="text-red-600 font-semibold">Expense: {fmtFull(totals.total_expense)}</span>
                <Badge className={totals.net_balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                  Net: {fmtFull(totals.net_balance)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-9 gap-2">
              {Object.keys(MODE_LABELS).map(mode => {
                const Icon = MODE_ICONS[mode];
                return (
                  <div key={mode} className={`rounded-lg border p-2 text-center ${MODE_COLORS[mode]}`}>
                    <Icon className="h-3.5 w-3.5 mx-auto mb-1 opacity-70" />
                    <p className="text-[10px] font-medium truncate">{MODE_LABELS[mode]}</p>
                    <p className="text-xs font-bold text-green-700">+{fmt(inc[mode] || 0)}</p>
                    <p className="text-xs font-bold text-red-600">-{fmt(exp[mode] || 0)}</p>
                  </div>
                );
              })}
              <div className="rounded-lg border p-2 text-center bg-gray-900 text-white">
                <DollarSign className="h-3.5 w-3.5 mx-auto mb-1" />
                <p className="text-[10px] font-medium">Total</p>
                <p className="text-xs font-bold text-green-400">+{fmt(inc.total || 0)}</p>
                <p className="text-xs font-bold text-red-400">-{fmt(exp.total || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project-wise Collapsible */}
        <Card className="mb-4">
          <CardHeader className="pb-0 pt-3 px-4 cursor-pointer" onClick={() => setProjectExpanded(!projectExpanded)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-600" /> Project-wise View
                <Badge variant="outline" className="text-xs">{projects.length} projects</Badge>
              </CardTitle>
              {projectExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {projectExpanded && (
            <CardContent className="px-4 pb-3 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-2 py-1.5 font-medium text-gray-500">Project</th>
                      <th className="text-right px-2 py-1.5 font-medium text-green-600">Income</th>
                      <th className="text-right px-2 py-1.5 font-medium text-red-600">Expense</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-700">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="px-2 py-1.5 font-medium">{p.project_name}</td>
                        <td className="px-2 py-1.5 text-right text-green-700">{fmtFull(p.income)}</td>
                        <td className="px-2 py-1.5 text-right text-red-600">{fmtFull(p.expense)}</td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${p.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {fmtFull(p.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Main Tabs: Income | Expense */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="w-full grid grid-cols-2 mb-3">
            <TabsTrigger value="income" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800 gap-1.5" data-testid="income-tab">
              <ArrowDownRight className="h-4 w-4" /> Income
            </TabsTrigger>
            <TabsTrigger value="expense" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800 gap-1.5" data-testid="expense-tab">
              <ArrowUpRight className="h-4 w-4" /> Expense
            </TabsTrigger>
          </TabsList>

          {/* ========= INCOME TAB ========= */}
          <TabsContent value="income">
            {/* Income Mode Breakdown */}
            <div className="grid grid-cols-4 md:grid-cols-9 gap-2 mb-4">
              {Object.keys(MODE_LABELS).map(mode => (
                <Card key={mode} className={`cursor-pointer hover:shadow-md transition-shadow border ${MODE_COLORS[mode]}`}
                  onClick={() => openModeDetail(mode, 'income')} data-testid={`income-mode-${mode}`}>
                  <CardContent className="p-2.5 text-center">
                    {React.createElement(MODE_ICONS[mode], { className: "h-4 w-4 mx-auto mb-1 opacity-60" })}
                    <p className="text-[10px] font-medium truncate">{MODE_LABELS[mode]}</p>
                    <p className="text-sm font-bold">{fmtFull(inc[mode] || 0)}</p>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-gray-900 bg-gray-900 text-white">
                <CardContent className="p-2.5 text-center">
                  <DollarSign className="h-4 w-4 mx-auto mb-1" />
                  <p className="text-[10px]">Total</p>
                  <p className="text-sm font-bold">{fmtFull(inc.total || 0)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Income Filters */}
            <Card className="mb-3">
              <CardContent className="p-3 flex flex-wrap gap-2 items-center">
                <Filter className="h-4 w-4 text-gray-400" />
                <Select value={incomeFilter.project} onValueChange={v => setIncomeFilter(p => ({...p, project: v}))}>
                  <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All Projects</SelectItem>
                    {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.project_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={incomeFilter.mode} onValueChange={v => setIncomeFilter(p => ({...p, mode: v}))}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Modes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All Modes</SelectItem>
                    {Object.entries(MODE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Stage (Advance, Stage 01...)" className="w-48 h-8 text-xs"
                  value={incomeFilter.stage} onChange={e => setIncomeFilter(p => ({...p, stage: e.target.value}))} />
                {(incomeFilter.project || incomeFilter.mode || incomeFilter.stage) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIncomeFilter({ project: '', mode: '', stage: '' })}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Income Payment Summary List */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm">Payment Summary ({filteredIncome.length})</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="income-table">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Date & Time</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Stage</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Txn ID / Cash</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncome.map((entry, i) => (
                        <tr key={entry.income_id || i} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            {new Date(entry.payment_date || entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {' '}
                            <span className="text-gray-400">{new Date(entry.payment_date || entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="px-3 py-2 font-medium">{entry.project_name || 'N/A'}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px]">{entry.stage || entry.description || 'Payment'}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(entry.payment_mode)]}`}>
                              {MODE_LABELS[classifyMode(entry.payment_mode)] || entry.payment_mode}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={entry.status === 'verified' ? 'bg-green-100 text-green-700' : entry.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}>
                              {entry.payment_type === 'partial' ? 'Partly Paid' : entry.status === 'verified' ? 'Fully Paid' : entry.status || 'Recorded'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px]">{entry.reference_number || entry.cheque_number || 'Cash'}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">{fmtFull(entry.amount)}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setSelectedEntry(entry); setViewDialog(true); }}>
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-600" onClick={() => handlePrintReceipt(entry)}>
                                <Printer className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredIncome.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-8 text-gray-400">No income entries found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========= EXPENSE TAB ========= */}
          <TabsContent value="expense">
            {/* Expense Mode Breakdown */}
            <div className="grid grid-cols-4 md:grid-cols-9 gap-2 mb-4">
              {Object.keys(MODE_LABELS).map(mode => (
                <Card key={mode} className={`cursor-pointer hover:shadow-md transition-shadow border ${MODE_COLORS[mode]}`}
                  onClick={() => openModeDetail(mode, 'expense')}>
                  <CardContent className="p-2.5 text-center">
                    {React.createElement(MODE_ICONS[mode], { className: "h-4 w-4 mx-auto mb-1 opacity-60" })}
                    <p className="text-[10px] font-medium truncate">{MODE_LABELS[mode]}</p>
                    <p className="text-sm font-bold">{fmtFull(exp[mode] || 0)}</p>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-gray-900 bg-gray-900 text-white">
                <CardContent className="p-2.5 text-center">
                  <DollarSign className="h-4 w-4 mx-auto mb-1" />
                  <p className="text-[10px]">Total</p>
                  <p className="text-sm font-bold">{fmtFull(exp.total || 0)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Expense Sub-tabs */}
            <Tabs value={expenseSubTab} onValueChange={setExpenseSubTab} className="mb-3">
              <TabsList>
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="material" className="text-xs">Materials</TabsTrigger>
                <TabsTrigger value="labour" className="text-xs">Labour</TabsTrigger>
                <TabsTrigger value="petty_cash" className="text-xs">Petty Cash</TabsTrigger>
                <TabsTrigger value="indirect" className="text-xs">Indirect Expense</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Expense Filters */}
            <Card className="mb-3">
              <CardContent className="p-3 flex flex-wrap gap-2 items-center">
                <Filter className="h-4 w-4 text-gray-400" />
                <Select value={expenseFilter.project} onValueChange={v => setExpenseFilter(p => ({...p, project: v}))}>
                  <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All Projects" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All Projects</SelectItem>
                    {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.project_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={expenseFilter.way} onValueChange={v => setExpenseFilter(p => ({...p, way: v}))}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Manual/Approval" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="approval">Approval</SelectItem>
                  </SelectContent>
                </Select>
                {(expenseFilter.project || expenseFilter.type || expenseFilter.way) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setExpenseFilter({ project: '', type: '', way: '' })}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Expense Payment Record */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm">Expense Records ({filteredExpenses.length})</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="expense-table">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Way</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Date & Time</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Txn ID</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Vendor</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExpenses.map((entry, i) => (
                        <tr key={entry.expense_id || entry.request_id || i} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            <Badge className={
                              entry.expense_type === 'material' ? 'bg-blue-100 text-blue-700' :
                              entry.expense_type === 'labour' ? 'bg-purple-100 text-purple-700' :
                              entry.expense_type === 'petty_cash' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-700'
                            }>{entry.expense_type || entry.category || 'Other'}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={`text-[10px] ${entry.approved_by ? 'border-green-300 text-green-700' : 'border-gray-300 text-gray-600'}`}>
                              {entry.approved_by ? 'Approval' : 'Manual'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {' '}
                            <span className="text-gray-400">{new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(entry.payment_method || entry.payment_mode)]}`}>
                              {MODE_LABELS[classifyMode(entry.payment_method || entry.payment_mode)] || 'Cash'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(entry.amount)}</td>
                          <td className="px-3 py-2 font-mono text-[10px]">{entry.transaction_id || entry.reference_number || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{entry.vendor_name || '—'}</td>
                          <td className="px-3 py-2 font-medium">{entry.project_name || 'N/A'}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setSelectedEntry(entry); setViewDialog(true); }}>
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-600" onClick={() => handlePrintReceipt(entry)}>
                                <Printer className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredExpenses.length === 0 && (
                        <tr><td colSpan={10} className="text-center py-8 text-gray-400">No expense entries found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Mode Detail Dialog */}
      <Dialog open={modeDetailDialog} onOpenChange={setModeDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMode && React.createElement(MODE_ICONS[selectedMode.mode] || DollarSign, { className: "h-5 w-5" })}
              {selectedMode?.label} — {selectedMode?.type === 'income' ? 'Income' : 'Expense'} Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Total: {fmtFull(selectedModeEntries.reduce((s, e) => s + (e.amount || 0), 0))} ({selectedModeEntries.length} entries)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-left">Project</th>
                    <th className="px-2 py-1.5 text-left">Description</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedModeEntries.map((e, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-2 py-1.5">{new Date(e.payment_date || e.created_at).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1.5">{e.project_name || 'N/A'}</td>
                      <td className="px-2 py-1.5">{e.stage || e.description || e.remarks || '—'}</td>
                      <td className="px-2 py-1.5 text-right font-bold">{fmtFull(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Entry Dialog */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">{fmtFull(selectedEntry.amount)}</p>
                <Badge className={selectedEntry.income_id ? 'bg-green-100 text-green-700 mt-1' : 'bg-red-100 text-red-700 mt-1'}>
                  {selectedEntry.income_id ? 'Income' : 'Expense'}
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ['Project', selectedEntry.project_name],
                  ['Stage/Description', selectedEntry.stage || selectedEntry.description],
                  ['Date', new Date(selectedEntry.payment_date || selectedEntry.created_at).toLocaleString('en-IN')],
                  ['Mode', selectedEntry.payment_mode || selectedEntry.payment_method || 'Cash'],
                  ['Status', selectedEntry.status],
                  ['Transaction ID', selectedEntry.reference_number || selectedEntry.transaction_id || 'Cash'],
                  ['Vendor', selectedEntry.vendor_name],
                  ['Remarks', selectedEntry.remarks],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-1">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => handlePrintReceipt(selectedEntry)}>
                <Printer className="h-4 w-4 mr-2" /> Print Receipt / Download PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MobileBottomNav />
    </div>
  );
}
