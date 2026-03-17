import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Wallet, DollarSign, Building2, Eye, FileText, ArrowUpRight, ArrowDownRight,
  TrendingUp, Banknote, Landmark, PiggyBank, CircleDollarSign, RefreshCw,
  Filter, Printer, ChevronDown, ChevronUp, X, Plus, Calendar, Search,
  CreditCard, CheckCircle, Clock, AlertTriangle, Edit, XCircle, Bell,
  AlertCircle, BookOpen, ArrowLeft, BarChart3, ClipboardCheck, ThumbsUp, ThumbsDown, EyeOff,
  Lock, PieChart
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MODE_LABELS = {
  cash: 'Cash', current_account: 'Current A/c', savings_account: 'Savings A/c',
  cheque: 'Cheque', petty_cash: 'Petty Cash', miscellaneous: 'Miscellaneous',
  direct_transfer: 'Cash DT', suspense_account: 'Suspense A/c'
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

// Masked value component - Super Admin always sees values, Accountant clicks to reveal for 10s
function MaskedValue({ value, className = '', formatFn = fmtFull, testId = '' }) {
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
    miscellaneous: 'miscellaneous', direct_transfer: 'direct_transfer',
    dt: 'direct_transfer', suspense: 'suspense_account', suspense_account: 'suspense_account'
  };
  return map[m] || 'miscellaneous';
};

// ============ DRILLDOWN VIEW ============
function DrilldownView({ title, entries, type, onBack }) {
  return (
    <div className="space-y-3" data-testid="drilldown-view">
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.length === 0 ? (
                  <tr><td colSpan={type === 'expense' ? 7 : 6} className="px-4 py-8 text-center text-gray-400">No entries found</td></tr>
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

// ============ SUSPENSE DRILLDOWN ============
function SuspenseDrilldown({ onBack }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/accountant/all-vendor-suspense`);
        setVendors(res.data);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-3" data-testid="suspense-drilldown">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={onBack} data-testid="suspense-back">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h3 className="text-sm font-semibold text-gray-800">Suspense Account</h3>
        <Badge variant="outline" className="text-xs">{vendors.length} vendors</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-amber-600" /></div>
      ) : vendors.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">No suspense balances found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
            <CardContent className="p-3">
              <p className="text-sm font-semibold text-orange-800">Total Suspense Balance</p>
              <p className="text-2xl font-bold text-orange-700">
                <MaskedValue value={vendors.reduce((s, v) => s + v.balance, 0)} className="text-orange-700" />
              </p>
            </CardContent>
          </Card>
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

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/accountant/petty-cash-management`);
        setData(res.data);
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
      // Refresh data
      const res = await axios.get(`${API}/accountant/petty-cash-management`);
      setData(res.data);
      if (selectedSE) fetchSECashbook(selectedSE);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to issue');
    }
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
                      <Badge className={
                        pc.status === 'issued' ? 'bg-green-100 text-green-700' :
                        pc.status === 'requested' ? 'bg-amber-100 text-amber-700' :
                        pc.status === 'settled' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }>{pc.status}</Badge>
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
              <div><Label>Amount to Issue</Label><Input type="number" value={issueAmount} onChange={e => setIssueAmount(e.target.value)} /></div>
              <div><Label>Remarks</Label><Textarea value={issueRemarks} onChange={e => setIssueRemarks(e.target.value)} rows={2} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialog(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleIssue}>Issue Cash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ INDIRECT EXPENSE SECTION ============
const INDIRECT_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'upi', label: 'UPI' }
];

