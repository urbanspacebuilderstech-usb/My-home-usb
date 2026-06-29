import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { DayPicker } from 'react-day-picker';
import { CashbookDateFilter, filterByDateRange } from '../components/CashbookDateFilter';
import ChequeListView from '../components/ChequeListView';
import PayApprovalDialog from '../components/PayApprovalDialog';
import DTSelectToPayDialog from '../components/DTSelectToPayDialog';
import { StatusPill, pillState } from '../components/StatusPill';
import { CorrectionDialog } from '../components/CorrectionDialog';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { ExpenseSplitSection, MultiProjectIndirectCostDialog } from '../components/ExpenseSplitSection';
import {
  Wallet,
  IndianRupee,
  Building2,
  Eye,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Banknote,
  Landmark,
  PiggyBank,
  RefreshCw,
  Filter,
  Printer,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Calendar,
  Search,
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  Edit,
  XCircle,
  Bell,
  AlertCircle,
  BookOpen,
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  ThumbsUp,
  ThumbsDown,
  EyeOff,
  Lock,
  PieChart,
  Truck,
  Check,
  Trash2
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { NumericInput } from '../components/NumericInput';
import AccountantLabourPayments from '../components/AccountantLabourPayments';
import AccountantMaterialPayments from '../components/AccountantMaterialPayments';
import AccountantCreditSettlements from '../components/AccountantCreditSettlements';
import IssueCashDialog from '../components/IssueCashDialog';
// Feb 20 2026 — `LabourAdvanceQueue` card removed from the Accountant
// approvals Labour tab; import dropped.

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODE_LABELS = {
  cash: 'Cash', current_account: 'HDFC CURRENT', savings_account: 'HDFC SAVINGS',
  cheque: 'Cheque', petty_cash: 'Petty Cash', miscellaneous: 'Miscellaneous',
  direct_transfer: 'CASH D/T', suspense_account: 'Suspense A/c'
};
const MODE_ICONS = {
  cash: Banknote, current_account: Landmark, savings_account: PiggyBank,
  cheque: FileText, petty_cash: Wallet, miscellaneous: IndianRupee,
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

const CHEQUE_STATUSES = [
  { value: 'issued', label: 'Issued', color: 'bg-amber-50 text-amber-700' },
  { value: 'deposited', label: 'Deposited', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'cleared', label: 'Cleared', color: 'bg-green-100 text-green-700' },
  { value: 'bounced', label: 'Bounced', color: 'bg-red-100 text-red-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-700' },
  { value: 'post_dated', label: 'Post-Dated', color: 'bg-purple-100 text-purple-700' }
];

const fmt = (n) => {
  if (n === undefined || n === null) return '0';
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} K`;
  return n.toLocaleString('en-IN');
};
const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';

// Context for user role - controls masking behavior
const MaskContext = React.createContext('accountant');
// Global unmask context
const UnmaskContext = React.createContext(false);

// Searchable project selector — replaces plain Select with a wider, search-enabled Popover
function ProjectSearchSelect({ projects = [], value = '', onChange, placeholder = 'All Projects', testId = 'project-search-select', width = 'w-64' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = projects.find(p => p.project_id === value);
  const selectedLabel = selected ? (selected.name || selected.project_name) : placeholder;
  const filtered = query.trim()
    ? projects.filter(p => (p.name || p.project_name || '').toLowerCase().includes(query.trim().toLowerCase()))
    : projects;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`${width} h-9 justify-between text-xs font-normal`}
          data-testid={testId}
        >
          <span className="truncate text-left flex-1">{selectedLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${width} p-0`} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              autoFocus
              placeholder="Search project..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid={`${testId}-input`}
            />
          </div>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${!value ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-700'}`}
            data-testid={`${testId}-all`}
          >
            <Check className={`h-3.5 w-3.5 ${!value ? 'opacity-100' : 'opacity-0'}`} />
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">No projects found</p>
          ) : filtered.map(p => (
            <button
              key={p.project_id}
              type="button"
              onClick={() => { onChange(p.project_id); setOpen(false); setQuery(''); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${value === p.project_id ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-700'}`}
              data-testid={`${testId}-item-${p.project_id}`}
            >
              <Check className={`h-3.5 w-3.5 ${value === p.project_id ? 'opacity-100' : 'opacity-0'}`} />
              <span className="truncate">{p.name || p.project_name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Masked value component - Super Admin always sees values, Accountant clicks to reveal for 10s
function MaskedValue({ value, className = '', formatFn = fmtFull, testId = '', style }) {
  const role = React.useContext(MaskContext);
  const globalUnmasked = React.useContext(UnmaskContext);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  // Super Admin always sees values
  const alwaysVisible = role === 'super_admin' || globalUnmasked;

  const handleClick = (e) => {
    if (alwaysVisible) return;
    e.stopPropagation();
    if (visible) {
      setVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setVisible(true);
      timerRef.current = setTimeout(() => setVisible(false), 10000);
    }
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const show = alwaysVisible || visible;

  return (
    <span
      className={`inline-flex items-center gap-1 select-none ${alwaysVisible ? '' : 'cursor-pointer'} ${className}`}
      onClick={handleClick}
      data-testid={testId || undefined}
      style={style}
      title={alwaysVisible ? undefined : (show ? 'Click to hide' : 'Click to reveal')}
    >
      {show ? formatFn(value) : '₹*****'}
      {!alwaysVisible && (show ? <EyeOff className="h-3 w-3 opacity-40" /> : <Eye className="h-3 w-3 opacity-40" />)}
    </span>
  );
}

const classifyMode = (mode) => {
  if (!mode) return 'cash';
  const m = mode.toLowerCase().replace(/\s+/g, '_');
  const map = {
    cash: 'cash', bank_transfer: 'current_account', neft: 'current_account',
    rtgs: 'current_account', imps: 'current_account', upi: 'current_account',
    cheque: 'cheque', petty_cash: 'petty_cash', savings: 'savings_account',
    savings_account: 'savings_account', current_account: 'current_account',
    // IssueCashDialog emits these underscored values:
    hdfc_current: 'current_account', hdfc_savings: 'savings_account',
    hdfc_curr: 'current_account', hdfc_sav: 'savings_account',
    hdfccurrent: 'current_account', hdfcsavings: 'savings_account',
    miscellaneous: 'miscellaneous', direct_transfer: 'direct_transfer',
    dt: 'direct_transfer', cash_dt: 'direct_transfer',
    suspense: 'suspense_account', suspense_account: 'suspense_account'
  };
  return map[m] || 'miscellaneous';
};

// ============ DRILLDOWN VIEW ============
function DrilldownView({ title, entries, type, onBack, onDelete, canDelete = false, hideHeader = false }) {
  return (
    <div className="space-y-3" data-testid="drilldown-view">
      {!hideHeader && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onBack} data-testid="drilldown-back">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <Badge variant="outline" className="text-xs">{entries.length} entries</Badge>
          <span className="ml-auto text-sm font-bold">
            Total: <span className={type === 'income' ? 'text-green-700' : 'text-red-600'}>
              <MaskedValue value={entries.reduce((s, e) => s + (e.amount || 0), 0)} className={type === 'income' ? 'text-green-700' : 'text-red-600'} />
            </span>
          </span>
        </div>
      )}
      {hideHeader && (
        <div className="flex items-center justify-end">
          <span className="text-sm font-bold">
            Total: <span className={type === 'income' ? 'text-green-700' : 'text-red-600'}>
              <MaskedValue value={entries.reduce((s, e) => s + (e.amount || 0), 0)} className={type === 'income' ? 'text-green-700' : 'text-red-600'} />
            </span>
          </span>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="drilldown-table">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                  {type === 'expense' && <th className="text-left px-3 py-2 font-medium text-gray-500">Vendor</th>}
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                  {canDelete && <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.length === 0 ? (
                  <tr><td colSpan={(type === 'expense' ? 7 : 6) + (canDelete ? 1 : 0)} className="px-4 py-8 text-center text-gray-400">No entries found</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">{new Date(e.payment_date || e.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2 font-medium">{e.stage || e.description || e.category || '-'}</td>
                    <td className="px-3 py-2">{e.project_name || '-'}</td>
                    <td className="px-3 py-2">
                      <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(e.payment_mode || e.payment_method)]}`}>
                        {MODE_LABELS[classifyMode(e.payment_mode || e.payment_method)] || 'Cash'}
                      </Badge>
                    </td>
                    {type === 'expense' && <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>}
                    <td className={`px-3 py-2 text-right font-bold ${type === 'income' ? 'text-green-700' : 'text-red-600'}`}>
                      <MaskedValue value={e.amount} className={type === 'income' ? 'text-green-700' : 'text-red-600'} />
                    </td>
                    {canDelete && (
                      <td className="px-3 py-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => onDelete && onDelete(e)}
                          data-testid={`drilldown-delete-${e.income_id || e.expense_id || e.request_id || i}`}
                          title={type === 'income' ? 'Delete income entry' : 'Delete expense'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ MODE DRILLDOWN (Cash / HDFC Current / HDFC Savings / Cheque / Cash DT) ============
// Single back arrow + project search bar shared across Income/Expense tabs.
function ModeDrilldownView({ label, incomeEntries, expenseEntries, onBack, canDelete, onDeleteIncome, onDeleteExpense }) {
  const [searchQuery, setSearchQuery] = useState('');
  const matchesQuery = (e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.project_name && e.project_name.toLowerCase().includes(q)) ||
      (e.project_id && String(e.project_id).toLowerCase().includes(q))
    );
  };
  const filteredIncome = incomeEntries.filter(matchesQuery);
  const filteredExpense = expenseEntries.filter(matchesQuery);
  return (
    <div className="space-y-3" data-testid="mode-drilldown">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onBack} data-testid="mode-drilldown-back">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-xs"
            data-testid="mode-drilldown-search"
          />
        </div>
        <Badge variant="outline" className="text-xs">{label}</Badge>
      </div>
      <Tabs defaultValue="income">
        <TabsList className="grid grid-cols-2 w-full mb-3">
          <TabsTrigger value="income" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800 gap-1">
            <ArrowDownRight className="h-3.5 w-3.5" /> Income ({filteredIncome.length})
          </TabsTrigger>
          <TabsTrigger value="expense" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800 gap-1">
            <ArrowUpRight className="h-3.5 w-3.5" /> Expense ({filteredExpense.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="income">
          <DrilldownView
            title={`${label} Income`}
            entries={filteredIncome}
            type="income"
            onBack={onBack}
            canDelete={canDelete}
            onDelete={onDeleteIncome}
            hideHeader
          />
        </TabsContent>
        <TabsContent value="expense">
          <DrilldownView
            title={`${label} Expenses`}
            entries={filteredExpense}
            type="expense"
            onBack={onBack}
            canDelete={canDelete}
            onDelete={onDeleteExpense}
            hideHeader
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ SUSPENSE DRILLDOWN ============
function SuspenseDrilldown({ onBack }) {
  const [vendors, setVendors] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [vRes, oRes] = await Promise.all([
          axios.get(`${API}/accountant/all-vendor-suspense`).catch(() => ({ data: [] })),
          axios.get(`${API}/suspense/overview`).catch(() => ({ data: null })),
        ]);
        setVendors(vRes.data || []);
        setOverview(oRes.data || null);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  // Source-of-truth totals (matches /accountant/overview.suspense_balance)
  const pettyBalance = (overview?.petty_cash?.balance) ?? 0;
  const materialTotal = (overview?.material_suspense?.total) ?? 0;
  const labourTotal = (overview?.labour_suspense?.total) ?? 0;
  const totalSuspense = pettyBalance + materialTotal + labourTotal;

  return (
    <div className="space-y-3" data-testid="suspense-drilldown">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onBack} data-testid="suspense-back">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h3 className="text-sm font-semibold text-gray-800">Suspense Account</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs ml-auto" onClick={() => navigate('/suspense-account')} data-testid="suspense-open-full">
          Open Full View →
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : (
        <div className="space-y-3">
          {/* Master Total + 3-way breakdown */}
          <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
            <CardContent className="p-3">
              <p className="text-sm font-semibold text-orange-800">Total Suspense Balance</p>
              <p className="text-2xl font-bold text-orange-700">
                <MaskedValue value={totalSuspense} className="text-orange-700" />
              </p>
              <div className="grid grid-cols-3 gap-2 mt-3" data-testid="suspense-breakdown">
                <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                  <p className="text-[10px] uppercase font-semibold text-amber-600">Petty Cash</p>
                  <p className="text-base font-bold text-amber-800"><MaskedValue value={pettyBalance} className="text-amber-800" /></p>
                  <p className="text-[10px] text-amber-600">{(overview?.petty_cash?.active_requests || []).length} active</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                  <p className="text-[10px] uppercase font-semibold text-blue-600">Material</p>
                  <p className="text-base font-bold text-blue-800"><MaskedValue value={materialTotal} className="text-blue-800" /></p>
                  <p className="text-[10px] text-blue-600">{(overview?.material_suspense?.balances || []).length} vendors</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-md p-2">
                  <p className="text-[10px] uppercase font-semibold text-purple-600">Labour</p>
                  <p className="text-base font-bold text-purple-800"><MaskedValue value={labourTotal} className="text-purple-800" /></p>
                  <p className="text-[10px] text-purple-600">{(overview?.labour_suspense?.balances || []).length} contractors</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed vendor list */}
          {vendors.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-gray-400 text-sm">No vendor-level suspense entries yet</CardContent></Card>
          ) : (
            <>
              <p className="text-xs font-semibold text-gray-600 mt-2">By Vendor:</p>
              {vendors.map(v => (
                <Card key={v.vendor_name} data-testid={`suspense-vendor-${v.vendor_name}`}>
                  <CardHeader className="py-2 px-4 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{v.vendor_name}</CardTitle>
                      <Badge className={v.balance > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                        Balance: <MaskedValue value={v.balance} className={v.balance > 0 ? 'text-green-700' : 'text-red-700'} />
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-500">Date</th>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-500">Description</th>
                          <th className="text-right px-3 py-1.5 font-medium text-gray-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {v.entries.map((e, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5">{new Date(e.created_at).toLocaleDateString('en-IN')}</td>
                            <td className="px-3 py-1.5">{e.description}</td>
                            <td className={`px-3 py-1.5 text-right font-bold ${e.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              <MaskedValue value={e.amount} className={e.amount >= 0 ? 'text-green-600' : 'text-red-600'} formatFn={(n) => `${n >= 0 ? '+' : ''}${fmtFull(n)}`} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============ PETTY CASH MANAGEMENT DRILLDOWN ============
function PettyCashManagement({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSE, setSelectedSE] = useState(null);
  const [seCashbook, setSeCashbook] = useState(null);
  const [issueDialog, setIssueDialog] = useState(false);
  const [issuePC, setIssuePC] = useState(null);
  const [issueAmount, setIssueAmount] = useState('');
  const [issueRemarks, setIssueRemarks] = useState('');
  // New: Payment processing dialog
  const [payDialog, setPayDialog] = useState(false);
  const [payPC, setPayPC] = useState(null);
  const [payForm, setPayForm] = useState({ payment_mode: 'cash', bank_name: '', cheque_number: '', reference_number: '', amount_paid: '', remarks: '', payment_date: new Date().toISOString().slice(0, 10) });
  // Pending PM-approved requests
  const [pendingRequests, setPendingRequests] = useState([]);
  // Petrol Allowance
  const [petrolRequests, setPetrolRequests] = useState([]);
  // Correction Engine state — Accountant view
  const [correctionPC, setCorrectionPC] = useState(null);        // post-approval send-for-correction (Accountant raises)
  const [correctionReason, setCorrectionReason] = useState('');
  const [viewCorrectionPC, setViewCorrectionPC] = useState(null); // read-only view of rejected/under-correction row

  useEffect(() => {
    (async () => {
      try {
        const [mgmtRes, pcRes, paRes] = await Promise.allSettled([
          axios.get(`${API}/accountant/petty-cash-management`),
          axios.get(`${API}/accountant/petty-cash`),
          axios.get(`${API}/accountant/petrol-allowance`)
        ]);
        if (mgmtRes.status === 'fulfilled') setData(mgmtRes.value.data);
        if (pcRes.status === 'fulfilled') setPendingRequests(pcRes.value.data || []);
        if (paRes.status === 'fulfilled') setPetrolRequests(paRes.value.data || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const fetchSECashbook = async (userId) => {
    try {
      const res = await axios.get(`${API}/accountant/petty-cash/${userId}/mini-cashbook`);
      setSeCashbook(res.data);
      setSelectedSE(userId);
    } catch { toast.error('Failed to load cashbook'); }
  };

  const handleIssue = async () => {
    if (!issueAmount) { toast.error('Enter amount'); return; }
    try {
      await axios.patch(`${API}/accountant/petty-cash/${issuePC.petty_cash_id}/issue`, {
        amount: parseFloat(issueAmount),
        remarks: issueRemarks,
      });
      toast.success('Petty cash issued');
      setIssueDialog(false);
      const res = await axios.get(`${API}/accountant/petty-cash-management`);
      setData(res.data);
      if (selectedSE) fetchSECashbook(selectedSE);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to issue');
    }
  };

  const handleProcessPayment = async () => {
    if (!payForm.amount_paid) { toast.error('Enter amount'); return; }
    try {
      await axios.patch(`${API}/accountant/petty-cash/${payPC.petty_cash_id}/process-payment`, {
        ...payForm,
        amount_paid: parseFloat(payForm.amount_paid),
      });
      toast.success('Payment processed! SE will be notified.');
      setPayDialog(false);
      const [mgmtRes, pcRes] = await Promise.allSettled([
        axios.get(`${API}/accountant/petty-cash-management`),
        axios.get(`${API}/accountant/petty-cash`)
      ]);
      if (mgmtRes.status === 'fulfilled') setData(mgmtRes.value.data);
      if (pcRes.status === 'fulfilled') setPendingRequests(pcRes.value.data || []);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to process');
    }
  };

  const handleApprovePetrol = async (id) => {
    try {
      await axios.patch(`${API}/accountant/petrol-allowance/${id}/approve`);
      toast.success('Petrol allowance approved');
      const res = await axios.get(`${API}/accountant/petrol-allowance`);
      setPetrolRequests(res.data || []);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRejectPetrol = async (id) => {
    try {
      await axios.patch(`${API}/accountant/petrol-allowance/${id}/reject`, { reason: 'Rejected' });
      toast.success('Petrol allowance rejected');
      const res = await axios.get(`${API}/accountant/petrol-allowance`);
      setPetrolRequests(res.data || []);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  if (loading) return <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>;

  // If viewing a specific SE's cashbook
  if (selectedSE && seCashbook) {
    return (
      <div className="space-y-3" data-testid="se-cashbook-detail">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { setSelectedSE(null); setSeCashbook(null); }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h3 className="text-sm font-semibold">{seCashbook.user?.name}'s Mini Cashbook</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card className="border-l-4 border-l-green-500"><CardContent className="p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-gray-500">Total Issued</p>
            <p className="text-base sm:text-lg font-bold text-green-700"><MaskedValue value={seCashbook.summary?.total_issued} className="text-green-700" /></p>
          </CardContent></Card>
          <Card className="border-l-4 border-l-red-500"><CardContent className="p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-gray-500">Total Spent</p>
            <p className="text-base sm:text-lg font-bold text-red-600"><MaskedValue value={seCashbook.summary?.total_spent} className="text-red-600" /></p>
          </CardContent></Card>
          <Card className="border-l-4 border-l-amber-500"><CardContent className="p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-gray-500">Balance</p>
            <p className={`text-base sm:text-lg font-bold ${(seCashbook.summary?.balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              <MaskedValue value={seCashbook.summary?.balance} className={(seCashbook.summary?.balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'} />
            </p>
          </CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Purpose</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500">Status</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Requested</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Issued</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Spent</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(seCashbook.petty_cash || []).map((pc, i) => (
                  <tr key={pc.petty_cash_id || i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(pc.created_at).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2 font-medium">{pc.purpose || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{pc.project_name || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusPill
                        status={pc.status}
                        data-testid={`acc-pc-status-${pc.petty_cash_id}`}
                        onClick={['accountant_rejected','under_correction'].includes(pc.status) ? () => setViewCorrectionPC(pc) : undefined}
                      />
                    </td>
                    <td className="px-3 py-2 text-right"><MaskedValue value={pc.amount_requested} /></td>
                    <td className="px-3 py-2 text-right text-green-700 font-semibold"><MaskedValue value={pc.amount_issued} className="text-green-700" /></td>
                    <td className="px-3 py-2 text-right text-red-600"><MaskedValue value={pc.amount_spent} className="text-red-600" /></td>
                    <td className="px-3 py-2 text-center">
                      {pc.status === 'requested' && (
                        <Button size="sm" className="h-6 text-[10px] bg-green-600 hover:bg-green-700"
                          onClick={() => { setIssuePC(pc); setIssueAmount(pc.amount_requested?.toString() || ''); setIssueDialog(true); }}>
                          Issue
                        </Button>
                      )}
                      {pillState(pc.status) === 'approved' && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] text-orange-600 border-orange-300 hover:bg-orange-50 ml-1"
                          data-testid={`acc-pc-correct-${pc.petty_cash_id}`}
                          onClick={() => setCorrectionPC(pc)}>
                          Send for Correction
                        </Button>
                      )}
                      {pillState(pc.status) === 'awaiting' && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600 border-red-300 hover:bg-red-50 ml-1"
                          data-testid={`acc-pc-reject-${pc.petty_cash_id}`}
                          onClick={async () => {
                            const reason = window.prompt('Reason for rejecting this petty cash request?');
                            if (!reason || !reason.trim()) return;
                            try {
                              await axios.patch(`${API}/accountant/petty-cash/${pc.petty_cash_id}/reject`, { reason: reason.trim() });
                              toast.success('Petty cash rejected. SE will be notified to correct & resubmit.');
                              fetchSECashbook(pc.requested_by || (seCashbook?.site_engineer?.user_id));
                            } catch (e) {
                              toast.error(e?.response?.data?.detail || 'Reject failed');
                            }
                          }}>
                          Reject
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const siteEngineers = data?.site_engineers || [];
  const summary = data?.summary || {};

  return (
    <div className="space-y-3" data-testid="petty-cash-mgmt">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onBack} data-testid="petty-cash-back">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h3 className="text-sm font-semibold text-gray-800">Petty Cash Management</h3>
        {summary.pending_requests > 0 && (
          <Badge className="bg-amber-100 text-amber-700">{summary.pending_requests} pending</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card className="border-l-4 border-l-green-500"><CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-gray-500">Total Issued</p>
          <p className="text-base sm:text-lg font-bold text-green-700"><MaskedValue value={summary.total_issued} className="text-green-700" /></p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-red-500"><CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-gray-500">Total Spent</p>
          <p className="text-base sm:text-lg font-bold text-red-600"><MaskedValue value={summary.total_spent} className="text-red-600" /></p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-amber-500"><CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-gray-500">Total Balance</p>
          <p className={`text-base sm:text-lg font-bold ${(summary.total_balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            <MaskedValue value={summary.total_balance} className={(summary.total_balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'} />
          </p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-purple-500"><CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-gray-500">Pending Requests</p>
          <p className="text-base sm:text-lg font-bold text-purple-700">{summary.pending_requests || 0}</p>
        </CardContent></Card>
      </div>

      {/* PM-Approved / Resubmitted Requests Needing Payment Processing */}
      {pendingRequests.filter(r => r.status === 'pm_approved' || r.status === 'awaiting_accountant').length > 0 && (
        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm flex items-center gap-2 text-teal-700">PM-Approved &amp; Resubmitted — Awaiting Payment ({pendingRequests.filter(r => r.status === 'pm_approved' || r.status === 'awaiting_accountant').length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="acc-pc-pending-table">
                <thead className="bg-teal-50 border-y"><tr>
                  <th className="px-3 py-2 text-left font-medium text-teal-700">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-teal-700">SE</th>
                  <th className="px-3 py-2 text-left font-medium text-teal-700">Project</th>
                  <th className="px-3 py-2 text-left font-medium text-teal-700">Purpose</th>
                  <th className="px-3 py-2 text-right font-medium text-teal-700">Amount</th>
                  <th className="px-3 py-2 text-center font-medium text-teal-700">PM</th>
                  <th className="px-3 py-2 text-center font-medium text-teal-700">Action</th>
                </tr></thead>
                <tbody className="divide-y">
                  {pendingRequests.filter(r => r.status === 'pm_approved' || r.status === 'awaiting_accountant').map(pc => (
                    <tr key={pc.petty_cash_id} className="hover:bg-teal-50/50">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(pc.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</td>
                      <td className="px-3 py-2 font-medium">{pc.requested_by_name}</td>
                      <td className="px-3 py-2">{pc.project_name}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate">{pc.purpose}</td>
                      <td className="px-3 py-2 text-right font-bold">₹{(pc.amount_requested || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-center"><Badge className="bg-green-100 text-green-700 text-[10px]">{pc.pm_approved_by_name || 'PM'}</Badge></td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center flex-wrap">
                          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 h-6 text-[10px]" data-testid={`acc-pc-pay-${pc.petty_cash_id}`}
                            onClick={() => { setPayPC(pc); setPayForm({ ...payForm, amount_paid: pc.amount_requested?.toString() || '' }); setPayDialog(true); }}>
                            Process Payment
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600 border-red-300 hover:bg-red-50"
                            data-testid={`acc-pc-reject-${pc.petty_cash_id}`}
                            onClick={async () => {
                              const reason = window.prompt('Reason for rejecting this petty cash request? (will be sent to the SE)');
                              if (!reason || !reason.trim()) return;
                              try {
                                await axios.patch(`${API}/accountant/petty-cash/${pc.petty_cash_id}/reject`, { reason: reason.trim() });
                                toast.success('Rejected. SE will see the correction banner.');
                                // Refresh the pending requests list
                                try {
                                  const r = await axios.get(`${API}/accountant/petty-cash-management`);
                                  setPendingRequests(r.data?.pending_requests || []);
                                } catch (_) {}
                              } catch (e) {
                                toast.error(e?.response?.data?.detail || 'Reject failed');
                              }
                            }}>
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Petrol Allowance Requests */}
      {petrolRequests.filter(r => r.status === 'requested').length > 0 && (
        <Card className="border-l-4 border-l-blue-500 mb-4">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700"><Truck className="h-4 w-4" /> Petrol Allowance — Pending ({petrolRequests.filter(r => r.status === 'requested').length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="acc-petrol-table">
                <thead className="bg-blue-50 border-y"><tr>
                  <th className="px-3 py-2 text-left font-medium text-blue-700">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-blue-700">SE</th>
                  <th className="px-3 py-2 text-right font-medium text-blue-700">Amount</th>
                  <th className="px-3 py-2 text-right font-medium text-blue-700">KM</th>
                  <th className="px-3 py-2 text-center font-medium text-blue-700">Action</th>
                </tr></thead>
                <tbody className="divide-y">
                  {petrolRequests.filter(r => r.status === 'requested').map(pa => (
                    <tr key={pa.allowance_id} className="hover:bg-blue-50/50" data-testid={`acc-petrol-row-${pa.allowance_id}`}>
                      <td className="px-3 py-2">{new Date(pa.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</td>
                      <td className="px-3 py-2 font-medium">{pa.requested_by_name}</td>
                      <td className="px-3 py-2 text-right font-bold">₹{(pa.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right">{pa.km} km</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 h-6 text-[10px]" onClick={() => handleApprovePetrol(pa.allowance_id)}>Approve</Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600 border-red-300" onClick={() => handleRejectPetrol(pa.allowance_id)}>Reject</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {siteEngineers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">No petty cash records found</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="petty-cash-se-table">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Site Engineer</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Projects</th>
                  <th className="text-right px-3 py-2 font-semibold text-green-600">Issued</th>
                  <th className="text-right px-3 py-2 font-semibold text-red-600">Spent</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600">Balance</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-600">Pending</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {siteEngineers.map(se => (
                  <tr key={se.user_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => fetchSECashbook(se.user_id)}>
                    <td className="px-3 py-2 font-medium text-blue-700">{se.name}</td>
                    <td className="px-3 py-2">{se.projects.map(p => p.project_name).join(', ') || '-'}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-semibold"><MaskedValue value={se.total_issued} className="text-green-700" /></td>
                    <td className="px-3 py-2 text-right text-red-600 font-semibold"><MaskedValue value={se.total_spent} className="text-red-600" /></td>
                    <td className={`px-3 py-2 text-right font-bold ${se.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}><MaskedValue value={se.balance} className={se.balance >= 0 ? 'text-green-700' : 'text-red-600'} /></td>
                    <td className="px-3 py-2 text-center">
                      {se.pending_requests > 0 && <Badge className="bg-amber-100 text-amber-700">{se.pending_requests}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-600" onClick={(e) => { e.stopPropagation(); fetchSECashbook(se.user_id); }}>
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issue Dialog */}
      <Dialog open={issueDialog} onOpenChange={setIssueDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Issue Petty Cash</DialogTitle></DialogHeader>
          {issuePC && (
            <div className="space-y-3">
              <Card className="bg-gray-50"><CardContent className="p-3 text-sm">
                <p><span className="text-gray-500">Requested by:</span> <span className="font-medium">{issuePC.requested_by_name}</span></p>
                <p><span className="text-gray-500">Purpose:</span> <span className="font-medium">{issuePC.purpose}</span></p>
                <p><span className="text-gray-500">Requested:</span> <span className="font-bold text-amber-700">{fmtFull(issuePC.amount_requested)}</span></p>
              </CardContent></Card>
              <div><Label>Amount to Issue</Label><NumericInput value={issueAmount} onChange={e => setIssueAmount(e.target.value)} /></div>
              <div><Label>Remarks</Label><Textarea value={issueRemarks} onChange={e => setIssueRemarks(e.target.value)} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleIssue}>Issue Cash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Payment Dialog */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="max-w-md" data-testid="acc-pc-pay-dialog">
          <DialogHeader><DialogTitle className="text-sm">Process Petty Cash Payment</DialogTitle></DialogHeader>
          {payPC && (
            <div className="space-y-3">
              <Card className="bg-teal-50 border-teal-200"><CardContent className="p-3 text-xs space-y-1">
                <p><span className="text-gray-500">SE:</span> <span className="font-semibold">{payPC.requested_by_name}</span></p>
                <p><span className="text-gray-500">Project:</span> <span className="font-semibold">{payPC.project_name}</span></p>
                <p><span className="text-gray-500">Purpose:</span> {payPC.purpose}</p>
                <p><span className="text-gray-500">Requested:</span> <span className="font-bold text-teal-700">₹{(payPC.amount_requested || 0).toLocaleString('en-IN')}</span></p>
              </CardContent></Card>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Payment Mode *</Label>
                  <Select value={payForm.payment_mode} onValueChange={v => setPayForm({...payForm, payment_mode: v})}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="savings_account">HDFC SAVINGS</SelectItem>
                      <SelectItem value="current_account">HDFC CURRENT</SelectItem>
                      <SelectItem value="direct_transfer">CASH D/T</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="escrow">Escrow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Amount to Pay *</Label>
                  <NumericInput className="h-8 text-xs" value={payForm.amount_paid} onChange={e => setPayForm({...payForm, amount_paid: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Bank Name</Label>
                  <Input className="h-8 text-xs" value={payForm.bank_name} onChange={e => setPayForm({...payForm, bank_name: e.target.value})} placeholder="e.g., SBI" />
                </div>
                <div>
                  <Label className="text-xs">Payment Date</Label>
                  <Input type="date" className="h-8 text-xs" value={payForm.payment_date} onChange={e => setPayForm({...payForm, payment_date: e.target.value})} />
                </div>
              </div>
              {(payForm.payment_mode === 'cheque') && (
                <div>
                  <Label className="text-xs">Cheque Number</Label>
                  <Input className="h-8 text-xs" value={payForm.cheque_number} onChange={e => setPayForm({...payForm, cheque_number: e.target.value})} placeholder="e.g., 123456" />
                </div>
              )}
              {(payForm.payment_mode === 'bank_transfer' || payForm.payment_mode === 'savings_account' || payForm.payment_mode === 'escrow') && (
                <div>
                  <Label className="text-xs">Reference / Transaction Number</Label>
                  <Input className="h-8 text-xs" value={payForm.reference_number} onChange={e => setPayForm({...payForm, reference_number: e.target.value})} placeholder="e.g., TXN001" />
                </div>
              )}
              <div>
                <Label className="text-xs">Remarks</Label>
                <Textarea className="text-xs" rows={2} value={payForm.remarks} onChange={e => setPayForm({...payForm, remarks: e.target.value})} placeholder="Optional notes..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPayDialog(false)}>Cancel</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleProcessPayment} data-testid="acc-pc-pay-confirm">Process Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction Engine — Petty Cash. Accountant raises a "Send for Correction" on
          an already-approved/issued row. The reason is required; the linked
          recorded_expenses row + cashflow_ledger entries are reversed server-side. */}
      <Dialog open={!!correctionPC} onOpenChange={(v) => { if (!v) { setCorrectionPC(null); setCorrectionReason(''); } }}>
        <DialogContent className="max-w-md" data-testid="acc-pc-correction-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <span className="text-orange-600">🔄</span>
              Send Approved Petty Cash for Correction
            </DialogTitle>
          </DialogHeader>
          {correctionPC && (
            <div className="space-y-3">
              <Card className="bg-orange-50 border-orange-200">
                <CardContent className="p-3 text-xs space-y-1">
                  <p><span className="text-gray-500">SE:</span> <span className="font-semibold">{correctionPC.requested_by_name}</span></p>
                  <p><span className="text-gray-500">Purpose:</span> {correctionPC.purpose}</p>
                  <p><span className="text-gray-500">Amount Issued:</span> <span className="font-bold text-orange-700">₹{(correctionPC.amount_issued || correctionPC.amount_requested || 0).toLocaleString('en-IN')}</span></p>
                  <p className="text-[11px] text-orange-700 italic mt-1">⚠ This amount will be removed from Cashbook + Cashflow Engine until the SE corrects and resubmits.</p>
                </CardContent>
              </Card>
              <div>
                <Label className="text-xs">Reason for Correction *</Label>
                <Textarea
                  className="text-xs"
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g., Wrong project tagged / amount mismatch / missing receipt..."
                  data-testid="acc-pc-correction-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCorrectionPC(null); setCorrectionReason(''); }}>Cancel</Button>
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="acc-pc-correction-confirm"
              onClick={async () => {
                if (!correctionReason.trim()) { toast.error('Correction reason is required'); return; }
                try {
                  await axios.post(`${API}/accountant/petty-cash/${correctionPC.petty_cash_id}/send-for-correction`, { reason: correctionReason.trim() });
                  toast.success('Sent for correction. Cashflow entries reversed.');
                  setCorrectionPC(null); setCorrectionReason('');
                  fetchSECashbook(correctionPC.requested_by || (seCashbook?.site_engineer?.user_id));
                } catch (e) {
                  toast.error(e?.response?.data?.detail || 'Send for correction failed');
                }
              }}
            >Send for Correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read-only view of rejected / under-correction rows (accountant clicks pill) */}
      <CorrectionDialog
        open={!!viewCorrectionPC}
        onClose={() => setViewCorrectionPC(null)}
        entityType="Petty Cash"
        doc={viewCorrectionPC}
        resubmitUrl=""
        editableFields={[]}
        canEdit={false}
      />
    </div>
  );
}

// ============ INDIRECT EXPENSE SECTION ============
const INDIRECT_PAYMENT_METHODS = [
  { value: 'savings_account', label: 'HDFC SAVINGS' },
  { value: 'current_account', label: 'HDFC CURRENT' },
  { value: 'direct_transfer', label: 'CASH D/T' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'escrow', label: 'Escrow' },
];

function IndirectExpenseSection({ userRole }) {
  const [costs, setCosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgetOverview, setBudgetOverview] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [indirectLoading, setIndirectLoading] = useState(true);
  const [viewMode, setViewMode] = useState('expenses'); // expenses, budget, allocations
  const [section, setSection] = useState('expenses'); // 'expenses' | 'split' — Feb 19 2026
  const [multiProjectDialog, setMultiProjectDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [indirectPct, setIndirectPct] = useState(20);
  const [editingPct, setEditingPct] = useState(false);
  const [pctInput, setPctInput] = useState('20');
  const [savingPct, setSavingPct] = useState(false);

  const [createDialog, setCreateDialog] = useState(false);
  const [approveDialog, setApproveDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [costToDelete, setCostToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedCost, setSelectedCost] = useState(null);
  const [distributionPreview, setDistributionPreview] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [createForm, setCreateForm] = useState({
    category: '', description: '', amount: '',
    payment_method: 'savings_account', vendor_name: '',
    invoice_number: '', invoice_date: '', remarks: ''
  });
  const [confirmForm, setConfirmForm] = useState({ payment_date: '', reference_number: '', remarks: '' });

  // Feb 19 2026 — Mini summary cards (Total Indirect / Out / Balance)
  // sourced from the Cashflow Engine so values match the engine exactly.
  const [cashflowSummary, setCashflowSummary] = useState(null);

  const fetchIndirect = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setIndirectLoading(true);
      const [costsRes, catsRes, budgetRes, allocRes, settingsRes, cfSummaryRes] = await Promise.all([
        axios.get(`${API}/financial/indirect-costs`),
        axios.get(`${API}/financial/indirect-cost-categories`),
        axios.get(`${API}/financial/project-budget-overview`).catch(() => ({ data: null })),
        axios.get(`${API}/financial/indirect-cost-allocations`).catch(() => ({ data: [] })),
        axios.get(`${API}/settings/company`).catch(() => ({ data: null })),
        axios.get(`${API}/cashflow/summary`).catch(() => ({ data: null }))
      ]);
      setCosts(costsRes.data);
      setCategories(catsRes.data);
      if (budgetRes.data) setBudgetOverview(budgetRes.data);
      setAllocations(allocRes.data || []);
      const pct = settingsRes.data?.indirect_cost_percent ?? 20;
      setIndirectPct(pct);
      setPctInput(String(pct));
      setCashflowSummary(cfSummaryRes.data);
    } catch { /* ignore */ }
    finally { setIndirectLoading(false); }
  }, []);

  useEffect(() => { fetchIndirect(); }, [fetchIndirect]);

  const fetchPreview = async (amount) => {
    if (!amount || parseFloat(amount) <= 0) { setDistributionPreview(null); return; }
    try {
      const res = await axios.get(`${API}/financial/indirect-cost-distribution-preview?amount=${parseFloat(amount)}`);
      setDistributionPreview(res.data);
    } catch { setDistributionPreview(null); }
  };

  const handleCreateCost = async () => {
    if (!createForm.category || !createForm.description || !createForm.amount) {
      toast.error('Category, description, and amount are required'); return;
    }
    try {
      await axios.post(`${API}/financial/indirect-costs`, {
        ...createForm, amount: parseFloat(createForm.amount),
        invoice_date: createForm.invoice_date ? new Date(createForm.invoice_date).toISOString() : null
      });
      toast.success('Indirect cost created. Goes to GM for approval.');
      setCreateDialog(false);
      setCreateForm({ category: '', description: '', amount: '', payment_method: 'savings_account', vendor_name: '', invoice_number: '', invoice_date: '', remarks: '' });
      setDistributionPreview(null);
      fetchIndirect(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to create');
    }
  };

  const handleApprove = async (approved) => {
    try {
      await axios.patch(`${API}/financial/indirect-costs/${selectedCost.indirect_cost_id}/approve`, {
        approved, rejection_reason: approved ? null : rejectionReason
      });
      toast.success(approved ? 'Approved! Payment will be processed.' : 'Rejected. Requester will be notified.');
      setApproveDialog(false); setSelectedCost(null); setRejectionReason('');
      fetchIndirect(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  const handleConfirmPayment = async () => {
    if (!confirmForm.reference_number || !confirmForm.payment_date) {
      toast.error('Payment date and reference required'); return;
    }
    try {
      await axios.patch(`${API}/financial/indirect-costs/${selectedCost.indirect_cost_id}/confirm`, {
        payment_date: new Date(confirmForm.payment_date).toISOString(),
        reference_number: confirmForm.reference_number, remarks: confirmForm.remarks || null
      });
      toast.success('Payment confirmed! Cost auto-distributed.');
      setConfirmDialog(false); setSelectedCost(null);
      setConfirmForm({ payment_date: '', reference_number: '', remarks: '' });
      fetchIndirect(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed');
    }
  };

  const handleDeleteCost = async () => {
    if (!costToDelete) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/financial/indirect-costs/${costToDelete.indirect_cost_id}`);
      toast.success('Indirect cost deleted');
      setDeleteDialog(false);
      setCostToDelete(null);
      fetchIndirect(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const getCategoryLabel = (v) => categories.find(c => c.value === v)?.label || v;
  const canCreate = ['accountant', 'super_admin'].includes(userRole);
  const canApprove = ['super_admin', 'general_manager'].includes(userRole);
  const canConfirm = ['accountant', 'super_admin'].includes(userRole);
  const canDelete = ['accountant', 'super_admin'].includes(userRole);
  const canEditPct = userRole === 'super_admin';

  const handleSavePct = async () => {
    const val = parseFloat(pctInput);
    if (!val || val < 1 || val > 50) { toast.error('Enter a value between 1 and 50'); return; }
    try {
      setSavingPct(true);
      await axios.patch(`${API}/settings/company`, { indirect_cost_percent: val });
      setIndirectPct(val);
      setEditingPct(false);
      toast.success(`Cost split updated: Direct ${100 - val}% / Indirect ${val}%`);
      fetchIndirect(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update');
    } finally { setSavingPct(false); }
  };
  const fmtI = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
  const fmtIL = (n) => { if (!n) return '0'; if (n >= 10000000) return `${(n/10000000).toFixed(2)} Cr`; if (n >= 100000) return `${(n/100000).toFixed(2)} L`; return fmt(n); };

  const filteredCosts = costs.filter(c => statusFilter === 'all' ? true : c.status === statusFilter);
  const stats = {
    pending: costs.filter(c => c.status === 'pending').length,
    approved: costs.filter(c => c.status === 'approved').length,
    confirmed: costs.filter(c => c.status === 'confirmed').length,
    rejected: costs.filter(c => c.status === 'rejected').length,
    totalConfirmed: costs.filter(c => c.status === 'confirmed').reduce((s, c) => s + (c.amount || 0), 0)
  };

  const getStatusBadge = (status) => {
    const m = { pending: ['Pending', 'bg-yellow-100 text-yellow-700'], approved: ['Approved', 'bg-amber-50 text-amber-700'], confirmed: ['Confirmed', 'bg-green-100 text-green-700'], rejected: ['Rejected', 'bg-red-100 text-red-700'] };
    const [label, cls] = m[status] || [status, 'bg-gray-100'];
    return <Badge className={cls}>{label}</Badge>;
  };

  if (indirectLoading) return <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-violet-600" /></div>;

  const bo = budgetOverview;

  return (
    <div className="space-y-3" data-testid="indirect-expense-section">
      {/* Feb 19 2026 — Mini summary cards sourced from Cashflow Engine */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="indirect-summary-cards">
        <Card className="border-l-4 border-l-violet-500 bg-violet-50/40">
          <CardContent className="p-2.5 sm:p-3">
            <p className="text-[10px] sm:text-xs text-gray-500">Total Indirect Cost</p>
            <p className="text-base sm:text-lg font-bold text-violet-700" data-testid="indirect-total-in">
              <MaskedValue value={cashflowSummary?.indirect_in || 0} className="text-violet-700" />
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500 bg-red-50/40">
          <CardContent className="p-2.5 sm:p-3">
            <p className="text-[10px] sm:text-xs text-gray-500">Indirect Out</p>
            <p className="text-base sm:text-lg font-bold text-red-600" data-testid="indirect-total-out">
              <MaskedValue value={cashflowSummary?.indirect_out || 0} className="text-red-600" />
            </p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${(cashflowSummary?.indirect_balance || 0) >= 0 ? 'border-l-emerald-500 bg-emerald-50/40' : 'border-l-amber-500 bg-amber-50/40'}`}>
          <CardContent className="p-2.5 sm:p-3">
            <p className="text-[10px] sm:text-xs text-gray-500">Balance</p>
            <p className={`text-base sm:text-lg font-bold ${(cashflowSummary?.indirect_balance || 0) >= 0 ? 'text-emerald-700' : 'text-amber-700'}`} data-testid="indirect-balance">
              <MaskedValue value={cashflowSummary?.indirect_balance || 0} className={(cashflowSummary?.indirect_balance || 0) >= 0 ? 'text-emerald-700' : 'text-amber-700'} />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Split Bar */}
      <Card className="border-violet-200 bg-gradient-to-r from-blue-50 via-white to-violet-50">
        <CardContent className="p-2.5 sm:p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <PieChart className="h-4 w-4 text-violet-600 shrink-0" />
              <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Cost Split</span>
              {/* Visual bar */}
              <div className="flex-1 flex h-5 rounded-full overflow-hidden border border-gray-200 max-w-xs">
                <div className="flex items-center justify-center text-[9px] font-bold text-blue-700 bg-blue-100 transition-all" style={{ width: `${100 - indirectPct}%` }}>
                  {100 - indirectPct}% Direct
                </div>
                <div className="flex items-center justify-center text-[9px] font-bold text-violet-700 bg-violet-200 transition-all" style={{ width: `${indirectPct}%` }}>
                  {indirectPct}%
                </div>
              </div>
            </div>
            {/* Edit controls - Super Admin only */}
            {canEditPct && !editingPct && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 shrink-0"
                onClick={() => { setEditingPct(true); setPctInput(String(indirectPct)); }} data-testid="edit-cost-split-btn">
                <Edit className="h-3 w-3" /> Edit
              </Button>
            )}
            {canEditPct && editingPct && (
              <div className="flex items-center gap-1.5 shrink-0">
                <NumericInput className="w-16 h-6 text-xs text-center"
                  value={pctInput} onChange={(e) => setPctInput(e.target.value)} data-testid="cost-split-input" />
                <span className="text-[10px] text-gray-500">%</span>
                <Button size="sm" className="h-6 text-[10px] bg-violet-600 hover:bg-violet-700 px-2" disabled={savingPct}
                  onClick={handleSavePct} data-testid="save-cost-split-btn">
                  {savingPct ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => setEditingPct(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            {/* View-only for Accountant */}
            {!canEditPct && (
              <span className="text-[10px] text-gray-400 shrink-0">Set by Admin</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feb 19 2026 — Section toggle: Expenses | Expense Split */}
      <div className="flex items-center gap-2 border-b" data-testid="indirect-section-tabs">
        {[
          { key: 'expenses', label: 'Expenses' },
          { key: 'split', label: 'Expense Split' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setSection(t.key)}
            data-testid={`indirect-section-${t.key}`}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              section === t.key ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === 'split' && <ExpenseSplitSection userRole={userRole} />}

      {section === 'expenses' && (<>
      {/* View Mode Tabs + Add Button */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {[
          { key: 'expenses', label: `Expenses (${costs.length})`, icon: Clock },
          { key: 'budget', label: 'Budget Overview', icon: PieChart },
          { key: 'allocations', label: `Allocations (${allocations.length})`, icon: ArrowUpRight },
        ].map(t => (
          <Button key={t.key} size="sm" variant={viewMode === t.key ? 'default' : 'outline'}
            className={`text-[10px] sm:text-xs h-6 sm:h-7 px-2 sm:px-3 gap-1 ${viewMode === t.key ? 'bg-violet-600 hover:bg-violet-700' : ''}`}
            onClick={() => setViewMode(t.key)} data-testid={`indirect-view-${t.key}`}>
            <t.icon className="h-3 w-3" /> {t.label}
          </Button>
        ))}
        {canCreate && (
          <div className="ml-auto">
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 gap-1 h-6 sm:h-7 text-[10px] sm:text-xs"
              onClick={() => setMultiProjectDialog(true)} data-testid="add-indirect-cost-inline-btn">
              <Plus className="h-3 w-3" /> Add Indirect Cost
            </Button>
          </div>
        )}
      </div>

      {/* ── EXPENSES VIEW ── */}
      {viewMode === 'expenses' && (
        <>
          {/* Status Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { key: 'all', label: 'All', count: costs.length, color: 'violet' },
              { key: 'pending', label: 'Pending', count: stats.pending, color: 'yellow' },
              { key: 'approved', label: 'Approved', count: stats.approved, color: 'amber' },
              { key: 'confirmed', label: 'Confirmed', count: stats.confirmed, color: 'green' },
              { key: 'rejected', label: 'Rejected', count: stats.rejected, color: 'red' },
            ].map(s => (
              <div key={s.key}
                className={`rounded-lg border p-2 text-center cursor-pointer transition-all hover:shadow-md ${statusFilter === s.key ? 'ring-2 ring-violet-400 ring-offset-1' : ''} bg-${s.color}-50 border-${s.color}-200`}
                onClick={() => setStatusFilter(s.key)} data-testid={`indirect-status-${s.key}`}>
                <p className={`text-lg font-bold text-${s.color}-700`}>{s.count}</p>
                <p className={`text-[10px] text-${s.color}-600`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Indirect Cost Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="indirect-costs-table">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600 w-12">S.No</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Project(s)</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Category</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Vendor</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCosts.length === 0 ? (
                      <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">No indirect cost entries</td></tr>
                    ) : filteredCosts.map((cost, idx) => {
                      const linkedAllocs = (allocations || []).filter(a => a.indirect_cost_id === cost.indirect_cost_id);
                      const projectNames = linkedAllocs.map(a => (a.project_name || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                      return (
                      <tr key={cost.indirect_cost_id} className="hover:bg-gray-50" data-testid={`indirect-row-${cost.indirect_cost_id}`}>
                        <td className="px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {projectNames.length === 0 ? <span className="text-gray-400">-</span>
                            : projectNames.length === 1 ? <span className="text-xs">{projectNames[0]}</span>
                            : <span className="text-xs" title={projectNames.join(', ')}>{projectNames[0]} <Badge variant="outline" className="text-[9px] ml-1">+{projectNames.length - 1}</Badge></span>
                          }
                        </td>
                        <td className="px-3 py-2 font-medium">{cost.description}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{getCategoryLabel(cost.category)}</Badge></td>
                        <td className="px-3 py-2 text-gray-600">{cost.vendor_name || '-'}</td>
                        <td className="px-3 py-2 text-right font-bold text-violet-700">{fmtI(cost.amount)}</td>
                        <td className="px-3 py-2 text-center">{getStatusBadge(cost.status)}</td>
                        <td className="px-3 py-2 text-center space-x-1">
                          {cost.status === 'pending' && canApprove && (
                            <Button size="sm" className="h-6 text-[10px]" onClick={() => { setSelectedCost(cost); setApproveDialog(true); }} data-testid={`indirect-review-${cost.indirect_cost_id}`}>Review</Button>
                          )}
                          {cost.status === 'approved' && canConfirm && (
                            <Button size="sm" className="h-6 text-[10px] bg-green-600 hover:bg-green-700" onClick={() => { setSelectedCost(cost); setConfirmDialog(true); }} data-testid={`indirect-confirm-${cost.indirect_cost_id}`}>Confirm</Button>
                          )}
                          {cost.status === 'confirmed' && <span className="text-[10px] text-green-600"><Lock className="h-3 w-3 inline" /> Locked</span>}
                          {cost.status === 'rejected' && <span className="text-[10px] text-red-500 truncate max-w-[100px] inline-block">{cost.rejection_reason || 'Rejected'}</span>}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-600 hover:bg-red-50 inline-flex"
                              onClick={() => { setCostToDelete(cost); setDeleteDialog(true); }}
                              data-testid={`indirect-delete-${cost.indirect_cost_id}`}
                              title="Delete indirect cost"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── BUDGET OVERVIEW ── */}
      {viewMode === 'budget' && bo && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            <Card className="bg-blue-50 border-blue-200"><CardContent className="p-3 text-center">
              <Building2 className="h-4 w-4 mx-auto mb-1 text-blue-600" />
              <p className="text-base font-bold text-blue-700">₹{fmtIL(bo.portfolio_total)}</p>
              <p className="text-[10px] text-blue-600">Portfolio ({bo.projects?.length || 0} Projects)</p>
            </CardContent></Card>
            <Card className="bg-orange-50 border-orange-200"><CardContent className="p-3 text-center">
              <PieChart className="h-4 w-4 mx-auto mb-1 text-orange-600" />
              <p className="text-base font-bold text-orange-700">₹{fmtIL(bo.total_indirect_budget)}</p>
              <p className="text-[10px] text-orange-600">{bo.indirect_cost_percent || 20}% Indirect Budget</p>
            </CardContent></Card>
            <Card className="bg-red-50 border-red-200"><CardContent className="p-3 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-red-600" />
              <p className="text-base font-bold text-red-700">₹{fmtIL(bo.total_indirect_spent)}</p>
              <p className="text-[10px] text-red-600">Indirect Spent</p>
            </CardContent></Card>
            <Card className="bg-green-50 border-green-200"><CardContent className="p-3 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-600" />
              <p className="text-base font-bold text-green-700">₹{fmtIL(bo.total_indirect_remaining)}</p>
              <p className="text-[10px] text-green-600">Remaining (Profit)</p>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader className="border-b py-2 px-4"><CardTitle className="text-xs font-semibold">Project-wise Budget ({bo.direct_cost_percent || 80}/{bo.indirect_cost_percent || 20} Rule)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600 w-12">S.No</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Project</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Value</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Share</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Direct ({bo.direct_cost_percent || 80}%)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Indirect ({bo.indirect_cost_percent || 20}%)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Spent</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Remaining</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(bo.projects || []).map((p, idx) => {
                      const usedPct = p.indirect_budget > 0 ? (p.indirect_spent / p.indirect_budget * 100) : 0;
                      return (
                        <tr key={p.project_id} className="hover:bg-gray-50" data-testid={`budget-row-${idx}`}>
                          <td className="px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2"><span className="font-medium">{(p.name || '').replace(/\s+/g, ' ').trim()}</span> <Badge variant="outline" className="text-[9px] ml-1">{p.planning_status || p.status}</Badge></td>
                          <td className="px-3 py-2 text-right font-bold">₹{fmtIL(p.total_value)}</td>
                          <td className="px-3 py-2 text-center"><Badge className="bg-blue-100 text-blue-700 text-[10px]">{p.share_pct}%</Badge></td>
                          <td className="px-3 py-2 text-right text-gray-600">₹{fmtIL(p.direct_budget)}</td>
                          <td className="px-3 py-2 text-right text-orange-600 font-medium">₹{fmtIL(p.indirect_budget)}</td>
                          <td className="px-3 py-2 text-right text-red-600 font-medium">₹{fmtIL(p.indirect_spent)}</td>
                          <td className="px-3 py-2 text-right text-green-600 font-bold">₹{fmtIL(p.indirect_remaining)}</td>
                          <td className="px-3 py-2 text-center">
                            {p.is_exhausted ? <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />Exhausted</Badge>
                              : usedPct > 75 ? <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">{usedPct.toFixed(0)}% Used</Badge>
                              : <Badge className="bg-green-100 text-green-700 text-[10px]">{usedPct.toFixed(0)}% Used</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                    {(!bo.projects || bo.projects.length === 0) && (
                      <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400">No active projects</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {viewMode === 'budget' && !bo && <Card><CardContent className="p-8 text-center text-gray-400">No budget data</CardContent></Card>}

      {/* ── ALLOCATIONS VIEW ── */}
      {viewMode === 'allocations' && (
        <Card>
          <CardHeader className="border-b py-2 px-4"><CardTitle className="text-xs font-semibold">Auto-Distribution History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600 w-12">S.No</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Project</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Category</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">Share</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allocations.length === 0 ? (
                    <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">No allocations yet. Confirm an indirect cost to see distribution.</td></tr>
                  ) : allocations.map((a, i) => (
                    <tr key={a.allocation_id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-center text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{(a.project_name || '').replace(/\s+/g, ' ').trim()}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{getCategoryLabel(a.category)}</Badge></td>
                      <td className="px-3 py-2 text-gray-600">{a.description}</td>
                      <td className="px-3 py-2 text-center"><Badge className="bg-blue-100 text-blue-700 text-[10px]">{a.share_pct ?? (a.percent ? a.percent.toFixed(2) : '-')}%</Badge></td>
                      <td className="px-3 py-2 text-right font-bold text-violet-700">{fmtI(a.amount)}</td>
                      <td className="px-3 py-2 text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── CREATE DIALOG ── */}
      </>)}

      {/* New multi-project Indirect Cost dialog (replaces legacy single-category flow) */}
      <MultiProjectIndirectCostDialog
        open={multiProjectDialog}
        onClose={() => setMultiProjectDialog(false)}
        onCreated={() => fetchIndirect(false)}
      />

      <Dialog open={createDialog} onOpenChange={(open) => { setCreateDialog(open); if (!open) setDistributionPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Indirect Cost (Overhead)</DialogTitle><DialogDescription>This entry requires approval. Once confirmed, it auto-distributes across active projects.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={createForm.category} onValueChange={(v) => setCreateForm({ ...createForm, category: v })}>
                  <SelectTrigger data-testid="indirect-select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Amount *</Label>
                <NumericInput value={createForm.amount} onChange={(e) => { setCreateForm({ ...createForm, amount: e.target.value }); if (e.target.value && parseFloat(e.target.value) > 0) fetchPreview(e.target.value); else setDistributionPreview(null); }} placeholder="Enter amount" data-testid="indirect-input-amount" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description *</Label>
              <Input value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="E.g., Marketing campaign Q1" data-testid="indirect-input-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment Method</Label>
                <Select value={createForm.payment_method} onValueChange={(v) => setCreateForm({ ...createForm, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INDIRECT_PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vendor/Payee</Label>
                <Input value={createForm.vendor_name} onChange={(e) => setCreateForm({ ...createForm, vendor_name: e.target.value })} placeholder="Vendor name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Invoice #</Label><Input value={createForm.invoice_number} onChange={(e) => setCreateForm({ ...createForm, invoice_number: e.target.value })} placeholder="INV-001" /></div>
              <div><Label className="text-xs">Invoice Date</Label><Input type="date" value={createForm.invoice_date} onChange={(e) => setCreateForm({ ...createForm, invoice_date: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Remarks</Label><Textarea value={createForm.remarks} onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })} rows={2} /></div>
            {distributionPreview && (
              <Card className="bg-violet-50 border-violet-200">
                <CardHeader className="py-1.5 px-3 border-b border-violet-200"><CardTitle className="text-xs text-violet-700">Auto-Distribution Preview ({fmtI(distributionPreview.amount)})</CardTitle></CardHeader>
                <CardContent className="p-2">
                  {distributionPreview.warnings?.length > 0 && distributionPreview.warnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-orange-600 flex items-start gap-1 mb-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}</p>
                  ))}
                  {distributionPreview.distributions?.map(d => (
                    <div key={d.project_id} className="flex items-center justify-between text-xs py-0.5">
                      <span className="flex items-center gap-1.5"><Badge className={d.is_capped ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} variant="outline">{d.share_pct}%</Badge> <span className="text-gray-700 truncate max-w-[180px]">{d.name}</span></span>
                      <span className="font-bold text-violet-700">{fmtI(d.amount)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateCost} className="bg-violet-600 hover:bg-violet-700" data-testid="submit-indirect-cost-inline"><Plus className="h-4 w-4 mr-1" /> Submit for Approval</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── APPROVE DIALOG ── */}
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Review Indirect Cost</DialogTitle></DialogHeader>
          {selectedCost && (
            <div className="space-y-3">
              <Card className="bg-violet-50 border-violet-200"><CardContent className="p-3">
                <p className="font-semibold">{getCategoryLabel(selectedCost.category)}</p>
                <p className="text-sm text-gray-600">{selectedCost.description}</p>
                <p className="text-2xl font-bold text-violet-700 mt-1">{fmtI(selectedCost.amount)}</p>
                {selectedCost.vendor_name && <p className="text-sm text-gray-500">Vendor: {selectedCost.vendor_name}</p>}
              </CardContent></Card>
              <div><Label className="text-xs">Rejection Reason (if rejecting)</Label><Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleApprove(false)} disabled={!rejectionReason} data-testid="indirect-reject-btn"><ThumbsDown className="h-4 w-4 mr-1" /> Reject</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleApprove(true)} data-testid="indirect-approve-btn"><ThumbsUp className="h-4 w-4 mr-1" /> Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM PAYMENT DIALOG ── */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm Payment</DialogTitle></DialogHeader>
          {selectedCost && (
            <div className="space-y-3">
              <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
                <p className="font-semibold text-sm">{selectedCost.description}</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{fmtI(selectedCost.amount)}</p>
              </CardContent></Card>
              <div><Label className="text-xs">Payment Date *</Label><Input type="date" value={confirmForm.payment_date} onChange={(e) => setConfirmForm({ ...confirmForm, payment_date: e.target.value })} data-testid="indirect-payment-date" /></div>
              <div><Label className="text-xs">Reference / Transaction ID *</Label><Input value={confirmForm.reference_number} onChange={(e) => setConfirmForm({ ...confirmForm, reference_number: e.target.value })} placeholder="TXN-001" data-testid="indirect-reference" /></div>
              <div><Label className="text-xs">Remarks</Label><Textarea value={confirmForm.remarks} onChange={(e) => setConfirmForm({ ...confirmForm, remarks: e.target.value })} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmPayment} className="bg-green-600 hover:bg-green-700" data-testid="indirect-confirm-payment-btn"><Lock className="h-4 w-4 mr-1" /> Confirm & Distribute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Indirect Cost Confirmation */}
      <Dialog open={deleteDialog} onOpenChange={(o) => { if (!o) { setDeleteDialog(false); setCostToDelete(null); } }}>
        <DialogContent className="max-w-md" data-testid="indirect-delete-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete Indirect Cost
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will permanently remove the indirect cost, all per-project allocations, and reverse the cashflow ledger entries.
              {costToDelete?.status === 'confirmed' && ' This entry is currently CONFIRMED & LOCKED — deleting will roll back its impact on every project.'}
            </DialogDescription>
          </DialogHeader>
          {costToDelete && (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-3 space-y-1">
                <p className="font-semibold text-sm">{costToDelete.description}</p>
                <p className="text-2xl font-bold text-red-700">{fmtI(costToDelete.amount)}</p>
                <p className="text-xs text-gray-600">Status: <span className="font-medium">{costToDelete.status}</span> · Category: {getCategoryLabel(costToDelete.category)}</p>
                {costToDelete.vendor_name && <p className="text-xs text-gray-600">Vendor: {costToDelete.vendor_name}</p>}
              </CardContent>
            </Card>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialog(false); setCostToDelete(null); }} disabled={deleting} data-testid="indirect-delete-cancel">Cancel</Button>
            <Button onClick={handleDeleteCost} disabled={deleting} className="bg-red-600 hover:bg-red-700" data-testid="indirect-delete-confirm">
              <Trash2 className="h-4 w-4 mr-1" /> {deleting ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ CASHBOOK TAB ============
function CashbookTab({ overview, projects, userRole, onRefresh }) {
  const location = useLocation();
  const expenseOnly = (() => {
    const params = new URLSearchParams(location.search);
    return params.get('sub') === 'expense';
  })();
  const initialSub = (() => {
    const params = new URLSearchParams(location.search);
    const s = params.get('sub');
    if (s === 'expense' || s === 'income' || s === 'indirect') return s;
    return 'income';
  })();
  const [cashbookData, setCashbookData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState(initialSub);
  // Keep subTab in sync with URL (?sub=) — so the "Expense" header link auto-opens Direct Expense
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const s = params.get('sub');
    if (s === 'expense' || s === 'income' || s === 'indirect') {
      setSubTab(s);
    }
  }, [location.search]);
  // Feb 26 2026 — Cashbook date filter starts EMPTY by default (show
  // all data). The Accountant can manually pick a range via the date
  // chip if they want a per-month view. Previously defaulted to the
  // current calendar month which silently hid older data.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [expenseSubTab, setExpenseSubTab] = useState('material');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'manual' | 'approval'
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  // Edit-mode for income view dialog: lets accountant change payment_mode + ref + cheque
  const [editingIncome, setEditingIncome] = useState(false);
  const [editIncomeForm, setEditIncomeForm] = useState({ payment_mode: 'cash', reference_number: '', cheque_number: '', bank_name: '' });
  const [savingIncomeEdit, setSavingIncomeEdit] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [mobileExpenseDialog, setMobileExpenseDialog] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [drilldown, setDrilldown] = useState(null); // { type: 'income'|'expense'|'suspense', mode?: string, category?: string }
  const [newExpense, setNewExpense] = useState({
    project_id: '', category: 'material', amount: '', vendor_name: '',
    description: '', payment_method: 'cash', transaction_id: ''
  });

  const fetchCashbook = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.append('start_date', dateFrom);
      if (dateTo) params.append('end_date', dateTo);
      if (filterProject) params.append('project_id', filterProject);
      const res = await axios.get(`${API}/accountant/cashbook-filtered?${params}`);
      setCashbookData(res.data);
    } catch {
      toast.error('Failed to load cashbook');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterProject]);

  useEffect(() => { fetchCashbook(); }, [fetchCashbook]);

  const handleDeleteIncome = async (entry) => {
    if (!entry?.income_id) { toast.error('Missing income id'); return; }
    if (!window.confirm(`Delete this income entry of ₹${(entry.amount || 0).toLocaleString('en-IN')}?\n\nThis will also adjust the project's recorded income. This action cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/income/${entry.income_id}`);
      toast.success('Income entry deleted');
      fetchCashbook();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete income');
    }
  };

  const startEditIncome = () => {
    if (!selectedEntry) return;
    setEditIncomeForm({
      payment_mode: selectedEntry.payment_mode || 'cash',
      reference_number: selectedEntry.reference_number || '',
      cheque_number: selectedEntry.cheque_number || '',
      bank_name: selectedEntry.bank_name || '',
    });
    setEditingIncome(true);
  };

  const handleSaveIncomeEdit = async () => {
    if (!selectedEntry?.income_id) return;
    setSavingIncomeEdit(true);
    try {
      const payload = {
        payment_mode: editIncomeForm.payment_mode,
        reference_number: editIncomeForm.reference_number || null,
        cheque_number: editIncomeForm.cheque_number || null,
        bank_name: editIncomeForm.bank_name || null,
      };
      await axios.patch(`${API}/income/${selectedEntry.income_id}`, payload);
      toast.success('Income updated');
      setSelectedEntry({ ...selectedEntry, ...payload });
      setEditingIncome(false);
      fetchCashbook();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update income');
    } finally {
      setSavingIncomeEdit(false);
    }
  };

  const handleDeleteExpense = async (entry) => {
    const recordId = entry.expense_id || entry.request_id;
    if (!recordId) { toast.error('Missing expense id'); return; }
    const expType = entry.expense_type || entry.category || 'recorded';
    if (!window.confirm(`Delete this ${expType} expense of ₹${(entry.amount || 0).toLocaleString('en-IN')}?\n\nThis action cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/cashbook/expense/${expType}/${recordId}`);
      toast.success('Expense deleted');
      fetchCashbook();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete expense');
    }
  };

  // Feb 28 2026 — "Send Back to Approvals" replaces destructive delete for
  // Petty Cash rows. Reverses the cashflow allocation and re-surfaces the
  // entry under Approvals → Petty Cash → Record Expense for re-review.
  const handleSendPettyCashBackToApprovals = async (entry) => {
    const recordId = entry.expense_id || entry.request_id;
    if (!recordId) { toast.error('Missing expense id'); return; }
    if (!window.confirm(`Send this Petty Cash entry of ₹${(entry.amount || 0).toLocaleString('en-IN')} back to Approvals → Petty Cash for re-review?\n\nThe cashflow allocation will be reversed.`)) return;
    try {
      await axios.post(`${API}/cashbook/expense/petty_cash/${recordId}/send-back-to-approvals`);
      toast.success('Sent back to Approvals → Petty Cash');
      fetchCashbook();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send back');
    }
  };

  // Feb 28 2026 — Same pattern for Material rows: pulls back to
  // Approvals → Expense Approvals → Materials so the accountant can
  // re-edit amount / payment-mode and Pay & Settle again.
  const handleSendMaterialBackToApprovals = async (entry) => {
    const recordId = entry.expense_id || entry.request_id;
    if (!recordId) { toast.error('Missing material id'); return; }
    if (!window.confirm(`Send this Material entry of ₹${(entry.amount || 0).toLocaleString('en-IN')} back to Approvals → Materials for re-review?\n\nThe cashflow allocation will be reversed and payment fields cleared.`)) return;
    try {
      await axios.post(`${API}/cashbook/expense/material/${recordId}/send-back-to-approvals`);
      toast.success('Sent back to Approvals → Materials');
      fetchCashbook();
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send back');
    }
  };

  const incomeEntries = cashbookData?.income_entries || overview?.income_entries || [];
  const allExpenseEntries = cashbookData?.expense_entries || overview?.expense_entries || [];
  const summary = cashbookData?.summary || overview?.totals || {};

  // Data from cashbook (filtered by date/project) for Financial Overview cards.
  // Falls back to overview (all-time) only if cashbook hasn't loaded yet so the
  // cards stay in sync with the table below as the user changes the date filter.
  const inc = cashbookData?.income_by_mode || overview?.income_by_mode || {};
  const exp = cashbookData?.expense_by_mode || overview?.expense_by_mode || {};
  const totals = cashbookData?.summary
    ? {
        total_income: cashbookData.summary.total_income,
        total_expense: cashbookData.summary.total_expense,
        net_balance: cashbookData.summary.net_balance,
        // Feb 22 2026 — Project Value Calculation cards on Project Wise tab.
        scope_value: cashbookData.summary.scope_value || 0,
        additions_total: cashbookData.summary.additions_total || 0,
        deductions_total: cashbookData.summary.deductions_total || 0,
        grand_total_value: cashbookData.summary.grand_total_value || 0,
        receivable: cashbookData.summary.receivable || 0,
      }
    : (overview?.totals || {});

  // Expense category calc
  const expByCategory = {
    overall: allExpenseEntries.reduce((s, e) => s + (e.amount || 0), 0),
    material: allExpenseEntries.filter(e => e.expense_type === 'material').reduce((s, e) => s + (e.amount || 0), 0),
    labour: allExpenseEntries.filter(e => e.expense_type === 'labour').reduce((s, e) => s + (e.amount || 0), 0),
    // Petty Cash = expenses recorded with category=petty_cash (cash actually
    // released by the accountant). Falls back to the live SE "spent" tracker
    // only when no expense rows exist yet.
    petty_cash: (
      allExpenseEntries.filter(e => e.expense_type === 'petty_cash').reduce((s, e) => s + (e.amount || 0), 0)
      || overview?.petty_cash?.spent
      || 0
    ),
    suspense: overview?.suspense_balance || 0,
    // "Other" must exclude petty_cash too, otherwise petty cash double-counts
    // (once in its own tile, once in Other).
    other: allExpenseEntries.filter(e => !['material', 'labour', 'petty_cash'].includes(e.expense_type)).reduce((s, e) => s + (e.amount || 0), 0),
  };
  const EXP_CATEGORIES = [
    { key: 'overall', label: 'Overall Expense', icon: IndianRupee, color: 'bg-red-50 text-red-700 border-red-200' },
    { key: 'material', label: 'Material', icon: Building2, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { key: 'labour', label: 'Labour', icon: Wallet, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { key: 'petty_cash', label: 'Petty Cash', icon: Banknote, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { key: 'suspense', label: 'Suspense', icon: RefreshCw, color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { key: 'other', label: 'Other', icon: IndianRupee, color: 'bg-gray-50 text-gray-700 border-gray-200' },
  ];

  const filteredExpenses = allExpenseEntries.filter(e => {
    const src = e.source === 'approval' ? 'approval' : 'manual';
    if (sourceFilter !== 'all' && src !== sourceFilter) return false;
    if (expenseSubTab === 'material') return e.expense_type === 'material';
    if (expenseSubTab === 'labour') return e.expense_type === 'labour';
    if (expenseSubTab === 'petty_cash') return e.expense_type === 'petty_cash';
    return false;
  });

  // Drilldown click handlers
  const handleModeClick = (mode) => {
    if (mode === 'suspense_account') {
      navigate('/suspense-account');
      return;
    }
    // Petty Cash mode = jump straight to the Petty Cash Management drilldown
    // so PM-approved requests are visible. The "mode breakdown" view only shows
    // transactions already paid via cash, which is empty until cash is issued.
    if (mode === 'petty_cash') {
      setDrilldown({ type: 'petty_cash_mgmt' });
      return;
    }
    // Show income entries for this mode
    const modeIncome = incomeEntries.filter(e => classifyMode(e.payment_mode) === mode);
    const modeExpense = allExpenseEntries.filter(e => classifyMode(e.payment_method || e.payment_mode) === mode);
    setDrilldown({ type: 'mode', mode, incomeEntries: modeIncome, expenseEntries: modeExpense, label: MODE_LABELS[mode] });
  };

  const handleCategoryClick = (catKey) => {
    if (catKey === 'suspense') {
      // Open the dedicated Suspense Account page so the URL changes to
      // /suspense-account (matching the user's expectation) instead of
      // showing an inline drilldown stuck on /accounts-board.
      navigate('/suspense-account');
      return;
    }
    if (catKey === 'petty_cash') {
      setDrilldown({ type: 'petty_cash_mgmt' });
      return;
    }
    if (catKey === 'overall') {
      setDrilldown(null);
      setSubTab('expense');
      setExpenseSubTab('all');
      return;
    }
    const filtered = allExpenseEntries.filter(e => {
      if (catKey === 'material') return e.expense_type === 'material';
      if (catKey === 'labour') return e.expense_type === 'labour';
      if (catKey === 'petty_cash') return e.expense_type === 'petty_cash';
      if (catKey === 'other') return !['material', 'labour', 'petty_cash'].includes(e.expense_type);
      return true;
    });
    setDrilldown({ type: 'category', category: catKey, entries: filtered, label: EXP_CATEGORIES.find(c => c.key === catKey)?.label || catKey });
  };

  // If in drilldown mode, show the drilldown
  if (drilldown?.type === 'suspense') {
    return <SuspenseDrilldown onBack={() => setDrilldown(null)} />;
  }
  if (drilldown?.type === 'petty_cash_mgmt') {
    return <PettyCashManagement onBack={() => setDrilldown(null)} />;
  }
  if (drilldown?.type === 'category') {
    const allowAcctActions = userRole === 'accountant' || userRole === 'super_admin';
    // Income drilldown (Overall Income card) renders with green styling and
    // calls the income deletion handler so the same DrilldownView component
    // is reused for both income & expense rows.
    const isIncome = drilldown.category === 'overall_income';
    return <DrilldownView
      title={isIncome ? `${drilldown.label} (${drilldown.entries.length})` : `${drilldown.label} (${drilldown.entries.length})`}
      entries={drilldown.entries}
      type={isIncome ? 'income' : 'expense'}
      onBack={() => setDrilldown(null)}
      canDelete={allowAcctActions}
      onDelete={(e) => {
        if (isIncome) {
          handleDeleteIncome(e);
        } else {
          handleDeleteExpense(e);
        }
        setDrilldown(null);
      }}
    />;
  }
  if (drilldown?.type === 'mode') {
    const allowAcctActions = userRole === 'accountant' || userRole === 'super_admin';
    return (
      <ModeDrilldownView
        label={drilldown.label}
        incomeEntries={drilldown.incomeEntries}
        expenseEntries={drilldown.expenseEntries}
        onBack={() => setDrilldown(null)}
        canDelete={allowAcctActions}
        onDeleteIncome={(e) => { handleDeleteIncome(e); setDrilldown(null); }}
        onDeleteExpense={(e) => { handleDeleteExpense(e); setDrilldown(null); }}
      />
    );
  }

  const handleExpenseSubmitClick = () => {
    if (!newExpense.project_id || !newExpense.amount || !newExpense.category) {
      toast.error('Project, Category & Amount are required'); return;
    }
    setShowSubmitConfirm(true);
  };

  const handleAddExpense = async () => {
    setSubmittingExpense(true);
    try {
      await axios.post(`${API}/accountant/record-expense`, {
        project_id: newExpense.project_id,
        category: newExpense.category,
        description: newExpense.description || `${newExpense.category} expense`,
        amount: parseFloat(newExpense.amount),
        payment_method: newExpense.payment_method || 'cash',
        vendor_name: newExpense.vendor_name || null,
        reference: newExpense.transaction_id || null,
      }, { withCredentials: true });
      toast.success('Expense recorded');
      setShowSubmitConfirm(false);
      setAddExpenseOpen(false);
      setMobileExpenseDialog(false);
      setNewExpense({ project_id: '', category: 'material', amount: '', vendor_name: '', description: '', payment_method: 'cash', transaction_id: '' });
      fetchCashbook(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to record expense');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handlePrintReceipt = (entry) => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Payment Receipt</title>
      <style>body{font-family:Arial;padding:40px;max-width:600px;margin:auto}
      h1{text-align:center;color:#333;border-bottom:2px solid #d97706;padding-bottom:10px}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
      .label{color:#666;font-weight:500}.value{font-weight:600}
      .amount{font-size:24px;text-align:center;color:#059669;margin:20px 0}
      .footer{text-align:center;margin-top:30px;color:#999;font-size:12px}
      @media print{button{display:none}}</style></head><body>
      <h1>My Home USB</h1><p style="text-align:center;color:#666">Payment Receipt</p>
      <div class="amount">${fmtFull(entry.amount)}</div>
      <div class="row"><span class="label">Date</span><span class="value">${new Date(entry.approved_at || entry.payment_date || entry.created_at).toLocaleDateString('en-IN')}</span></div>
      <div class="row"><span class="label">Project</span><span class="value">${entry.project_name || 'N/A'}</span></div>
      <div class="row"><span class="label">Mode</span><span class="value">${entry.payment_mode || entry.payment_method || 'Cash'}</span></div>
      <div class="footer">Generated on ${new Date().toLocaleString('en-IN')}<br>My Home USB - Urban Space Builders</div>
      <div style="text-align:center;margin-top:20px">
        <button onclick="window.print()" style="padding:8px 24px;background:#d97706;color:#fff;border:none;border-radius:6px;cursor:pointer">Print / Download PDF</button>
      </div></body></html>`);
    w.document.close();
  };

  const projectsList = cashbookData?.projects || projects || [];

  return (
    <div className="space-y-4" data-testid="cashbook-tab">
      {!expenseOnly && (
      <>
      {/* Top KPI cards: Overall Income / Expense / Balance.
          Each card is clickable — opens an itemised drilldown showing
          every contributing row. The Expense card is especially important
          because the headline number includes the hidden "Other" category
          rows (e.g. uncategorised manual expenses) that aren't visible on
          the Direct Expense tab below.
          Feb 26 2026 — Profit (all-time cumulative) card removed per user
          request; only 3 cards now show. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-cards">
        <Card
          className="border-l-4 border-l-green-500 bg-gradient-to-br from-green-50 to-white cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setDrilldown({ type: 'category', category: 'overall_income', entries: incomeEntries, label: 'Overall Income' })}
          data-testid="kpi-card-income"
          title="Click to see all income entries"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Overall Income</p>
                <p className="text-2xl font-bold text-green-700 mt-1"><MaskedValue value={totals.total_income || 0} className="text-green-700" formatFn={fmtFull} testId="kpi-overall-income" /></p>
                <p className="text-[10px] text-gray-400 mt-0.5">For selected period</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50 to-white cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setDrilldown({ type: 'category', category: 'overall_expense', entries: allExpenseEntries, label: 'All Expense' })}
          data-testid="kpi-card-expense"
          title="Click to see all expense entries (includes Other / uncategorised)"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Expense</p>
                <p className="text-2xl font-bold text-red-600 mt-1"><MaskedValue value={totals.total_expense || 0} className="text-red-600" formatFn={fmtFull} testId="kpi-expense" /></p>
                <p className="text-[10px] text-gray-400 mt-0.5">For selected period</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {(() => {
          const bal = (totals.total_income || 0) - (totals.total_expense || 0);
          const isPos = bal >= 0;
          return (
            <Card
              className={`border-l-4 ${isPos ? 'border-l-blue-500 bg-gradient-to-br from-blue-50 to-white' : 'border-l-orange-500 bg-gradient-to-br from-orange-50 to-white'} cursor-pointer hover:shadow-md transition-shadow`}
              onClick={() => setDrilldown({ type: 'category', category: 'overall_expense', entries: allExpenseEntries, label: 'All Expense (Balance contribution)' })}
              data-testid="kpi-card-balance"
              title="Click to see expense rows driving the balance"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Balance</p>
                    <p className={`text-2xl font-bold mt-1 ${isPos ? 'text-blue-700' : 'text-orange-600'}`}><MaskedValue value={bal} className={isPos ? 'text-blue-700' : 'text-orange-600'} formatFn={fmtFull} testId="kpi-balance" /></p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Income − Expense (period)</p>
                  </div>
                  <div className={`h-10 w-10 rounded-full ${isPos ? 'bg-blue-100' : 'bg-orange-100'} flex items-center justify-center`}>
                    <Wallet className={`h-5 w-5 ${isPos ? 'text-blue-600' : 'text-orange-600'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* Feb 26 2026 — Per-bucket Cashbook summary cards (matches the Carry
          Forward tab visual). Each bucket Expense = live Cashbook expense
          for that payment_mode + Carry-Forward Expense the Accountant
          entered in the Lock Closing Balance dialog for that bucket. Same
          for Income. So Cash Expense ≠ 0 even when no live expense rows
          exist as long as the lock has a non-zero Cash → Expense value. */}
      {(() => {
        const cbBuckets = [
          { key: 'cash',             lockKey: 'cash',             label: 'Cash',         accent: 'border-l-amber-500 bg-amber-50/40',   Icon: Banknote },
          { key: 'current_account',  lockKey: 'current_account',  label: 'HDFC Current', accent: 'border-l-blue-500 bg-blue-50/40',     Icon: Landmark },
          { key: 'savings_account',  lockKey: 'savings',          label: 'HDFC Savings', accent: 'border-l-emerald-500 bg-emerald-50/40', Icon: PiggyBank },
          { key: 'cheque',           lockKey: 'cheque',           label: 'Cheque',       accent: 'border-l-violet-500 bg-violet-50/40', Icon: FileText },
          { key: 'direct_transfer',  lockKey: 'direct_transfer',  label: 'Cash DT',      accent: 'border-l-rose-500 bg-rose-50/40',     Icon: TrendingUp },
        ];
        const lockBuckets = cashbookData?.closing_balance_buckets || {};
        // NOTE: lock.income values flow into the live cashbook via the
        // `carry_forward_lock` sync in the backend (each non-zero lock
        // income is written to db.income with the matching payment_mode).
        // So `inc[key]` already includes them — adding cfInc here would
        // double-count. lock.expense has NO sync sibling, so we add it.
        const cfExp = (lk) => Number((lockBuckets[lk] || {}).expense || 0);
        const incFor = (b) => (inc[b.key] || 0);
        const expFor = (b) => (exp[b.key] || 0) + cfExp(b.lockKey);
        const totalInc = cbBuckets.reduce((s, b) => s + incFor(b), 0);
        const totalExp = cbBuckets.reduce((s, b) => s + expFor(b), 0);
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5" data-testid="cashbook-bucket-cards">
            {cbBuckets.map(b => {
              const i = incFor(b);
              const e = expFor(b);
              const bal = i - e;
              const Icon = b.Icon;
              const hasCf = cfExp(b.lockKey) > 0;
              return (
                <div
                  key={b.key}
                  className={`rounded-lg border-l-4 ${b.accent} p-3 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all`}
                  data-testid={`cb-bucket-${b.key}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleModeClick(b.key)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') handleModeClick(b.key); }}
                  title={`View all ${b.label} income & expense entries`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">
                    <Icon className="h-3 w-3" /> {b.label}
                    {hasCf && <span className="ml-auto text-[8px] font-bold text-violet-600 bg-violet-100 px-1 rounded">+CF</span>}
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-emerald-700">Income</span>
                    <span className="font-semibold text-emerald-700"><MaskedValue value={i} className="text-emerald-700" /></span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] mt-0.5">
                    <span className="text-rose-700">Expense</span>
                    <span className="font-semibold text-rose-700"><MaskedValue value={e} className="text-rose-700" /></span>
                  </div>
                  <div className="border-t mt-2 pt-1.5 flex items-baseline justify-between text-[11px]">
                    <span className="text-gray-700">Balance</span>
                    <span className={`font-bold ${bal >= 0 ? 'text-gray-900' : 'text-rose-700'}`}><MaskedValue value={bal} className={bal >= 0 ? 'text-gray-900' : 'text-rose-700'} /></span>
                  </div>
                </div>
              );
            })}
            {/* Total card — dark theme to match the Carry Forward tab.
                Clicking opens a combined Income+Expense drilldown across all modes. */}
            <div
              className="rounded-lg p-3 shadow-sm bg-slate-900 text-white cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all"
              data-testid="cb-bucket-total"
              role="button"
              tabIndex={0}
              onClick={() => setDrilldown({ type: 'mode', mode: 'all', incomeEntries: incomeEntries, expenseEntries: allExpenseEntries, label: 'All Channels (Total)' })}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setDrilldown({ type: 'mode', mode: 'all', incomeEntries: incomeEntries, expenseEntries: allExpenseEntries, label: 'All Channels (Total)' }); }}
              title="View all income & expense entries across every channel"
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-300 font-semibold mb-2">
                <TrendingUp className="h-3 w-3" /> Total
              </div>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-emerald-300">Income</span>
                <span className="font-semibold"><MaskedValue value={totalInc} className="text-white" /></span>
              </div>
              <div className="flex items-baseline justify-between text-[11px] mt-0.5">
                <span className="text-rose-300">Expense</span>
                <span className="font-semibold"><MaskedValue value={totalExp} className="text-white" /></span>
              </div>
              <div className="border-t border-slate-700 mt-2 pt-1.5 flex items-baseline justify-between text-[11px]">
                <span className="text-slate-300">Balance</span>
                <span className={`font-bold ${(totalInc - totalExp) >= 0 ? 'text-white' : 'text-rose-300'}`}><MaskedValue value={totalInc - totalExp} className={(totalInc - totalExp) >= 0 ? 'text-white' : 'text-rose-300'} /></span>
              </div>
            </div>
          </div>
        );
      })()}

      </>
      )}

      {/* Date / Month / Year Filters — unified (hidden in expense-only, merged into top bar) */}
      {!expenseOnly && (
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <CashbookDateFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              setDateFrom={setDateFrom}
              setDateTo={setDateTo}
              testIdPrefix="cashbook"
              accent="amber"
            />
            <ProjectSearchSelect
              projects={projectsList}
              value={filterProject}
              onChange={setFilterProject}
              placeholder="All Projects"
              testId="cashbook-project-filter"
              width="w-64"
            />
            <div className="flex items-center gap-2">
              {filterProject && (
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setFilterProject('')}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
              {loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Expense-only top bar: Direct|Indirect (left) + ALL filters (right, full width) */}
      {expenseOnly && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Left: small segmented Direct | Indirect */}
              <div className="inline-flex bg-gray-100 rounded-lg p-0.5 self-start">
                <button
                  onClick={() => setSubTab('expense')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors gap-1 inline-flex items-center ${subTab === 'expense' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  data-testid="expense-only-direct-tab"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" /> Direct
                </button>
                <button
                  onClick={() => setSubTab('indirect')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors gap-1 inline-flex items-center ${subTab === 'indirect' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  data-testid="expense-only-indirect-tab"
                >
                  <PieChart className="h-3.5 w-3.5" /> Indirect
                </button>
              </div>
              {/* Right: All filters in one row, full width */}
              <div className="flex flex-wrap items-center gap-2 lg:justify-end flex-1">
                <CashbookDateFilter
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  setDateFrom={setDateFrom}
                  setDateTo={setDateTo}
                  testIdPrefix="exponly"
                  accent="red"
                />
                <ProjectSearchSelect
                  projects={projectsList}
                  value={filterProject}
                  onChange={setFilterProject}
                  placeholder="All Projects"
                  testId="exponly-project-filter"
                  width="w-64"
                />
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-36 h-9 text-xs" data-testid="exponly-source-filter"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="approval">Approval</SelectItem>
                  </SelectContent>
                </Select>
                {loading && <RefreshCw className="h-4 w-4 animate-spin text-red-600" />}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Income / Direct Expense / Indirect Expense Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        {!expenseOnly && (
          <TabsList className="w-full grid grid-cols-3 mb-3">
            <TabsTrigger value="income" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800 gap-1.5" data-testid="cashbook-income-tab">
              <ArrowDownRight className="h-4 w-4" /> Income ({incomeEntries.length})
            </TabsTrigger>
            <TabsTrigger value="expense" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800 gap-1.5" data-testid="cashbook-expense-tab">
              <ArrowUpRight className="h-4 w-4" /> <span className="hidden sm:inline">Direct </span>Expense ({allExpenseEntries.length})
            </TabsTrigger>
            <TabsTrigger value="indirect" className="data-[state=active]:bg-violet-100 data-[state=active]:text-violet-800 gap-1.5" data-testid="cashbook-indirect-tab">
              <PieChart className="h-4 w-4" /> Indirect
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="income">
          <IncomeTabsView
            incomeEntries={incomeEntries}
            classifyMode={classifyMode}
            onView={(entry) => { setSelectedEntry(entry); setViewDialog(true); }}
            onPrint={handlePrintReceipt}
            onDelete={handleDeleteIncome}
          />
        </TabsContent>

        <TabsContent value="expense">
          {(() => {
            // Apply source filter at the category-total level too, so the cards reflect active filters
            const srcMatch = (e) => sourceFilter === 'all' || (e.source === 'approval' ? 'approval' : 'manual') === sourceFilter;
            const byCat = {
              material: allExpenseEntries.filter(e => e.expense_type === 'material' && srcMatch(e)),
              labour: allExpenseEntries.filter(e => e.expense_type === 'labour' && srcMatch(e)),
              petty_cash: allExpenseEntries.filter(e => e.expense_type === 'petty_cash' && srcMatch(e)),
            };
            const sumAmt = (arr) => arr.reduce((s, e) => s + (e.amount || 0), 0);
            const cards = [
              { key: 'material', label: 'Material', icon: Building2, gradient: 'from-blue-500 to-blue-600', ring: 'ring-blue-600', bg: 'bg-blue-50', count: byCat.material.length, total: sumAmt(byCat.material) },
              { key: 'labour', label: 'Labour', icon: Wallet, gradient: 'from-purple-500 to-purple-600', ring: 'ring-purple-600', bg: 'bg-purple-50', count: byCat.labour.length, total: sumAmt(byCat.labour) },
              { key: 'petty_cash', label: 'Petty Cash', icon: Banknote, gradient: 'from-amber-500 to-amber-600', ring: 'ring-amber-600', bg: 'bg-amber-50', count: byCat.petty_cash.length, total: sumAmt(byCat.petty_cash) },
            ];
            if (expenseOnly) {
              // Colorful full cards
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {cards.map(c => {
                    const Icon = c.icon;
                    const active = expenseSubTab === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setExpenseSubTab(c.key)}
                        data-testid={`expense-filter-${c.key}`}
                        className={`text-left rounded-xl p-4 bg-gradient-to-br ${c.gradient} text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.02] ${active ? `ring-2 ring-offset-2 ${c.ring}` : 'opacity-90'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className="h-5 w-5 opacity-90" />
                          <Badge className="bg-white/20 text-white border-0 text-[10px]">{c.count} entries</Badge>
                        </div>
                        <p className="text-sm font-medium opacity-90">{c.label}</p>
                        <p className="text-2xl font-bold mt-1">
                          <MaskedValue value={c.total} className="text-white" />
                        </p>
                      </button>
                    );
                  })}
                  <div className="sm:col-span-3 flex justify-end">
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1 h-8 text-xs" onClick={() => {
                      if (window.innerWidth < 768) { setMobileExpenseDialog(true); } else { setAddExpenseOpen(true); }
                    }} data-testid="add-expense-btn">
                      <Plus className="h-3.5 w-3.5" /> Add Expense
                    </Button>
                  </div>
                </div>
              );
            }
            // Fallback: legacy pill style for the regular Cashbook view
            const tabs = [
              { key: 'material', label: 'Material', accent: 'bg-blue-600 hover:bg-blue-700', chip: 'bg-blue-50 text-blue-700 border-blue-200', count: byCat.material.length, total: sumAmt(byCat.material) },
              { key: 'labour', label: 'Labour', accent: 'bg-purple-600 hover:bg-purple-700', chip: 'bg-purple-50 text-purple-700 border-purple-200', count: byCat.labour.length, total: sumAmt(byCat.labour) },
              { key: 'petty_cash', label: 'Petty Cash', accent: 'bg-amber-600 hover:bg-amber-700', chip: 'bg-amber-50 text-amber-700 border-amber-200', count: byCat.petty_cash.length, total: sumAmt(byCat.petty_cash) },
            ];
            return (
              <div className="flex flex-wrap gap-2 mb-3">
                {tabs.map(t => (
                  <Button
                    key={t.key}
                    size="sm"
                    variant={expenseSubTab === t.key ? 'default' : 'outline'}
                    className={`text-xs h-8 px-3 gap-2 ${expenseSubTab === t.key ? `${t.accent} text-white border-transparent` : ''}`}
                    onClick={() => setExpenseSubTab(t.key)}
                    data-testid={`expense-filter-${t.key}`}
                  >
                    {t.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${expenseSubTab === t.key ? 'bg-white/20 text-white border-white/30' : t.chip}`}>
                      {t.count} · <MaskedValue value={t.total} className={expenseSubTab === t.key ? 'text-white' : ''} />
                    </span>
                  </Button>
                ))}
                <div className="ml-auto">
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1 sm:gap-1.5 h-8 text-xs" onClick={() => {
                    if (window.innerWidth < 768) { setMobileExpenseDialog(true); } else { setAddExpenseOpen(true); }
                  }} data-testid="add-expense-btn">
                    <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Add </span>Expense
                  </Button>
                </div>
              </div>
            );
          })()}
          <Card>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="cashbook-expense-table">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Date & Time</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Vendor</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Source</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Desktop inline add expense row - hidden on mobile */}
                    {addExpenseOpen && (
                      <tr className="border-b bg-red-50/50 border-l-4 border-l-red-400 hidden md:table-row">
                        <td className="px-2 py-2 text-center"><span className="text-[10px] font-bold text-red-500">NEW</span></td>
                        <td className="px-1 py-1.5">
                          <Select value={newExpense.category} onValueChange={v => setNewExpense(p => ({...p, category: v}))}>
                            <SelectTrigger className="h-7 text-[11px] w-24 bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="labour">Labour</SelectItem>
                              <SelectItem value="petty_cash">Petty Cash</SelectItem>
                              <SelectItem value="indirect">Indirect</SelectItem>
                              <SelectItem value="transport">Transport</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1.5 text-[10px] text-gray-400 whitespace-nowrap">
                          {new Date().toLocaleDateString('en-IN')} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-1 py-1.5">
                          <Select value={newExpense.payment_method} onValueChange={v => setNewExpense(p => ({...p, payment_method: v}))}>
                            <SelectTrigger className="h-7 text-[11px] w-24 bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="savings_account">HDFC SAVINGS</SelectItem>
                              <SelectItem value="current_account">HDFC CURRENT</SelectItem>
                              <SelectItem value="direct_transfer">CASH D/T</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="cheque">Cheque</SelectItem>
                              <SelectItem value="escrow">Escrow</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1.5">
                          <NumericInput placeholder="Amount" className="h-7 text-[11px] w-24 bg-white text-right"
                            value={newExpense.amount} onChange={e => setNewExpense(p => ({...p, amount: e.target.value}))} />
                        </td>
                        <td className="px-1 py-1.5">
                          <Input placeholder="Vendor" className="h-7 text-[11px] w-24 bg-white"
                            value={newExpense.vendor_name} onChange={e => setNewExpense(p => ({...p, vendor_name: e.target.value}))} />
                        </td>
                        <td className="px-1 py-1.5">
                          <Select value={newExpense.project_id} onValueChange={v => setNewExpense(p => ({...p, project_id: v}))}>
                            <SelectTrigger className="h-7 text-[11px] w-32 bg-white"><SelectValue placeholder="Project" /></SelectTrigger>
                            <SelectContent>
                              {projectsList.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name || p.project_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1.5 text-center text-[10px] text-gray-400">Manual</td>
                        <td className="px-1 py-1.5 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <Button size="sm" className="h-7 text-[11px] bg-red-600 hover:bg-red-700 px-2.5" onClick={handleExpenseSubmitClick} data-testid="submit-expense-row-btn">Submit</Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400" onClick={() => { setAddExpenseOpen(false); setNewExpense({ project_id: '', category: 'material', amount: '', vendor_name: '', description: '', payment_method: 'cash', transaction_id: '' }); }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
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
                          {new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          {' '}<span className="text-gray-400">{new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(entry.payment_method || entry.payment_mode)]}`}>
                            {MODE_LABELS[classifyMode(entry.payment_method || entry.payment_mode)] || 'Cash'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-red-600"><MaskedValue value={entry.amount} className="text-red-600" /></td>
                        <td className="px-3 py-2 text-gray-600">{entry.vendor_name || '-'}</td>
                        <td className="px-3 py-2 font-medium">{entry.project_name || 'N/A'}</td>
                        <td className="px-3 py-2 text-center" data-testid={`expense-source-${i}`}>
                          <Badge className={entry.source === 'approval' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}>
                            {entry.source === 'approval' ? 'Approval' : 'Manual'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setSelectedEntry(entry); setViewDialog(true); }}><Eye className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-600" onClick={() => handlePrintReceipt(entry)}><Printer className="h-3 w-3" /></Button>
                            {entry.expense_type === 'petty_cash' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                                onClick={() => handleSendPettyCashBackToApprovals(entry)}
                                data-testid={`expense-send-back-btn-${entry.expense_id || entry.request_id || i}`}
                                title="Send back to Approvals → Petty Cash"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            ) : entry.expense_type === 'material' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                                onClick={() => handleSendMaterialBackToApprovals(entry)}
                                data-testid={`expense-mat-send-back-btn-${entry.expense_id || entry.request_id || i}`}
                                title="Send back to Approvals → Materials"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteExpense(entry)}
                                data-testid={`expense-delete-btn-${entry.expense_id || entry.request_id || i}`}
                                title="Delete expense"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400">No expense entries found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indirect">
          <IndirectExpenseSection userRole={userRole} />
        </TabsContent>
      </Tabs>
      <Dialog open={viewDialog} onOpenChange={(o) => { setViewDialog(o); if (!o) setEditingIncome(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Transaction Details</span>
              {selectedEntry?.income_id && !editingIncome && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={startEditIncome} data-testid="income-edit-btn">
                  <Edit className="h-3 w-3" /> Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900">{fmtFull(selectedEntry.amount)}</p>
                <Badge className={selectedEntry.income_id ? 'bg-green-100 text-green-700 mt-1' : 'bg-red-100 text-red-700 mt-1'}>
                  {selectedEntry.income_id ? 'Income' : 'Expense'}
                </Badge>
              </div>
              {!editingIncome ? (
                <div className="space-y-2 text-sm">
                  {[
                    ['Project', selectedEntry.project_name],
                    ['Description', selectedEntry.stage || selectedEntry.description],
                    ['Date', new Date(selectedEntry.approved_at || selectedEntry.payment_date || selectedEntry.created_at).toLocaleString('en-IN')],
                    ['Mode', MODE_LABELS[classifyMode(selectedEntry.payment_mode || selectedEntry.payment_method)] || selectedEntry.payment_mode || selectedEntry.payment_method || 'Cash'],
                    ['Reference / Txn', selectedEntry.reference_number],
                    ['Cheque No', selectedEntry.cheque_number],
                    ['Bank', selectedEntry.bank_name],
                    ['Vendor', selectedEntry.vendor_name],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b pb-1">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 text-sm bg-amber-50/40 border border-amber-200 rounded-md p-3" data-testid="income-edit-form">
                  <p className="text-xs text-amber-700 font-medium">Edit payment details</p>
                  <div>
                    <Label className="text-xs">Payment Mode *</Label>
                    <Select value={editIncomeForm.payment_mode} onValueChange={v => setEditIncomeForm(f => ({ ...f, payment_mode: v }))}>
                      <SelectTrigger className="h-8 text-xs mt-1" data-testid="income-edit-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="savings_account">HDFC SAVINGS</SelectItem>
                        <SelectItem value="current_account">HDFC CURRENT</SelectItem>
                        <SelectItem value="direct_transfer">CASH D/T</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="escrow">Escrow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editIncomeForm.payment_mode === 'cheque' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Cheque No</Label>
                        <Input className="h-8 text-xs mt-1" value={editIncomeForm.cheque_number} onChange={e => setEditIncomeForm(f => ({ ...f, cheque_number: e.target.value }))} data-testid="income-edit-cheque" />
                      </div>
                      <div>
                        <Label className="text-xs">Bank</Label>
                        <Input className="h-8 text-xs mt-1" value={editIncomeForm.bank_name} onChange={e => setEditIncomeForm(f => ({ ...f, bank_name: e.target.value }))} data-testid="income-edit-bank" />
                      </div>
                    </div>
                  ) : (
                    editIncomeForm.payment_mode !== 'cash' && (
                      <div>
                        <Label className="text-xs">Reference / Txn ID</Label>
                        <Input className="h-8 text-xs mt-1" value={editIncomeForm.reference_number} onChange={e => setEditIncomeForm(f => ({ ...f, reference_number: e.target.value }))} data-testid="income-edit-ref" />
                      </div>
                    )
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingIncome(false)} disabled={savingIncomeEdit}>Cancel</Button>
                    <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSaveIncomeEdit} disabled={savingIncomeEdit} data-testid="income-edit-save">
                      {savingIncomeEdit ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null} Save
                    </Button>
                  </div>
                </div>
              )}
              {!editingIncome && (
                <Button className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => handlePrintReceipt(selectedEntry)}>
                  <Printer className="h-4 w-4 mr-2" /> Print Receipt
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Submit Confirmation */}
      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-center text-lg">Confirm Expense</DialogTitle></DialogHeader>
          <div className="text-center space-y-3 py-2">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <FileText className="h-7 w-7 text-red-600" />
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-bold text-red-600">{fmtFull(parseFloat(newExpense.amount) || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="font-medium">{newExpense.category}</span></div>
              {newExpense.vendor_name && <div className="flex justify-between"><span className="text-gray-500">Vendor</span><span className="font-medium">{newExpense.vendor_name}</span></div>}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleAddExpense} disabled={submittingExpense}>
              {submittingExpense ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile-only Add Expense Dialog */}
      <Dialog open={mobileExpenseDialog} onOpenChange={(open) => { setMobileExpenseDialog(open); if (!open) setNewExpense({ project_id: '', category: 'material', amount: '', vendor_name: '', description: '', payment_method: 'cash', transaction_id: '' }); }}>
        <DialogContent className="max-w-[95vw] rounded-xl" data-testid="mobile-add-expense-dialog">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <Plus className="h-4 w-4 text-red-600" />
              </div>
              Add Expense
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                <Select value={newExpense.category} onValueChange={v => setNewExpense(p => ({...p, category: v}))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="labour">Labour</SelectItem>
                    <SelectItem value="petty_cash">Petty Cash</SelectItem>
                    <SelectItem value="indirect">Indirect</SelectItem>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Payment Mode</Label>
                <Select value={newExpense.payment_method} onValueChange={v => setNewExpense(p => ({...p, payment_method: v}))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="savings_account">HDFC SAVINGS</SelectItem>
                    <SelectItem value="current_account">HDFC CURRENT</SelectItem>
                    <SelectItem value="direct_transfer">CASH D/T</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="escrow">Escrow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Amount</Label>
              <NumericInput placeholder="Enter amount" className="h-9 text-sm"
                value={newExpense.amount} onChange={e => setNewExpense(p => ({...p, amount: e.target.value}))}
                data-testid="mobile-expense-amount" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Project</Label>
              <Select value={newExpense.project_id} onValueChange={v => setNewExpense(p => ({...p, project_id: v}))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projectsList.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name || p.project_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Vendor</Label>
              <Input placeholder="Vendor name (optional)" className="h-9 text-sm"
                value={newExpense.vendor_name} onChange={e => setNewExpense(p => ({...p, vendor_name: e.target.value}))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Description</Label>
              <Input placeholder="Brief description (optional)" className="h-9 text-sm"
                value={newExpense.description} onChange={e => setNewExpense(p => ({...p, description: e.target.value}))} />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => { setMobileExpenseDialog(false); setNewExpense({ project_id: '', category: 'material', amount: '', vendor_name: '', description: '', payment_method: 'cash', transaction_id: '' }); }}>
              Cancel
            </Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleExpenseSubmitClick} disabled={submittingExpense}
              data-testid="mobile-expense-submit">
              {submittingExpense ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ CHEQUE MANAGEMENT TAB ============
function ChequeManagementTab({ projects }) {
  const [cheques, setCheques] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [vendorSuspense, setVendorSuspense] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [addDialog, setAddDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [smartPayDialog, setSmartPayDialog] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState(null);
  const [suspenseAlert, setSuspenseAlert] = useState(null);

  // Default to current month/year
  const _cTody = new Date();
  const _cStart = `${_cTody.getFullYear()}-${String(_cTody.getMonth() + 1).padStart(2, '0')}-01`;
  const _cEnd = (() => { const d = new Date(_cTody.getFullYear(), _cTody.getMonth() + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [chqDateFrom, setChqDateFrom] = useState(_cStart);
  const [chqDateTo, setChqDateTo] = useState(_cEnd);

  const [chequeForm, setChequeForm] = useState({
    cheque_number: '', bank_name: '', branch_name: '', account_number: '',
    ifsc_code: '', amount: '', cheque_date: '', cheque_type: 'incoming',
    party_name: '', party_type: 'client', project_id: '', is_post_dated: false,
    reminder_date: '', remarks: ''
  });
  const [statusForm, setStatusForm] = useState({
    status: '', deposit_date: '', clearance_date: '', bounce_reason: '', bounce_charges: '', remarks: ''
  });
  const [smartPayForm, setSmartPayForm] = useState({
    cheque_id: '', expense_project_id: '', expense_category: 'material',
    expense_description: '', expense_amount: '', vendor_name: '',
    use_suspense: false, suspense_amount_to_use: 0, remarks: ''
  });

  const fetchChequeData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [chequesRes, remindersRes, suspenseRes] = await Promise.all([
        axios.get(`${API}/accountant/cheques`),
        axios.get(`${API}/accountant/cheques/reminders`),
        axios.get(`${API}/accountant/all-vendor-suspense`),
      ]);
      setCheques(chequesRes.data);
      setReminders(remindersRes.data);
      setVendorSuspense(suspenseRes.data);
    } catch (err) {
      console.error('Failed to load cheques:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChequeData(); }, [fetchChequeData]);

  const handleAddCheque = async () => {
    if (!chequeForm.cheque_number || !chequeForm.bank_name || !chequeForm.amount || !chequeForm.party_name) {
      toast.error('Please fill required fields'); return;
    }
    try {
      await axios.post(`${API}/accountant/cheques`, {
        ...chequeForm, amount: parseFloat(chequeForm.amount),
        cheque_date: new Date(chequeForm.cheque_date).toISOString(),
        reminder_date: chequeForm.reminder_date ? new Date(chequeForm.reminder_date).toISOString() : null
      });
      toast.success('Cheque record added');
      setAddDialog(false);
      fetchChequeData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add cheque'); }
  };

  const handleUpdateStatus = async () => {
    try {
      await axios.patch(`${API}/accountant/cheques/${selectedCheque.cheque_id}/status`, {
        status: statusForm.status,
        deposit_date: statusForm.deposit_date ? new Date(statusForm.deposit_date).toISOString() : null,
        clearance_date: statusForm.clearance_date ? new Date(statusForm.clearance_date).toISOString() : null,
        bounce_reason: statusForm.bounce_reason || null,
        bounce_charges: parseFloat(statusForm.bounce_charges) || 0,
        remarks: statusForm.remarks || null
      });
      toast.success('Cheque status updated');
      setStatusDialog(false);
      fetchChequeData(false);
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to update cheque status');
    }
  };

  const checkVendorSuspense = async (vendorName) => {
    if (!vendorName) { setSuspenseAlert(null); return; }
    try {
      const res = await axios.get(`${API}/accountant/vendor-suspense/${encodeURIComponent(vendorName)}`);
      if (res.data.suspense_balance > 0) {
        setSuspenseAlert(res.data);
        setSmartPayForm(prev => ({ ...prev, use_suspense: true, suspense_amount_to_use: res.data.suspense_balance }));
      } else { setSuspenseAlert(null); }
    } catch { setSuspenseAlert(null); }
  };

  const handleSmartPayment = async () => {
    if (!smartPayForm.cheque_id || !smartPayForm.expense_project_id || !smartPayForm.expense_amount || !smartPayForm.vendor_name) {
      toast.error('Fill all required fields'); return;
    }
    try {
      const res = await axios.post(`${API}/accountant/cheque-payment`, {
        ...smartPayForm, expense_amount: parseFloat(smartPayForm.expense_amount),
        suspense_amount_to_use: smartPayForm.use_suspense ? parseFloat(smartPayForm.suspense_amount_to_use) || 0 : 0,
      });
      toast.success(res.data.message);
      setSmartPayDialog(false);
      setSuspenseAlert(null);
      setSmartPayForm({ cheque_id: '', expense_project_id: '', expense_category: 'material', expense_description: '', expense_amount: '', vendor_name: '', use_suspense: false, suspense_amount_to_use: 0, remarks: '' });
      fetchChequeData(false);
    } catch (error) { toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Payment failed'); }
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
    // Date range filter (by cheque_date)
    let withinDate = true;
    if (chqDateFrom || chqDateTo) {
      const d = c.cheque_date ? new Date(c.cheque_date).toISOString().slice(0, 10) : '';
      if (!d) withinDate = false;
      else {
        if (chqDateFrom && d < chqDateFrom) withinDate = false;
        if (chqDateTo && d > chqDateTo) withinDate = false;
      }
    }
    if (!withinDate) return false;
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'incoming') return matchesSearch && c.cheque_type === 'incoming';
    if (activeTab === 'outgoing') return matchesSearch && c.cheque_type === 'outgoing';
    if (activeTab === 'pending') return matchesSearch && ['issued', 'deposited', 'post_dated'].includes(c.status);
    if (activeTab === 'bounced') return matchesSearch && c.status === 'bounced';
    return matchesSearch;
  });

  // Stats respect the date range (but ignore activeTab + searchTerm so cards can still navigate)
  const chequesInRange = cheques.filter(c => {
    if (!chqDateFrom && !chqDateTo) return true;
    const d = c.cheque_date ? new Date(c.cheque_date).toISOString().slice(0, 10) : '';
    if (!d) return false;
    if (chqDateFrom && d < chqDateFrom) return false;
    if (chqDateTo && d > chqDateTo) return false;
    return true;
  });

  const stats = {
    total: chequesInRange.length, incoming: chequesInRange.filter(c => c.cheque_type === 'incoming').length,
    outgoing: chequesInRange.filter(c => c.cheque_type === 'outgoing').length,
    pending: chequesInRange.filter(c => ['issued', 'deposited', 'post_dated'].includes(c.status)).length,
    bounced: chequesInRange.filter(c => c.status === 'bounced').length,
    cleared: chequesInRange.filter(c => c.status === 'cleared').length,
  };
  const unclearedOutgoing = chequesInRange.filter(c => c.cheque_type === 'outgoing' && ['issued', 'post_dated'].includes(c.status));

  return (
    <div className="space-y-4" data-testid="cheque-management-tab">
      {/* Unified Date / Month / Year Filter */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CashbookDateFilter
              dateFrom={chqDateFrom}
              dateTo={chqDateTo}
              setDateFrom={setChqDateFrom}
              setDateTo={setChqDateTo}
              testIdPrefix="cheque"
              accent="amber"
            />
          </div>
        </CardContent>
      </Card>

      {reminders.length > 0 && (
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200" data-testid="cheque-reminders">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <Bell className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Post-Dated Cheque Reminders ({reminders.length})</p>
                {reminders.slice(0, 3).map(r => (
                  <div key={r.cheque_id} className="text-xs bg-white/50 rounded px-2 py-0.5 mt-1">
                    <span className="font-medium">{r.cheque_number}</span> - {r.party_name} - {fmtFull(r.amount)}
                    <span className="text-amber-600 ml-2">Due: {new Date(r.cheque_date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {vendorSuspense.length > 0 && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200" data-testid="vendor-suspense-summary">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-800 text-sm">Vendor Suspense Balances</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {vendorSuspense.map(v => (
                    <Badge key={v.vendor_name} className="bg-blue-100 text-blue-700 text-xs">{v.vendor_name}: {fmtFull(v.balance)}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New unified Cheque List View — Accountant scope: stats + filters + Request Open workflow */}
      <ChequeListView
        scope="accountant"
        userRole="accountant"
        onAction={(type, c) => {
          if (type === 'update_status') {
            setSelectedCheque(c);
            setStatusForm({
              status: c.status,
              deposit_date: c.deposit_date?.split('T')[0] || '',
              clearance_date: c.clearance_date?.split('T')[0] || '',
              bounce_reason: c.bounce_reason || '',
              bounce_charges: c.bounce_charges?.toString() || '',
              remarks: c.remarks || '',
            });
            setStatusDialog(true);
          }
        }}
      />

      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3" style={{display:'none'}}>
        {[
          { key: 'all', label: 'Total', value: stats.total, icon: FileText, bg: '' },
          { key: 'incoming', label: 'Incoming', value: stats.incoming, color: 'text-green-700', bg: 'bg-green-50' },
          { key: 'outgoing', label: 'Outgoing', value: stats.outgoing, color: 'text-amber-700', bg: 'bg-amber-50' },
          { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { key: 'bounced', label: 'Bounced', value: stats.bounced, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { key: 'cleared', label: 'Cleared', value: stats.cleared, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <Card key={s.key} className={`cursor-pointer hover:shadow-md ${s.bg}`} onClick={() => setActiveTab(s.key)}>
            <CardContent className="p-3 text-center">
              {s.icon && React.createElement(s.icon, { className: `h-4 w-4 mx-auto mb-0.5 ${s.color || 'text-gray-600'}` })}
              <p className={`text-xl font-bold ${s.color || ''}`}>{s.value}</p>
              <p className={`text-[10px] ${s.color || 'text-gray-500'}`}>{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card style={{display:'none'}}>
        <CardHeader className="border-b py-3 px-3 sm:px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
            <div className="flex flex-wrap gap-1">
              {['all', 'incoming', 'outgoing', 'pending', 'bounced'].map(tab => (
                <Button key={tab} size="sm" variant={activeTab === tab ? 'default' : 'ghost'}
                  className={`text-[10px] sm:text-xs h-6 sm:h-7 px-2 sm:px-3 ${activeTab === tab ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                  onClick={() => setActiveTab(tab)} data-testid={`cheque-filter-${tab}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input placeholder="Search cheques..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 w-full sm:w-48 h-8 text-xs" data-testid="search-cheques" />
              </div>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1 h-8 text-xs" onClick={() => setAddDialog(true)} data-testid="add-cheque-btn">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
              <Button size="sm" variant="outline" className="gap-1 h-8 border-blue-300 text-blue-700 text-xs" onClick={() => setSmartPayDialog(true)} data-testid="smart-pay-btn">
                <CreditCard className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Smart </span>Pay
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="cheque-table">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">CHEQUE NO</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">BANK</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">PARTY</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">PROJECT</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">TYPE</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">AMOUNT</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">DATE</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">STATUS</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">CRE</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCheques.length === 0 ? (
                    <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-500">No cheques found</td></tr>
                  ) : filteredCheques.map(cheque => {
                    const lockedForAccountant = cheque.cheque_type === 'incoming' && !cheque.is_opened && cheque.status !== 'cancelled';
                    const dateLabel = (() => {
                      if (!cheque.cheque_date) return '-';
                      const d = new Date(cheque.cheque_date);
                      return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    })();
                    return (
                    <tr key={cheque.cheque_id} className={`hover:bg-gray-50 ${lockedForAccountant ? 'bg-amber-50/30' : ''}`} data-testid={`cheque-row-${cheque.cheque_id}`}>
                      <td className="px-3 py-2">
                        <p className="font-mono font-medium">{cheque.cheque_number}</p>
                        {cheque.is_post_dated && <Badge variant="outline" className="text-purple-600 border-purple-300 text-[9px] mt-0.5">PDC</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{cheque.bank_name}</p>
                        {cheque.branch_name && <p className="text-[10px] text-gray-500">{cheque.branch_name}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{cheque.party_name}</p>
                        <Badge variant="outline" className="text-[9px]">{cheque.party_type === 'client' ? 'Client' : 'Vendor'}</Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{cheque.project_name || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={cheque.cheque_type === 'incoming' ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'}>
                          {cheque.cheque_type === 'incoming' ? 'IN' : 'OUT'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        <MaskedValue value={cheque.amount} className={cheque.cheque_type === 'incoming' ? 'text-green-600' : 'text-amber-600'} />
                      </td>
                      <td className="px-3 py-2">{dateLabel}</td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(cheque.status)}</td>
                      <td className="px-3 py-2 text-center">
                        {cheque.cheque_type === 'incoming' ? (
                          cheque.is_opened ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1" title={cheque.opened_by_name ? `Opened by ${cheque.opened_by_name}` : 'Opened'}>
                              <CheckCircle className="h-3 w-3" /> Opened
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1" title="Awaiting CRE release">
                              <Lock className="h-3 w-3" /> Locked
                            </Badge>
                          )
                        ) : (
                          <span className="text-[10px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled={lockedForAccountant}
                          title={lockedForAccountant ? 'Awaiting CRE release — ask CRE to open this cheque first' : 'Update status'}
                          onClick={() => {
                            if (lockedForAccountant) {
                              toast.warning('This cheque is awaiting CRE release. Ask CRE to open it before depositing/clearing.');
                              return;
                            }
                            setSelectedCheque(cheque);
                            setStatusForm({ status: cheque.status, deposit_date: cheque.deposit_date?.split('T')[0] || '', clearance_date: cheque.clearance_date?.split('T')[0] || '', bounce_reason: cheque.bounce_reason || '', bounce_charges: cheque.bounce_charges?.toString() || '', remarks: cheque.remarks || '' });
                            setStatusDialog(true);
                          }}
                          data-testid={`update-status-${cheque.cheque_id}`}
                        >
                          {lockedForAccountant ? <Lock className="h-3 w-3 text-amber-600" /> : <Edit className="h-3 w-3" />}
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Cheque Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-600" /> Add New Cheque</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cheque Number *</Label><Input value={chequeForm.cheque_number} onChange={e => setChequeForm({...chequeForm, cheque_number: e.target.value})} data-testid="input-cheque-number" /></div>
              <div><Label>Amount *</Label><NumericInput value={chequeForm.amount} onChange={e => setChequeForm({...chequeForm, amount: e.target.value})} data-testid="input-amount" /></div>
              <div><Label>Cheque Date *</Label><Input type="date" value={chequeForm.cheque_date} onChange={e => setChequeForm({...chequeForm, cheque_date: e.target.value})} data-testid="input-cheque-date" /></div>
              <div><Label>Type</Label>
                <Select value={chequeForm.cheque_type} onValueChange={v => setChequeForm({...chequeForm, cheque_type: v})}>
                  <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="incoming">Incoming</SelectItem><SelectItem value="outgoing">Outgoing</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Bank Name *</Label><Input value={chequeForm.bank_name} onChange={e => setChequeForm({...chequeForm, bank_name: e.target.value})} data-testid="input-bank-name" /></div>
              <div><Label>Branch</Label><Input value={chequeForm.branch_name} onChange={e => setChequeForm({...chequeForm, branch_name: e.target.value})} /></div>
              <div><Label>Party Name *</Label><Input value={chequeForm.party_name} onChange={e => setChequeForm({...chequeForm, party_name: e.target.value})} data-testid="input-party-name" /></div>
              <div><Label>Party Type</Label>
                <Select value={chequeForm.party_type} onValueChange={v => setChequeForm({...chequeForm, party_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="client">Client</SelectItem><SelectItem value="vendor">Vendor</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Project</Label>
                <Select value={chequeForm.project_id || 'none'} onValueChange={v => setChequeForm({...chequeForm, project_id: v === 'none' ? '' : v})}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name || p.project_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_post_dated" checked={chequeForm.is_post_dated} onChange={e => setChequeForm({...chequeForm, is_post_dated: e.target.checked})} className="h-4 w-4 rounded" />
              <Label htmlFor="is_post_dated" className="cursor-pointer text-sm">Post-Dated Cheque</Label>
            </div>
            {chequeForm.is_post_dated && <div><Label>Reminder Date</Label><Input type="date" value={chequeForm.reminder_date} onChange={e => setChequeForm({...chequeForm, reminder_date: e.target.value})} /></div>}
            <div><Label>Remarks</Label><Textarea value={chequeForm.remarks} onChange={e => setChequeForm({...chequeForm, remarks: e.target.value})} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCheque} className="bg-amber-600 hover:bg-amber-700" data-testid="save-cheque-btn"><CheckCircle className="h-4 w-4 mr-1" /> Save Cheque</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Update Cheque Status</DialogTitle></DialogHeader>
          {selectedCheque && (
            <div className="space-y-4">
              <Card className="bg-gray-50"><CardContent className="p-3">
                <p className="font-mono font-semibold">{selectedCheque.cheque_number}</p>
                <p className="text-sm text-gray-600">{selectedCheque.bank_name}</p>
                <p className="text-lg font-bold text-green-600 mt-1">{fmtFull(selectedCheque.amount)}</p>
              </CardContent></Card>
              <div><Label>Status</Label>
                <Select value={statusForm.status} onValueChange={v => setStatusForm({...statusForm, status: v})}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{CHEQUE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {statusForm.status === 'deposited' && <div><Label>Deposit Date</Label><Input type="date" value={statusForm.deposit_date} onChange={e => setStatusForm({...statusForm, deposit_date: e.target.value})} /></div>}
              {statusForm.status === 'cleared' && <div><Label>Clearance Date</Label><Input type="date" value={statusForm.clearance_date} onChange={e => setStatusForm({...statusForm, clearance_date: e.target.value})} /></div>}
              {statusForm.status === 'bounced' && (
                <>
                  <div><Label>Bounce Reason</Label>
                    <Select value={statusForm.bounce_reason} onValueChange={v => setStatusForm({...statusForm, bounce_reason: v})}>
                      <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Insufficient Funds">Insufficient Funds</SelectItem>
                        <SelectItem value="Signature Mismatch">Signature Mismatch</SelectItem>
                        <SelectItem value="Account Closed">Account Closed</SelectItem>
                        <SelectItem value="Date Issue">Date Issue</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Bounce Charges</Label><NumericInput value={statusForm.bounce_charges} onChange={e => setStatusForm({...statusForm, bounce_charges: e.target.value})} /></div>
                </>
              )}
              <div><Label>Remarks</Label><Textarea value={statusForm.remarks} onChange={e => setStatusForm({...statusForm, remarks: e.target.value})} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} className="bg-amber-600 hover:bg-amber-700" data-testid="update-status-btn"><CheckCircle className="h-4 w-4 mr-1" /> Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Smart Payment Dialog */}
      <Dialog open={smartPayDialog} onOpenChange={v => { setSmartPayDialog(v); if (!v) setSuspenseAlert(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-600" /> Smart Cheque Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {suspenseAlert && suspenseAlert.suspense_balance > 0 && (
              <Card className="bg-green-50 border-green-300" data-testid="suspense-auto-alert">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-semibold text-green-800 text-sm">Suspense Balance Available!</p>
                      <p className="text-xs text-green-700">{suspenseAlert.vendor_name} has {fmtFull(suspenseAlert.suspense_balance)} in suspense.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={smartPayForm.use_suspense} onChange={e => setSmartPayForm(prev => ({ ...prev, use_suspense: e.target.checked }))} className="h-4 w-4 rounded" />
                    <Label className="text-sm cursor-pointer">Use suspense balance ({fmtFull(suspenseAlert.suspense_balance)})</Label>
                  </div>
                  {smartPayForm.use_suspense && (
                    <div className="mt-2">
                      <Label className="text-xs">Amount to use from suspense</Label>
                      <NumericInput className="h-8 text-sm" value={smartPayForm.suspense_amount_to_use}
                        onChange={e => setSmartPayForm(prev => ({ ...prev, suspense_amount_to_use: e.target.value }))} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <div><Label>Select Cheque *</Label>
              <Select value={smartPayForm.cheque_id} onValueChange={v => setSmartPayForm(prev => ({ ...prev, cheque_id: v }))}>
                <SelectTrigger data-testid="smart-pay-cheque-select"><SelectValue placeholder="Select an outgoing cheque" /></SelectTrigger>
                <SelectContent>
                  {unclearedOutgoing.length === 0 && <SelectItem value="none" disabled>No uncleared outgoing cheques</SelectItem>}
                  {unclearedOutgoing.map(c => (<SelectItem key={c.cheque_id} value={c.cheque_id}>{c.cheque_number} - {c.party_name} - {fmtFull(c.amount)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Vendor Name *</Label>
              <Input value={smartPayForm.vendor_name} data-testid="smart-pay-vendor"
                onChange={e => setSmartPayForm(prev => ({ ...prev, vendor_name: e.target.value }))}
                onBlur={e => checkVendorSuspense(e.target.value)} placeholder="Vendor name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Project *</Label>
                <Select value={smartPayForm.expense_project_id} onValueChange={v => setSmartPayForm(prev => ({ ...prev, expense_project_id: v }))}>
                  <SelectTrigger data-testid="smart-pay-project"><SelectValue placeholder="Project" /></SelectTrigger>
                  <SelectContent>{projects.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name || p.project_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={smartPayForm.expense_category} onValueChange={v => setSmartPayForm(prev => ({ ...prev, expense_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem><SelectItem value="labour">Labour</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem><SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Expense Amount *</Label>
              <NumericInput value={smartPayForm.expense_amount} onChange={e => setSmartPayForm(prev => ({ ...prev, expense_amount: e.target.value }))} data-testid="smart-pay-amount" placeholder="Expense amount" />
            </div>
            <div><Label>Description</Label><Input value={smartPayForm.expense_description} onChange={e => setSmartPayForm(prev => ({ ...prev, expense_description: e.target.value }))} placeholder="e.g., Cement purchase" /></div>
            <div><Label>Remarks</Label><Textarea value={smartPayForm.remarks} onChange={e => setSmartPayForm(prev => ({ ...prev, remarks: e.target.value }))} rows={2} /></div>
            {smartPayForm.cheque_id && smartPayForm.expense_amount && (
              <Card className="bg-gray-50" data-testid="payment-summary">
                <CardContent className="p-3 space-y-1 text-sm">
                  <p className="font-semibold text-gray-700">Payment Summary</p>
                  {(() => {
                    const chq = unclearedOutgoing.find(c => c.cheque_id === smartPayForm.cheque_id);
                    const chequeAmt = chq?.amount || 0;
                    const expAmt = parseFloat(smartPayForm.expense_amount) || 0;
                    const susUse = smartPayForm.use_suspense ? parseFloat(smartPayForm.suspense_amount_to_use) || 0 : 0;
                    const fromCheque = Math.max(0, expAmt - susUse);
                    const excess = chequeAmt - fromCheque;
                    return (
                      <>
                        <div className="flex justify-between"><span className="text-gray-500">Cheque Amount</span><span className="font-bold">{fmtFull(chequeAmt)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Expense Amount</span><span className="font-bold text-red-600">{fmtFull(expAmt)}</span></div>
                        {susUse > 0 && <div className="flex justify-between"><span className="text-gray-500">From Suspense</span><span className="font-bold text-blue-600">-{fmtFull(susUse)}</span></div>}
                        <div className="flex justify-between"><span className="text-gray-500">Used from Cheque</span><span className="font-bold">{fmtFull(fromCheque)}</span></div>
                        {excess > 0 && <div className="flex justify-between border-t pt-1"><span className="text-green-600 font-medium">Excess to Suspense</span><span className="font-bold text-green-600">+{fmtFull(excess)}</span></div>}
                        {excess < 0 && <div className="flex justify-between border-t pt-1"><span className="text-red-600 font-medium">Shortfall</span><span className="font-bold text-red-600">{fmtFull(excess)}</span></div>}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmartPayDialog(false)}>Cancel</Button>
            <Button onClick={handleSmartPayment} className="bg-blue-600 hover:bg-blue-700" data-testid="process-smart-payment-btn"><CreditCard className="h-4 w-4 mr-1" /> Process Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ APPROVALS TAB ============
function ApprovalsTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ income: [], materials: [], labour: [], vendor: [], summary: {} });
  // WO stage payment requests forwarded by Planning (new SE Work Order V2 flow).
  // Lives in db.project_work_orders.stages.payment_requests, separate from legacy labour_expenses.
  const [woStagePayments, setWoStagePayments] = useState([]);
  const [activeTab, setActiveTab] = useState('income');
  const [rejectDialog, setRejectDialog] = useState({ open: false, type: '', id: '', reason: '' });
  const [processing, setProcessing] = useState(null);
  // Default date filter to current month
  const _a_today = new Date();
  const _a_mStart = `${_a_today.getFullYear()}-${String(_a_today.getMonth() + 1).padStart(2, '0')}-01`;
  const _a_mEnd = (() => { const d = new Date(_a_today.getFullYear(), _a_today.getMonth() + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [appDateFrom, setAppDateFrom] = useState(_a_mStart);
  const [appDateTo, setAppDateTo] = useState(_a_mEnd);
  // Income review dialog
  const [reviewDialog, setReviewDialog] = useState({ open: false, income: null });
  // Pay-approval dialog (unified Pay & Settle for material / labour / petty_cash)
  const [payDialog, setPayDialog] = useState({ open: false, reqType: '', requestId: '' });
  // Issue Cash / Approve dialog for Petty Cash → Req Petty Cash & Record Expense sub-tabs
  const [issueDialog, setIssueDialog] = useState({ open: false, kind: 'issue', item: null });
  const [reviewForm, setReviewForm] = useState({
    verification_mode: '',
    denomination: { '2000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0 },
    cheque_number: '',
    transaction_id: '',
    dt_id: '',
    notes: ''
  });
  // Status filter — pending / approved / rejected / under_correction / all
  const [statusFilter, setStatusFilter] = useState('pending');
  // Send-for-correction modal state (post-approval pullback by accountant)
  const [correctionIncome, setCorrectionIncome] = useState(null);
  const [correctionIncomeReason, setCorrectionIncomeReason] = useState('');
  // Read-only correction view (for rejected/under-correction rows)
  const [viewCorrectionIncome, setViewCorrectionIncome] = useState(null);

  const fetchApprovals = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [unifiedRes, woRes] = await Promise.all([
        axios.get(`${API}/approvals/unified`, { params: { status_filter: statusFilter } }),
        axios.get(`${API}/accountant/labour-payments?status=pending`).catch(() => ({ data: { requests: [] } })),
      ]);
      setData(unifiedRes.data);
      setWoStagePayments(woRes.data?.requests || []);
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const handleApproveIncome = async (incomeId) => {
    setProcessing(incomeId);
    try {
      await axios.post(`${API}/approvals/income/${incomeId}/approve`);
      toast.success('Income approved & recorded.');
      fetchApprovals(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveExpense = async (type, id, action) => {
    setProcessing(id);
    try {
      await axios.patch(`${API}/expenses/${type}/${id}/${action}`, { action: 'approved' });
      toast.success('Expense approved & recorded.');
      fetchApprovals(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    const { type, id, reason } = rejectDialog;
    setProcessing(id);
    try {
      if (type === 'income') {
        await axios.post(`${API}/approvals/income/${id}/reject?reason=${encodeURIComponent(reason)}`);
      } else {
        const actionMap = { material: 'accounts-approval', labour: 'accounts-approval', 'vendor-service': 'accounts-approval' };
        await axios.patch(`${API}/expenses/${type}/${id}/${actionMap[type]}`, { action: 'rejected', reason });
      }
      toast.success('Rejected. Requester will be notified.');
      setRejectDialog({ open: false, type: '', id: '', reason: '' });
      fetchApprovals(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to reject');
    } finally {
      setProcessing(null);
    }
  };

  const getApprovalAction = (status, type) => {
    if (status === 'requested') return 'planning-approval';
    if (status === 'planning_approved') return type === 'material' ? 'procurement-pricing' : 'accounts-approval';
    if (status === 'pending_accounts_approval') return 'accounts-approval';
    if (status === 'procurement_priced') return 'accounts-approval';
    return null;
  };

  const [projectCheques, setProjectCheques] = useState([]);
  const [chequeVerifications, setChequeVerifications] = useState({});
  // Inline "Add Cheque Detail" form for accountant when cheque records are missing
  const [newCheque, setNewCheque] = useState({ cheque_number: '', bank_name: '', cheque_date: '', adding: false });

  const handleAddMissingCheque = async () => {
    const inc = reviewDialog.income;
    if (!inc) return;
    if (!newCheque.cheque_number.trim()) {
      toast.error('Cheque number is required');
      return;
    }
    setNewCheque(c => ({ ...c, adding: true }));
    try {
      // cheque_date defaults to today (datetime field is required by Pydantic model)
      const cheque_date = newCheque.cheque_date
        ? new Date(newCheque.cheque_date + 'T00:00:00').toISOString()
        : new Date().toISOString();
      const payload = {
        cheque_number: newCheque.cheque_number.trim(),
        bank_name: newCheque.bank_name.trim() || 'Not specified',
        amount: inc.amount,
        cheque_date,
        cheque_type: 'incoming',
        party_name: inc.client_name || inc.party_name || 'Client',
        party_type: 'client',
        project_id: inc.project_id,
        income_id: inc.income_id,
      };
      await axios.post(`${API}/accountant/cheques`, payload);
      toast.success('Cheque added — visible to CRE Cheque Mgmt + project page');
      // Re-fetch cheques bound to this income
      const res = await axios.get(`${API}/approvals/income/${inc.income_id}/cheques`);
      setProjectCheques(res.data.cheques || []);
      const verMap = {};
      (res.data.cheques || []).forEach(c => { verMap[c.cheque_id] = ''; });
      setChequeVerifications(verMap);
      setNewCheque({ cheque_number: '', bank_name: '', cheque_date: '', adding: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add cheque');
      setNewCheque(c => ({ ...c, adding: false }));
    }
  };

  const openReviewDialog = async (income) => {
    const mode = classifyMode(income.payment_mode);
    let verificationMode = 'cash';
    if (mode === 'cheque' || income.payment_mode === 'cheque') verificationMode = 'cheque';
    else if (['current_account', 'savings_account'].includes(mode) || ['bank_transfer', 'neft', 'escrow'].includes(income.payment_mode)) verificationMode = 'bank';
    else if (mode === 'direct_transfer' || income.payment_mode === 'direct_transfer') verificationMode = 'dt';

    setReviewForm({
      verification_mode: verificationMode,
      denomination: { '2000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0 },
      cheque_number: '', transaction_id: income.transaction_id || '',
      dt_id: '', notes: ''
    });
    if (verificationMode === 'cheque') {
      try {
        const res = await axios.get(`${API}/approvals/income/${income.income_id}/cheques`);
        setProjectCheques(res.data.cheques || []);
        const verMap = {};
        (res.data.cheques || []).forEach(c => { verMap[c.cheque_id] = ''; });
        setChequeVerifications(verMap);
      } catch { setProjectCheques([]); setChequeVerifications({}); }
    } else {
      setProjectCheques([]); setChequeVerifications({});
    }
    setReviewDialog({ open: true, income });
  };

  const denominationTotal = Object.entries(reviewForm.denomination).reduce((sum, [note, count]) => sum + (parseInt(note) * (parseInt(count) || 0)), 0);

  const handleSubmitReview = async () => {
    const inc = reviewDialog.income;
    if (!inc) return;

    if (reviewForm.verification_mode === 'cash' && denominationTotal !== inc.amount) {
      toast.error(`Denomination total (₹${denominationTotal.toLocaleString('en-IN')}) doesn't match amount (₹${inc.amount.toLocaleString('en-IN')})`);
      return;
    }
    if (reviewForm.verification_mode === 'cheque' && projectCheques.length > 0) {
      const allVerified = projectCheques.every(c => chequeVerifications[c.cheque_id]?.trim());
      if (!allVerified) { toast.error('Please re-enter all cheque numbers'); return; }
    }
    if (reviewForm.verification_mode === 'bank' && !reviewForm.transaction_id.trim()) {
      toast.error('Please enter transaction ID');
      return;
    }
    if (reviewForm.verification_mode === 'dt' && !reviewForm.dt_id.trim()) {
      toast.error('Please enter DT payment ID');
      return;
    }

    setProcessing(inc.income_id);
    try {
      const payload = {
        verification_mode: reviewForm.verification_mode,
        notes: reviewForm.notes || undefined
      };
      if (reviewForm.verification_mode === 'cash') {
        const denom = {};
        Object.entries(reviewForm.denomination).forEach(([k, v]) => { if (parseInt(v) > 0) denom[k] = parseInt(v); });
        payload.denomination = denom;
      }
      if (reviewForm.verification_mode === 'cheque' && projectCheques.length > 0) {
        payload.cheque_verifications = projectCheques.map(c => ({
          cheque_id: c.cheque_id, cheque_number: c.cheque_number,
          entered_number: chequeVerifications[c.cheque_id] || '', amount: String(c.amount || ''), bank: c.bank_name || ''
        }));
      }
      if (reviewForm.verification_mode === 'bank') payload.transaction_id = reviewForm.transaction_id;
      if (reviewForm.verification_mode === 'dt') payload.dt_id = reviewForm.dt_id;

      await axios.post(`${API}/approvals/income/${inc.income_id}/review`, payload);
      toast.success('Income reviewed & approved. Recorded in books.');
      setReviewDialog({ open: false, income: null });
      fetchApprovals(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to review');
    } finally {
      setProcessing(null);
    }
  };

  const s = data.summary || {};
  // Apply unified date filter to data arrays (client-side, using created_at)
  const filteredIncome = filterByDateRange(data.income || [], appDateFrom, appDateTo, r => r.created_at);
  const filteredMaterials = filterByDateRange(data.materials || [], appDateFrom, appDateTo, r => r.created_at);
  const filteredLabour = filterByDateRange(data.labour || [], appDateFrom, appDateTo, r => r.created_at);
  const filteredVendor = filterByDateRange(data.vendor || [], appDateFrom, appDateTo, r => r.created_at);
  const filteredPettyCash = filterByDateRange(data.petty_cash || [], appDateFrom, appDateTo, r => r.created_at);
  const filteredRecordedExpenses = filterByDateRange(data.recorded_expenses || [], appDateFrom, appDateTo, r => r.created_at);
  // WO stage payments use planning_approved_at (or requested_at) — apply same date filter so the
  // labour tab badge/count stays consistent with what's actually rendered.
  const filteredWoStagePayments = filterByDateRange(
    woStagePayments,
    appDateFrom,
    appDateTo,
    r => r.planning_approved_at || r.requested_at,
  );
  const fSummary = {
    income_count: filteredIncome.length,
    income_total: filteredIncome.reduce((sum, x) => sum + (x.amount || 0), 0),
    material_count: filteredMaterials.length,
    material_total: filteredMaterials.reduce((sum, x) => sum + (x.estimated_cost || x.final_amount || 0), 0),
    labour_count: filteredLabour.length + filteredWoStagePayments.length,
    labour_total: filteredLabour.reduce((sum, x) => sum + (x.total_amount || 0), 0)
                 + filteredWoStagePayments.reduce((sum, x) => sum + (x.amount || 0), 0),
    vendor_count: filteredVendor.length,
    vendor_total: filteredVendor.reduce((sum, x) => sum + (x.amount || 0), 0),
    petty_cash_count: filteredPettyCash.length,
    petty_cash_total: filteredPettyCash.reduce((sum, x) => sum + (x.amount_requested || x.amount_issued || 0), 0),
  };
  const totalPending = fSummary.income_count + fSummary.material_count + fSummary.labour_count + fSummary.vendor_count + fSummary.petty_cash_count + filteredRecordedExpenses.length;
  // Keep s in scope for any downstream usage (e.g., non-filtered pieces)
  void s;

  if (loading && !data.summary) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="approvals-tab">
      {/* Unified Date / Month / Year Filter + Status filter chips */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CashbookDateFilter
              dateFrom={appDateFrom}
              dateTo={appDateTo}
              setDateFrom={setAppDateFrom}
              setDateTo={setAppDateTo}
              testIdPrefix="approvals"
              accent="amber"
            />
            <div className="flex items-center gap-1 ml-auto flex-wrap" data-testid="approvals-status-filter">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mr-1">Status:</span>
              {[
                { v: 'pending', label: 'Pending', cls: 'amber' },
                { v: 'approved', label: 'Approved', cls: 'emerald' },
                { v: 'rejected', label: 'Rejected', cls: 'red' },
                { v: 'under_correction', label: 'Under Correction', cls: 'orange' },
                { v: 'all', label: 'All', cls: 'gray' },
              ].map(opt => {
                const active = statusFilter === opt.v;
                const accentCls = {
                  amber: active ? 'bg-amber-600 text-white border-amber-600' : 'border-amber-300 text-amber-700 hover:bg-amber-50',
                  emerald: active ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                  red: active ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-700 hover:bg-red-50',
                  orange: active ? 'bg-orange-600 text-white border-orange-600' : 'border-orange-300 text-orange-700 hover:bg-orange-50',
                  gray: active ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                }[opt.cls];
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setStatusFilter(opt.v)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition ${accentCls}`}
                    data-testid={`approvals-filter-${opt.v}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-purple-500" onClick={() => {}} data-testid="approvals-total-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <ClipboardCheck className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Total Pending</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-purple-700">{totalPending}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500" onClick={() => setActiveTab('income')} data-testid="approvals-income-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <IndianRupee className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Income</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-green-700">{fSummary.income_count}</p>
            <p className="text-[10px] sm:text-xs text-green-600 font-medium"><MaskedValue value={fSummary.income_total} className="text-green-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500" onClick={() => setActiveTab('materials')} data-testid="approvals-material-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Building2 className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Materials</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-amber-700">{fSummary.material_count}</p>
            <p className="text-[10px] sm:text-xs text-amber-600 font-medium"><MaskedValue value={fSummary.material_total} className="text-amber-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500" onClick={() => setActiveTab('labour')} data-testid="approvals-labour-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Wallet className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Labour</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-blue-700">{fSummary.labour_count}</p>
            <p className="text-[10px] sm:text-xs text-blue-600 font-medium"><MaskedValue value={fSummary.labour_total} className="text-blue-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-orange-500" onClick={() => setActiveTab('vendor')} data-testid="approvals-vendor-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <CreditCard className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Suppliers</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-orange-700">{fSummary.vendor_count}</p>
            <p className="text-[10px] sm:text-xs text-orange-600 font-medium"><MaskedValue value={fSummary.vendor_total} className="text-orange-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
      </div>

      {/* Top-level Approval Category Tabs */}
      <Tabs value={['materials','labour','vendor'].includes(activeTab) ? 'expense' : 'income'} onValueChange={(v) => setActiveTab(v === 'income' ? 'income' : 'materials')}>
        <TabsList className="w-full grid grid-cols-2 mb-3" data-testid="approval-main-tabs">
          <TabsTrigger value="income" className="text-xs sm:text-sm data-[state=active]:bg-green-100 data-[state=active]:text-green-800 gap-1" data-testid="approval-income-tab">
            <ArrowDownRight className="h-3.5 w-3.5" /> Income Approvals ({fSummary.income_count})
          </TabsTrigger>
          <TabsTrigger value="expense" className="text-xs sm:text-sm data-[state=active]:bg-red-100 data-[state=active]:text-red-800 gap-1" data-testid="approval-expense-tab">
            <ArrowUpRight className="h-3.5 w-3.5" /> Expense Approvals ({fSummary.material_count + fSummary.labour_count + fSummary.vendor_count})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Expense sub-tabs */}
      {['materials','labour','vendor'].includes(activeTab) && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 mb-3" data-testid="approval-expense-sub-tabs">
            <TabsTrigger value="materials" className="text-xs sm:text-sm data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 gap-1">
              <Building2 className="h-3.5 w-3.5" /> Materials ({fSummary.material_count})
            </TabsTrigger>
            <TabsTrigger value="labour" className="text-xs sm:text-sm data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 gap-1">
              <Wallet className="h-3.5 w-3.5" /> Labour Work Order ({fSummary.labour_count})
            </TabsTrigger>
            <TabsTrigger value="vendor" className="text-xs sm:text-sm data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800 gap-1">
              <CreditCard className="h-3.5 w-3.5" /> Petty Cash ({fSummary.petty_cash_count + filteredRecordedExpenses.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Content panel */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="hidden">
          <TabsTrigger value="income"></TabsTrigger>
          <TabsTrigger value="materials"></TabsTrigger>
          <TabsTrigger value="labour"></TabsTrigger>
          <TabsTrigger value="vendor"></TabsTrigger>
        </TabsList>

        {/* Income Approvals */}
        <TabsContent value="income">
          {filteredIncome.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-gray-400">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No income rows in this filter
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="approvals-income-table">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500">Status</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncome.map((inc, i) => {
                        const st = (inc.status || '').toLowerCase();
                        const isPending = st === 'pending_approval' || st === 'pending';
                        const isApproved = ['approved', 'verified', 'accountant_verified'].includes(st);
                        const isRejected = ['rejected', 'accountant_rejected', 'accounts_rejected'].includes(st);
                        const isCorrection = st === 'under_correction';
                        return (
                          <tr key={inc.income_id} className={`border-b hover:bg-gray-50 ${isCorrection ? 'bg-orange-50/40' : isRejected ? 'bg-red-50/40' : ''}`} data-testid={`approval-income-row-${inc.income_id}`}>
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{new Date(inc.created_at).toLocaleDateString('en-IN')}</td>
                            <td className="px-3 py-2 font-medium">{inc.project_name || 'N/A'}</td>
                            <td className="px-3 py-2">{inc.stage || inc.remarks || inc.description || 'Payment'}</td>
                            <td className="px-3 py-2">
                              <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(inc.payment_mode)]}`}>
                                {MODE_LABELS[classifyMode(inc.payment_mode)] || inc.payment_mode || 'Cash'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-green-700"><MaskedValue value={inc.amount} className="text-green-700" /></td>
                            <td className="px-3 py-2 text-center">
                              <StatusPill
                                status={inc.status}
                                data-testid={`approval-income-status-${inc.income_id}`}
                                onClick={(isRejected || isCorrection) ? () => setViewCorrectionIncome(inc) : undefined}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex gap-1 justify-center flex-wrap">
                                {isPending && (
                                  <Button size="sm" className="h-6 text-[10px] bg-amber-600 hover:bg-amber-700 gap-1 px-3"
                                    disabled={processing === inc.income_id}
                                    onClick={() => openReviewDialog(inc)}
                                    data-testid={`review-income-btn-${inc.income_id}`}>
                                    {processing === inc.income_id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />} Review
                                  </Button>
                                )}
                                {isApproved && (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] text-orange-600 border-orange-300 hover:bg-orange-50 gap-1"
                                    onClick={() => { setCorrectionIncome(inc); setCorrectionIncomeReason(''); }}
                                    data-testid={`income-correction-btn-${inc.income_id}`}>
                                    🔄 Send for Correction
                                  </Button>
                                )}
                                {(isRejected || isCorrection) && (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600 border-red-300 hover:bg-red-50 gap-1"
                                    onClick={() => setViewCorrectionIncome(inc)}
                                    data-testid={`income-view-correction-btn-${inc.income_id}`}>
                                    View / Edit
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Material Approvals */}
        <TabsContent value="materials">
          {/* Procurement → Planning → Accountant material payments (full / advance / balance).
              Uses the unified PayApprovalDialog with cheque suspense + CRE-opened cheque picker. */}
          <div className="mb-3" data-testid="approvals-procurement-materials">
            <AccountantMaterialPayments onRefresh={() => fetchApprovals(false)} legacyExpenses={filteredMaterials} />
          </div>
          {/* Vendor credit ledger settlements awaiting accountant release */}
          <div className="mb-3" data-testid="approvals-credit-settlements">
            <AccountantCreditSettlements />
          </div>
        </TabsContent>

        {/* Labour Approvals */}
        <TabsContent value="labour">
          {/* Feb 20 2026 — Removed the Labour Advance Requests pipeline card
              from Accountant > Approvals > Labour Work Order at user's
              request. Advances still flow through the Planning → PM → GM
              ladder via /labour-advances; the Accountant approval queue
              now opens directly on the Labour Payment Releases card. */}
          {/* SE Work Order V2 stage payments — forwarded by Planning, awaiting accountant release.
              Lives in db.project_work_orders.stages.payment_requests (separate from legacy labour_expenses). */}
          {filteredWoStagePayments.length > 0 && (
            <div className="mb-3" data-testid="approvals-wo-stage-payments">
              <AccountantLabourPayments />
            </div>
          )}
          <ApprovalExpenseTable
            items={filteredLabour}
            type="labour"
            idField="labour_expense_id"
            amountField="total_amount"
            descField="contractor_name"
            processing={processing}
            getApprovalAction={getApprovalAction}
            onApprove={handleApproveExpense}
            onReject={(id) => setRejectDialog({ open: true, type: 'labour', id, reason: '' })}
            onPay={(id) => setPayDialog({ open: true, reqType: 'labour', requestId: id })}
          />
        </TabsContent>

        {/* Petty Cash Approvals — 2 sub-tabs: Req Petty Cash | Record Expense */}
        <TabsContent value="vendor">
          <Tabs defaultValue="req_petty_cash" className="w-full">
            <TabsList className="grid grid-cols-2 mb-3 max-w-md">
              <TabsTrigger value="req_petty_cash" className="text-xs gap-1 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800">
                <Wallet className="h-3.5 w-3.5" /> Req Petty Cash ({filteredPettyCash.length})
              </TabsTrigger>
              <TabsTrigger value="record_expense" className="text-xs gap-1 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800">
                <FileText className="h-3.5 w-3.5" /> Record Expense ({filteredRecordedExpenses.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="req_petty_cash">
              {filteredPettyCash.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-gray-400">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No pending petty-cash approvals
                </CardContent></Card>
              ) : (
                <div className="space-y-2" data-testid="approvals-petty-cash-list">
                  {filteredPettyCash.map((pc) => (
                    <Card key={pc.petty_cash_id} className="border-l-4 border-l-orange-500" data-testid={`approval-petty-card-${pc.petty_cash_id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize bg-amber-50 text-amber-800 border-amber-300">{(pc.status || '').replace(/_/g, ' ')}</Badge>
                            <span className="text-[10px] text-gray-400 font-mono">#{pc.petty_cash_id}</span>
                            <span className="text-sm font-semibold">{pc.purpose || 'Petty Cash'}</span>
                          </div>
                          <span className="text-base font-bold text-emerald-700">₹{(pc.amount_requested || pc.amount_issued || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Requested By</p><p className="font-medium truncate">{pc.requested_by_name || '-'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Project</p><p className="font-medium truncate">{pc.project_name || 'General'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">PM Approved</p><p className="font-medium truncate">{pc.pm_approved_by_name || '-'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Date</p><p className="font-medium">{new Date(pc.created_at).toLocaleDateString('en-IN')}</p></div>
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1 border-red-300 text-red-700 hover:bg-red-50"
                            data-testid={`approval-petty-reject-${pc.petty_cash_id}`}
                            onClick={async () => {
                              const reason = window.prompt('Reason for rejecting this petty cash request? (will be sent to the SE)');
                              if (!reason || !reason.trim()) return;
                              try {
                                await axios.patch(`${API}/accountant/petty-cash/${pc.petty_cash_id}/reject`, { reason: reason.trim() });
                                toast.success('Rejected');
                                fetchApprovals(false);
                              } catch (e) {
                                toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to reject');
                              }
                            }}
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
                            data-testid={`approval-petty-issue-${pc.petty_cash_id}`}
                            onClick={() => setIssueDialog({ open: true, kind: 'issue', item: pc })}
                          >
                            <Wallet className="h-3 w-3" /> Issue Cash
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="record_expense">
              {filteredRecordedExpenses.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-gray-400">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No PM-approved recorded expenses awaiting accountant review
                </CardContent></Card>
              ) : (
                <div className="space-y-2" data-testid="approvals-record-expense-list">
                  {filteredRecordedExpenses.map((re) => (
                    <Card key={re.expense_id} className="border-l-4 border-l-emerald-500" data-testid={`approval-record-card-${re.expense_id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize bg-cyan-50 text-cyan-800 border-cyan-300">{(re.status || '').replace(/_/g, ' ')}</Badge>
                            <span className="text-[10px] text-gray-400 font-mono">#{re.expense_id}</span>
                            {re.category && <Badge variant="outline" className="text-[9px] capitalize">{re.category.replace(/_/g, ' ')}</Badge>}
                          </div>
                          <span className="text-base font-bold text-red-700">₹{(re.amount || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="sm:col-span-2"><p className="text-[10px] uppercase text-gray-400 font-semibold">Description</p><p className="font-medium truncate">{re.description || '-'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Vendor / Payee</p><p className="font-medium truncate">{re.vendor_name || '-'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Project</p><p className="font-medium truncate">{re.project_name || 'General'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Recorded By</p><p className="font-medium truncate">{re.recorded_by_name || '-'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">PM Approved</p><p className="font-medium truncate">{re.pm_approved_by_name || '-'}</p></div>
                          <div><p className="text-[10px] uppercase text-gray-400 font-semibold">Date</p><p className="font-medium">{new Date(re.created_at).toLocaleDateString('en-IN')}</p></div>
                        </div>
                        {re.bill_file_id && (
                          <div className="mt-1">
                            <a href={`${API}/files/${re.bill_file_id}/download`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 underline">View bill</a>
                          </div>
                        )}
                        <div className="flex justify-end gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1 border-red-300 text-red-700 hover:bg-red-50"
                            data-testid={`approval-record-reject-${re.expense_id}`}
                            onClick={async () => {
                              const reason = window.prompt('Reason for rejecting this recorded expense?');
                              if (!reason || !reason.trim()) return;
                              try {
                                await axios.patch(`${API}/accountant/recorded-expenses/${re.expense_id}/reject`, { reason: reason.trim() });
                                toast.success('Rejected — bounced back');
                                fetchApprovals(false);
                              } catch (e) {
                                toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to reject');
                              }
                            }}
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
                            data-testid={`approval-record-approve-${re.expense_id}`}
                            onClick={() => setIssueDialog({ open: true, kind: 'approve', item: re })}
                          >
                            <CheckCircle className="h-3 w-3" /> Approve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Pay & Settle Dialog (Material/Labour/Petty-Cash) */}
      <PayApprovalDialog
        open={payDialog.open}
        onOpenChange={(o) => !o && setPayDialog({ open: false, reqType: '', requestId: '' })}
        reqType={payDialog.reqType}
        requestId={payDialog.requestId}
        onPaid={() => fetchApprovals(false)}
      />

      {/* Send-for-Correction dialog — Accountant pulls back an APPROVED income.
          Reverses cashflow_ledger + payment_stage + advance_amount, then prompts
          the original collector to edit + resubmit via the CorrectionDialog. */}
      <Dialog open={!!correctionIncome} onOpenChange={(v) => { if (!v) { setCorrectionIncome(null); setCorrectionIncomeReason(''); } }}>
        <DialogContent className="max-w-md" data-testid="income-correction-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2 text-orange-700">
              <span>🔄</span> Send Approved Income for Correction
            </DialogTitle>
          </DialogHeader>
          {correctionIncome && (
            <div className="space-y-3">
              <Card className="bg-orange-50 border-orange-200">
                <CardContent className="p-3 text-xs space-y-1">
                  <p><span className="text-gray-500">Project:</span> <span className="font-semibold">{correctionIncome.project_name}</span></p>
                  <p><span className="text-gray-500">Collected by:</span> {correctionIncome.collected_by_name || correctionIncome.created_by_name}</p>
                  <p><span className="text-gray-500">Description:</span> {correctionIncome.description || correctionIncome.stage}</p>
                  <p><span className="text-gray-500">Amount:</span> <span className="font-bold text-orange-700">₹{(correctionIncome.amount || 0).toLocaleString('en-IN')}</span></p>
                  <p className="text-[11px] text-orange-700 italic mt-1">⚠ This amount will be removed from Cashbook, Cashflow Engine and the project's Total Income card until corrected and re-approved.</p>
                </CardContent>
              </Card>
              <div>
                <Label className="text-xs">Reason for Correction *</Label>
                <Textarea
                  className="text-xs"
                  rows={3}
                  value={correctionIncomeReason}
                  onChange={(e) => setCorrectionIncomeReason(e.target.value)}
                  placeholder="e.g., Wrong project tagged / amount mismatch / wrong payment mode..."
                  data-testid="income-correction-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCorrectionIncome(null); setCorrectionIncomeReason(''); }}>Cancel</Button>
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="income-correction-confirm"
              onClick={async () => {
                if (!correctionIncomeReason.trim()) { toast.error('Correction reason is required'); return; }
                try {
                  await axios.post(`${API}/approvals/income/${correctionIncome.income_id}/send-for-correction`, { reason: correctionIncomeReason.trim() });
                  toast.success('Approved income sent back for correction. Totals rolled back.');
                  setCorrectionIncome(null); setCorrectionIncomeReason('');
                  fetchApprovals(false);
                } catch (e) {
                  toast.error(e?.response?.data?.detail || 'Send for correction failed');
                }
              }}
            >Send for Correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read-only view of rejected / under-correction income rows.
          The original collector (different login) sees an editable version on
          their dashboard via the same CorrectionDialog. Accountant view here
          is read-only since the Accountant can't edit someone else's income. */}
      <CorrectionDialog
        open={!!viewCorrectionIncome}
        onClose={() => setViewCorrectionIncome(null)}
        entityType="Income"
        doc={viewCorrectionIncome}
        resubmitUrl=""
        editableFields={[]}
        canEdit={false}
      />

      {/* Income Review Dialog */}
      <Dialog open={reviewDialog.open} onOpenChange={(open) => { if (!open) setReviewDialog({ open: false, income: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <ClipboardCheck className="h-5 w-5" /> Review Income
            </DialogTitle>
          </DialogHeader>
          {reviewDialog.income && (
            <div className="space-y-4">
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-green-600">Project</p>
                    <p className="font-medium text-sm">{reviewDialog.income.project_name || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-600">Amount</p>
                    <p className="font-bold text-lg text-green-700">₹{reviewDialog.income.amount?.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <p className="text-xs text-green-500 mt-1">{reviewDialog.income.stage || reviewDialog.income.remarks || 'Payment'} • {MODE_LABELS[classifyMode(reviewDialog.income.payment_mode)] || reviewDialog.income.payment_mode}</p>
              </div>

              {/* Cash - Denomination */}
              {reviewForm.verification_mode === 'cash' && (
                <div data-testid="review-cash-section">
                  <Label className="text-sm font-semibold mb-2 block">Cash Denomination</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {['2000', '500', '200', '100', '50', '20', '10', '5', '2', '1'].map(note => (
                      <div key={note} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5">
                        <span className="text-xs font-medium text-gray-600 w-10">₹{note}</span>
                        <span className="text-gray-400 text-xs">×</span>
                        <NumericInput
 
                          className="h-7 text-xs text-center flex-1"
                          value={reviewForm.denomination[note] || ''}
                          onChange={(e) => setReviewForm({
                            ...reviewForm,
                            denomination: { ...reviewForm.denomination, [note]: parseInt(e.target.value) || 0 }
                          })}
                          data-testid={`denom-${note}`}
                        />
                        <span className="text-[10px] text-gray-400 w-14 text-right">= ₹{((parseInt(reviewForm.denomination[note]) || 0) * parseInt(note)).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-2 p-2 rounded text-center text-sm font-bold ${denominationTotal === reviewDialog.income.amount ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    Total: ₹{denominationTotal.toLocaleString('en-IN')} {denominationTotal === reviewDialog.income.amount ? '✓ Matches' : `≠ ₹${reviewDialog.income.amount?.toLocaleString('en-IN')}`}
                  </div>
                </div>
              )}

              {/* Cheque - Show all project cheques for verification */}
              {reviewForm.verification_mode === 'cheque' && (
                <div data-testid="review-cheque-section">
                  <Label className="text-sm font-semibold mb-2 block">Cheque Verification ({projectCheques.length} cheque{projectCheques.length !== 1 ? 's' : ''})</Label>
                  {projectCheques.length === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2" data-testid="add-missing-cheque-form">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-amber-700">
                          No cheque records found. CRE missed adding cheque details. Add them now — the cheque will appear in CRE's Cheque Management and the project page.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px] text-gray-600">Cheque Number<span className="text-red-500">*</span></Label>
                          <Input
                            value={newCheque.cheque_number}
                            onChange={(e) => setNewCheque({ ...newCheque, cheque_number: e.target.value })}
                            placeholder="e.g., 123456"
                            className="h-8 text-sm"
                            disabled={newCheque.adding}
                            data-testid="add-cheque-number-input"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-600">Bank Name</Label>
                          <Input
                            value={newCheque.bank_name}
                            onChange={(e) => setNewCheque({ ...newCheque, bank_name: e.target.value })}
                            placeholder="e.g., BOI"
                            className="h-8 text-sm"
                            disabled={newCheque.adding}
                            data-testid="add-cheque-bank-input"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-600">Cheque Date <span className="text-gray-400">(opt)</span></Label>
                          <Input
                            type="date"
                            value={newCheque.cheque_date}
                            onChange={(e) => setNewCheque({ ...newCheque, cheque_date: e.target.value })}
                            className="h-8 text-sm"
                            disabled={newCheque.adding}
                            data-testid="add-cheque-date-input"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 h-8"
                        onClick={handleAddMissingCheque}
                        disabled={newCheque.adding}
                        data-testid="add-cheque-submit-btn"
                      >
                        {newCheque.adding ? 'Adding…' : '+ Add Cheque Detail'}
                      </Button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {projectCheques.map((cheque, idx) => (
                      <div key={cheque.cheque_id} className="border rounded-lg p-3 bg-blue-50/50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-xs text-blue-500">Cheque {idx + 1} • {cheque.bank_name || 'Bank'}</p>
                            <p className="font-bold text-blue-800 text-lg tracking-wider">{cheque.cheque_number}</p>
                          </div>
                          <Badge variant="outline" className="text-green-700 border-green-300">
                            ₹{parseInt(cheque.amount).toLocaleString('en-IN')}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Re-enter cheque number to verify</Label>
                          <Input
                            value={chequeVerifications[cheque.cheque_id] || ''}
                            onChange={(e) => setChequeVerifications({ ...chequeVerifications, [cheque.cheque_id]: e.target.value })}
                            placeholder="Re-enter cheque number"
                            className={`mt-1 h-8 text-sm ${chequeVerifications[cheque.cheque_id] === cheque.cheque_number ? 'border-green-400 bg-green-50' : ''}`}
                            data-testid={`verify-cheque-${cheque.cheque_id}`}
                          />
                          {chequeVerifications[cheque.cheque_id] && chequeVerifications[cheque.cheque_id] === cheque.cheque_number && (
                            <p className="text-xs text-green-600 mt-1">✓ Verified</p>
                          )}
                          {chequeVerifications[cheque.cheque_id] && chequeVerifications[cheque.cheque_id] !== cheque.cheque_number && (
                            <p className="text-xs text-red-500 mt-1">✗ Does not match</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bank - Transaction ID */}
              {reviewForm.verification_mode === 'bank' && (
                <div data-testid="review-bank-section">
                  <Label className="text-sm font-semibold">Transaction ID</Label>
                  <Input
                    value={reviewForm.transaction_id}
                    onChange={(e) => setReviewForm({ ...reviewForm, transaction_id: e.target.value })}
                    placeholder="Enter bank transaction ID"
                    className="mt-1"
                    data-testid="review-txn-input"
                  />
                </div>
              )}

              {/* DT - Payment DT ID */}
              {reviewForm.verification_mode === 'dt' && (
                <div data-testid="review-dt-section">
                  <Label className="text-sm font-semibold">Payment DT ID</Label>
                  <Input
                    value={reviewForm.dt_id}
                    onChange={(e) => setReviewForm({ ...reviewForm, dt_id: e.target.value })}
                    placeholder="Enter DT payment ID"
                    className="mt-1"
                    data-testid="review-dt-input"
                  />
                </div>
              )}

              <div>
                <Label className="text-sm">Notes (optional)</Label>
                <Textarea
                  value={reviewForm.notes}
                  onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    const inc = reviewDialog.income;
                    if (!inc) return;
                    setReviewDialog({ open: false, income: null });
                    setRejectDialog({ open: true, type: 'income', id: inc.income_id, reason: '' });
                  }}
                  disabled={processing}
                  data-testid="reject-income-btn"
                >
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleSubmitReview}
                  disabled={processing}
                  data-testid="submit-review-btn"
                >
                  {processing ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  Record Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => { if (!open) setRejectDialog({ open: false, type: '', id: '', reason: '' }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject {rejectDialog.type === 'income' ? 'Income' : 'Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Reason for rejection</Label>
              <Textarea data-testid="approval-reject-reason" value={rejectDialog.reason}
                onChange={(e) => setRejectDialog({ ...rejectDialog, reason: e.target.value })}
                placeholder="Enter rejection reason..." rows={3} />
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700" onClick={handleReject}
              disabled={!rejectDialog.reason || processing}
              data-testid="confirm-approval-reject-btn">
              {processing ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null} Confirm Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <IssueCashDialog
        open={issueDialog.open}
        onOpenChange={(o) => setIssueDialog({ open: o, kind: issueDialog.kind, item: issueDialog.item })}
        variant={issueDialog.kind === 'approve' ? 'approve' : 'issue'}
        defaultAmount={
          issueDialog.kind === 'approve'
            ? Number(issueDialog.item?.amount || 0)
            : Number(issueDialog.item?.amount_requested || issueDialog.item?.amount_issued || 0)
        }
        title={issueDialog.kind === 'approve' ? 'Approve Recorded Expense' : 'Issue Petty Cash'}
        subtitle={
          issueDialog.kind === 'approve'
            ? `${issueDialog.item?.description || ''} • ${issueDialog.item?.recorded_by_name || ''}`
            : `${issueDialog.item?.requested_by_name || ''} • ${issueDialog.item?.purpose || ''}`
        }
        onSubmit={async (vals) => {
          try {
            if (issueDialog.kind === 'approve') {
              await axios.patch(`${API}/accountant/recorded-expenses/${issueDialog.item.expense_id}/approve`, {
                remarks: vals.remarks,
                payment_mode: vals.payment_mode,
                reference_number: vals.reference_number,
                bank_name: vals.bank_name,
                cheque_date: vals.cheque_date,
                payment_date: vals.payment_date,
              });
              toast.success('Approved — recorded into cashbook');
            } else {
              await axios.patch(`${API}/accountant/petty-cash/${issueDialog.item.petty_cash_id}/issue`, {
                amount: vals.amount,
                remarks: vals.remarks,
                payment_mode: vals.payment_mode,
                reference_number: vals.reference_number,
                bank_name: vals.bank_name,
                cheque_date: vals.cheque_date,
                payment_date: vals.payment_date,
              });
              toast.success('Petty cash issued');
            }
            fetchApprovals(false);
          } catch (e) {
            toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Action failed');
            throw e;
          }
        }}
      />

      {/* Refresh button */}
      <div className="flex justify-center pt-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={fetchApprovals} data-testid="refresh-approvals-btn">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Approvals
        </Button>
      </div>
    </div>
  );
}

// Income split: Main Income (everything except DT) + Direct Transfer
function IncomeTabsView({ incomeEntries, classifyMode, onView, onPrint, onDelete }) {
  const [tab, setTab] = useState('main');
  const [dtPayDialog, setDtPayDialog] = useState({ open: false, dtIncome: null });
  const isDT = (e) => (e.payment_mode === 'direct_transfer') || (classifyMode(e.payment_mode) === 'direct_transfer');
  // Feb 22 2026 — Carry-forward auto-rows created by the Lock Closing
  // Balance dialog (source='carry_forward_lock'). They live in their own
  // sub-tab so the Main Income view stays a clean list of real receipts.
  const isCarryForward = (e) => e?.source === 'carry_forward_lock';
  const carryForward = (incomeEntries || []).filter(isCarryForward);
  const main = (incomeEntries || []).filter(e => !isDT(e) && !isCarryForward(e));
  const dt = (incomeEntries || []).filter(e => isDT(e) && !isCarryForward(e));
  const list = tab === 'main' ? main : (tab === 'dt' ? dt : carryForward);
  const dtStatusBadge = (s) => {
    const map = {
      pending_cre_recv: { label: 'CRE: Mark Received', cls: 'bg-blue-100 text-blue-700' },
      pending_accountant_review: { label: 'Awaiting Review', cls: 'bg-purple-100 text-purple-700' },
      completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
    };
    const m = map[s] || { label: 'New', cls: 'bg-amber-100 text-amber-700' };
    return <Badge className={`${m.cls} text-[10px]`}>{m.label}</Badge>;
  };
  return (
    <div className="space-y-3" data-testid="income-tabs-view">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('main')}
          className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${tab === 'main' ? 'bg-green-50 border-green-300 text-green-800 ring-1 ring-green-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
          data-testid="income-tab-main"
        >Main Income <span className="ml-1 font-bold">({main.length})</span></button>
        <button
          type="button"
          onClick={() => setTab('dt')}
          className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${tab === 'dt' ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-1 ring-emerald-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
          data-testid="income-tab-dt"
        >Direct Transfer <span className="ml-1 font-bold">({dt.length})</span></button>
        <button
          type="button"
          onClick={() => setTab('cf')}
          className={`px-4 py-1.5 text-xs font-medium rounded-full border transition-all ${tab === 'cf' ? 'bg-indigo-50 border-indigo-300 text-indigo-800 ring-1 ring-indigo-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
          data-testid="income-tab-carry-forward"
        >Carry Forward <span className="ml-1 font-bold">({carryForward.length})</span></button>
      </div>
      <Card>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid={`cashbook-income-${tab}-table`}>
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Date & Time</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Stage</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">{tab === 'dt' ? 'DT Status' : 'Txn ID'}</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry, i) => (
                  <tr key={entry.income_id || i} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      {new Date(entry.approved_at || entry.payment_date || entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      {' '}<span className="text-gray-400">{new Date(entry.approved_at || entry.payment_date || entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-3 py-2 font-medium">{entry.project_name || 'N/A'}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{entry.stage || entry.description || 'Payment'}</Badge></td>
                    <td className="px-3 py-2">
                      <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(entry.payment_mode)]}`}>
                        {MODE_LABELS[classifyMode(entry.payment_mode)] || entry.payment_mode}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">
                      {tab === 'dt' ? dtStatusBadge(entry.dt_status) : (entry.reference_number || entry.cheque_number || 'Cash')}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-green-700"><MaskedValue value={entry.amount} className="text-green-700" /></td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {tab === 'dt' && (!entry.dt_status || entry.dt_status === 'new') && (
                          <Button
                            size="sm"
                            className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 gap-1 px-2"
                            onClick={() => setDtPayDialog({ open: true, dtIncome: entry })}
                            data-testid={`dt-select-pay-btn-${entry.income_id}`}
                          >
                            Select to Pay
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onView(entry)}><Eye className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-600" onClick={() => onPrint(entry)}><Printer className="h-3 w-3" /></Button>
                        {onDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                            onClick={() => onDelete(entry)}
                            data-testid={`income-delete-btn-${entry.income_id}`}
                            title="Delete income entry"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">
                    {tab === 'main' ? 'No main income entries found' : (tab === 'dt' ? 'No Direct Transfer entries found' : 'No Carry Forward entries yet — lock the closing balance with an Income value to populate this tab.')}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <DTSelectToPayDialog
        open={dtPayDialog.open}
        onOpenChange={(o) => !o && setDtPayDialog({ open: false, dtIncome: null })}
        dtIncome={dtPayDialog.dtIncome}
        onAssigned={() => window.dispatchEvent(new Event('refresh-cashbook'))}
      />
    </div>
  );
}

// Reusable expense approval table within AccountsBoard
function ApprovalExpenseTable({ items, type, idField, amountField, altAmountField, descField, processing, getApprovalAction, onApprove, onReject, onPay }) {
  if (!items || items.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-gray-400">
        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No pending {type} approvals
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid={`approvals-${type}-table`}>
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Status</th>
                <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const id = item[idField] || item.expense_id;
                const amount = item[amountField] || (altAmountField ? item[altAmountField] : 0) || 0;
                const desc = item[descField] || item.description || 'Unknown';
                const action = getApprovalAction(item.status, type);

                return (
                  <tr key={id} className="border-b hover:bg-gray-50" data-testid={`approval-${type}-row-${id}`}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '-'}</td>
                    <td className="px-3 py-2 font-medium">{desc}</td>
                    <td className="px-3 py-2">{item.project_name || 'N/A'}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700"><MaskedValue value={amount} className="text-amber-700" /></td>
                    <td className="px-3 py-2 text-center">
                      <Badge className={
                        item.status === 'requested' ? 'bg-yellow-100 text-yellow-700' :
                        item.status === 'planning_approved' ? 'bg-blue-100 text-blue-700' :
                        item.status === 'pending_accounts_approval' ? 'bg-orange-100 text-orange-700' :
                        item.status === 'procurement_priced' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }>{item.status?.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {action ? (
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {onPay && (
                            <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 gap-1 px-2"
                              disabled={processing === id}
                              onClick={() => onPay(id)}
                              data-testid={`pay-${type}-btn-${id}`}>
                              <Wallet className="h-3 w-3" /> Pay & Settle
                            </Button>
                          )}
                          <Button size="sm" className="h-6 text-[10px] bg-green-600 hover:bg-green-700 gap-1 px-2"
                            disabled={processing === id}
                            onClick={() => onApprove(type, id, action)}
                            data-testid={`approve-${type}-btn-${id}`}>
                            {processing === id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />} Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-600 border-red-200 gap-1 px-2"
                            onClick={() => onReject(id)}
                            data-testid={`reject-${type}-btn-${id}`}>
                            <ThumbsDown className="h-3 w-3" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400">No action available</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}


// ============ PROJECT SUMMARY TAB ============
function ProjectSummaryTab({ overview, userRole, onRefresh }) {
  const navigate = useNavigate();
  const isSuperAdmin = userRole === 'super_admin';

  // Permanent-wipe modal state
  const [wipeTarget, setWipeTarget] = useState(null);  // {project_id, project_name}
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeBusy, setWipeBusy] = useState(false);

  const handleWipe = async () => {
    if (!wipeTarget || wipeConfirmText !== 'DELETE') return;
    setWipeBusy(true);
    try {
      const res = await axios.delete(`${API}/projects/${wipeTarget.project_id}/permanent-wipe`, {
        data: { confirmation: 'DELETE' },
      });
      toast.success(res.data?.message || 'Project deleted');
      setWipeTarget(null);
      setWipeConfirmText('');
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to delete project');
    } finally {
      setWipeBusy(false);
    }
  };

  // Default to current month/year
  const _pToday = new Date();
  const _pStart = `${_pToday.getFullYear()}-${String(_pToday.getMonth() + 1).padStart(2, '0')}-01`;
  const _pEnd = (() => { const d = new Date(_pToday.getFullYear(), _pToday.getMonth() + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [projDateFrom, setProjDateFrom] = useState(_pStart);
  const [projDateTo, setProjDateTo] = useState(_pEnd);

  const [filteredData, setFilteredData] = useState(null);
  const [fLoading, setFLoading] = useState(false);

  // Team-based filter — pick role, pick a person, see only their projects.
  const [teamMap, setTeamMap] = useState(null);            // { roles: {role: [{user_id,name,project_ids}]}, total_live_projects }
  const [activeRole, setActiveRole] = useState(null);       // 'planning_person' | 'site_engineer' | 'project_manager' | 'sr_site_engineer' | null
  const [activeUserId, setActiveUserId] = useState(null);   // user_id currently filtered by

  // Feb 19 2026 — Project-name search box (case-insensitive, trim-safe).
  const [projSearch, setProjSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/accountant/team-project-map`)
      .then(r => { if (!cancelled) setTeamMap(r.data); })
      .catch(() => { if (!cancelled) setTeamMap(null); });
    return () => { cancelled = true; };
  }, []);
  const allowedProjectIds = (() => {
    if (!activeRole || !activeUserId || !teamMap) return null;
    const list = (teamMap.roles?.[activeRole] || []).find(u => u.user_id === activeUserId);
    return list ? new Set(list.project_ids) : new Set();
  })();

  useEffect(() => {
    let cancelled = false;
    const fetchFiltered = async () => {
      try {
        setFLoading(true);
        const params = new URLSearchParams();
        if (projDateFrom) params.append('start_date', projDateFrom);
        if (projDateTo) params.append('end_date', projDateTo);
        const res = await axios.get(`${API}/accountant/cashbook-filtered?${params}`);
        if (!cancelled) setFilteredData(res.data);
      } catch {
        if (!cancelled) setFilteredData(null);
      } finally {
        if (!cancelled) setFLoading(false);
      }
    };
    fetchFiltered();
    return () => { cancelled = true; };
  }, [projDateFrom, projDateTo]);

  // Compute project-wise breakdown — prefer the backend-computed
  // `project_wise` (seeded with ALL 51 real projects and aggregated
  // from the FULL incomes/expenses lists, not the [:500] slice).
  // Fall back to overview, and only if neither is available rebuild
  // from the truncated entries arrays.
  const projectsRaw = (() => {
    if (filteredData?.project_wise) return filteredData.project_wise;
    if (!filteredData) return overview?.project_wise || [];
    // Legacy fallback: derive from entries (may miss zero-balance projects)
    const map = {};
    (filteredData.income_entries || []).forEach(i => {
      const pid = i.project_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { project_id: pid, project_name: i.project_name || 'Unknown', income: 0, expense: 0 };
      map[pid].income += i.amount || 0;
    });
    (filteredData.expense_entries || []).forEach(e => {
      const pid = e.project_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { project_id: pid, project_name: e.project_name || 'Unknown', income: 0, expense: 0 };
      map[pid].expense += e.amount || 0;
    });
    Object.values(map).forEach(p => { p.balance = p.income - p.expense; });
    return Object.values(map).sort((a, b) => b.income - a.income);
  })();
  const projects = (() => {
    let list = allowedProjectIds
      ? projectsRaw.filter(p => allowedProjectIds.has(p.project_id))
      : projectsRaw;
    // Whitespace-tolerant search: collapse multiple spaces + trim on
    // both sides so " Mr Rajesh  puzhal" matches "rajesh puzhal".
    const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const q = normalize(projSearch);
    if (q) {
      list = list.filter(p => normalize(p.project_name).includes(q));
    }
    return list;
  })();

  const totals = filteredData?.summary
    ? {
        total_income: filteredData.summary.total_income,
        total_expense: filteredData.summary.total_expense,
        net_balance: filteredData.summary.net_balance,
        // Feb 22 2026 — Project Value Calculation cards on Project Wise tab.
        scope_value: filteredData.summary.scope_value || 0,
        additions_total: filteredData.summary.additions_total || 0,
        deductions_total: filteredData.summary.deductions_total || 0,
        grand_total_value: filteredData.summary.grand_total_value || 0,
        receivable: filteredData.summary.receivable || 0,
      }
    : (overview?.totals || {});

  return (
    <div className="space-y-4" data-testid="project-summary-tab">
      {/* Unified Date / Month / Year Filter + Project Search */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CashbookDateFilter
              dateFrom={projDateFrom}
              dateTo={projDateTo}
              setDateFrom={setProjDateFrom}
              setDateTo={setProjDateTo}
              testIdPrefix="projsummary"
              accent="amber"
            />
            {fLoading && <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />}
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={projSearch}
                onChange={(e) => setProjSearch(e.target.value)}
                placeholder="Search project name..."
                data-testid="project-summary-search"
                className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              {projSearch && (
                <button
                  type="button"
                  onClick={() => setProjSearch('')}
                  data-testid="project-summary-search-clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 text-xs"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team filter — pick a role then a person to filter the table below */}
      <Card data-testid="team-filter-card">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-gray-500 mr-1">Filter by:</p>
            {[
              { k: 'planning_person',  label: 'Planning Person',     pill: 'bg-violet-100 text-violet-700 border-violet-200',   active: 'bg-violet-600' },
              { k: 'site_engineer',    label: 'Site Engineer',       pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', active: 'bg-emerald-600' },
              { k: 'project_manager',  label: 'Project Manager',     pill: 'bg-amber-100 text-amber-800 border-amber-200',      active: 'bg-amber-600' },
              { k: 'sr_site_engineer', label: 'Senior Site Engineer', pill: 'bg-blue-100 text-blue-700 border-blue-200',         active: 'bg-blue-600' },
            ].map(r => (
              <button
                key={r.k}
                onClick={() => { setActiveRole(prev => prev === r.k ? null : r.k); setActiveUserId(null); }}
                data-testid={`team-role-${r.k}`}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  activeRole === r.k ? `${r.active} text-white border-transparent` : `${r.pill} hover:opacity-80`
                }`}
              >
                {r.label}
                <span className={`ml-1.5 text-[10px] ${activeRole === r.k ? 'opacity-80' : 'text-gray-500'}`}>
                  ({(teamMap?.roles?.[r.k] || []).length})
                </span>
              </button>
            ))}
            {(activeRole || activeUserId) && (
              <button
                onClick={() => { setActiveRole(null); setActiveUserId(null); }}
                className="text-xs text-gray-500 hover:text-red-600 ml-1"
                data-testid="team-filter-clear"
              >Clear</button>
            )}
          </div>
          {activeRole && (
            <div className="pt-2 border-t flex items-center gap-2 flex-wrap">
              <p className="text-xs text-gray-500 mr-1">Select person:</p>
              {(teamMap?.roles?.[activeRole] || []).length === 0 ? (
                <p className="text-xs text-gray-400 italic">No users in this role</p>
              ) : (
                (teamMap.roles[activeRole]).map(u => (
                  <button
                    key={u.user_id}
                    onClick={() => setActiveUserId(prev => prev === u.user_id ? null : u.user_id)}
                    data-testid={`team-user-${u.user_id}`}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                      activeUserId === u.user_id ? 'bg-gray-900 text-white border-transparent' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {u.name}
                    <span className={`text-[10px] px-1.5 rounded-full ${activeUserId === u.user_id ? 'bg-white/25' : 'bg-gray-100 text-gray-600'}`}>
                      {u.project_count}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          {activeUserId && allowedProjectIds && (
            <p className="text-[11px] text-gray-500 italic">
              Showing {projects.length} project{projects.length === 1 ? '' : 's'} handled by this person.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Feb 22 2026 — Project Wise hero cards split into two grouped
          sections: Project Value Calculation (Scope + Additions − Deductions
          = Grand Total) and Financial Performance (Income / Expense /
          Balance / Receivable). Replaces the legacy 3-card row. */}
      {(() => {
        const sv = totals.scope_value || 0;
        const ad = totals.additions_total || 0;
        const dd = totals.deductions_total || 0;
        const gt = totals.grand_total_value || 0;
        const ti = totals.total_income || 0;
        const te = totals.total_expense || 0;
        const tb = totals.net_balance || 0;
        const rc = totals.receivable || 0;
        const pctOfValue = gt > 0 ? ((ti / gt) * 100).toFixed(1) : '0.0';
        const pctOfIncome = ti > 0 ? ((te / ti) * 100).toFixed(1) : '0.0';
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Project Value Calculation */}
            <Card className="border-t-4 border-t-indigo-300 bg-indigo-50/30">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-indigo-700/80 font-bold mb-2">Project Value Calculation</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white rounded-md border border-blue-200 p-2.5 text-center" data-testid="pw-scope-value">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Scope Value</p>
                    <p className="text-sm font-bold text-blue-700 mt-1 break-words"><MaskedValue value={sv} className="text-blue-700" testId="masked-scope" /></p>
                  </div>
                  <div className="bg-white rounded-md border border-cyan-200 p-2.5 text-center" data-testid="pw-additions">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Additions</p>
                    <p className="text-sm font-bold text-cyan-700 mt-1 break-words"><MaskedValue value={ad} className="text-cyan-700" testId="masked-additions" /></p>
                  </div>
                  <div className="bg-white rounded-md border border-orange-200 p-2.5 text-center" data-testid="pw-deductions">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Deductions</p>
                    <p className="text-sm font-bold text-orange-700 mt-1 break-words"><MaskedValue value={dd} className="text-orange-700" testId="masked-deductions" /></p>
                  </div>
                  <div className="bg-violet-600 rounded-md border border-violet-700 p-2.5 text-center text-white" data-testid="pw-grand-total">
                    <p className="text-[10px] uppercase text-violet-100 font-semibold">Grand Total</p>
                    <p className="text-sm font-bold mt-1 break-words"><MaskedValue value={gt} className="text-white" testId="masked-grand-total" /></p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Performance */}
            <Card className="border-t-4 border-t-emerald-300 bg-emerald-50/30">
              <CardContent className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 font-bold mb-2">Financial Performance</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white rounded-md border border-emerald-200 p-2.5 text-center" data-testid="pw-total-income">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Total Income</p>
                    <p className="text-sm font-bold text-emerald-700 mt-1 break-words"><MaskedValue value={ti} className="text-emerald-700" testId="masked-proj-income" /></p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{pctOfValue}% of value</p>
                  </div>
                  <div className="bg-white rounded-md border border-rose-200 p-2.5 text-center" data-testid="pw-total-expense">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Total Expense</p>
                    <p className="text-sm font-bold text-rose-700 mt-1 break-words"><MaskedValue value={te} className="text-rose-700" testId="masked-proj-expense" /></p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{pctOfIncome}% of income</p>
                  </div>
                  <div className="bg-white rounded-md border border-indigo-200 p-2.5 text-center" data-testid="pw-total-balance">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">Total Balance</p>
                    <p className={`text-sm font-bold mt-1 break-words ${tb >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}><MaskedValue value={tb} className={tb >= 0 ? 'text-indigo-700' : 'text-rose-700'} testId="masked-proj-net" /></p>
                    <p className="text-[9px] text-gray-400 mt-0.5">Income − Expense</p>
                  </div>
                  <div className="bg-amber-500 rounded-md border border-amber-600 p-2.5 text-center text-white" data-testid="pw-receivable">
                    <p className="text-[10px] uppercase text-amber-100 font-semibold">Receivable</p>
                    <p className="text-sm font-bold mt-1 break-words"><MaskedValue value={rc} className="text-white" testId="masked-receivable" /></p>
                    <p className="text-[9px] text-amber-100 mt-0.5">Yet to receive</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-600" /> All Projects
              <Badge variant="outline" className="text-xs">{projects.length} projects</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="project-summary-table">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">S.No</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Project</th>
                  <th className="text-right px-3 py-2 font-semibold text-blue-700">Scope Value</th>
                  <th className="text-right px-3 py-2 font-semibold text-cyan-700">Additions</th>
                  <th className="text-right px-3 py-2 font-semibold text-orange-700">Deductions</th>
                  <th className="text-right px-3 py-2 font-semibold text-violet-700">Grand Total</th>
                  <th className="text-right px-3 py-2 font-semibold text-green-600">Income</th>
                  <th className="text-right px-3 py-2 font-semibold text-red-600">Expense</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600">Balance</th>
                  <th className="text-right px-3 py-2 font-semibold text-amber-700">Receivable</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-600">P&L</th>
                  {isSuperAdmin && <th className="text-center px-3 py-2 font-semibold text-gray-600 w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((p, i) => {
                  const pnl = (p.income || 0) - (p.expense || 0);
                  const pnlPct = p.income ? ((pnl / p.income) * 100).toFixed(1) : '0.0';
                  const navProj = () => p.project_id && navigate(`/projects/${p.project_id}`);
                  return (
                    <tr key={i} className="hover:bg-amber-50 transition-colors" data-testid={`project-row-${i}`}>
                      <td className="px-3 py-2 text-gray-400 cursor-pointer" onClick={navProj}>{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-blue-700 underline decoration-dotted cursor-pointer" onClick={navProj}>{(p.project_name || '').replace(/\s+/g, ' ').trim()}</td>
                      <td className="px-3 py-2 text-right text-blue-700 font-medium cursor-pointer" onClick={navProj}><MaskedValue value={p.scope_value || 0} className="text-blue-700" /></td>
                      <td className="px-3 py-2 text-right text-cyan-700 font-medium cursor-pointer" onClick={navProj}><MaskedValue value={p.additions || 0} className="text-cyan-700" /></td>
                      <td className="px-3 py-2 text-right text-orange-700 font-medium cursor-pointer" onClick={navProj}><MaskedValue value={p.deductions || 0} className="text-orange-700" /></td>
                      <td className="px-3 py-2 text-right text-violet-700 font-bold cursor-pointer" onClick={navProj}><MaskedValue value={p.grand_total || 0} className="text-violet-700" /></td>
                      <td className="px-3 py-2 text-right text-green-700 font-semibold cursor-pointer" onClick={navProj}><MaskedValue value={p.income} className="text-green-700" /></td>
                      <td className="px-3 py-2 text-right text-red-600 font-semibold cursor-pointer" onClick={navProj}><MaskedValue value={p.expense} className="text-red-600" /></td>
                      <td className={`px-3 py-2 text-right font-bold cursor-pointer ${p.balance >= 0 ? 'text-green-700' : 'text-red-600'}`} onClick={navProj}><MaskedValue value={p.balance} className={p.balance >= 0 ? 'text-green-700' : 'text-red-600'} /></td>
                      <td className="px-3 py-2 text-right text-amber-700 font-semibold cursor-pointer" onClick={navProj}><MaskedValue value={((p.grand_total || 0) - (p.income || 0))} className="text-amber-700" /></td>
                      <td className="px-3 py-2 text-center cursor-pointer" onClick={navProj}>
                        <Badge className={pnl >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {pnl >= 0 ? '+' : ''}{pnlPct}%
                        </Badge>
                      </td>
                      {isSuperAdmin && (
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setWipeTarget({ project_id: p.project_id, project_name: (p.project_name || '').replace(/\s+/g, ' ').trim() }); setWipeConfirmText(''); }}
                            data-testid={`project-delete-${p.project_id}`}
                            className="p-1.5 rounded hover:bg-red-100 text-red-500 hover:text-red-700 transition-colors"
                            title="Permanently delete project"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {projects.length === 0 && (
                  <tr><td colSpan={isSuperAdmin ? 12 : 11} className="px-4 py-8 text-center text-gray-400">No projects found</td></tr>
                )}
              </tbody>
              {projects.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr className="font-bold">
                    <td className="px-3 py-2" colSpan={2}>Total ({projects.length} projects)</td>
                    <td className="px-3 py-2 text-right text-blue-700"><MaskedValue value={projects.reduce((s, p) => s + (p.scope_value || 0), 0)} className="text-blue-700" /></td>
                    <td className="px-3 py-2 text-right text-cyan-700"><MaskedValue value={projects.reduce((s, p) => s + (p.additions || 0), 0)} className="text-cyan-700" /></td>
                    <td className="px-3 py-2 text-right text-orange-700"><MaskedValue value={projects.reduce((s, p) => s + (p.deductions || 0), 0)} className="text-orange-700" /></td>
                    <td className="px-3 py-2 text-right text-violet-700"><MaskedValue value={projects.reduce((s, p) => s + (p.grand_total || 0), 0)} className="text-violet-700" /></td>
                    <td className="px-3 py-2 text-right text-green-700"><MaskedValue value={projects.reduce((s, p) => s + (p.income || 0), 0)} className="text-green-700" /></td>
                    <td className="px-3 py-2 text-right text-red-600"><MaskedValue value={projects.reduce((s, p) => s + (p.expense || 0), 0)} className="text-red-600" /></td>
                    <td className={`px-3 py-2 text-right ${totals.net_balance >= 0 ? 'text-green-700' : 'text-red-600'}`}><MaskedValue value={totals.net_balance} className={totals.net_balance >= 0 ? 'text-green-700' : 'text-red-600'} /></td>
                    <td className="px-3 py-2 text-right text-amber-700"><MaskedValue value={projects.reduce((s, p) => s + ((p.grand_total || 0) - (p.income || 0)), 0)} className="text-amber-700" /></td>
                    <td className="px-3 py-2"></td>
                    {isSuperAdmin && <td className="px-3 py-2"></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Permanent-wipe confirmation modal — Super Admin only */}
      <Dialog open={!!wipeTarget} onOpenChange={(v) => { if (!v) { setWipeTarget(null); setWipeConfirmText(''); } }}>
        <DialogContent className="max-w-lg" data-testid="project-wipe-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Permanently Delete Project
            </DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-red-800 text-xs space-y-1.5">
              <p className="font-bold text-sm flex items-center gap-1.5">
                ⚠ This will wipe the project + ALL associated data:
              </p>
              <ul className="list-disc list-inside text-red-700 space-y-0.5 pl-1">
                <li>All <strong>stages</strong> (Payment & Work Order stages)</li>
                <li>All <strong>RABs</strong> (raised, approved, paid)</li>
                <li>All <strong>payments</strong>, <strong>income</strong> and <strong>expense</strong> entries</li>
                <li>All <strong>cheques</strong> linked to this project</li>
                <li>All <strong>additional items</strong> (Claimable, Non-Claimable, Rework)</li>
                <li>All <strong>attendance</strong> and labour records</li>
                <li>The project&apos;s <strong>Client Portal access</strong></li>
                <li>All <strong>files</strong>, <strong>documents</strong> and <strong>cashflow ledger</strong> rows</li>
              </ul>
            </div>
            <div className="rounded bg-gray-50 px-3 py-2 text-xs">
              <p className="text-gray-600">Project to delete:</p>
              <p className="font-bold text-gray-900 text-sm" data-testid="wipe-project-name">{wipeTarget?.project_name}</p>
            </div>
            <div>
              <Label className="text-red-700">Type <code className="bg-red-100 px-1.5 py-0.5 rounded text-red-800 font-bold">DELETE</code> to confirm *</Label>
              <Input
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value)}
                placeholder="DELETE"
                className="mt-1 border-red-300 focus:border-red-500 focus:ring-red-500"
                data-testid="wipe-confirm-input"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWipeTarget(null); setWipeConfirmText(''); }}>Cancel</Button>
            <Button
              onClick={handleWipe}
              disabled={wipeConfirmText !== 'DELETE' || wipeBusy}
              className="bg-red-600 hover:bg-red-700 gap-1"
              data-testid="wipe-confirm-btn"
            >
              <Trash2 className="h-4 w-4" /> {wipeBusy ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// ============ MAIN ACCOUNTS BOARD ============
// ==================== CARRY FORWARD TAB ====================
// Feb 12 2026 — surfaces the Super Admin's manually-locked closing balance
// across 4 buckets (Current Account / Savings / Cash / Cheque) plus a manual
// overall amount. Plain Accountants can see the values; only Super Admin can
// open the popup and lock new figures (matching role rule from backend).
function CarryForwardTab({ userRole }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    manual_amount: '',
    // Feb 12 2026 — Income / Expense entered per mode. Balance = Income − Expense.
    buckets: {
      current_account: { income: '', expense: '' },
      savings: { income: '', expense: '' },
      cash: { income: '', expense: '' },
      cheque: { income: '', expense: '' },
      direct_transfer: { income: '', expense: '' },
    },
  });
  // Project-wise table state (Feb 2026)
  const [projectRows, setProjectRows] = useState([]);
  // Feb 22 2026 — Search filter for Project-wise Carry Forward table.
  const [cfRowSearch, setCfRowSearch] = useState('');
  const [projectTotals, setProjectTotals] = useState(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProject, setPickerProject] = useState(null);
  const [cfDialog, setCfDialog] = useState({ open: false, type: null, project: null });
  const [cfForm, setCfForm] = useState({
    // Income side
    adjustment_amount: '',
    carry_forward_amount: '',
    // Expense side (4 separate buckets — Feb 2026 user spec)
    material_carry_forward: '',
    labour_carry_forward: '',
    petty_cash_carry_forward: '',
    indirect_carry_forward: '',
    note: '',
  });
  const [cfSaving, setCfSaving] = useState(false);
  const canEdit = userRole === 'super_admin';

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/accountant/closing-balance`);
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load closing balance');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Per-project carry-forward table data
  const loadProjects = useCallback(async () => {
    try {
      setProjectLoading(true);
      const res = await axios.get(`${API}/accountant/carry-forward/projects`);
      setProjectRows(res.data?.rows || []);
      setProjectTotals(res.data?.totals || null);
    } catch (e) {
      toast.error('Failed to load project carry-forwards');
    } finally {
      setProjectLoading(false);
    }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const openCfDialog = (project, type) => {
    setCfDialog({ open: true, type, project });
    if (type === 'income') {
      setCfForm({
        adjustment_amount: project.income_adjustment ?? '',
        carry_forward_amount: project.income_carry_forward ?? '',
        material_carry_forward: '',
        labour_carry_forward: '',
        petty_cash_carry_forward: '',
        indirect_carry_forward: '',
        note: '',
      });
    } else {
      setCfForm({
        adjustment_amount: '',
        carry_forward_amount: '',
        material_carry_forward: project.material_carry_forward ?? '',
        labour_carry_forward: project.labour_carry_forward ?? '',
        petty_cash_carry_forward: project.petty_cash_carry_forward ?? '',
        indirect_carry_forward: project.indirect_carry_forward ?? '',
        note: '',
      });
    }
  };

  const askIncomeOrExpense = (project) => {
    setPickerProject(project);
    setPickerOpen(true);
  };

  const submitCarryForward = async () => {
    if (!cfDialog.project || !cfDialog.type) return;
    try {
      setCfSaving(true);
      const payload = {
        type: cfDialog.type,
        note: cfForm.note || '',
      };
      if (cfDialog.type === 'income') {
        payload.adjustment_amount = parseFloat(cfForm.adjustment_amount) || 0;
        payload.carry_forward_amount = parseFloat(cfForm.carry_forward_amount) || 0;
      } else {
        payload.material_carry_forward = parseFloat(cfForm.material_carry_forward) || 0;
        payload.labour_carry_forward = parseFloat(cfForm.labour_carry_forward) || 0;
        payload.petty_cash_carry_forward = parseFloat(cfForm.petty_cash_carry_forward) || 0;
        payload.indirect_carry_forward = parseFloat(cfForm.indirect_carry_forward) || 0;
      }
      await axios.post(`${API}/accountant/carry-forward/${cfDialog.project.project_id}`, payload);
      toast.success(`${cfDialog.type === 'income' ? 'Income' : 'Expense'} carry-forward saved`);
      setCfDialog({ open: false, type: null, project: null });
      await loadProjects();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setCfSaving(false);
    }
  };

  // Live "expense popup" computed values
  const cfDialogComputed = (() => {
    const p = cfDialog.project;
    if (!p) return null;
    if (cfDialog.type === 'expense') {
      const matCf = parseFloat(cfForm.material_carry_forward) || 0;
      const labCf = parseFloat(cfForm.labour_carry_forward) || 0;
      const pcCf = parseFloat(cfForm.petty_cash_carry_forward) || 0;
      const indirectCf = parseFloat(cfForm.indirect_carry_forward) || 0;
      const directCf = matCf + labCf + pcCf;
      const totalCf = directCf + indirectCf;
      const grandExpense = (p.direct_expense_total || 0) + totalCf;
      const difference = (p.grand_income || 0) - grandExpense;
      return { matCf, labCf, pcCf, indirectCf, directCf, totalCf, grandExpense, difference };
    }
    const adj = parseFloat(cfForm.adjustment_amount) || 0;
    const carry = parseFloat(cfForm.carry_forward_amount) || 0;
    const grand = (p.total_income || 0) + adj + carry;
    const difference = grand - (p.grand_expense || 0);
    return { adj, carry, grand, difference };
  })();

  const openDialog = () => {
    const b = data?.buckets || {};
    const pick = (k) => ({
      income: b[k]?.income ?? '',
      expense: b[k]?.expense ?? '',
    });
    setForm({
      manual_amount: data?.manual_amount ?? '',
      buckets: {
        current_account: pick('current_account'),
        savings: pick('savings'),
        cash: pick('cash'),
        cheque: pick('cheque'),
        direct_transfer: pick('direct_transfer'),
      },
    });
    setDialogOpen(true);
  };

  const liveBucketBalance = (k) => {
    const inc = parseFloat(form.buckets[k]?.income) || 0;
    const exp = parseFloat(form.buckets[k]?.expense) || 0;
    return inc - exp;
  };
  const liveTotalIncome = () =>
    Object.keys(form.buckets).reduce((s, k) => s + (parseFloat(form.buckets[k]?.income) || 0), 0);
  const liveTotalExpense = () =>
    Object.keys(form.buckets).reduce((s, k) => s + (parseFloat(form.buckets[k]?.expense) || 0), 0);
  const liveTotalBalance = () => liveTotalIncome() - liveTotalExpense();

  const handleLock = async () => {
    try {
      setSaving(true);
      const buckets = {};
      for (const k of Object.keys(form.buckets)) {
        buckets[k] = {
          income: parseFloat(form.buckets[k].income) || 0,
          expense: parseFloat(form.buckets[k].expense) || 0,
        };
      }
      const payload = {
        manual_amount: parseFloat(form.manual_amount) || liveTotalBalance(),
        buckets,
      };
      const res = await axios.post(`${API}/accountant/closing-balance`, payload);
      setData(res.data);
      setDialogOpen(false);
      toast.success('Closing balance locked');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to lock closing balance');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
      </div>
    );
  }

  // Feb 22 2026 — Display order & labels updated per request:
  //   1. Cash          2. HDFC Current   3. HDFC Savings
  //   4. Cheque        5. Cash DT
  // DB keys (`current_account`, `savings`, `direct_transfer`) are kept
  // untouched so legacy closing_balance docs continue to load.
  const buckets = [
    { key: 'cash', label: 'Cash', Icon: Banknote, accent: 'border-l-amber-500 bg-amber-50/40' },
    { key: 'current_account', label: 'HDFC Current', Icon: Landmark, accent: 'border-l-blue-500 bg-blue-50/40' },
    { key: 'savings', label: 'HDFC Savings', Icon: PiggyBank, accent: 'border-l-emerald-500 bg-emerald-50/40' },
    { key: 'cheque', label: 'Cheque', Icon: FileText, accent: 'border-l-violet-500 bg-violet-50/40' },
    { key: 'direct_transfer', label: 'Cash DT', Icon: TrendingUp, accent: 'border-l-rose-500 bg-rose-50/40' },
  ];
  const bv = (k, field) => (data?.buckets?.[k]?.[field] ?? 0);

  return (
    <div className="space-y-4" data-testid="carry-forward-tab">
      {/* Hero card — current net amount + Open popup */}
      <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/60 to-white">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-indigo-700 font-semibold">
              <Wallet className="h-4 w-4" /> Current Net Amount
            </div>
            <div className="mt-1 text-3xl sm:text-4xl font-bold text-gray-900" data-testid="carry-forward-manual-amount">
              {fmt(data?.manual_amount)}
            </div>
            {data?.locked_at && (
              <div className="text-[11px] text-gray-500 mt-1">
                Last locked {new Date(data.locked_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                {data?.locked_by_name ? ` · by ${data.locked_by_name}` : ''}
              </div>
            )}
          </div>
          {canEdit && (
            <Button
              onClick={openDialog}
              className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              data-testid="open-carry-forward-dialog"
            >
              <Lock className="h-4 w-4" /> {data?.locked_at ? 'Update Lock' : 'Lock Balance'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 5 bucket cards (Income / Expense / Balance) + Grand Total */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {buckets.map((b) => (
          <Card key={b.key} className={`border-l-4 ${b.accent}`} data-testid={`carry-forward-${b.key}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-600 font-semibold">
                <b.Icon className="h-3.5 w-3.5" /> {b.label}
              </div>
              <div className="mt-1.5 space-y-0.5 text-[11px]">
                <div className="flex justify-between"><span className="text-emerald-700">Income</span><span className="font-semibold">{fmt(bv(b.key, 'income'))}</span></div>
                <div className="flex justify-between"><span className="text-rose-700">Expense</span><span className="font-semibold">{fmt(bv(b.key, 'expense'))}</span></div>
                <div className="flex justify-between border-t pt-0.5"><span className="font-semibold text-gray-800">Balance</span><span className={`font-bold ${bv(b.key, 'balance') >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(bv(b.key, 'balance'))}</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card className="border-l-4 border-l-gray-800 bg-gray-900 text-white" data-testid="carry-forward-total">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-300 font-semibold">
              <TrendingUp className="h-3.5 w-3.5" /> Total
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px]">
              <div className="flex justify-between"><span className="text-emerald-300">Income</span><span className="font-semibold">{fmt(data?.total_income)}</span></div>
              <div className="flex justify-between"><span className="text-rose-300">Expense</span><span className="font-semibold">{fmt(data?.total_expense)}</span></div>
              <div className="flex justify-between border-t border-gray-700 pt-0.5"><span className="font-semibold">Balance</span><span className="font-bold">{fmt(data?.total_balance)}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!canEdit && (
        <p className="text-[11px] text-gray-500 italic">
          Only Super Admin can lock or update the closing balance.
        </p>
      )}

      {/* ─── Project-wise Carry Forward Table (Feb 2026) ─────────────── */}
      <Card className="mt-6">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Project-wise Carry Forward</CardTitle>
            <p className="text-[11px] text-gray-500">Manual one-time adjustments to align live ledger with offline records.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-56 sm:w-64">
              <Input
                type="text"
                placeholder="Search project…"
                value={cfRowSearch}
                onChange={(e) => setCfRowSearch(e.target.value)}
                className="h-8 text-xs pl-3 pr-7"
                data-testid="cf-row-search"
              />
              {cfRowSearch && (
                <button
                  type="button"
                  onClick={() => setCfRowSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none"
                  data-testid="cf-row-search-clear"
                  aria-label="Clear search"
                >×</button>
              )}
            </div>
            {projectTotals && (
              <div className="text-right text-[11px] text-gray-600">
                <div>Total Income: <span className="font-semibold text-emerald-700">₹{projectTotals.grand_income.toLocaleString('en-IN')}</span></div>
                <div>Total Expense: <span className="font-semibold text-rose-700">₹{projectTotals.grand_expense.toLocaleString('en-IN')}</span></div>
                <div>Difference: <span className={`font-semibold ${projectTotals.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>₹{projectTotals.difference.toLocaleString('en-IN')}</span></div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {projectLoading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-600" />
            </div>
          ) : projectRows.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">No projects yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="carry-forward-projects-table">
                <thead className="bg-gray-50 text-gray-700 uppercase text-[10px] tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 w-12">S.No</th>
                    <th className="text-left px-3 py-2">Project</th>
                    <th className="text-right px-3 py-2">Project Value</th>
                    <th className="text-right px-3 py-2">Total Income</th>
                    <th className="text-right px-3 py-2">CF Income</th>
                    <th className="text-right px-3 py-2">Total Expense</th>
                    <th className="text-right px-3 py-2">CF Expense</th>
                    <th className="text-right px-3 py-2">Difference</th>
                    {canEdit && <th className="text-center px-3 py-2">Carry Forward</th>}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = cfRowSearch.trim().toLowerCase();
                    const filtered = projectRows.filter(r => !q || (r.project_name || '').toLowerCase().includes(q));
                    if (filtered.length === 0) {
                      return (
                        <tr><td colSpan={canEdit ? 9 : 8} className="text-center text-sm text-gray-400 py-8">No project matches &quot;{cfRowSearch}&quot;</td></tr>
                      );
                    }
                    return filtered.map((r, idx) => (
                    <tr key={r.project_id} className="border-t hover:bg-amber-50/30">
                      <td className="px-3 py-2 text-gray-500 tabular-nums" data-testid={`cf-row-sno-${r.project_id}`}>{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.project_name}</td>
                      <td className="px-3 py-2 text-right">₹{(r.project_value || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">₹{(r.total_income || 0).toLocaleString('en-IN')}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${canEdit ? 'cursor-pointer underline-offset-2 hover:underline text-emerald-700' : 'text-gray-500'}`}
                        onClick={() => canEdit && openCfDialog(r, 'income')}
                        data-testid={`cf-income-cell-${r.project_id}`}
                        title={canEdit ? 'Click to edit income carry-forward' : ''}
                      >
                        ₹{(r.income_carry_forward || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 text-right text-rose-700">₹{(r.direct_expense_total || 0).toLocaleString('en-IN')}</td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${canEdit ? 'cursor-pointer underline-offset-2 hover:underline text-rose-700' : 'text-gray-500'}`}
                        onClick={() => canEdit && openCfDialog(r, 'expense')}
                        data-testid={`cf-expense-cell-${r.project_id}`}
                        title={canEdit ? 'Click to edit expense carry-forward' : ''}
                      >
                        ₹{(r.expense_carry_forward || 0).toLocaleString('en-IN')}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${r.difference === 0 ? 'text-gray-600' : (r.difference > 0 ? 'text-emerald-700' : 'text-rose-700')}`}>
                        ₹{(r.difference || 0).toLocaleString('en-IN')}
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] gap-1 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                            onClick={() => askIncomeOrExpense(r)}
                            data-testid={`cf-row-btn-${r.project_id}`}
                          >
                            <Lock className="h-3 w-3" /> Carry Forward
                          </Button>
                        </td>
                      )}
                    </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Income / Expense picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Carry Forward — {pickerProject?.project_name}</DialogTitle>
            <DialogDescription className="text-xs">Pick which side you want to add a carry-forward / adjustment for.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Button
              variant="outline"
              className="h-20 flex-col gap-1 border-emerald-300 hover:bg-emerald-50 text-emerald-700"
              onClick={() => { setPickerOpen(false); openCfDialog(pickerProject, 'income'); }}
              data-testid="picker-income-btn"
            >
              <ArrowDownRight className="h-5 w-5" />
              <span className="text-sm font-semibold">Income</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-1 border-rose-300 hover:bg-rose-50 text-rose-700"
              onClick={() => { setPickerOpen(false); openCfDialog(pickerProject, 'expense'); }}
              data-testid="picker-expense-btn"
            >
              <ArrowUpRight className="h-5 w-5" />
              <span className="text-sm font-semibold">Expense</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Income / Expense carry-forward edit dialog */}
      <Dialog open={cfDialog.open} onOpenChange={(open) => setCfDialog({ ...cfDialog, open })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={cfDialog.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}>
              {cfDialog.type === 'income' ? 'Income' : 'Expense'} Carry Forward — {cfDialog.project?.project_name}
            </DialogTitle>
          </DialogHeader>

          {cfDialog.type === 'expense' && cfDialog.project && (
            <div className="space-y-3">
              {/* Live ledger reference (read-only) */}
              <div className="space-y-1 text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-semibold">Live Ledger (read-only)</div>
                <div className="flex justify-between"><span>Material (actual)</span><span className="font-semibold">₹{(cfDialog.project.material_expense || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between"><span>Work Order (actual)</span><span className="font-semibold">₹{(cfDialog.project.work_order_expense || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between"><span>Petty Cash (actual)</span><span className="font-semibold">₹{(cfDialog.project.petty_cash_expense || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1"><span>Direct Expense Total</span><span className="font-semibold">₹{(cfDialog.project.direct_expense_total || 0).toLocaleString('en-IN')}</span></div>
              </div>

              {/* Carry-forward INPUT panel */}
              <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50/40 p-3">
                <div className="text-[10px] uppercase tracking-wide text-rose-700 font-semibold">Carry Forward Entry</div>

                <div className="text-[11px] font-semibold text-gray-700 mt-1">Direct</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-gray-600">Material</Label>
                    <Input
                      type="number" step="0.01"
                      value={cfForm.material_carry_forward}
                      onChange={(e) => setCfForm({ ...cfForm, material_carry_forward: e.target.value })}
                      data-testid="cf-material-input"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-600">Labour</Label>
                    <Input
                      type="number" step="0.01"
                      value={cfForm.labour_carry_forward}
                      onChange={(e) => setCfForm({ ...cfForm, labour_carry_forward: e.target.value })}
                      data-testid="cf-labour-input"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-600">Petty Cash</Label>
                    <Input
                      type="number" step="0.01"
                      value={cfForm.petty_cash_carry_forward}
                      onChange={(e) => setCfForm({ ...cfForm, petty_cash_carry_forward: e.target.value })}
                      data-testid="cf-pettycash-input"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs bg-white/60 rounded px-2 py-1">
                  <span className="text-gray-600">Direct Auto Total</span>
                  <span className="font-semibold text-rose-700" data-testid="cf-direct-auto-total">₹{(cfDialogComputed?.directCf || 0).toLocaleString('en-IN')}</span>
                </div>

                <div className="text-[11px] font-semibold text-gray-700 mt-2">Indirect</div>
                <div>
                  <Label className="text-[10px] text-gray-600">Indirect Expense (single amount)</Label>
                  <Input
                    type="number" step="0.01"
                    value={cfForm.indirect_carry_forward}
                    onChange={(e) => setCfForm({ ...cfForm, indirect_carry_forward: e.target.value })}
                    data-testid="cf-indirect-input"
                    placeholder="0"
                  />
                </div>

                <div className="flex justify-between text-sm border-t pt-2 mt-1">
                  <span className="font-semibold text-gray-700">Total Expense CF (Direct + Indirect)</span>
                  <span className="font-bold text-rose-700" data-testid="cf-total-expense">₹{(cfDialogComputed?.totalCf || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Roll-up summary */}
              <div className="space-y-1 text-xs bg-rose-50/60 border border-rose-200 rounded-md p-3">
                <div className="flex justify-between"><span>Live Direct Expense</span><span>₹{(cfDialog.project.direct_expense_total || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-rose-700"><span>+ Carry Forward (Direct + Indirect)</span><span className="font-semibold">₹{(cfDialogComputed?.totalCf || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>Grand Total Expense</span><span>₹{(cfDialogComputed?.grandExpense || 0).toLocaleString('en-IN')}</span></div>
                <div className={`flex justify-between font-bold ${cfDialogComputed?.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <span>Project Difference (Income − Expense)</span><span>₹{(cfDialogComputed?.difference || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          )}

          {cfDialog.type === 'income' && cfDialog.project && (
            <div className="space-y-3">
              <div className="space-y-1 text-xs bg-emerald-50/40 border border-emerald-100 rounded-md p-3">
                <div className="flex justify-between"><span>Total Approved Income</span><span className="font-semibold">₹{(cfDialog.project.total_income || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-emerald-700"><span>+ Adjustment</span><span className="font-semibold">₹{(cfDialogComputed?.adj || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-emerald-700"><span>+ Carry Forward Add</span><span className="font-semibold">₹{(cfDialogComputed?.carry || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>Grand Income</span><span>₹{(cfDialogComputed?.grand || 0).toLocaleString('en-IN')}</span></div>
                <div className={`flex justify-between font-bold ${cfDialogComputed?.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <span>Project Difference (Income − Expense)</span><span>₹{(cfDialogComputed?.difference || 0).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Adjustment</Label>
                  <Input
                    type="number" step="0.01"
                    value={cfForm.adjustment_amount}
                    onChange={(e) => setCfForm({ ...cfForm, adjustment_amount: e.target.value })}
                    data-testid="cf-adjustment-input"
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">Income Carry Forward Add</Label>
                  <Input
                    type="number" step="0.01"
                    value={cfForm.carry_forward_amount}
                    onChange={(e) => setCfForm({ ...cfForm, carry_forward_amount: e.target.value })}
                    data-testid="cf-carry-input"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={cfForm.note}
              onChange={(e) => setCfForm({ ...cfForm, note: e.target.value })}
              placeholder="Why this carry-forward?"
              data-testid="cf-note-input"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCfDialog({ open: false, type: null, project: null })} disabled={cfSaving}>Cancel</Button>
            <Button
              onClick={submitCarryForward}
              disabled={cfSaving}
              className={cfDialog.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700 gap-1.5' : 'bg-rose-600 hover:bg-rose-700 gap-1.5'}
              data-testid="cf-save-btn"
            >
              <Lock className="h-4 w-4" /> {cfSaving ? 'Saving…' : 'Save Carry Forward'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Closing Balance dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-600" /> Lock Closing Balance
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter the current net amount and the 4 bucket-wise balances. The total is computed live from the 4 buckets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Manual Amount (Current Net Amount)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.manual_amount}
                onChange={(e) => setForm({ ...form, manual_amount: e.target.value })}
                data-testid="carry-forward-input-manual"
                placeholder="Auto-fills with Total Balance"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">Leave blank to auto-use the Total Balance below.</p>
            </div>

            {/* Matrix: 5 modes × {Income, Expense, Balance} */}
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 uppercase text-[10px]">
                  <tr>
                    <th className="text-left px-2 py-1.5">Mode</th>
                    <th className="text-right px-2 py-1.5">Income</th>
                    <th className="text-right px-2 py-1.5">Expense</th>
                    <th className="text-right px-2 py-1.5">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={b.key} className="border-t">
                      <td className="px-2 py-1.5 font-medium text-gray-800 flex items-center gap-1.5"><b.Icon className="h-3 w-3" /> {b.label}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.01"
                          value={form.buckets[b.key].income}
                          onChange={(e) => setForm({
                            ...form,
                            buckets: { ...form.buckets, [b.key]: { ...form.buckets[b.key], income: e.target.value } },
                          })}
                          data-testid={`cb-income-${b.key}`}
                          className="h-7 text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" step="0.01"
                          value={form.buckets[b.key].expense}
                          onChange={(e) => setForm({
                            ...form,
                            buckets: { ...form.buckets, [b.key]: { ...form.buckets[b.key], expense: e.target.value } },
                          })}
                          data-testid={`cb-expense-${b.key}`}
                          className="h-7 text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className={`px-2 py-1.5 text-right font-bold ${liveBucketBalance(b.key) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`} data-testid={`cb-balance-${b.key}`}>
                        {fmt(liveBucketBalance(b.key))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2">
                  <tr>
                    <td className="px-2 py-1.5 font-semibold text-gray-800">Total</td>
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-700" data-testid="cb-total-income">{fmt(liveTotalIncome())}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-rose-700" data-testid="cb-total-expense">{fmt(liveTotalExpense())}</td>
                    <td className={`px-2 py-1.5 text-right font-bold ${liveTotalBalance() >= 0 ? 'text-emerald-700' : 'text-rose-700'}`} data-testid="cb-total-balance">{fmt(liveTotalBalance())}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={handleLock}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              data-testid="carry-forward-lock-btn"
            >
              <Lock className="h-4 w-4" /> {saving ? 'Locking…' : 'Lock Closing Balance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



export default function AccountsBoard() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [projects, setProjects] = useState([]);
  const [mainTab, setMainTab] = useState('cashbook');
  const [globalUnmasked, setGlobalUnmasked] = useState(false);
  const [unmaskDialog, setUnmaskDialog] = useState(false);

  // Sync mainTab with URL ?tab= query param (so header nav works)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t && ['cashbook', 'approvals', 'cheques', 'projects', 'carry-forward'].includes(t)) {
      setMainTab(t);
    }
  }, [location.search]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [userRes, overviewRes, projectsRes] = await Promise.all([
        axios.get(`${API}/auth/me`),
        axios.get(`${API}/accountant/overview`),
        axios.get(`${API}/projects`).catch(() => ({ data: [] })),
      ]);
      if (!['accountant', 'super_admin'].includes(userRes.data.role)) {
        toast.error('Access denied - Accountant only');
        window.location.href = '/dashboard';
        return;
      }
      setUser(userRes.data);
      setOverview(overviewRes.data);
      setProjects(projectsRes.data);
    } catch (error) {
      if (error.response?.status === 401) window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchAll, 15000);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader user={user} />
        <div className="flex items-center justify-center h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </div>
    );
  }

  // Mask/Unmask toggle button — moved into the header (right of nav, before bell).
  const maskToggleButton = user?.role && user.role !== 'super_admin' ? (
    globalUnmasked ? (
      <Button
        variant="outline"
        size="sm"
        className="border-red-300 text-red-600 hover:bg-red-50 hidden md:inline-flex"
        onClick={() => setGlobalUnmasked(false)}
        data-testid="mask-all-btn"
      >
        <EyeOff className="h-4 w-4 mr-1.5" /> Mask All
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="border-amber-300 text-amber-700 hover:bg-amber-50 hidden md:inline-flex"
        onClick={() => setUnmaskDialog(true)}
        data-testid="unmask-all-btn"
      >
        <Eye className="h-4 w-4 mr-1.5" /> Unmask All
      </Button>
    )
  ) : null;

  // Cashflow Engine quick-link for Accountant/SuperAdmin
  const cashflowLinkButton = (
    <Link to="/cashflow-engine">
      <Button size="sm" variant="outline" className="h-9 px-3 border-indigo-300 text-indigo-700 hover:bg-indigo-50" data-testid="accounts-cashflow-engine-link">
        <Wallet className="h-4 w-4 mr-1.5" /> Cashflow Engine
      </Button>
    </Link>
  );
  const combinedHeaderActions = (
    <div className="flex items-center gap-2">
      {cashflowLinkButton}
      {maskToggleButton}
    </div>
  );

  return (
    <MaskContext.Provider value={user?.role || 'accountant'}>
    <UnmaskContext.Provider value={globalUnmasked}>
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-4" data-testid="accounts-board">
      <AppHeader user={user} headerActions={combinedHeaderActions} />
      <main className="max-w-[1400px] mx-auto px-3 md:px-6 pt-3 pb-4">
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsContent value="cashbook">
            <CashbookTab overview={overview} projects={projects} userRole={user?.role} onRefresh={() => fetchAll(false)} />
          </TabsContent>

          <TabsContent value="approvals">
            <ApprovalsTab />
          </TabsContent>

          <TabsContent value="cheques">
            <ChequeManagementTab projects={projects} />
          </TabsContent>

          <TabsContent value="projects">
            <ProjectSummaryTab overview={overview} userRole={user?.role} onRefresh={() => fetchAll(false)} />
          </TabsContent>

          <TabsContent value="carry-forward">
            <CarryForwardTab userRole={user?.role} />
          </TabsContent>
        </Tabs>
      </main>
      <MobileBottomNav user={user} />

      {/* Unmask Confirmation Dialog */}
      <Dialog open={unmaskDialog} onOpenChange={setUnmaskDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Eye className="h-5 w-5" /> Unmask All Values
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            This will reveal all masked financial values. Are you sure you want to proceed?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUnmaskDialog(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="confirm-unmask-btn"
              onClick={() => {
                setGlobalUnmasked(true);
                setUnmaskDialog(false);
                toast.success('All values unmasked');
              }}
            >
              <Eye className="h-4 w-4 mr-1.5" /> Unmask
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </UnmaskContext.Provider>
    </MaskContext.Provider>
  );
}