function IndirectExpenseSection({ userRole }) {
  const [costs, setCosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgetOverview, setBudgetOverview] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [indirectLoading, setIndirectLoading] = useState(true);
  const [viewMode, setViewMode] = useState('expenses'); // expenses, budget, allocations
  const [statusFilter, setStatusFilter] = useState('all');

  const [createDialog, setCreateDialog] = useState(false);
  const [approveDialog, setApproveDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedCost, setSelectedCost] = useState(null);
  const [distributionPreview, setDistributionPreview] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [createForm, setCreateForm] = useState({
    category: '', description: '', amount: '',
    payment_method: 'bank_transfer', vendor_name: '',
    invoice_number: '', invoice_date: '', remarks: ''
  });
  const [confirmForm, setConfirmForm] = useState({ payment_date: '', reference_number: '', remarks: '' });

  const fetchIndirect = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setIndirectLoading(true);
      const [costsRes, catsRes, budgetRes, allocRes] = await Promise.all([
        axios.get(`${API}/financial/indirect-costs`),
        axios.get(`${API}/financial/indirect-cost-categories`),
        axios.get(`${API}/financial/project-budget-overview`).catch(() => ({ data: null })),
        axios.get(`${API}/financial/indirect-cost-allocations`).catch(() => ({ data: [] }))
      ]);
      setCosts(costsRes.data);
      setCategories(catsRes.data);
      if (budgetRes.data) setBudgetOverview(budgetRes.data);
      setAllocations(allocRes.data || []);
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
      toast.success('Indirect cost created. Pending approval.');
      setCreateDialog(false);
      setCreateForm({ category: '', description: '', amount: '', payment_method: 'bank_transfer', vendor_name: '', invoice_number: '', invoice_date: '', remarks: '' });
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
      toast.success(approved ? 'Approved' : 'Rejected');
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

  const getCategoryLabel = (v) => categories.find(c => c.value === v)?.label || v;
  const canCreate = ['accountant', 'super_admin'].includes(userRole);
  const canApprove = ['super_admin', 'general_manager'].includes(userRole);
  const canConfirm = ['accountant', 'super_admin'].includes(userRole);
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
              onClick={() => setCreateDialog(true)} data-testid="add-indirect-cost-inline-btn">
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
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Category</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Vendor</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCosts.length === 0 ? (
                      <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">No indirect cost entries</td></tr>
                    ) : filteredCosts.map(cost => (
                      <tr key={cost.indirect_cost_id} className="hover:bg-gray-50" data-testid={`indirect-row-${cost.indirect_cost_id}`}>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{getCategoryLabel(cost.category)}</Badge></td>
                        <td className="px-3 py-2 font-medium">{cost.description}</td>
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
                        </td>
                      </tr>
                    ))}
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
              <p className="text-[10px] text-orange-600">20% Indirect Budget</p>
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
            <CardHeader className="border-b py-2 px-4"><CardTitle className="text-xs font-semibold">Project-wise Budget (80/20 Rule)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Project</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Value</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Share</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Direct (80%)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Indirect (20%)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Spent</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Remaining</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(bo.projects || []).map(p => {
                      const usedPct = p.indirect_budget > 0 ? (p.indirect_spent / p.indirect_budget * 100) : 0;
                      return (
                        <tr key={p.project_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2"><span className="font-medium">{p.name}</span> <Badge variant="outline" className="text-[9px] ml-1">{p.status}</Badge></td>
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
                      <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">No active projects</td></tr>
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
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">No allocations yet. Confirm an indirect cost to see distribution.</td></tr>
                  ) : allocations.map((a, i) => (
                    <tr key={a.allocation_id || i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{a.project_name}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{getCategoryLabel(a.category)}</Badge></td>
                      <td className="px-3 py-2 text-gray-600">{a.description}</td>
                      <td className="px-3 py-2 text-center"><Badge className="bg-blue-100 text-blue-700 text-[10px]">{a.share_pct}%</Badge></td>
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
      <Dialog open={createDialog} onOpenChange={(open) => { setCreateDialog(open); if (!open) setDistributionPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Indirect Cost (Overhead)</DialogTitle></DialogHeader>
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
                <Input type="number" value={createForm.amount} onChange={(e) => { setCreateForm({ ...createForm, amount: e.target.value }); if (e.target.value && parseFloat(e.target.value) > 0) fetchPreview(e.target.value); else setDistributionPreview(null); }} placeholder="Enter amount" data-testid="indirect-input-amount" />
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
    </div>
  );
}

// ============ CASHBOOK TAB ============
function CashbookTab({ overview, projects, userRole }) {
  const [cashbookData, setCashbookData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState('income');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [expenseSubTab, setExpenseSubTab] = useState('all');
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
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

  const incomeEntries = cashbookData?.income_entries || overview?.income_entries || [];
  const allExpenseEntries = cashbookData?.expense_entries || overview?.expense_entries || [];
  const summary = cashbookData?.summary || overview?.totals || {};

  // Data from overview for Financial Overview cards
  const inc = overview?.income_by_mode || {};
  const exp = overview?.expense_by_mode || {};
  const totals = overview?.totals || {};

  // Expense category calc
  const expByCategory = {
    overall: allExpenseEntries.reduce((s, e) => s + (e.amount || 0), 0),
    material: allExpenseEntries.filter(e => e.expense_type === 'material').reduce((s, e) => s + (e.amount || 0), 0),
    labour: allExpenseEntries.filter(e => e.expense_type === 'labour').reduce((s, e) => s + (e.amount || 0), 0),
    petty_cash: overview?.petty_cash?.spent || 0,
    suspense: overview?.suspense_balance || 0,
    other: allExpenseEntries.filter(e => !['material', 'labour'].includes(e.expense_type)).reduce((s, e) => s + (e.amount || 0), 0),
  };
  const EXP_CATEGORIES = [
    { key: 'overall', label: 'Overall Expense', icon: DollarSign, color: 'bg-red-50 text-red-700 border-red-200' },
    { key: 'material', label: 'Material', icon: Building2, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { key: 'labour', label: 'Labour', icon: Wallet, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { key: 'petty_cash', label: 'Petty Cash', icon: Banknote, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { key: 'suspense', label: 'Suspense', icon: RefreshCw, color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { key: 'other', label: 'Other', icon: CircleDollarSign, color: 'bg-gray-50 text-gray-700 border-gray-200' },
  ];

  const filteredExpenses = allExpenseEntries.filter(e => {
    if (expenseSubTab === 'all') return true;
    if (expenseSubTab === 'material') return e.expense_type === 'material';
    if (expenseSubTab === 'labour') return e.expense_type === 'labour';
    if (expenseSubTab === 'petty_cash') return e.expense_type === 'petty_cash';
    if (expenseSubTab === 'other') return !['material', 'labour', 'petty_cash'].includes(e.expense_type);
    return true;
  });

  // Drilldown click handlers
  const handleModeClick = (mode) => {
    if (mode === 'suspense_account') {
      setDrilldown({ type: 'suspense' });
      return;
    }
    // Show income entries for this mode
    const modeIncome = incomeEntries.filter(e => classifyMode(e.payment_mode) === mode);
    const modeExpense = allExpenseEntries.filter(e => classifyMode(e.payment_method || e.payment_mode) === mode);
    setDrilldown({ type: 'mode', mode, incomeEntries: modeIncome, expenseEntries: modeExpense, label: MODE_LABELS[mode] });
  };

  const handleCategoryClick = (catKey) => {
    if (catKey === 'suspense') {
      setDrilldown({ type: 'suspense' });
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
    return <DrilldownView title={`${drilldown.label} Expenses`} entries={drilldown.entries} type="expense" onBack={() => setDrilldown(null)} />;
  }
  if (drilldown?.type === 'mode') {
    return (
      <div className="space-y-3" data-testid="mode-drilldown">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setDrilldown(null)} data-testid="mode-drilldown-back">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h3 className="text-sm font-semibold text-gray-800">{drilldown.label} — Breakdown</h3>
        </div>
        <Tabs defaultValue="income">
          <TabsList className="grid grid-cols-2 w-full mb-3">
            <TabsTrigger value="income" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-800 gap-1">
              <ArrowDownRight className="h-3.5 w-3.5" /> Income ({drilldown.incomeEntries.length})
            </TabsTrigger>
            <TabsTrigger value="expense" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-800 gap-1">
              <ArrowUpRight className="h-3.5 w-3.5" /> Expense ({drilldown.expenseEntries.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="income">
            <DrilldownView title={`${drilldown.label} Income`} entries={drilldown.incomeEntries} type="income" onBack={() => setDrilldown(null)} />
          </TabsContent>
          <TabsContent value="expense">
            <DrilldownView title={`${drilldown.label} Expenses`} entries={drilldown.expenseEntries} type="expense" onBack={() => setDrilldown(null)} />
          </TabsContent>
        </Tabs>
      </div>
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
      <div class="row"><span class="label">Date</span><span class="value">${new Date(entry.payment_date || entry.created_at).toLocaleDateString('en-IN')}</span></div>
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
      {/* Financial Overview - Clickable Cards */}
      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600" /> Financial Overview
            </CardTitle>
            <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs flex-wrap">
              <span className="text-green-600 font-semibold">Income: <MaskedValue value={totals.total_income} className="text-green-600" testId="masked-total-income" /></span>
              <span className="text-red-600 font-semibold">Expense: <MaskedValue value={totals.total_expense} className="text-red-600" testId="masked-total-expense" /></span>
              <Badge className={totals.net_balance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                Net: <MaskedValue value={totals.net_balance} className={totals.net_balance >= 0 ? 'text-green-700' : 'text-red-700'} testId="masked-net-balance" />
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 pb-3">
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 sm:gap-2">
            {Object.keys(MODE_LABELS).map(mode => {
              const Icon = MODE_ICONS[mode];
              return (
                <div key={mode}
                  className={`rounded-lg border p-1.5 sm:p-2 text-center cursor-pointer transition-all hover:shadow-md hover:scale-[1.03] ${MODE_COLORS[mode]}`}
                  onClick={() => handleModeClick(mode)}
                  data-testid={`mode-card-${mode}`}
                >
                  <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mx-auto mb-0.5 opacity-70" />
                  <p className="text-[9px] sm:text-[10px] font-medium truncate">{MODE_LABELS[mode]}</p>
                  <p className="text-[10px] sm:text-xs font-bold text-green-700"><MaskedValue value={inc[mode] || 0} className="text-green-700 text-[10px] sm:text-xs" formatFn={(n) => `+${fmt(n)}`} /></p>
                  <p className="text-[10px] sm:text-xs font-bold text-red-600"><MaskedValue value={exp[mode] || 0} className="text-red-600 text-[10px] sm:text-xs" formatFn={(n) => `-${fmt(n)}`} /></p>
                </div>
              );
            })}
            <div className="rounded-lg border p-1.5 sm:p-2 text-center bg-gray-900 text-white col-span-3 sm:col-span-1">
              <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5 mx-auto mb-0.5" />
              <p className="text-[9px] sm:text-[10px] font-medium">Total</p>
              <p className="text-[10px] sm:text-xs font-bold text-green-400"><MaskedValue value={inc.total || 0} className="text-green-400 text-[10px] sm:text-xs" formatFn={(n) => `+${fmt(n)}`} /></p>
              <p className="text-[10px] sm:text-xs font-bold text-red-400"><MaskedValue value={exp.total || 0} className="text-red-400 text-[10px] sm:text-xs" formatFn={(n) => `-${fmt(n)}`} /></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expense Category Breakdown - Clickable */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        {EXP_CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <Card key={cat.key}
              className={`border cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${cat.color}`}
              onClick={() => handleCategoryClick(cat.key)}
              data-testid={`exp-cat-${cat.key}`}
            >
              <CardContent className="p-2 sm:p-3 text-center">
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mx-auto mb-0.5 opacity-70" />
                <p className="text-[10px] sm:text-[11px] font-semibold truncate">{cat.label}</p>
                <p className="text-sm sm:text-base font-bold mt-0.5"><MaskedValue value={expByCategory[cat.key] || 0} /></p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Date Range Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                <Label className="text-xs text-gray-500 whitespace-nowrap">From</Label>
                <Input type="date" className="h-8 w-full sm:w-40 text-xs" value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)} data-testid="cashbook-date-from" />
              </div>
            </div>
            <div className="flex items-center gap-2 pl-6 sm:pl-0">
              <Label className="text-xs text-gray-500 whitespace-nowrap">To</Label>
              <Input type="date" className="h-8 w-full sm:w-40 text-xs" value={dateTo}
                onChange={e => setDateTo(e.target.value)} data-testid="cashbook-date-to" />
            </div>
            <Select value={filterProject || 'all'} onValueChange={v => setFilterProject(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-48 h-8 text-xs" data-testid="cashbook-project-filter"><SelectValue placeholder="All Projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectsList.map(p => <SelectItem key={p.project_id} value={p.project_id}>{p.name || p.project_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              {(dateFrom || dateTo || filterProject) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(''); setDateTo(''); setFilterProject(''); }}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
              {loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Income / Direct Expense / Indirect Expense Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
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

        <TabsContent value="income">
          <Card>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="cashbook-income-table">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Date & Time</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Project</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Stage</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Txn ID</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeEntries.map((entry, i) => (
                      <tr key={entry.income_id || i} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          {new Date(entry.payment_date || entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          {' '}<span className="text-gray-400">{new Date(entry.payment_date || entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-3 py-2 font-medium">{entry.project_name || 'N/A'}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{entry.stage || entry.description || 'Payment'}</Badge></td>
                        <td className="px-3 py-2">
                          <Badge className={`text-[10px] ${MODE_COLORS[classifyMode(entry.payment_mode)]}`}>
                            {MODE_LABELS[classifyMode(entry.payment_mode)] || entry.payment_mode}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">{entry.reference_number || entry.cheque_number || 'Cash'}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700"><MaskedValue value={entry.amount} className="text-green-700" /></td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setSelectedEntry(entry); setViewDialog(true); }}><Eye className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-amber-600" onClick={() => handlePrintReceipt(entry)}><Printer className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {incomeEntries.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-gray-400">No income entries found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expense">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
            {['all', 'material', 'labour', 'petty_cash', 'other'].map(tab => (
              <Button key={tab} size="sm" variant={expenseSubTab === tab ? 'default' : 'outline'}
                className={`text-[10px] sm:text-xs h-6 sm:h-7 px-2 sm:px-3 ${expenseSubTab === tab ? 'bg-red-600 hover:bg-red-700' : ''}`}
                onClick={() => setExpenseSubTab(tab)} data-testid={`expense-filter-${tab}`}>
                {tab === 'all' ? 'All' : tab === 'petty_cash' ? 'Petty Cash' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Button>
            ))}
            <div className="ml-auto">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1 sm:gap-1.5 h-6 sm:h-7 text-[10px] sm:text-xs" onClick={() => {
                if (window.innerWidth < 768) { setMobileExpenseDialog(true); } else { setAddExpenseOpen(true); }
              }} data-testid="add-expense-btn">
                <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Add </span>Expense
              </Button>
            </div>
          </div>
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
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="cheque">Cheque</SelectItem>
                              <SelectItem value="upi">UPI</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1.5">
                          <Input type="number" placeholder="Amount" className="h-7 text-[11px] w-24 bg-white text-right"
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
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transaction Details</DialogTitle></DialogHeader>
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
                  ['Description', selectedEntry.stage || selectedEntry.description],
                  ['Date', new Date(selectedEntry.payment_date || selectedEntry.created_at).toLocaleString('en-IN')],
                  ['Mode', selectedEntry.payment_mode || selectedEntry.payment_method || 'Cash'],
                  ['Vendor', selectedEntry.vendor_name],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-1">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => handlePrintReceipt(selectedEntry)}>
                <Printer className="h-4 w-4 mr-2" /> Print Receipt
              </Button>
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
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Amount</Label>
              <Input type="number" placeholder="Enter amount" className="h-9 text-sm"
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
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'incoming') return matchesSearch && c.cheque_type === 'incoming';
    if (activeTab === 'outgoing') return matchesSearch && c.cheque_type === 'outgoing';
    if (activeTab === 'pending') return matchesSearch && ['issued', 'deposited', 'post_dated'].includes(c.status);
    if (activeTab === 'bounced') return matchesSearch && c.status === 'bounced';
    return matchesSearch;
  });

  const stats = {
    total: cheques.length, incoming: cheques.filter(c => c.cheque_type === 'incoming').length,
    outgoing: cheques.filter(c => c.cheque_type === 'outgoing').length,
    pending: cheques.filter(c => ['issued', 'deposited', 'post_dated'].includes(c.status)).length,
    bounced: cheques.filter(c => c.status === 'bounced').length,
    cleared: cheques.filter(c => c.status === 'cleared').length,
  };
  const unclearedOutgoing = cheques.filter(c => c.cheque_type === 'outgoing' && ['issued', 'post_dated'].includes(c.status));

  return (
    <div className="space-y-4" data-testid="cheque-management-tab">
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

      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
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

      <Card>
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
                    <th className="px-3 py-2 text-center font-semibold text-gray-600">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCheques.length === 0 ? (
                    <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-500">No cheques found</td></tr>
                  ) : filteredCheques.map(cheque => (
                    <tr key={cheque.cheque_id} className="hover:bg-gray-50" data-testid={`cheque-row-${cheque.cheque_id}`}>
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
                      <td className="px-3 py-2">{new Date(cheque.cheque_date).toLocaleDateString('en-IN')}</td>
                      <td className="px-3 py-2 text-center">{getStatusBadge(cheque.status)}</td>
                      <td className="px-3 py-2 text-center">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                          setSelectedCheque(cheque);
                          setStatusForm({ status: cheque.status, deposit_date: cheque.deposit_date?.split('T')[0] || '', clearance_date: cheque.clearance_date?.split('T')[0] || '', bounce_reason: cheque.bounce_reason || '', bounce_charges: cheque.bounce_charges?.toString() || '', remarks: cheque.remarks || '' });
                          setStatusDialog(true);
                        }} data-testid={`update-status-${cheque.cheque_id}`}><Edit className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
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
              <div><Label>Amount *</Label><Input type="number" value={chequeForm.amount} onChange={e => setChequeForm({...chequeForm, amount: e.target.value})} data-testid="input-amount" /></div>
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
                  <div><Label>Bounce Charges</Label><Input type="number" value={statusForm.bounce_charges} onChange={e => setStatusForm({...statusForm, bounce_charges: e.target.value})} /></div>
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
                      <Input type="number" className="h-8 text-sm" value={smartPayForm.suspense_amount_to_use}
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
              <Input type="number" value={smartPayForm.expense_amount} onChange={e => setSmartPayForm(prev => ({ ...prev, expense_amount: e.target.value }))} data-testid="smart-pay-amount" placeholder="Expense amount" />
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
  const [activeTab, setActiveTab] = useState('income');
  const [rejectDialog, setRejectDialog] = useState({ open: false, type: '', id: '', reason: '' });
  const [processing, setProcessing] = useState(null);
  // Income review dialog
  const [reviewDialog, setReviewDialog] = useState({ open: false, income: null });
  const [reviewForm, setReviewForm] = useState({
    verification_mode: '',
    denomination: { '2000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0 },
    cheque_number: '',
    transaction_id: '',
    dt_id: '',
    notes: ''
  });

  const fetchApprovals = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const res = await axios.get(`${API}/approvals/unified`);
      setData(res.data);
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const handleApproveIncome = async (incomeId) => {
    setProcessing(incomeId);
    try {
      await axios.post(`${API}/approvals/income/${incomeId}/approve`);
      toast.success('Income approved');
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
      toast.success('Expense approved');
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
      toast.success('Rejected successfully');
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
    if (status === 'procurement_priced') return 'accounts-approval';
    return null;
  };

  const [projectCheques, setProjectCheques] = useState([]);
  const [chequeVerifications, setChequeVerifications] = useState({});

  const openReviewDialog = async (income) => {
    const mode = classifyMode(income.payment_mode);
    let verificationMode = 'cash';
    if (mode === 'cheque' || income.payment_mode === 'cheque') verificationMode = 'cheque';
    else if (['current_account', 'savings_account'].includes(mode) || ['bank_transfer', 'neft', 'upi'].includes(income.payment_mode)) verificationMode = 'bank';
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
    if (reviewForm.verification_mode === 'cheque') {
      const allVerified = projectCheques.length > 0 && projectCheques.every(c => chequeVerifications[c.cheque_id]?.trim());
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
      if (reviewForm.verification_mode === 'cheque') {
        payload.cheque_verifications = projectCheques.map(c => ({
          cheque_id: c.cheque_id, cheque_number: c.cheque_number,
          entered_number: chequeVerifications[c.cheque_id] || '', amount: c.amount, bank: c.bank_name
        }));
      }
      if (reviewForm.verification_mode === 'bank') payload.transaction_id = reviewForm.transaction_id;
      if (reviewForm.verification_mode === 'dt') payload.dt_id = reviewForm.dt_id;

      await axios.post(`${API}/approvals/income/${inc.income_id}/review`, payload);
      toast.success('Income reviewed & approved');
      setReviewDialog({ open: false, income: null });
      fetchApprovals(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to review');
    } finally {
      setProcessing(null);
    }
  };

  const s = data.summary || {};
  const totalPending = (s.income_count || 0) + (s.material_count || 0) + (s.labour_count || 0) + (s.vendor_count || 0);

  if (loading && !data.summary) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="approvals-tab">
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
              <DollarSign className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Income</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-green-700">{s.income_count || 0}</p>
            <p className="text-[10px] sm:text-xs text-green-600 font-medium"><MaskedValue value={s.income_total} className="text-green-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500" onClick={() => setActiveTab('materials')} data-testid="approvals-material-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Building2 className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Materials</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-amber-700">{s.material_count || 0}</p>
            <p className="text-[10px] sm:text-xs text-amber-600 font-medium"><MaskedValue value={s.material_total} className="text-amber-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500" onClick={() => setActiveTab('labour')} data-testid="approvals-labour-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Wallet className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Labour</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-blue-700">{s.labour_count || 0}</p>
            <p className="text-[10px] sm:text-xs text-blue-600 font-medium"><MaskedValue value={s.labour_total} className="text-blue-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-orange-500" onClick={() => setActiveTab('vendor')} data-testid="approvals-vendor-card">
          <CardContent className="p-2 sm:p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <CreditCard className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Suppliers</span>
            </div>
            <p className="text-lg sm:text-xl font-bold text-orange-700">{s.vendor_count || 0}</p>
            <p className="text-[10px] sm:text-xs text-orange-600 font-medium"><MaskedValue value={s.vendor_total} className="text-orange-600 text-[10px] sm:text-xs" /></p>
          </CardContent>
        </Card>
      </div>

      {/* Approval Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 mb-3" data-testid="approval-sub-tabs">
          <TabsTrigger value="income" className="text-xs sm:text-sm data-[state=active]:bg-green-100 data-[state=active]:text-green-800 gap-1">
            <ArrowDownRight className="h-3.5 w-3.5" /> Income ({s.income_count || 0})
          </TabsTrigger>
          <TabsTrigger value="materials" className="text-xs sm:text-sm data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 gap-1">
            <Building2 className="h-3.5 w-3.5" /> Material ({s.material_count || 0})
          </TabsTrigger>
          <TabsTrigger value="labour" className="text-xs sm:text-sm data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 gap-1">
            <Wallet className="h-3.5 w-3.5" /> Labour ({s.labour_count || 0})
          </TabsTrigger>
          <TabsTrigger value="vendor" className="text-xs sm:text-sm data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800 gap-1">
            <CreditCard className="h-3.5 w-3.5" /> Supplier ({s.vendor_count || 0})
          </TabsTrigger>
        </TabsList>

        {/* Income Approvals */}
        <TabsContent value="income">
          {data.income.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-gray-400">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-300" />No pending income approvals
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
                      {data.income.map((inc, i) => (
                        <tr key={inc.income_id} className="border-b hover:bg-gray-50" data-testid={`approval-income-row-${inc.income_id}`}>
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
                            <Badge className="bg-amber-100 text-amber-700">{inc.status?.replace(/_/g, ' ')}</Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button size="sm" className="h-6 text-[10px] bg-amber-600 hover:bg-amber-700 gap-1 px-3"
                              disabled={processing === inc.income_id}
                              onClick={() => openReviewDialog(inc)}
                              data-testid={`review-income-btn-${inc.income_id}`}>
                              {processing === inc.income_id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />} Review
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
        </TabsContent>

        {/* Material Approvals */}
        <TabsContent value="materials">
          <ApprovalExpenseTable
            items={data.materials}
            type="material"
            idField="expense_id"
            amountField="estimated_cost"
            altAmountField="final_amount"
            descField="material_name"
            processing={processing}
            getApprovalAction={getApprovalAction}
            onApprove={handleApproveExpense}
            onReject={(id) => setRejectDialog({ open: true, type: 'material', id, reason: '' })}
          />
        </TabsContent>

        {/* Labour Approvals */}
        <TabsContent value="labour">
          <ApprovalExpenseTable
            items={data.labour}
            type="labour"
            idField="labour_expense_id"
            amountField="total_amount"
            descField="contractor_name"
            processing={processing}
            getApprovalAction={getApprovalAction}
            onApprove={handleApproveExpense}
            onReject={(id) => setRejectDialog({ open: true, type: 'labour', id, reason: '' })}
          />
        </TabsContent>

        {/* Vendor/Supplier Approvals */}
        <TabsContent value="vendor">
          <ApprovalExpenseTable
            items={data.vendor}
            type="vendor-service"
            idField="expense_id"
            amountField="amount"
            descField="vendor_name"
            processing={processing}
            getApprovalAction={getApprovalAction}
            onApprove={handleApproveExpense}
            onReject={(id) => setRejectDialog({ open: true, type: 'vendor-service', id, reason: '' })}
          />
        </TabsContent>
      </Tabs>

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
                        <Input
                          type="number" min="0"
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
                    <p className="text-sm text-gray-400 italic py-2">No cheques found for this project</p>
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

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleSubmitReview}
                disabled={processing}
                data-testid="submit-review-btn"
              >
                {processing ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Record Payment
              </Button>
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

      {/* Refresh button */}
      <div className="flex justify-center pt-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={fetchApprovals} data-testid="refresh-approvals-btn">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Approvals
        </Button>
      </div>
    </div>
  );
}

// Reusable expense approval table within AccountsBoard
function ApprovalExpenseTable({ items, type, idField, amountField, altAmountField, descField, processing, getApprovalAction, onApprove, onReject }) {
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
                        item.status === 'procurement_priced' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }>{item.status?.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {action ? (
                        <div className="flex items-center justify-center gap-1">
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
function ProjectSummaryTab({ overview }) {
  const navigate = useNavigate();
  const projects = overview?.project_wise || [];
  const totals = overview?.totals || {};

  return (
    <div className="space-y-4" data-testid="project-summary-tab">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Income</p>
            <p className="text-lg font-bold text-green-700"><MaskedValue value={totals.total_income} className="text-green-700" testId="masked-proj-income" /></p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Expense</p>
            <p className="text-lg font-bold text-red-600"><MaskedValue value={totals.total_expense} className="text-red-600" testId="masked-proj-expense" /></p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Net Balance</p>
            <p className={`text-lg font-bold ${(totals.net_balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}><MaskedValue value={totals.net_balance} className={(totals.net_balance || 0) >= 0 ? 'text-green-700' : 'text-red-600'} testId="masked-proj-net" /></p>
          </CardContent>
        </Card>
      </div>

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
                  <th className="text-right px-3 py-2 font-semibold text-green-600">Income</th>
                  <th className="text-right px-3 py-2 font-semibold text-red-600">Expense</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600">Balance</th>
                  <th className="text-center px-3 py-2 font-semibold text-gray-600">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((p, i) => {
                  const pnl = (p.income || 0) - (p.expense || 0);
                  const pnlPct = p.income ? ((pnl / p.income) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={i} className="hover:bg-amber-50 cursor-pointer transition-colors" data-testid={`project-row-${i}`}
                      onClick={() => p.project_id && navigate(`/projects/${p.project_id}`)}>
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-blue-700 underline decoration-dotted">{p.project_name}</td>
                      <td className="px-3 py-2 text-right text-green-700 font-semibold"><MaskedValue value={p.income} className="text-green-700" /></td>
                      <td className="px-3 py-2 text-right text-red-600 font-semibold"><MaskedValue value={p.expense} className="text-red-600" /></td>
                      <td className={`px-3 py-2 text-right font-bold ${p.balance >= 0 ? 'text-green-700' : 'text-red-600'}`}><MaskedValue value={p.balance} className={p.balance >= 0 ? 'text-green-700' : 'text-red-600'} /></td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={pnl >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {pnl >= 0 ? '+' : ''}{pnlPct}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No projects found</td></tr>
                )}
              </tbody>
              {projects.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr className="font-bold">
                    <td className="px-3 py-2" colSpan={2}>Total ({projects.length} projects)</td>
                    <td className="px-3 py-2 text-right text-green-700"><MaskedValue value={projects.reduce((s, p) => s + (p.income || 0), 0)} className="text-green-700" /></td>
                    <td className="px-3 py-2 text-right text-red-600"><MaskedValue value={projects.reduce((s, p) => s + (p.expense || 0), 0)} className="text-red-600" /></td>
                    <td className={`px-3 py-2 text-right ${totals.net_balance >= 0 ? 'text-green-700' : 'text-red-600'}`}><MaskedValue value={totals.net_balance} className={totals.net_balance >= 0 ? 'text-green-700' : 'text-red-600'} /></td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ MAIN ACCOUNTS BOARD ============
export default function AccountsBoard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [projects, setProjects] = useState([]);
  const [mainTab, setMainTab] = useState('cashbook');
  const [globalUnmasked, setGlobalUnmasked] = useState(false);
  const [unmaskDialog, setUnmaskDialog] = useState(false);

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

  return (
    <MaskContext.Provider value={user?.role || 'accountant'}>
    <UnmaskContext.Provider value={globalUnmasked}>
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-4" data-testid="accounts-board">
      <AppHeader user={user} />
      <div className="sticky top-14 z-40 bg-gray-50 border-b border-gray-100">
        <div className="max-w-[1400px] mx-auto px-3 md:px-6 pt-2 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div />
            {user?.role !== 'super_admin' && (
              globalUnmasked ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setGlobalUnmasked(false)}
                  data-testid="mask-all-btn"
                >
                  <EyeOff className="h-4 w-4 mr-1.5" /> Mask All
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => setUnmaskDialog(true)}
                  data-testid="unmask-all-btn"
                >
                  <Eye className="h-4 w-4 mr-1.5" /> Unmask All
                </Button>
              )
            )}
          </div>
          <Tabs value={mainTab} onValueChange={setMainTab}>
            <TabsList className="w-full grid grid-cols-4" data-testid="accounts-main-tabs">
              <TabsTrigger value="cashbook" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-green-100 data-[state=active]:text-green-800" data-testid="tab-cashbook">
                <BookOpen className="h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Cashbook</span><span className="sm:hidden">Cash</span>
              </TabsTrigger>
              <TabsTrigger value="approvals" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800" data-testid="tab-approvals">
                <ClipboardCheck className="h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Approvals</span><span className="sm:hidden">Approve</span>
              </TabsTrigger>
              <TabsTrigger value="cheques" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800" data-testid="tab-cheques">
                <FileText className="h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Cheque Management</span><span className="sm:hidden">Cheques</span>
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800" data-testid="tab-projects">
                <BarChart3 className="h-4 w-4 shrink-0" /> <span className="hidden sm:inline">Project Summary</span><span className="sm:hidden">Projects</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <main className="max-w-[1400px] mx-auto px-3 md:px-6 pt-3 pb-4">
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsContent value="cashbook">
            <CashbookTab overview={overview} projects={projects} userRole={user?.role} />
          </TabsContent>

          <TabsContent value="approvals">
            <ApprovalsTab />
          </TabsContent>

          <TabsContent value="cheques">
            <ChequeManagementTab projects={projects} />
          </TabsContent>

          <TabsContent value="projects">
            <ProjectSummaryTab overview={overview} />
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
