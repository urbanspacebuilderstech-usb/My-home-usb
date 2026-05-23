import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Building2,
  LogOut,
  ArrowLeft,
  ArrowRight,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  IndianRupee,
  FileText,
  TrendingUp,
  TrendingDown,
  Wallet,
  MinusCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Check,
  XCircle,
  ShieldCheck,
  Send,
  Upload,
  Printer,
  Download,
  Folder,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Eye,
  Layers,
  Users,
  Package,
  HardHat,
  CreditCard,
  GitBranch,
  Lock,
  Snowflake,
  Mail,
  MapPin,
  ChevronDown,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import MobileBottomNav from '../components/MobileBottomNav';
import { generateREPDF } from '../utils/pdfGenerator';
import { FileUpload, FileList } from '../components/FileUpload';
import { AppHeader } from '../components/AppHeader';
import GanttChart from '../components/GanttChart';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import ChequeListView from '../components/ChequeListView';
import { NumericInput } from '../components/NumericInput';
import { UnitSelect } from '../components/UnitSelect';
import { SortableList, SortableTableRow, DragHandle } from '../components/SortableList';
import DLRPanel from '../components/DLRPanel';
import ProjectAttendanceDLR from '../components/ProjectAttendanceDLR';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Inline editable rate (%) — used on the virtual Auto-collected (Sales) row in
// the Payment Schedule. Click to edit, type a number, Enter / blur to save.

// Helper: inclusive day-count between two ISO dates (YYYY-MM-DD). Returns '' if missing.
const daysBetween = (start, end) => {
  if (!start || !end) return '';
  const a = new Date(start), b = new Date(end);
  if (isNaN(a) || isNaN(b)) return '';
  const ms = b.getTime() - a.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
};
const InlineEditRate = ({ initial, onSave, mode = 'percent' }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(initial ?? ''));
  useEffect(() => { setVal(String(initial ?? '')); }, [initial]);
  
  const isPct = mode === 'percent';
  const commit = async () => {
    const num = parseFloat(val);
    if (!isFinite(num) || num < 0 || (isPct && num > 100)) {
      toast.error(isPct ? 'Rate must be between 0 and 100' : 'Amount must be a non-negative number');
      setVal(String(initial ?? ''));
      setEditing(false);
      return;
    }
    setEditing(false);
    // Always invoke onSave (even when value is unchanged) so the backend can
    // re-sync derived fields like ₹ amount from the latest base value.
    await onSave(num);
  };
  
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-amber-50 text-gray-800 hover:text-amber-700 transition-colors group"
        title={isPct ? 'Click to edit rate' : 'Click to edit amount'}
        data-testid={isPct ? 'edit-advance-rate-btn' : 'edit-advance-amount-btn'}
      >
        <span>
          {isPct
            ? `${Number(initial || 0)}%`
            : `₹${Number(initial || 0).toLocaleString()}`}
        </span>
        <Edit className="h-3 w-3 opacity-0 group-hover:opacity-70" />
      </button>
    );
  }
  return (
    <input
      type="number"
      step={isPct ? '0.01' : '1'}
      min="0"
      {...(isPct ? { max: '100' } : {})}
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setVal(String(initial ?? '')); setEditing(false); }
      }}
      className={`${isPct ? 'w-20' : 'w-32'} px-2 py-1 text-right text-sm border border-amber-400 rounded outline-none focus:ring-1 focus:ring-amber-400`}
      data-testid={isPct ? 'edit-advance-rate-input' : 'edit-advance-amount-input'}
    />
  );
};

// Compact searchable Unit picker — used inside the Work Order dialog rows.
// Accepts free-form values too (allows typing custom units the list doesn't have).
const UnitCombobox = ({ value, onChange, units, testId }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between px-2 text-xs font-normal"
          data-testid={testId}
        >
          <span className="truncate">{value || <span className="text-gray-400">unit</span>}</span>
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search unit…" className="h-8 text-xs" />
          <CommandEmpty className="text-xs p-2">Press Enter to use custom value</CommandEmpty>
          <CommandList className="max-h-56">
            {units.map(u => (
              <CommandItem
                key={u}
                value={u}
                onSelect={() => { onChange(u); setOpen(false); }}
                className="text-xs"
              >
                <Check className={`mr-2 h-3 w-3 ${value === u ? 'opacity-100' : 'opacity-0'}`} />
                {u}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Initial empty rows for bulk add — defaults to 6 rows per the planning team's request
const createEmptyRows = (type, count = 6) => {
  if (type === 'scope') {
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }));
  } else if (type === 'payment') {
    return Array(count).fill(null).map(() => ({ stage_name: '', percentage: '', amount: '', due_date: '' }));
  } else if (type === 'addition') {
    // Simplified to Name | Qty | Amount per product owner
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', amount: '' }));
  } else if (type === 'deduction') {
    return Array(count).fill(null).map(() => ({ item_name: '', quantity: '1', amount: '' }));
  }
  return [];
};

const WorkflowBadge = ({ status }) => {
  const config = {
    draft: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    pending_verification: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    pending_approval: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    approved: { label: 'Active', color: 'bg-green-100 text-green-700', icon: Check },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle }
  };
  const cfg = config[status] || config.draft;
  const Icon = cfg.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
};

// ============ PAYMENT SUMMARY SECTION WITH INCOME/EXPENSE VIEWS ============
const fmtFull = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0';
// =====================================================================
// Hindrance taxonomy — used by the inline Hindrances picker in Project Stages
// =====================================================================
const HINDRANCE_REASONS = {
  internal: ['Drawing', 'Staff', 'Material', 'Labour', 'Machinery', 'Payment to Vendor', 'Petty Cash Delay', 'Others'],
  external: ['Approval', 'Drawing Change', 'Client New Design', 'Cost', 'Others'],
  neutral:  ['Rain', 'Local Issue', 'Approvals', '3rd Party Dependency', 'Others'],
};
const HINDRANCE_TYPE_LABEL = { internal: 'Internal', external: 'External', neutral: 'Neutral' };
const HINDRANCE_TYPE_COLOR = {
  internal: 'bg-rose-100 text-rose-700 border-rose-200',
  external: 'bg-amber-100 text-amber-700 border-amber-200',
  neutral:  'bg-sky-100 text-sky-700 border-sky-200',
};

// Inline picker: 3 type pills → reason dropdown → optional "Others" text input.
// Calls `onChange({hindrance_type, hindrance_reason, hindrances})`.
function HindrancePicker({ value, onChange, compact = false }) {
  const hType = value?.hindrance_type || '';
  const hReason = value?.hindrance_reason || '';
  const hNotes = value?.hindrances || '';
  const isOthers = hReason === 'Others';

  const clear = () => onChange({ hindrance_type: '', hindrance_reason: '', hindrances: '' });

  return (
    <div className={`flex flex-col gap-1 ${compact ? '' : 'min-w-[180px]'}`}>
      <div className="flex gap-1">
        {Object.keys(HINDRANCE_REASONS).map(t => (
          <button
            type="button"
            key={t}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${hType === t ? HINDRANCE_TYPE_COLOR[t] + ' font-semibold' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
            onClick={() => onChange({ hindrance_type: t, hindrance_reason: '', hindrances: '' })}
            data-testid={`hindrance-type-${t}`}
          >
            {HINDRANCE_TYPE_LABEL[t]}
          </button>
        ))}
        {(hType || hReason) && (
          <button type="button" className="text-[10px] px-1.5 py-0.5 text-gray-400 hover:text-rose-500" onClick={clear} title="Clear">×</button>
        )}
      </div>
      {hType && (
        <select
          className="border rounded px-2 py-1 text-xs"
          value={hReason}
          onChange={e => onChange({ hindrance_type: hType, hindrance_reason: e.target.value, hindrances: hNotes })}
          data-testid="hindrance-reason"
        >
          <option value="">— select reason —</option>
          {HINDRANCE_REASONS[hType].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {isOthers && (
        <input
          type="text"
          placeholder="Describe the hindrance..."
          className="border rounded px-2 py-1 text-xs"
          value={hNotes}
          onChange={e => onChange({ hindrance_type: hType, hindrance_reason: 'Others', hindrances: e.target.value })}
          data-testid="hindrance-other-text"
        />
      )}
    </div>
  );
}
// Read-only badge view used in the saved table
function HindranceBadge({ stage }) {
  const t = stage?.hindrance_type;
  const r = stage?.hindrance_reason;
  const notes = stage?.hindrances || stage?.remarks;
  if (!t && !r && !notes) return <span className="text-gray-300">-</span>;
  const tone = HINDRANCE_TYPE_COLOR[t] || 'bg-gray-100 text-gray-700 border-gray-200';
  // Single compact pill — never wraps inside; horizontally truncates with ellipsis
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0">
      {(t || r) && (
        <span
          className={`inline-flex items-center max-w-full text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border whitespace-nowrap leading-tight ${tone}`}
          title={`${t ? HINDRANCE_TYPE_LABEL[t] : ''}${t && r ? ' · ' : ''}${r || ''}${notes && r === 'Others' ? ` — ${notes}` : ''}`}
        >
          <span className="truncate">{t ? HINDRANCE_TYPE_LABEL[t] : ''}{t && r ? ' · ' : ''}{r || ''}</span>
        </span>
      )}
      {notes && r === 'Others' && (
        <span className="text-[11px] text-gray-600 line-clamp-1 max-w-full" title={notes}>{notes}</span>
      )}
      {notes && !t && !r && (
        <span className="text-[11px] text-gray-600 line-clamp-2 max-w-full" title={notes}>{notes}</span>
      )}
    </div>
  );
}



function ProjectCostAllocation({ projectId, api }) {
  const [data, setData] = useState(null);
  const [direct, setDirect] = useState(85);
  const [indirect, setIndirect] = useState(15);
  const [retro, setRetro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const r = await axios.get(`${api}/cashflow/summary?project_id=${projectId}`);
      setData(r.data);
      const split = r.data?.effective_split || { direct_pct: 85, indirect_pct: 15 };
      setDirect(split.direct_pct);
      setIndirect(split.indirect_pct);
    } catch { /* silent */ }
  };
  useEffect(() => { load(); }, [projectId]);

  const save = async () => {
    if (Math.abs(Number(direct) + Number(indirect) - 100) > 0.01) {
      toast.error('Direct + Indirect must sum to 100');
      return;
    }
    setBusy(true);
    try {
      const r = await axios.put(`${api}/cashflow/config/projects/${projectId}`, {
        direct_pct: Number(direct), indirect_pct: Number(indirect), apply_retroactively: !!retro,
      });
      toast.success(`Saved${r.data.retroactive_rows_updated ? ` · ${r.data.retroactive_rows_updated} past rows updated` : ''}`);
      setEditing(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const removeOverride = async () => {
    if (!window.confirm('Revert this project to the global split?')) return;
    setBusy(true);
    try {
      await axios.delete(`${api}/cashflow/config/projects/${projectId}`);
      toast.success('Reverted to global');
      setRetro(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  if (!data) return null;
  const hasOverride = data.has_override === true || (data.effective_split && data.effective_split.direct_pct !== undefined && Boolean(data.has_override));
  return (
    <Card className="mb-4 border-indigo-200 bg-indigo-50/40" data-testid="project-cost-allocation-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[11px] uppercase font-semibold text-indigo-700 flex items-center gap-1">
              Cost Allocation (Cashflow Engine)
              {data.has_override ? (
                <Badge variant="outline" className="text-[9px] border-indigo-300 text-indigo-700">Project Override</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] border-gray-300 text-gray-500">Global Default</Badge>
              )}
            </p>
            <p className="text-xs text-gray-600">Direct {data.direct_in?.toLocaleString('en-IN')} in · {data.direct_out?.toLocaleString('en-IN')} out · Indirect {data.indirect_in?.toLocaleString('en-IN')} in · {data.indirect_out?.toLocaleString('en-IN')} out</p>
          </div>
          {!editing ? (
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-100 text-emerald-700">Direct {data.effective_split.direct_pct}%</Badge>
              <Badge className="bg-sky-100 text-sky-700">Indirect {data.effective_split.indirect_pct}%</Badge>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="cf-proj-edit">Edit</Button>
            </div>
          ) : (
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <Label className="text-[10px]">Direct %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={direct} onChange={(e) => { setDirect(e.target.value); setIndirect(Math.max(0, 100 - Number(e.target.value))); }} className="h-8 w-24 text-sm" data-testid="cf-proj-direct" />
              </div>
              <div>
                <Label className="text-[10px]">Indirect %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={indirect} onChange={(e) => { setIndirect(e.target.value); setDirect(Math.max(0, 100 - Number(e.target.value))); }} className="h-8 w-24 text-sm" data-testid="cf-proj-indirect" />
              </div>
              <label className="flex items-center gap-1 text-[11px] mb-0.5">
                <input type="checkbox" checked={retro} onChange={(e) => setRetro(e.target.checked)} data-testid="cf-proj-retro" />
                Recompute past
              </label>
              <Button size="sm" onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="cf-proj-save">{busy ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={removeOverride} disabled={busy}>Revert</Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function ProjectCashflowTab({ projectId, isAdmin }) {
  const [data, setData] = useState(null);
  const [psData, setPsData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(true);
  const [direct, setDirect] = useState(85);
  const [indirect, setIndirect] = useState(15);
  const [retro, setRetro] = useState(false);
  const [pw, setPw] = useState({ open: false, password: '', verifying: false });

  const load = async () => {
    try {
      const [r, ps] = await Promise.all([
        axios.get(`${API}/cashflow/summary?project_id=${projectId}`),
        axios.get(`${API}/projects/${projectId}/payment-summary`).catch(() => ({ data: null })),
      ]);
      setData(r.data);
      setPsData(ps?.data || null);
      const split = r.data?.effective_split || { direct_pct: 85, indirect_pct: 15 };
      setDirect(split.direct_pct);
      setIndirect(split.indirect_pct);
    } catch { /* silent */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const save = async () => {
    if (Math.abs(Number(direct) + Number(indirect) - 100) > 0.01) { toast.error('Direct + Indirect must sum to 100'); return; }
    setBusy(true);
    try {
      const r = await axios.put(`${API}/cashflow/config/projects/${projectId}`, { direct_pct: Number(direct), indirect_pct: Number(indirect), apply_retroactively: !!retro });
      toast.success(`Saved${r.data.retroactive_rows_updated ? ` · ${r.data.retroactive_rows_updated} past rows updated` : ''}`);
      setLocked(true); setRetro(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const revert = async () => {
    if (!window.confirm('Revert this project to the global split?')) return;
    setBusy(true);
    try {
      await axios.delete(`${API}/cashflow/config/projects/${projectId}`);
      toast.success('Reverted to global');
      setLocked(true); setRetro(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  };

  const submitUnlock = async () => {
    if (!pw.password) { toast.error('Enter your password'); return; }
    setPw(p => ({ ...p, verifying: true }));
    try {
      await axios.post(`${API}/auth/verify-password`, { password: pw.password });
      setLocked(false);
      setPw({ open: false, password: '', verifying: false });
      toast.success('Unlocked — you can now edit allocation');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Incorrect password');
      setPw(p => ({ ...p, verifying: false }));
    }
  };

  if (!data) return <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>;
  const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const net = (data.direct_balance || 0) + (data.indirect_balance || 0);

  // === Redesigned Project Header Strip values ===
  const scopeTotal = psData?.scope_total || 0;
  const additionsTotal = psData?.additions_total || 0;
  const deductionsTotal = psData?.deductions_total || 0;
  const grandTotal = scopeTotal + additionsTotal - deductionsTotal;
  const totalIncome = psData?.summary?.total_received || data.income_total || 0;
  const totalExpense = psData?.total_expense || data.expense_total || 0;
  const receivableBalance = Math.max(0, grandTotal - totalIncome);
  const collectionPct = grandTotal > 0 ? (totalIncome / grandTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* === Project Header Strip: Value + Add − Ded = Grand Total | Income − Expense = Receivable === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="project-strip">
        {/* LEFT — Project Value Calculation */}
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/60 to-violet-50/40">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2">Project Value Calculation</p>
            <div className="grid grid-cols-4 gap-2 items-stretch">
              {/* Value */}
              <div className="rounded-md bg-white/80 border border-blue-200 p-2.5">
                <p className="text-[10px] text-gray-500 uppercase">Scope Value</p>
                <p className="text-base font-bold text-blue-700 mt-0.5">{fmtINR(scopeTotal)}</p>
              </div>
              {/* Additions */}
              <div className="rounded-md bg-white/80 border border-cyan-200 p-2.5">
                <p className="text-[10px] text-gray-500 uppercase">Additions</p>
                <p className="text-base font-bold text-cyan-700 mt-0.5">{fmtINR(additionsTotal)}</p>
              </div>
              {/* Deductions */}
              <div className="rounded-md bg-white/80 border border-orange-200 p-2.5">
                <p className="text-[10px] text-gray-500 uppercase">Deductions</p>
                <p className="text-base font-bold text-orange-700 mt-0.5">{fmtINR(deductionsTotal)}</p>
              </div>
              {/* Grand Total (highlighted) */}
              <div className="rounded-md bg-violet-600 text-white p-2.5">
                <p className="text-[10px] uppercase opacity-90">Grand Total</p>
                <p className="text-base font-extrabold mt-0.5">{fmtINR(grandTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — Financial Performance */}
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-rose-50/40">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Financial Performance</p>
            <div className="grid grid-cols-3 gap-2 items-stretch">
              {/* Total Income */}
              <div className="rounded-md bg-white/80 border border-emerald-200 p-2.5">
                <p className="text-[10px] text-gray-500 uppercase">Total Income</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">{fmtINR(totalIncome)}</p>
                <p className="text-[9px] text-emerald-600 mt-0.5">{collectionPct.toFixed(1)}% of value</p>
              </div>
              {/* Total Expense */}
              <div className="rounded-md bg-white/80 border border-rose-200 p-2.5">
                <p className="text-[10px] text-gray-500 uppercase">Total Expense</p>
                <p className="text-base font-bold text-rose-600 mt-0.5">{fmtINR(totalExpense)}</p>
                {totalIncome > 0 && <p className="text-[9px] text-rose-600 mt-0.5">{((totalExpense / totalIncome) * 100).toFixed(1)}% of income</p>}
              </div>
              {/* Receivable Balance */}
              <div className={`rounded-md p-2.5 ${receivableBalance > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'}`}>
                <p className="text-[10px] uppercase opacity-90">Receivable</p>
                <p className="text-base font-extrabold mt-0.5">{fmtINR(receivableBalance)}</p>
                <p className="text-[9px] opacity-90 mt-0.5">Yet to receive</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 01 — Project Cashflow Overview */}
        <Card className="bg-gradient-to-br from-violet-50 to-violet-100/40 border-violet-200">
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase text-violet-700">Cashflow Overview</span>
              {net >= 0 ? <TrendingUp className="h-4 w-4 text-violet-600" /> : <TrendingDown className="h-4 w-4 text-rose-600" />}
            </div>
            <div className="flex items-center justify-between border-b border-violet-200/60 pb-1.5">
              <span className="text-[11px] text-violet-700/80">Total Income</span>
              <span className="text-sm font-bold text-emerald-700">{fmtINR(data.income_total)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-violet-200/60 pb-1.5">
              <span className="text-[11px] text-violet-700/80">Total Expense (D+I)</span>
              <span className="text-sm font-bold text-rose-600">{fmtINR(data.expense_total)}</span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[12px] font-semibold text-violet-900">Balance</span>
              <span className={`text-lg font-extrabold ${net >= 0 ? 'text-violet-800' : 'text-rose-800'}`}>{fmtINR(net)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 02 — Direct */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border-emerald-200">
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase text-emerald-700">Direct Cost Allocation</span>
              <Badge className="bg-emerald-200 text-emerald-800 text-[10px]">{data.effective_split?.direct_pct}%</Badge>
            </div>
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
              <span className="text-[11px] text-emerald-700/80">Total Direct Allocation</span>
              <span className="text-sm font-bold text-emerald-700">{fmtINR(data.direct_in)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
              <span className="text-[11px] text-emerald-700/80">Expense (Direct)</span>
              <span className="text-sm font-bold text-rose-600">{fmtINR(data.direct_out)}</span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[12px] font-semibold text-emerald-900">Balance</span>
              <span className="text-lg font-extrabold text-emerald-800">{fmtINR(data.direct_balance)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 03 — Indirect */}
        <Card className="bg-gradient-to-br from-sky-50 to-sky-100/40 border-sky-200">
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase text-sky-700">Indirect Cost Allocation</span>
              <Badge className="bg-sky-200 text-sky-800 text-[10px]">{data.effective_split?.indirect_pct}%</Badge>
            </div>
            <div className="flex items-center justify-between border-b border-sky-200/60 pb-1.5">
              <span className="text-[11px] text-sky-700/80">Total Indirect Allocation</span>
              <span className="text-sm font-bold text-sky-700">{fmtINR(data.indirect_in)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-sky-200/60 pb-1.5">
              <span className="text-[11px] text-sky-700/80">Expense (Indirect)</span>
              <span className="text-sm font-bold text-rose-600">{fmtINR(data.indirect_out)}</span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[12px] font-semibold text-sky-900">Balance</span>
              <span className="text-lg font-extrabold text-sky-800">{fmtINR(data.indirect_balance)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Allocation Editor (Super Admin) */}
      {isAdmin && (
        <Card className="border-indigo-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div>
                <p className="text-[11px] uppercase font-semibold text-indigo-700 flex items-center gap-1">
                  Allocation Editor
                  {data.has_override ? <Badge variant="outline" className="text-[9px] border-indigo-300 text-indigo-700">Project Override</Badge> : <Badge variant="outline" className="text-[9px] border-gray-300 text-gray-500">Using Global Default</Badge>}
                </p>
                <p className="text-xs text-gray-500">Adjust Direct / Indirect split for this project.</p>
              </div>
              {locked && (
                <Button variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50" onClick={() => setPw({ open: true, password: '', verifying: false })} data-testid="proj-cf-edit-btn">
                  <Lock className="h-4 w-4 mr-1" /> Edit (Password Required)
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div>
                <Label className="text-xs">Direct %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={direct} onChange={(e) => { setDirect(e.target.value); setIndirect(Math.max(0, 100 - Number(e.target.value))); }} disabled={locked} data-testid="proj-cf-direct" />
              </div>
              <div>
                <Label className="text-xs">Indirect %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={indirect} onChange={(e) => { setIndirect(e.target.value); setDirect(Math.max(0, 100 - Number(e.target.value))); }} disabled={locked} data-testid="proj-cf-indirect" />
              </div>
            </div>
            {!locked && (
              <>
                <label className="flex items-center gap-2 mt-3 text-xs">
                  <input type="checkbox" checked={retro} onChange={(e) => setRetro(e.target.checked)} data-testid="proj-cf-retro" />
                  Recompute past income with the new split
                </label>
                <div className="flex items-center gap-2 mt-3">
                  <Button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="proj-cf-save"><Save className="h-4 w-4 mr-1" /> Save</Button>
                  <Button variant="outline" onClick={() => { setLocked(true); load(); }} data-testid="proj-cf-cancel">Cancel</Button>
                  {data.has_override && (
                    <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={revert} disabled={busy} data-testid="proj-cf-revert"><Trash2 className="h-4 w-4 mr-1" /> Revert to Global</Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={pw.open} onOpenChange={(o) => !o && !pw.verifying && setPw({ open: false, password: '', verifying: false })}>
        <DialogContent className="max-w-sm" data-testid="proj-cf-pw-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-indigo-600" /> Enter Password to Edit</DialogTitle>
            <DialogDescription>Editing this project's cost allocation is restricted. Re-enter your password to unlock.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs">Your password</Label>
            <Input type="password" autoFocus value={pw.password} onChange={(e) => setPw(p => ({ ...p, password: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') submitUnlock(); }} placeholder="••••••••" data-testid="proj-cf-pw-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPw({ open: false, password: '', verifying: false })} disabled={pw.verifying}>Cancel</Button>
            <Button onClick={submitUnlock} disabled={pw.verifying || !pw.password} className="bg-indigo-600 hover:bg-indigo-700" data-testid="proj-cf-pw-submit">
              {pw.verifying ? 'Verifying…' : 'Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function PaymentSummarySection({ user, projectId, paymentSummary, formatCurrency, getPaymentStatusBadge, openCollectDialog }) {
  const [incomeData, setIncomeData] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [loadingFinance, setLoadingFinance] = useState(true);
  const [financeTab, setFinanceTab] = useState('income');

  const canSeeTotals = ['super_admin', 'accountant'].includes(user?.role);
  const canSeePaymentDetails = ['super_admin', 'accountant', 'general_manager', 'planning'].includes(user?.role);

  useEffect(() => {
    if (canSeePaymentDetails) {
      (async () => {
        try {
          const [incRes, expRes] = await Promise.all([
            axios.get(`${API}/projects/${projectId}/income`).catch(() => null),
            axios.get(`${API}/projects/${projectId}/expenses`).catch(() => null),
          ]);
          if (incRes) setIncomeData(incRes.data);
          if (expRes) setExpenseData(expRes.data);
        } catch { /* ignore */ }
        setLoadingFinance(false);
      })();
    } else {
      setLoadingFinance(false);
    }
  }, [projectId, canSeePaymentDetails]);


  const incomeEntries = incomeData?.entries || [];
  const incomeSummary = incomeData?.summary || {};
  const expenseSummary = expenseData?.summary || {};
  const materialExpenses = expenseData?.material || [];
  const labourExpenses = expenseData?.labour || [];
  const vendorExpenses = expenseData?.vendor_service || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Payment Summary</h3>
          <p className="text-xs sm:text-sm text-gray-500">Complete payment schedule from advance to handover</p>
        </div>
      </div>

      {/* Totals - Only for Super Admin & Accountant */}
      {canSeeTotals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="payment-summary-totals">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Income</p>
              <p className="text-lg font-bold text-green-700">{fmtFull(incomeSummary.total_income)}</p>
              <p className="text-[10px] text-gray-400">{incomeEntries.length} entries</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Expense</p>
              <p className="text-lg font-bold text-red-600">{fmtFull(expenseSummary.total_expenses)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Total Paid</p>
              <p className="text-lg font-bold text-blue-600">{fmtFull(expenseSummary.total_paid)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Net Balance</p>
              <p className={`text-lg font-bold ${(incomeSummary.total_income || 0) - (expenseSummary.total_expenses || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmtFull((incomeSummary.total_income || 0) - (expenseSummary.total_expenses || 0))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary Cards */}
      {paymentSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <CardContent className="p-3">
              <p className="text-xs text-indigo-600 font-medium">Project Value</p>
              <p className="text-lg font-bold text-indigo-700">{formatCurrency(paymentSummary.project_value || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
            <CardContent className="p-3">
              <p className="text-xs text-emerald-600 font-medium">Advance Paid</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(paymentSummary.advance_payment?.amount || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-3">
              <p className="text-xs text-amber-600 font-medium">Stages Scheduled</p>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(paymentSummary.summary?.total_scheduled || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3">
              <p className="text-xs text-green-600 font-medium">Total Received</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(paymentSummary.summary?.total_received || 0)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-3">
              <p className="text-xs text-orange-600 font-medium">Balance Due</p>
              <p className="text-lg font-bold text-orange-700">{formatCurrency(paymentSummary.summary?.total_balance || 0)}</p>
              <p className="text-[10px] text-orange-500">{paymentSummary.summary?.collection_percentage?.toFixed(1) || 0}% collected</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Income / Expense Mini Views - Visible to GM, Planning, Super Admin, Accountant */}
      {canSeePaymentDetails && (
        <Card data-testid="income-expense-section">
          <CardHeader className="pb-0 pt-3 px-4 border-b">
            <Tabs value={financeTab} onValueChange={setFinanceTab}>
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="income" className="gap-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-800" data-testid="project-income-tab">
                  <ArrowDownRight className="h-3.5 w-3.5" /> Income ({incomeEntries.length})
                </TabsTrigger>
                <TabsTrigger value="expense" className="gap-1.5 data-[state=active]:bg-red-100 data-[state=active]:text-red-800" data-testid="project-expense-tab">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Expense
                </TabsTrigger>
                <TabsTrigger value="cashflow" className="gap-1.5 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800" data-testid="project-cashflow-tab">
                  <Wallet className="h-3.5 w-3.5" /> Cashflow Engine
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {loadingFinance ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-amber-600" /></div>
            ) : financeTab === 'cashflow' ? (
              <div className="p-4">
                <ProjectCashflowTab projectId={projectId} isAdmin={['super_admin'].includes(user?.role)} />
              </div>
            ) : financeTab === 'income' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="project-income-table">
                  <thead className="bg-green-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Mode</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Reference</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incomeEntries.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">No income entries</td></tr>
                    ) : incomeEntries.map((e, i) => (
                      <tr key={e.income_id || i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2">{new Date(e.payment_date || e.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2 font-medium">{e.stage || e.description || 'Payment'}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] capitalize">{e.payment_mode?.replace('_', ' ') || 'Cash'}</Badge></td>
                        <td className="px-3 py-2 font-mono text-[10px]">{e.reference_number || e.cheque_number || '-'}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{fmtFull(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {canSeeTotals && incomeEntries.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2 font-semibold">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right text-gray-600">Total Income:</td>
                        <td className="px-3 py-2 text-right text-green-700 text-sm">{fmtFull(incomeSummary.total_income)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="project-expense-table">
                  <thead className="bg-red-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">S.No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Vendor</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materialExpenses.length === 0 && labourExpenses.length === 0 && vendorExpenses.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-400">No expense entries</td></tr>
                    ) : (
                      <>
                        {materialExpenses.map((e, i) => (
                          <tr key={e.expense_id || `m-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-blue-100 text-blue-700 text-[10px]">Material</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.material_name || e.description || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.final_amount || e.amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                        {labourExpenses.map((e, i) => (
                          <tr key={e.expense_id || `l-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{materialExpenses.length + i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-purple-100 text-purple-700 text-[10px]">Labour</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.description || e.worker_name || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.contractor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                        {vendorExpenses.map((e, i) => (
                          <tr key={e.expense_id || `v-${i}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{materialExpenses.length + labourExpenses.length + i + 1}</td>
                            <td className="px-3 py-2"><Badge className="bg-amber-100 text-amber-700 text-[10px]">Vendor</Badge></td>
                            <td className="px-3 py-2 font-medium">{e.service_name || e.description || '-'}</td>
                            <td className="px-3 py-2 text-gray-600">{e.vendor_name || '-'}</td>
                            <td className="px-3 py-2 text-right font-bold text-red-600">{fmtFull(e.amount)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{fmtFull(e.total_paid)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                  {canSeeTotals && (materialExpenses.length > 0 || labourExpenses.length > 0 || vendorExpenses.length > 0) && (
                    <tfoot className="bg-red-50 border-t-2 font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Total Expense:</td>
                        <td className="px-3 py-2 text-right text-red-600 text-sm">{fmtFull(expenseSummary.total_expenses)}</td>
                        <td className="px-3 py-2 text-right text-green-600 text-sm">{fmtFull(expenseSummary.total_paid)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stage-wise Payment Schedule removed — already shown in the dedicated
          "Payment Schedule" tab. Keeps Payment Summary focused on totals + cheques. */}
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectData, setProjectData] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'rough-estimate');
  // Project income (used by the Advance card + auto-injected schedule row).
  // Fetched once per project; refreshed whenever fetchData runs.
  const [projectIncomeEntries, setProjectIncomeEntries] = useState([]);
  const [projectIncomeSummary, setProjectIncomeSummary] = useState({});
  const [projectExpenseSummary, setProjectExpenseSummary] = useState({});
  
  // "Set Advance %" popup — converts the virtual Auto-collected row into a real
  // first payment stage with a user-chosen % and stage name. Also reused for
  // EDITING an existing advance stage when `editing_stage_id` is set.
  const [advanceDialog, setAdvanceDialog] = useState({
    open: false,
    editing_stage_id: null,        // when set → PATCH that stage instead of POST materialize
    income_amount: 0,
    stage_name: 'Stage 01 Payment',
    percentage: '',
    expected_payment_date: '',
    generate_remaining: true,
    remaining_template_id: '__default__',
    submitting: false,
  });
  
  // Bulk dialog states
  const [bulkScopeDialog, setBulkScopeDialog] = useState(false);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(false);
  // Choose Payment Schedule Template dialog
  const [chooseTemplateDialog, setChooseTemplateDialog] = useState(false);
  const [psTemplates, setPsTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateApplyMode, setTemplateApplyMode] = useState('append');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [bulkAdditionDialog, setBulkAdditionDialog] = useState(false);
  const [bulkDeductionDialog, setBulkDeductionDialog] = useState(false);
  
  // Verification dialog
  const [verifyDialog, setVerifyDialog] = useState({ open: false, type: '', ids: [] });
  const [verifyCode, setVerifyCode] = useState('');
  
  // Multi-select for bulk delete
  const [selectedScopeIds, setSelectedScopeIds] = useState([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  
  // Project Stages
  const [projectStages, setProjectStages] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showAddStages, setShowAddStages] = useState(false);
  const [newStages, setNewStages] = useState([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '', hindrances: '', sl_no: '', section_title: '', is_section_header: false, actual_start_date: '', actual_finish_date: '', duration_days: '', progress: 0, depends_on: '', hindrance_type: '', hindrance_reason: '' }]);
  const [saveTemplateDialog, setSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editingStageId, setEditingStageId] = useState(null);
  const [editStageData, setEditStageData] = useState({});
  const [timelineStage, setTimelineStage] = useState(null);  // null | stage object — opens the Timeline dialog
  const [stagesView, setStagesView] = useState('table'); // 'table' or 'gantt'
  
  // Bulk form data
  const [bulkScopeRows, setBulkScopeRows] = useState(createEmptyRows('scope'));
  const [bulkPaymentRows, setBulkPaymentRows] = useState(createEmptyRows('payment'));
  const [bulkAdditionRows, setBulkAdditionRows] = useState(createEmptyRows('addition'));
  const [bulkDeductionRows, setBulkDeductionRows] = useState(createEmptyRows('deduction'));
  
  // Editing states
  const [editingPayment, setEditingPayment] = useState(null);
  const [editingAddition, setEditingAddition] = useState(null);
  // Edit Addition / Deduction dialog: lets user change Name, Qty, Amount post-creation
  const [editItemDialog, setEditItemDialog] = useState({ open: false, type: null, id: null });
  const [editItemForm, setEditItemForm] = useState({ name: '', qty: '1', amount: '' });
  const [editingScopeItem, setEditingScopeItem] = useState(null);
  const [editScopeForm, setEditScopeForm] = useState({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  const [deleteProjectDialog, setDeleteProjectDialog] = useState(false);
  // Req Payment dialog (asks for expected month/date before requesting)
  const [reqPayDialog, setReqPayDialog] = useState({ open: false, stage: null, date: '', submitting: false });
  // Planning Resubmit dialog for CRE/Accountant rejected payment stages
  const [psResubmitDialog, setPsResubmitDialog] = useState({ open: false, stage: null, mode: null, amount: '', remarks: '', submitting: false });
  // Payment Schedule month/year filter (filters by expected_payment_date)
  const [psMonthFilter, setPsMonthFilter] = useState(''); // '' = all, format 'YYYY-MM'
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Inline edit for project header
  const [headerEditing, setHeaderEditing] = useState(false);
  const [headerForm, setHeaderForm] = useState({ name: '', client_name: '', client_phone: '', client_email: '', location: '', package_id: '' });
  const [headerSaving, setHeaderSaving] = useState(false);
  const [allPackages, setAllPackages] = useState([]);
  // Payment Schedule Edit Dialog states
  const [editPaymentDialog, setEditPaymentDialog] = useState(false);
  const [editPaymentStage, setEditPaymentStage] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ stage_name: '', percentage: '', amount: '', due_date: '' });
  const [submitScheduleDialog, setSubmitScheduleDialog] = useState(false);
  
  // Payment Summary state
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [collectPaymentDialog, setCollectPaymentDialog] = useState(false);
  const [selectedStage, setSelectedStage] = useState(null);
  const [collectForm, setCollectForm] = useState({ amount_received: '', payment_mode: 'bank_transfer', payment_reference: '', remarks: '' });
  
  // Rough Estimate state
  const [reProject, setReProject] = useState(null);
  const [reInnerTab, setReInnerTab] = useState('scope'); // 'scope' | 'payments' — inside Rough Estimate tab
  const [reRevisions, setReRevisions] = useState([]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [designData, setDesignData] = useState({ site_plans: [], design_files: [] });
  const [teamData, setTeamData] = useState({ architect: null, project_manager: null, sr_site_engineer: null, site_engineer: null, cre: null, qc: null, procurement: null });
  const [materialsData, setMaterialsData] = useState({ summary: {}, materials: [] });
  const [laboursData, setLaboursData] = useState({ summary: {}, labours: [] });
  const [vendorAssignments, setVendorAssignments] = useState([]);
  const [allVendors, setAllVendors] = useState([]);
  const [vendorCategories, setVendorCategories] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [materialSubTab, setMaterialSubTab] = useState('materials');
  
  // Package Materials (editable list within project)
  const [projectMaterials, setProjectMaterials] = useState([]);
  const [projectMaterialsLoaded, setProjectMaterialsLoaded] = useState(false);
  const [projMaterialNames, setProjMaterialNames] = useState([]);
  const [projBrandsByMat, setProjBrandsByMat] = useState({});
  const [projAddingMatFor, setProjAddingMatFor] = useState(null);
  const [projAddingBrandFor, setProjAddingBrandFor] = useState(null);
  const [projNewMatName, setProjNewMatName] = useState('');
  const [projNewBrandName, setProjNewBrandName] = useState('');
  const [editingMaterials, setEditingMaterials] = useState(false);
  const [selectedMatPackage, setSelectedMatPackage] = useState('');

  // Work Orders
  const [workOrders, setWorkOrders] = useState([]);
  const [woDialog, setWoDialog] = useState(false);
  const [editingWo, setEditingWo] = useState(null);
  const [woViewId, setWoViewId] = useState(null);
  const [contractorTypes, setContractorTypes] = useState([]);
  const [allContractors, setAllContractors] = useState([]);
  // Helper: merge legacy `/contractors` (older work orders reference these)
  // with the new `/labour-contractors` collection (created from the Planning
  // Board's Labour Contractors tab) so both appear in WO dropdowns.
  // Dedupes by `contractor_id`.
  const fetchAllContractors = async () => {
    const [legacy, lc] = await Promise.all([
      axios.get(`${API}/contractors`).catch(() => ({ data: [] })),
      axios.get(`${API}/labour-contractors`).catch(() => ({ data: [] })),
    ]);
    const seen = new Set();
    const merged = [];
    for (const c of [...(lc.data || []), ...(legacy.data || [])]) {
      const id = c.contractor_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(c);
    }
    return merged;
  };
  const [woSelectedType, setWoSelectedType] = useState('');
  const [woForm, setWoForm] = useState({ contractor_id: '', notes: '', scope_items: [], stages: [], additional_work: [], deductions: [], payment_stages: [], total_amount: 0, description: '', labour_rates: { skilled: 0, semi_skilled: 0, unskilled: 0 } });
  // Top-level tab inside the WO dialog: 'work_order' (with inner Scope/Additional/Deductions/Summary) | 'payment_stages'
  const [woMainTab, setWoMainTab] = useState('work_order');
  // Common construction units used by the searchable Unit dropdown across
  // Scope / Additional / Deductions rows.
  const WO_UNITS = ['nos', 'sqft', 'sft', 'rft', 'm', 'sqm', 'cum', 'kg', 'ton', 'litre', 'hr', 'day', 'lot', 'ls', 'box', 'bag', 'roll', 'set'];
  const [woSubTab, setWoSubTab] = useState('scope');
  const [assignVendorDialog, setAssignVendorDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ category: '', vendor_id: '', brand: '' });
  const [labourSubTab, setLabourSubTab] = useState('workorders');
  const [labourWoViewId, setLabourWoViewId] = useState(null);
  const [expandedWoStages, setExpandedWoStages] = useState({});
  // Planning: Request Labour Advance (Planning → PM → GM → Accountant)
  const [labourAdvanceDialog, setLabourAdvanceDialog] = useState({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' });
  const [labourAdvanceSaving, setLabourAdvanceSaving] = useState(false);
  const [labourAttendance, setLabourAttendance] = useState([]);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [attForm, setAttForm] = useState({ contractor_id: '', work_order_id: '', stage_id: '', date: new Date().toISOString().split('T')[0], entries: [] });
  const [materialInventory, setMaterialInventory] = useState([]);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [showWOForm, setShowWOForm] = useState(false);
  const [invForm, setInvForm] = useState({ material_name: '', unit: '', date: new Date().toISOString().split('T')[0], opening_stock: 0, received: 0, used: 0, notes: '' });
  const [invDashboard, setInvDashboard] = useState(null);
  const [showLocationSetup, setShowLocationSetup] = useState(false);
  const [locationUrl, setLocationUrl] = useState('');
  const [locationSaving, setLocationSaving] = useState(false);

  // Team editing state
  const [teamEditDialog, setTeamEditDialog] = useState(false);
  const [teamRoleUsers, setTeamRoleUsers] = useState({});
  const [teamDraft, setTeamDraft] = useState({});
  const [teamSaving, setTeamSaving] = useState(false);

  // Freeze & Reassign state
  const [freezeStep, setFreezeStep] = useState(null); // null | 'otp' | 'reassign'
  const [freezeWoId, setFreezeWoId] = useState(null);
  const [freezeOtp, setFreezeOtp] = useState('');
  const [freezeOtpSending, setFreezeOtpSending] = useState(false);
  const [freezeOtpVerified, setFreezeOtpVerified] = useState(false);
  const [freezeNewType, setFreezeNewType] = useState('');
  const [freezeForm, setFreezeForm] = useState({ new_contractor_id: '', scope_items: [], stages: [], additional_work: [], notes: '' });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const userRes = await axios.get(`${API}/auth/me`);
      setUser(userRes.data);
      
      // Redirect Site Engineers to their dedicated board
      if (userRes.data.role === 'site_engineer') {
        window.location.href = `/site-engineer/project/${projectId}`;
        return;
      }
      
      // Run ALL data fetches in parallel
      const [projectRes, summaryRes, stagesRes, templatesRes, filesRes, designRes, teamRes, materialsRes, laboursRes, vendorAssignRes, vendorsRes, vendorCatsRes, poRes, pkgRes, incomeRes, expRes] = await Promise.all([
        axios.get(`${API}/projects/${projectId}/full-details`),
        axios.get(`${API}/projects/${projectId}/payment-summary`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/project-stages`).catch(() => null),
        axios.get(`${API}/stage-templates`).catch(() => null),
        axios.get(`${API}/files?project_id=${projectId}`, { withCredentials: true }).catch(() => null),
        axios.get(`${API}/architect/projects/${projectId}/all-design-data`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/team`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/materials-summary`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/labours-summary`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/vendor-assignments`).catch(() => null),
        axios.get(`${API}/vendor-master`).catch(() => null),
        axios.get(`${API}/vendor-categories`).catch(() => null),
        axios.get(`${API}/purchase-orders?project_id=${projectId}`).catch(() => null),
        axios.get(`${API}/packages`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/income`).catch(() => null),
        axios.get(`${API}/projects/${projectId}/expenses`).catch(() => null),
      ]);
      
      setProjectData(projectRes.data);
      if (summaryRes) setPaymentSummary(summaryRes.data);
      if (stagesRes) setProjectStages(stagesRes.data);
      if (templatesRes) setStageTemplates(templatesRes.data);
      if (filesRes) setProjectFiles(filesRes.data);
      if (designRes) setDesignData(designRes.data || { site_plans: [], design_files: [] });
      if (teamRes) setTeamData(teamRes.data || { architect: null, project_manager: null, sr_site_engineer: null, site_engineer: null, cre: null, qc: null, procurement: null });
      if (materialsRes) setMaterialsData(materialsRes.data || { summary: {}, materials: [] });
      if (laboursRes) setLaboursData(laboursRes.data || { summary: {}, labours: [] });
      if (vendorAssignRes) setVendorAssignments(vendorAssignRes.data || []);
      if (vendorsRes) setAllVendors(vendorsRes.data || []);
      if (vendorCatsRes) setVendorCategories(vendorCatsRes.data || []);
      if (poRes) setPurchaseOrders(poRes.data || []);
      if (pkgRes) setAllPackages(pkgRes.data || []);
      // Project income (used by Advance card + auto-injected schedule row)
      // Endpoint returns { entries: [...], summary: {...} }
      // — capture the entries list defensively whatever shape the BE returns.
      if (incomeRes) {
        const ent = incomeRes.data?.entries || incomeRes.data || [];
        setProjectIncomeEntries(Array.isArray(ent) ? ent : []);
        setProjectIncomeSummary(incomeRes.data?.summary || {});
      }
      if (expRes) {
        setProjectExpenseSummary(expRes.data?.summary || {});
      }

      // Load work orders, contractors, attendance, inventory
      try {
        const [woRes, contMerged, attRes, invRes, dashRes] = await Promise.all([
          axios.get(`${API}/projects/${projectId}/work-orders`).catch(() => null),
          fetchAllContractors(),
          axios.get(`${API}/labour-attendance?project_id=${projectId}`).catch(() => null),
          axios.get(`${API}/material-inventory?project_id=${projectId}`).catch(() => null),
          axios.get(`${API}/material-inventory/dashboard?project_id=${projectId}`).catch(() => null)
        ]);
        if (woRes) setWorkOrders(woRes.data || []);
        setAllContractors(contMerged);
        if (attRes) setLabourAttendance(attRes.data || []);
        if (invRes) setMaterialInventory(invRes.data || []);
        if (dashRes) setInvDashboard(dashRes.data || null);
      } catch { /* ignore */ }
      
      // Fetch RE project if available (depends on projectRes)
      if (projectRes.data.project?.re_project_id) {
        try {
          const reRes = await axios.get(`${API}/crm/re-projects/${projectRes.data.project.re_project_id}`);
          setReProject(reRes.data);
          // Load all revisions
          if (reRes.data.parent_re_number) {
            try {
              const revRes = await axios.get(`${API}/crm/re-projects/by-number/${reRes.data.parent_re_number}`);
              setReRevisions(revRes.data || []);
            } catch { setReRevisions([reRes.data]); }
          } else {
            setReRevisions([reRes.data]);
          }
        } catch (e) { /* RE project not available */ }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
    }
  };
  useAutoRefresh(fetchData, 15000);

  // Load package materials when project data is available
  useEffect(() => {
    if (projectData?.project && !projectMaterialsLoaded) {
      loadProjectMaterials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectData?.project?.project_id, projectMaterialsLoaded]);

  const fetchProjectFiles = async () => {
    try {
      const res = await axios.get(`${API}/files?project_id=${projectId}`, { withCredentials: true });
      setProjectFiles(res.data);
    } catch {
      // Files endpoint may not have data yet
    }
  };

  // Fetch work orders when tab is active
  useEffect(() => {
    if (activeTab === 'work-orders' && projectId) fetchWorkOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  const fetchDesignData = async () => {
    try {
      const res = await axios.get(`${API}/architect/projects/${projectId}/all-design-data`);
      setDesignData(res.data || { site_plans: [], design_files: [] });
    } catch {
      // Design data may not exist
    }
  };

  const TEAM_ROLES = [
    { key: 'architect', label: 'Architect', dbRole: 'architect', color: 'purple' },
    { key: 'project_manager', label: 'Project Manager', dbRole: 'project_manager', color: 'indigo' },
    { key: 'planning_person', label: 'Planning Person', dbRole: 'planning_person', color: 'blue' },
    { key: 'sr_site_engineer', label: 'Sr. Site Engineer', dbRole: 'sr_site_engineer', color: 'amber' },
    { key: 'site_engineer', label: 'Site Engineer', dbRole: 'site_engineer', color: 'green' },
    { key: 'cre', label: 'CRE', dbRole: 'cre', color: 'blue' },
    { key: 'qc', label: 'QC', dbRole: 'qc', color: 'rose' },
    { key: 'procurement', label: 'Procurement', dbRole: 'procurement', color: 'orange' },
  ];

  const fetchTeamData = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/team`);
      setTeamData(res.data || { architect: null, project_manager: null, planning_person: null, sr_site_engineer: null, site_engineer: null, cre: null, qc: null, procurement: null });
    } catch { /* No team data */ }
  };

  const openTeamEditDialog = async () => {
    // Build draft from current assignments
    const draft = {};
    TEAM_ROLES.forEach(r => { draft[r.key] = teamData[r.key]?.user_id || ''; });
    setTeamDraft(draft);
    // Fetch users for each role in parallel
    const roleMap = {};
    await Promise.all(TEAM_ROLES.map(async (r) => {
      try {
        const res = await axios.get(`${API}/users/by-role/${r.dbRole}`);
        roleMap[r.key] = res.data || [];
      } catch { roleMap[r.key] = []; }
    }));
    setTeamRoleUsers(roleMap);
    setTeamEditDialog(true);
  };

  const handleTeamSave = async () => {
    setTeamSaving(true);
    try {
      const payload = {};
      TEAM_ROLES.forEach(r => { payload[r.key] = (teamDraft[r.key] && teamDraft[r.key] !== '__none__') ? teamDraft[r.key] : null; });
      await axios.patch(`${API}/projects/${projectId}/team`, payload);
      toast.success('Team updated successfully');
      setTeamEditDialog(false);
      fetchTeamData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update team'); }
    setTeamSaving(false);
  };

  const fetchPackages = async () => {
    try {
      const res = await axios.get(`${API}/packages`);
      setAllPackages(res.data || []);
    } catch { setAllPackages([]); }
  };

  const loadProjectMaterials = async () => {
    try {
      const [matNamesRes, savedRes] = await Promise.all([
        axios.get(`${API}/material-names`).catch(() => ({ data: [] })),
        axios.get(`${API}/projects/${projectId}/package-materials`).catch(() => ({ data: [] })),
      ]);
      setProjMaterialNames(matNamesRes.data || []);
      setSelectedMatPackage(projectData?.project?.package_id || '');
      if (savedRes.data?.length > 0) {
        setProjectMaterials(savedRes.data);
        savedRes.data.forEach(m => { if (m.name) fetchProjBrands(m.name); });
        setEditingMaterials(false);
      } else if (projectData?.project?.package_id) {
        const pkgListRes = await axios.get(`${API}/packages`).catch(() => ({ data: [] }));
        const pkg = (pkgListRes.data || []).find(p => p.package_id === projectData.project.package_id);
        if (pkg?.material_items?.length > 0) {
          const items = pkg.material_items.map(m => ({ name: m.name, brand: m.brand || '' }));
          setProjectMaterials(items);
          items.forEach(m => { if (m.name) fetchProjBrands(m.name); });
          setEditingMaterials(true); // New import - show in edit mode
        } else { setProjectMaterials([]); setEditingMaterials(true); }
      } else { setProjectMaterials([]); setEditingMaterials(true); }
    } catch { setProjectMaterials([]); setEditingMaterials(true); }
    setProjectMaterialsLoaded(true);
  };

  const fetchProjBrands = async (materialName) => {
    if (!materialName) return;
    try {
      const res = await axios.get(`${API}/brands?category=${encodeURIComponent(materialName)}`);
      setProjBrandsByMat(prev => ({ ...prev, [materialName]: res.data || [] }));
    } catch { /* ignore */ }
  };

  const saveProjectMaterials = async (mats) => {
    try {
      await axios.put(`${API}/projects/${projectId}/package-materials`, { materials: mats.map(m => ({ name: m.name || '', brand: m.brand || '' })) });
    } catch { /* silent save */ }
  };

  const saveTimeoutRef = { current: null };
  const debouncedSaveProjectMaterials = (mats) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveProjectMaterials(mats), 600);
  };

  const updateProjectMaterial = (idx, field, val) => {
    setProjectMaterials(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      if (field === 'name') { updated[idx].brand = ''; fetchProjBrands(val); }
      debouncedSaveProjectMaterials(updated);
      return updated;
    });
  };

  const handleProjCreateMaterial = async (idx) => {
    const name = projNewMatName.trim();
    if (!name) return;
    try {
      const res = await axios.post(`${API}/material-names`, { name });
      if (!res.data.exists) setProjMaterialNames(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      updateProjectMaterial(idx, 'name', res.data.name);
      setProjNewMatName('');
      setProjAddingMatFor(null);
      toast.success(`Material "${res.data.name}" added`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleProjCreateBrand = async (idx) => {
    const name = projNewBrandName.trim();
    const materialName = projectMaterials[idx]?.name;
    if (!name || !materialName) return;
    try {
      const res = await axios.post(`${API}/brands`, { name, category: materialName });
      setProjBrandsByMat(prev => ({ ...prev, [materialName]: [...(prev[materialName] || []), res.data].sort((a, b) => a.name.localeCompare(b.name)) }));
      updateProjectMaterial(idx, 'brand', res.data.name);
      setProjNewBrandName('');
      setProjAddingBrandFor(null);
      toast.success(`Brand "${res.data.name}" added`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleLoadPackageMaterials = async (pkgId) => {
    setSelectedMatPackage(pkgId);
    if (!pkgId || pkgId === '__none__') return;
    try {
      const pkgRes = await axios.get(`${API}/packages`);
      const pkg = (pkgRes.data || []).find(p => p.package_id === pkgId);
      if (pkg?.material_items?.length > 0) {
        const items = pkg.material_items.map(m => ({ name: m.name, brand: m.brand || '' }));
        setProjectMaterials(items);
        items.forEach(m => { if (m.name) fetchProjBrands(m.name); });
        setEditingMaterials(true);
      }
    } catch { toast.error('Failed to load package materials'); }
  };

  const handleSaveMaterials = async () => {
    await saveProjectMaterials(projectMaterials);
    setEditingMaterials(false);
    toast.success('Materials saved');
  };

  // === WORK ORDER HANDLERS ===
  const fetchWorkOrders = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/work-orders`);
      setWorkOrders(res.data || []);
    } catch { setWorkOrders([]); }
  };

  const openWoDialog = async (wo = null) => {
    setEditingWo(wo);
    setWoViewId(null);
    // Fetch contractor types and contractors (merged: legacy + new)
    try {
      const [typesRes, contMerged] = await Promise.all([
        axios.get(`${API}/contractor-types`),
        fetchAllContractors(),
      ]);
      setContractorTypes(typesRes.data || []);
      setAllContractors(contMerged);
    } catch { setContractorTypes([]); setAllContractors([]); }

    if (wo) {
      setWoSelectedType(wo.contractor_type || '');
      setWoForm({
        contractor_id: wo.contractor_id || '',
        notes: wo.notes || '',
        scope_items: (wo.scope_items || []).map(s => ({ name: s.name, unit: s.unit, quantity: s.quantity, unit_rate: s.unit_rate })),
        // Strip auto-derived "additional cost" stages — they get regenerated each render from additional_work
        stages: (wo.stages || []).filter(s => s.source !== 'additional').map(s => ({ name: s.name, type: s.type, value: s.value })),
        additional_work: (wo.additional_work || []).map(a => ({ description: a.description, unit: a.unit, quantity: a.quantity, unit_rate: a.unit_rate })),
        deductions: (wo.deductions || []).map(d => ({ description: d.description, unit: d.unit, quantity: d.quantity, unit_rate: d.unit_rate })),
        labour_rates: wo.labour_rates || { skilled: 0, semi_skilled: 0, unskilled: 0 },
      });
    } else {
      setWoSelectedType('');
      setWoForm({ contractor_id: '', notes: '', scope_items: [], stages: [], additional_work: [], deductions: [], labour_rates: { skilled: 0, semi_skilled: 0, unskilled: 0 } });
    }
    setWoSubTab('scope');
    setWoMainTab('work_order');
    setWoDialog(true);
  };

  const handleSaveWo = async () => {
    if (!woForm.contractor_id) { toast.error('Select a contractor'); return; }
    try {
      // Auto-derive one fixed-amount payment stage per Additional row.
      // Rule (per product owner): every Additional cost is its own locked
      // payment stage; user-defined % stages compute on Scope only — never on
      // Scope+Additional. So we prepend auto-additional stages here on save.
      const autoStages = (woForm.additional_work || [])
        .filter(a => (parseFloat(a.quantity) || 0) * (parseFloat(a.unit_rate) || 0) > 0)
        .map((a, i) => ({
          name: `Additional Cost ${i + 1}${a.description ? ` - ${a.description}` : ''}`.slice(0, 120),
          type: 'amount',
          value: Math.round((parseFloat(a.quantity) || 0) * (parseFloat(a.unit_rate) || 0) * 100) / 100,
          source: 'additional',
        }));
      const userStages = (woForm.stages || []).map(s => ({ ...s, source: null }));
      // Auto-additional stages appear LAST so user-defined % stages run first.
      const payload = { ...woForm, stages: [...userStages, ...autoStages] };
      if (editingWo) {
        await axios.patch(`${API}/projects/${projectId}/work-orders/${editingWo.work_order_id}`, payload);
        toast.success('Work order updated');
      } else {
        await axios.post(`${API}/projects/${projectId}/work-orders`, payload);
        toast.success('Work order created');
      }
      setWoDialog(false);
      fetchWorkOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
  };

  const handleDeleteWo = async (wo) => {
    if (!window.confirm(`Delete work order for "${wo.contractor_name}"?`)) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}`);
      toast.success('Work order deleted');
      fetchWorkOrders();
    } catch { toast.error('Failed to delete'); }
  };

  // Match work orders against contractors. Contractors store types in `work_types[]`
  // (legacy single-string `contractor_type` is also honoured for old data).
  const filteredWoContractors = allContractors.filter(c => {
    if (c.is_active === false) return false;
    if (!woSelectedType) return true;
    const types = c.work_types || (c.contractor_type ? [c.contractor_type] : []);
    return types.includes(woSelectedType);
  });

  // === WORK ORDER STAGE APPROVAL HANDLERS ===
  const handleWoStageApprove = async (woId, stageId, action, extra = {}) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${woId}/stages/${stageId}/approve`, {
        action, ...extra
      });
      toast.success(`Stage ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      fetchWorkOrders();
    } catch (e) { toast.error(e.response?.data?.detail || `Failed to ${action}`); }
  };

  const handleWoStageRequestPayment = async (woId, stageId) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${woId}/stages/${stageId}/request-payment`, {
        notes: 'Payment requested'
      });
      toast.success('Payment requested successfully');
      fetchWorkOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to request payment'); }
  };

  // Planning submits a Labour Advance request → routes to PM → GM → Accountant
  const submitLabourAdvanceRequest = async () => {
    const { stage, workOrder, amount, date, reason } = labourAdvanceDialog;
    if (!amount || Number(amount) <= 0) { toast.error('Amount must be > 0'); return; }
    if (!(reason || '').trim()) { toast.error('Reason is required'); return; }
    setLabourAdvanceSaving(true);
    try {
      await axios.post(`${API}/labour-advance-requests`, {
        project_id: projectId,
        work_order_id: workOrder.work_order_id,
        stage_id: stage.stage_id,
        stage_name: stage.name,
        contractor_id: workOrder.contractor_id || null,
        contractor_name: workOrder.contractor_name || '',
        amount: Number(amount),
        request_date: date || new Date().toISOString().split('T')[0],
        reason: reason.trim(),
      });
      toast.success('Advance request submitted — awaiting PM approval');
      setLabourAdvanceDialog({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit advance request');
    } finally {
      setLabourAdvanceSaving(false);
    }
  };

  const handleOpenStage = async (woId, stageId) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/work-orders/${woId}/stages/${stageId}/open`);
      toast.success('Stage opened for Site Engineer');
      fetchWorkOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to open stage'); }
  };

  const getStageStatusConfig = (status, isOpen) => {
    if (status === 'pending' && isOpen) {
      return { label: 'Open', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    }
    const map = {
      pending: { label: 'Locked', className: 'bg-gray-100 text-gray-700 border-gray-300' },
      requested: { label: 'Payment Requested', className: 'bg-amber-100 text-amber-800 border-amber-300' },
      pm_approved: { label: 'PM Approved', className: 'bg-blue-100 text-blue-800 border-blue-300' },
      planning_approved: { label: 'Planning Approved', className: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
      approved: { label: 'Paid', className: 'bg-green-100 text-green-800 border-green-300' },
      rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-300' },
    };
    return map[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  };

  const canApproveStage = (stage) => {
    if (!user) return false;
    const role = user.role;
    const status = stage.status;
    if (role === 'super_admin') return ['requested', 'pm_approved', 'planning_approved'].includes(status);
    if (role === 'project_manager' && status === 'requested') return true;
    if (role === 'planning' && status === 'pm_approved') return true;
    if (role === 'accountant' && status === 'planning_approved') return true;
    return false;
  };

  // === FREEZE & REASSIGN HANDLERS ===
  const startFreeze = async (woId) => {
    setFreezeWoId(woId);
    setFreezeOtp('');
    setFreezeOtpVerified(false);
    setFreezeStep('otp');
    setFreezeOtpSending(true);
    try {
      // Also load contractors for the reassign step (merged: legacy + new)
      const [typesRes, contMerged] = await Promise.all([
        axios.get(`${API}/contractor-types`),
        fetchAllContractors(),
      ]);
      setContractorTypes(typesRes.data || []);
      setAllContractors(contMerged);
      // Send OTP
      const res = await axios.post(`${API}/projects/${projectId}/work-orders/${woId}/freeze/send-otp`);
      toast.success(res.data.message || 'OTP sent to your email');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to send OTP'); setFreezeStep(null); }
    finally { setFreezeOtpSending(false); }
  };

  const verifyFreezeOtp = async () => {
    if (!freezeOtp || freezeOtp.length !== 6) { toast.error('Enter 6-digit OTP'); return; }
    try {
      await axios.post(`${API}/projects/${projectId}/work-orders/${freezeWoId}/freeze/verify-otp`, { otp: freezeOtp });
      setFreezeOtpVerified(true);
      toast.success('OTP verified');
      // Pre-fill reassign form with balance stages
      const wo = workOrders.find(w => w.work_order_id === freezeWoId);
      if (wo) {
        const balanceStages = (wo.stages || []).filter(s => s.status !== 'approved');
        setFreezeForm({
          new_contractor_id: '',
          scope_items: (wo.scope_items || []).map(s => ({ name: s.name, unit: s.unit, quantity: s.quantity, unit_rate: s.unit_rate })),
          stages: balanceStages.map(s => ({ name: s.name, type: s.type, value: s.value })),
          additional_work: (wo.additional_work || []).map(a => ({ description: a.description, unit: a.unit, quantity: a.quantity, unit_rate: a.unit_rate })),
          notes: '',
        });
        setFreezeNewType('');
      }
      setFreezeStep('reassign');
    } catch (e) { toast.error(e.response?.data?.detail || 'Invalid OTP'); }
  };

  const submitFreezeReassign = async () => {
    if (!freezeForm.new_contractor_id) { toast.error('Select a new contractor'); return; }
    if (freezeForm.stages.length === 0) { toast.error('At least one stage is required'); return; }
    try {
      const res = await axios.post(`${API}/projects/${projectId}/work-orders/${freezeWoId}/freeze/reassign`, {
        otp: freezeOtp,
        new_contractor_id: freezeForm.new_contractor_id,
        scope_items: freezeForm.scope_items,
        stages: freezeForm.stages,
        additional_work: freezeForm.additional_work,
        notes: freezeForm.notes,
      });
      toast.success(`Work order frozen & reassigned to ${res.data.new_contractor}`);
      setFreezeStep(null);
      setFreezeWoId(null);
      setWoViewId(null);
      fetchWorkOrders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to reassign'); }
  };

  const filteredFreezeContractors = allContractors.filter(c => c.is_active !== false && (!freezeNewType || c.contractor_type === freezeNewType));



  const addProjectMaterial = () => {
    setProjectMaterials(prev => {
      const updated = [...prev, { name: '', brand: '' }];
      return updated;
    });
  };

  const removeProjectMaterial = (idx) => {
    setProjectMaterials(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      saveProjectMaterials(updated);
      return updated;
    });
  };



  const startHeaderEdit = () => {
    if (!projectData?.project) return;
    const p = projectData.project;
    setHeaderForm({ name: p.name || '', client_name: p.client_name || '', client_phone: p.client_phone || '', client_email: p.client_email || '', location: p.location || '', package_id: p.package_id || '' });
    fetchPackages();
    setHeaderEditing(true);
  };

  const saveHeaderEdit = async () => {
    setHeaderSaving(true);
    try {
      const payload = {};
      const p = projectData.project;
      if (headerForm.name !== (p.name || '')) payload.name = headerForm.name;
      if (headerForm.client_name !== (p.client_name || '')) payload.client_name = headerForm.client_name;
      if (headerForm.client_phone !== (p.client_phone || '')) payload.client_phone = headerForm.client_phone;
      if (headerForm.client_email !== (p.client_email || '')) payload.client_email = headerForm.client_email;
      if (headerForm.location !== (p.location || '')) payload.location = headerForm.location;
      if (headerForm.package_id !== (p.package_id || '')) payload.package_id = headerForm.package_id || '';
      if (Object.keys(payload).length === 0) { setHeaderEditing(false); setHeaderSaving(false); return; }
      await axios.patch(`${API}/projects/${projectId}`, payload);
      // Optimistic update
      setProjectData(prev => ({ ...prev, project: { ...prev.project, ...payload, package_id: headerForm.package_id || null } }));
      toast.success('Project details updated');
      setHeaderEditing(false);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to update'); }
    setHeaderSaving(false);
  };


  const fetchMaterialsData = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/materials-summary`);
      setMaterialsData(res.data || { summary: {}, materials: [] });
    } catch { /* No materials data */ }
  };

  const fetchVendorData = async () => {
    try {
      const [aRes, vRes, cRes, poRes] = await Promise.all([
        axios.get(`${API}/projects/${projectId}/vendor-assignments`),
        axios.get(`${API}/vendor-master`),
        axios.get(`${API}/vendor-categories`),
        axios.get(`${API}/purchase-orders?project_id=${projectId}`)
      ]);
      setVendorAssignments(aRes.data || []);
      setAllVendors(vRes.data || []);
      setVendorCategories(cRes.data || []);
      setPurchaseOrders(poRes.data || []);
    } catch { /* ignore */ }
  };

  const handleAssignVendor = async () => {
    if (!assignForm.category || !assignForm.vendor_id) return toast.error('Select category and vendor');
    try {
      await axios.post(`${API}/projects/${projectId}/vendor-assignments`, assignForm);
      toast.success('Vendor assigned');
      setAssignVendorDialog(false);
      setAssignForm({ category: '', vendor_id: '', brand: '' });
      fetchVendorData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRemoveAssignment = async (category) => {
    if (!window.confirm('Remove this vendor assignment?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/vendor-assignments/${encodeURIComponent(category)}`);
      toast.success('Removed');
      fetchVendorData();
    } catch { toast.error('Failed to remove'); }
  };

  const fetchWorkOrderData = async () => {
    try {
      const [woRes, contMerged, attRes, invRes, dashRes] = await Promise.all([
        axios.get(`${API}/projects/${projectId}/work-orders`),
        fetchAllContractors(),
        axios.get(`${API}/labour-attendance?project_id=${projectId}`),
        axios.get(`${API}/material-inventory?project_id=${projectId}`),
        axios.get(`${API}/material-inventory/dashboard?project_id=${projectId}`).catch(() => null)
      ]);
      setWorkOrders(woRes.data || []);
      setAllContractors(contMerged);
      setLabourAttendance(attRes.data || []);
      setMaterialInventory(invRes.data || []);
      setInvDashboard(dashRes?.data || null);
    } catch { /* ignore */ }
  };

  const handleCreateWO = async () => {
    if (!woForm.contractor_id || !woForm.total_amount) return toast.error('Select contractor and amount');
    const contractor = allContractors.find(c => c.contractor_id === woForm.contractor_id);
    try {
      await axios.post(`${API}/labour-work-orders`, {
        project_id: projectId,
        project_name: project?.name || '',
        contractor_id: woForm.contractor_id,
        contractor_name: contractor?.name || '',
        contractor_type: contractor?.contractor_type || '',
        description: woForm.description,
        total_amount: woForm.total_amount,
        payment_stages: woForm.payment_stages
      });
      toast.success('Work order created! Site Engineer can now log attendance.');
      setShowWOForm(false);
      setWoForm({ contractor_id: '', description: '', total_amount: 0, payment_stages: [{ stage_name: 'Stage 1', amount: 0, percentage: 0 }] });
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleRequestStagePayment = async (woId, stageId, amount) => {
    try {
      await axios.patch(`${API}/labour-work-orders/${woId}/stages/${stageId}/request-payment`, { requested_amount: amount });
      toast.success('Payment requested! Goes to Planning for review.');
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleSubmitAttendance = async () => {
    if (!attForm.contractor_id) return toast.error('Select contractor');
    const contractor = allContractors.find(c => c.contractor_id === attForm.contractor_id);
    try {
      await axios.post(`${API}/labour-attendance`, {
        project_id: projectId,
        contractor_id: attForm.contractor_id,
        contractor_name: contractor?.name || '',
        work_order_id: attForm.work_order_id,
        stage_id: attForm.stage_id,
        date: attForm.date,
        entries: attForm.entries
      });
      toast.success('Attendance saved for the day.');
      setShowAttendanceForm(false);
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const handleSubmitInventory = async () => {
    if (!invForm.material_name) return toast.error('Select material');
    try {
      await axios.post(`${API}/material-inventory`, {
        project_id: projectId,
        ...invForm
      });
      toast.success('Inventory entry saved.');
      setShowInventoryForm(false);
      fetchWorkOrderData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const fetchLaboursData = async () => {
    try {
      const res = await axios.get(`${API}/projects/${projectId}/labours-summary`);
      setLaboursData(res.data || { summary: {}, labours: [] });
    } catch { /* No labours data */ }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed');
    }
  };

  // Format currency for PDF
  // Generate PDF handler using shared utility
  const handleGenerateREPDF = async () => {
    if (!reProject) {
      toast.error('No Rough Estimate available');
      return;
    }
    try {
      await generateREPDF(reProject);
      toast.success('Rough Estimate PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleConvertToScope = async () => {
    const scopeItems = reProject?.rough_scope_items || reProject?.scope_items || [];
    if (!scopeItems.length) {
      toast.error('No scope items in the Rough Estimate to convert');
      setActiveTab('scope');
      return;
    }
    
    // Check if already converted (scope items from RE already exist)
    const existingFromRE = (projectData?.scope_items || []).filter(
      s => s.remarks && s.remarks.includes('From RE:')
    );
    if (existingFromRE.length > 0) {
      toast.error('Scope items already converted from Rough Estimate');
      setActiveTab('scope');
      return;
    }
    
    try {
      const items = scopeItems.map(item => ({
        item_name: item.name || item.item_name,
        quantity: parseFloat(item.quantity) || 1,
        unit: item.unit || 'Nos',
        unit_rate: parseFloat(item.rate || item.unit_rate) || 0,
        remarks: `From RE: ${reProject.project_name || ''}`
      }));
      
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items
      });
      
      toast.success(`Converted ${items.length} RE items to project scope`);
      await fetchData(false);
      setActiveTab('scope');
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to convert to scope');
    }
  };

  const handleConvertToPaymentSchedule = async () => {
    const stages = reProject?.payment_schedule || [];
    if (!stages.length) {
      toast.error('No payment stages in the Rough Estimate to convert');
      return;
    }
    // Check if any project payment_stage already references this RE
    const alreadyConverted = (projectData?.payment_stages || []).some(
      s => s.notes && String(s.notes).includes('From RE:')
    );
    if (alreadyConverted) {
      toast.error('Payment schedule already converted from Rough Estimate');
      setActiveTab('payments');
      return;
    }
    try {
      const items = stages.map(s => ({
        stage_name: s.stage_name,
        percentage: parseFloat(s.percentage) || 0,
        amount: parseFloat(s.amount) || 0,
        due_date: s.due_date || null,
        notes: `From RE: ${reProject.project_name || ''}`,
      }));
      await axios.post(`${API}/payment-stages/bulk`, {
        project_id: projectId,
        items,
      });
      toast.success(`Converted ${items.length} RE stages to project payment schedule`);
      await fetchData(false);
      setActiveTab('payments');
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to convert payment schedule');
    }
  };

  // ==================== BULK ADD HANDLERS ====================
  const handleBulkAddScope = async () => {
    const validItems = bulkScopeRows.filter(r => r.item_name && r.unit_rate);
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    try {
      await axios.post(`${API}/scope-items/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          item_name: r.item_name,
          quantity: parseFloat(r.quantity) || 1,
          unit: r.unit || 'Nos',
          unit_rate: parseFloat(r.unit_rate) || 0,
          remarks: r.remarks || null
        }))
      });
      toast.success(`Added ${validItems.length} scope items`);
      setBulkScopeDialog(false);
      setBulkScopeRows(createEmptyRows('scope'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add scope items');
    }
  };

  const handleBulkAddPayment = async () => {
    const validItems = bulkPaymentRows.filter(r => r.stage_name && (r.percentage || r.amount));
    if (validItems.length === 0) {
      toast.error('Please fill at least one complete row');
      return;
    }
    
    // Validate: existing % + already-collected advance % + new % cannot exceed 100%
    const existingPct = payment_stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
    const newPct = validItems.reduce((sum, r) => sum + (parseFloat(r.percentage) || 0), 0);
    const totalVal = projectData?.summary?.scope_total || projectData?.project?.total_value || 0;
    // Only treat as "explicit advance" if the stage carries an explicit is_advance / linked_income_id
    // flag — name-based matching ("Advance payment for...") is too aggressive and would hide the
    // virtual sales-advance row whenever a regular schedule stage happens to start with "Advance".
    const hasExplicitAdvance = (payment_stages || []).some(s => s.is_advance === true || s.linked_income_id);
    const earliestIncome = (projectIncomeEntries || []).slice().sort((a, b) => {
      const da = new Date(a.received_date || a.created_at || 0).getTime();
      const db = new Date(b.received_date || b.created_at || 0).getTime();
      return da - db;
    })[0];
    const virtualAdvancePct = (!hasExplicitAdvance && earliestIncome && totalVal > 0)
      ? ((earliestIncome.amount || 0) / totalVal) * 100
      : 0;
    
    const totalPct = existingPct + virtualAdvancePct + newPct;
    if (totalPct > 100.01) {
      const remaining = Math.max(0, Math.round((100 - existingPct - virtualAdvancePct) * 100) / 100);
      toast.error(`Total would be ${totalPct.toFixed(2)}% (incl. ${virtualAdvancePct.toFixed(2)}% already collected). Only ${remaining}% remaining.`);
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/bulk`, {
        project_id: projectId,
        items: validItems.map(r => ({
          stage_name: r.stage_name,
          percentage: parseFloat(r.percentage) || 0,
          amount: parseFloat(r.amount) || 0,
          due_date: r.due_date || null
        }))
      });
      toast.success(`Added ${validItems.length} payment stages`);
      setBulkPaymentDialog(false);
      setBulkPaymentRows(createEmptyRows('payment'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add payment stages');
    }
  };

  const handleBulkAddAddition = async () => {
    const validItems = bulkAdditionRows.filter(r => r.item_name && parseFloat(r.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Please fill at least one row (Name + Amount)');
      return;
    }
    
    try {
      await axios.post(`${API}/additional-costs/bulk`, {
        project_id: projectId,
        items: validItems.map(r => {
          const qty = parseFloat(r.quantity) || 1;
          const total = parseFloat(r.amount) || 0;
          const rate = qty > 0 ? total / qty : total;
          const desc = qty > 1 ? `${r.item_name} (${qty} × ₹${rate.toFixed(2)})` : r.item_name;
          return {
            description: desc,
            estimated_amount: total,
            name: r.item_name,
            qty: qty,
            price: rate,
          };
        })
      });
      toast.success(`Added ${validItems.length} additions`);
      setBulkAdditionDialog(false);
      setBulkAdditionRows(createEmptyRows('addition'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add additions');
    }
  };

  const handleBulkAddDeduction = async () => {
    const validItems = bulkDeductionRows.filter(r => r.item_name && parseFloat(r.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Please fill at least one row (Name + Amount)');
      return;
    }
    
    try {
      await axios.post(`${API}/deductions/bulk`, {
        project_id: projectId,
        items: validItems.map(r => {
          const qty = parseFloat(r.quantity) || 1;
          const total = parseFloat(r.amount) || 0;
          const rate = qty > 0 ? total / qty : total;
          const desc = qty > 1 ? `${r.item_name} (${qty} × ₹${rate.toFixed(2)})` : r.item_name;
          return {
            description: desc,
            amount: total,
            remarks: null,
            name: r.item_name,
            qty: qty,
            price: rate,
          };
        })
      });
      toast.success(`Added ${validItems.length} deductions`);
      setBulkDeductionDialog(false);
      setBulkDeductionRows(createEmptyRows('deduction'));
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add deductions');
    }
  };

  // ==================== VERIFICATION HANDLER ====================
  const openVerifyDialog = (type, ids) => {
    setVerifyDialog({ open: true, type, ids });
    setVerifyCode('');
  };

  const handleVerify = async () => {
    if (verifyCode !== 'VERIFY') {
      toast.error("Please type 'VERIFY' exactly in capital letters");
      return;
    }
    
    try {
      const endpoint = {
        scope: '/scope-items/verify',
        payment: '/payment-stages/verify',
        addition: '/additional-costs/verify',
        deduction: '/deductions/verify'
      }[verifyDialog.type];
      
      await axios.post(`${API}${endpoint}`, {
        item_ids: verifyDialog.ids,
        verification_code: verifyCode
      });
      
      toast.success('Items verified! Goes to Accountant for payment approval.');
      setVerifyDialog({ open: false, type: '', ids: [] });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Verification failed');
    }
  };

  // ==================== APPROVAL HANDLER (Super Admin) ====================
  const handleApprove = async (type, ids, action) => {
    try {
      const endpoint = {
        scope: '/scope-items/approve',
        payment: '/payment-stages/approve',
        addition: '/additional-costs/approve',
        deduction: '/deductions/approve'
      }[type];
      
      await axios.post(`${API}${endpoint}`, { item_ids: ids, action });
      toast.success(`Items ${action}d successfully`);
      fetchData(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || `${action} failed`);
    }
  };

  // ==================== DELETE HANDLERS ====================
  const handleDeleteScope = async (scopeId) => {
    if (!confirm('Delete this scope item?')) return;
    try {
      await axios.delete(`${API}/scope-items/${scopeId}`);
      toast.success('Scope item deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete scope item');
    }
  };

  const handleScopeReorder = async (newIds) => {
    // Optimistic local reorder
    const newItems = newIds.map(id => (scope_items || []).find(s => s.scope_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      scope_items: newItems
    }));
    try {
      await axios.post(`${API}/scope-items/reorder`, { scope_ids: newIds });
    } catch { toast.error('Failed to save order'); }
  };

  const handleAdditionalCostReorder = async (newIds) => {
    const newItems = newIds.map(id => (additional_costs || []).find(c => c.cost_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      additional_costs: newItems
    }));
    try {
      await axios.post(`${API}/additional-costs/reorder`, { cost_ids: newIds });
    } catch { toast.error('Failed to save order'); }
  };

  const handleDeductionReorder = async (newIds) => {
    const newItems = newIds.map(id => (deductions || []).find(d => d.deduction_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      deductions: newItems
    }));
    try {
      await axios.post(`${API}/deductions/reorder`, { deduction_ids: newIds });
    } catch { toast.error('Failed to save order'); }
  };

  const handleStageReorder = async (newIds) => {
    const newStages = newIds.map(id => projectStages.find(s => s.stage_id === id)).filter(Boolean);
    setProjectStages(newStages);
    try {
      await axios.post(`${API}/projects/${projectId}/project-stages/reorder`, { stage_ids: newIds });
    } catch { toast.error('Failed to save stage order'); }
  };

  // Reorder Payment Schedule rows (Payment Stages tab) — drag-to-reorder, persists server-side.
  // Excludes virtual rows (e.g., "__virtual_advance__") which are auto-injected client-side.
  const handlePaymentScheduleReorder = async (newIds) => {
    const realIds = newIds.filter(id => id && !id.startsWith('__virtual_'));
    const newStages = realIds.map(id => (payment_stages || []).find(s => s.stage_id === id)).filter(Boolean);
    setProjectData(prev => ({
      ...prev,
      payment_stages: newStages,
    }));
    try {
      await axios.post(`${API}/payment-stages/reorder`, { stage_ids: realIds });
    } catch { toast.error('Failed to save payment order'); }
  };

  const handleDeletePayment = async (stageId) => {
    if (!confirm('Delete this payment stage?')) return;
    try {
      await axios.delete(`${API}/payment-stages/${stageId}`);
      toast.success('Payment stage deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete payment stage');
    }
  };

  const handleBulkDeleteScope = async () => {
    if (!selectedScopeIds.length) return;
    if (!confirm(`Delete ${selectedScopeIds.length} selected scope item(s)?`)) return;
    try {
      await Promise.all(selectedScopeIds.map(id => axios.delete(`${API}/scope-items/${id}`)));
      toast.success(`Deleted ${selectedScopeIds.length} scope item(s)`);
      setSelectedScopeIds([]);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete some items');
    }
  };

  const handleBulkDeletePayment = async () => {
    if (!selectedPaymentIds.length) return;
    if (!confirm(`Delete ${selectedPaymentIds.length} selected payment stage(s)?`)) return;
    try {
      await Promise.all(selectedPaymentIds.map(id => axios.delete(`${API}/payment-stages/${id}`)));
      toast.success(`Deleted ${selectedPaymentIds.length} payment stage(s)`);
      setSelectedPaymentIds([]);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete some stages');
    }
  };

  const toggleScopeSelect = (id) => {
    setSelectedScopeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllScope = () => {
    setSelectedScopeIds(prev => prev.length === (scope_items || []).length ? [] : (scope_items || []).map(s => s.scope_id));
  };
  const togglePaymentSelect = (id) => {
    setSelectedPaymentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllPayment = () => {
    setSelectedPaymentIds(prev => prev.length === (payment_stages || []).length ? [] : (payment_stages || []).map(p => p.stage_id));
  };

  // ---- Project Stages Handlers ----
  const handleLoadTemplate = async (name) => {
    setSelectedTemplate(name);
    if (!name) return;
    try {
      const res = await axios.get(`${API}/stage-templates/${encodeURIComponent(name)}`);
      const tmplStages = (res.data.stages || []).map(s => ({
        stage_name: s.stage_name || '',
        start_date: s.start_date || '',
        target_date: s.target_date || '',
        status: s.status || 'yet_to_start',
        remarks: s.remarks || '',
        sl_no: s.sl_no || '',
        section_title: s.section_title || '',
        is_section_header: !!s.is_section_header,
      }));
      if (tmplStages.length > 0) {
        setNewStages(tmplStages);
        setShowAddStages(true);
        toast.success(`Loaded "${name}" template with ${tmplStages.length} rows`);
      }
    } catch { toast.error('Failed to load template'); }
  };

  const addNewStageRow = () => {
    setNewStages(prev => [...prev, {
      stage_name: '',
      start_date: '',
      target_date: '',
      status: 'yet_to_start',
      remarks: '',
      hindrances: '',
      sl_no: '',
      section_title: '',
      is_section_header: false,
      actual_start_date: '',
      actual_finish_date: '',
      duration_days: '',
      progress: 0,
      depends_on: '',
      hindrance_type: '',
      hindrance_reason: '',
    }]);
  };
  const addNewTitleRow = () => {
    setNewStages(prev => [...prev, {
      stage_name: '',
      section_title: '',
      is_section_header: true,
      status: 'yet_to_start',
      sl_no: '',
      start_date: '',
      target_date: '',
      actual_start_date: '',
      actual_finish_date: '',
      duration_days: '',
      progress: 0,
      remarks: '',
      hindrances: '',
      depends_on: '',
      hindrance_type: '',
      hindrance_reason: '',
    }]);
  };
  const removeNewStageRow = (idx) => {
    setNewStages(prev => prev.filter((_, i) => i !== idx));
  };
  const updateNewStage = (idx, field, value) => {
    setNewStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSaveStages = async () => {
    const valid = newStages.filter(s => s.stage_name.trim());
    if (!valid.length) { toast.error('Add at least one stage'); return; }
    try {
      await axios.post(`${API}/projects/${projectId}/project-stages/bulk`, valid);
      toast.success(`Added ${valid.length} stages`);
      setShowAddStages(false);
      setNewStages([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '', hindrances: '', sl_no: '', section_title: '', is_section_header: false, actual_start_date: '', actual_finish_date: '', duration_days: '', progress: 0 }]);
      fetchData(false);
    } catch (error) { toast.error('Failed to add stages'); }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) { toast.error('Enter template name'); return; }
    const valid = newStages.filter(s => s.stage_name.trim());
    if (!valid.length) { toast.error('Add at least one stage'); return; }
    try {
      await axios.post(`${API}/stage-templates`, { template_name: templateName, stages: valid });
      toast.success(`Template "${templateName}" saved`);
      setSaveTemplateDialog(false);
      setTemplateName('');
      const res = await axios.get(`${API}/stage-templates`);
      setStageTemplates(res.data);
    } catch (error) { toast.error('Failed to save template'); }
  };

  const handleUpdateStage = async (stageId) => {
    try {
      // Sanitize the payload — Pydantic's Optional[int]/Optional[bool] reject
      // empty strings, so coerce them to null. Pydantic skips null fields
      // via the existing `if v is not None` filter on the backend.
      const NUMERIC_FIELDS = ['duration_days', 'progress'];
      const cleaned = {};
      for (const [k, v] of Object.entries(editStageData)) {
        if (NUMERIC_FIELDS.includes(k)) {
          cleaned[k] = (v === '' || v === null || v === undefined) ? null : Number(v);
        } else {
          cleaned[k] = (v === '' || v === undefined) ? null : v;
        }
      }
      await axios.patch(`${API}/projects/${projectId}/project-stages/${stageId}`, cleaned);
      toast.success('Stage updated');
      setEditingStageId(null);
      fetchData(false);
    } catch (e) {
      // Surface the actual backend error so the user sees WHY the save failed
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(d => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join(' · ')
        : (typeof detail === 'string' ? detail : 'Failed to update');
      toast.error(msg);
    }
  };

  // Auto-save a single stage field (used by date pickers + Depends On while editing)
  // — keeps the user in edit mode, silently PATCHes and refreshes the stage list.
  const autoSaveStageField = async (stageId, patch) => {
    try {
      await axios.patch(`${API}/projects/${projectId}/project-stages/${stageId}`, patch);
      fetchData(false);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map(d => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join(' · ')
        : (typeof detail === 'string' ? detail : 'Auto-save failed');
      toast.error(msg);
    }
  };

  // === Payment Schedule Templates ===
  useEffect(() => {
    if (!chooseTemplateDialog && !advanceDialog.open) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/payment-schedule-templates`);
        setPsTemplates(Array.isArray(res.data) ? res.data : []);
      } catch { setPsTemplates([]); }
    })();
  }, [chooseTemplateDialog, advanceDialog.open]);

  const applyPaymentTemplate = async () => {
    if (!selectedTemplateId) { toast.error('Pick a template first'); return; }
    setApplyingTemplate(true);
    try {
      const res = await axios.post(`${API}/projects/${projectId}/apply-payment-template`, {
        template_id: selectedTemplateId,
        mode: templateApplyMode,
      });
      toast.success(`${res.data?.message || 'Template applied'} (${res.data?.created || 0} rows added)`);
      setChooseTemplateDialog(false);
      setSelectedTemplateId('');
      fetchData(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to apply template');
    }
    setApplyingTemplate(false);
  };

  const handleDeleteStage = async (stageId) => {
    if (!confirm('Delete this stage?')) return;
    try {
      await axios.delete(`${API}/projects/${projectId}/project-stages/${stageId}`);
      toast.success('Stage deleted');
      fetchData(false);
    } catch { toast.error('Failed to delete'); }
  };

  const stageStatusConfig = {
    yet_to_start: { label: 'Yet to Start', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    started: { label: 'Started', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    finished: { label: 'Finished', color: 'bg-green-100 text-green-700 border-green-300' }
  };


  const handleRequestPayment = async (stageId, expectedDate = null) => {
    try {
      const payload = expectedDate ? { expected_payment_date: expectedDate } : {};
      await axios.patch(`${API}/payment-stages/${stageId}/request`, payload);
      toast.success('Payment requested! Goes to CRE for processing.');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request payment');
    }
  };

  const handleDeleteAddition = async (costId) => {
    if (!confirm('Delete this addition?')) return;
    try {
      await axios.delete(`${API}/additional-costs/${costId}`);
      toast.success('Addition deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete addition');
    }
  };

  const handleRequestAdditionPayment = async (costId, expectedDate) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}/request-payment`, {
        expected_payment_date: expectedDate || null,
      });
      toast.success('Additional payment requested! Goes to the Client for approval next.');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to request payment');
      throw error;
    }
  };

  const handleCREApproveAddition = async (costId) => {
    if (!window.confirm('Approve this Additional Work for collection? The Accountant will be notified once you confirm.')) return;
    try {
      const res = await axios.post(`${API}/additional-costs/${costId}/cre-approve`);
      toast.success(res.data?.message || 'CRE approved');
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to approve');
    }
  };

  const handleDeleteDeduction = async (deductionId) => {
    if (!confirm('Delete this deduction?')) return;
    try {
      await axios.delete(`${API}/deductions/${deductionId}`);
      toast.success('Deduction deleted');
      fetchData(false);
    } catch (error) {
      toast.error('Failed to delete deduction');
    }
  };

  // ==================== UPDATE HANDLERS ====================
  const handleUpdatePayment = async (stageId, updates) => {
    try {
      await axios.patch(`${API}/payment-stages/${stageId}`, updates);
      toast.success('Payment updated');
      setEditingPayment(null);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to update payment');
    }
  };

  // Open edit dialog for payment stage
  const openEditPaymentDialog = (stage) => {
    setEditPaymentStage(stage);
    setEditPaymentForm({
      stage_name: stage.stage_name || '',
      percentage: stage.percentage?.toString() || '',
      amount: stage.amount?.toString() || '',
      due_date: stage.due_date ? new Date(stage.due_date).toISOString().split('T')[0] : ''
    });
    setEditPaymentDialog(true);
  };

  // Handle save from edit payment dialog
  const handleSavePaymentEdit = async () => {
    if (!editPaymentStage) return;
    
    try {
      await axios.patch(`${API}/payment-stages/${editPaymentStage.stage_id}`, {
        stage_name: editPaymentForm.stage_name,
        percentage: parseFloat(editPaymentForm.percentage) || 0,
        amount: parseFloat(editPaymentForm.amount) || 0,
        due_date: editPaymentForm.due_date || null
      });
      toast.success('Payment stage updated');
      setEditPaymentDialog(false);
      setEditPaymentStage(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update payment stage');
    }
  };

  // Submit/finalize draft payment schedule
  const handleSubmitPaymentSchedule = async () => {
    try {
      await axios.post(`${API}/projects/${projectId}/payment-schedule/submit`);
      toast.success('Payment schedule submitted! Goes to CRE for collection.');
      setSubmitScheduleDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to submit payment schedule');
    }
  };

  const handleUpdateAddition = async (costId, updates) => {
    try {
      await axios.patch(`${API}/additional-costs/${costId}`, updates);
      toast.success('Addition updated');
      setEditingAddition(null);
      fetchData(false);
    } catch (error) {
      toast.error('Failed to update addition');
    }
  };

  // Open Name/Qty/Amount edit dialog for an Addition or Deduction row
  const openEditItemDialog = (type, item) => {
    const itemId = type === 'addition' ? item.cost_id : item.deduction_id;
    const currentAmount = type === 'addition' ? (item.estimated_amount || 0) : (item.amount || 0);
    setEditItemForm({
      name: item.name || item.description || '',
      qty: item.qty != null ? String(item.qty) : '1',
      amount: String(currentAmount),
    });
    setEditItemDialog({ open: true, type, id: itemId });
  };

  const handleSaveEditItem = async () => {
    const { type, id } = editItemDialog;
    if (!type || !id) return;
    const name = (editItemForm.name || '').trim();
    const qty = parseFloat(editItemForm.qty) || 1;
    const amount = parseFloat(editItemForm.amount) || 0;
    if (!name || amount <= 0) {
      toast.error('Name and Amount are required');
      return;
    }
    const rate = qty > 0 ? amount / qty : amount;
    const description = qty > 1 ? `${name} (${qty} × ₹${rate.toFixed(2)})` : name;
    try {
      if (type === 'addition') {
        await axios.patch(`${API}/additional-costs/${id}`, {
          description, name, qty, price: rate, estimated_amount: amount,
        });
      } else {
        await axios.patch(`${API}/deductions/${id}`, {
          description, name, qty, price: rate, amount,
        });
      }
      toast.success(`${type === 'addition' ? 'Addition' : 'Deduction'} updated`);
      setEditItemDialog({ open: false, type: null, id: null });
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update');
    }
  };

  // ==================== SCOPE ITEM EDIT HANDLERS ====================
  const openScopeEdit = (item) => {
    setEditingScopeItem(item.scope_id);
    setEditScopeForm({
      item_name: item.item_name || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'Nos',
      unit_rate: item.unit_rate || 0,
      remarks: item.remarks || ''
    });
  };

  const handleUpdateScope = async () => {
    if (!editingScopeItem) return;
    
    try {
      await axios.patch(`${API}/scope-items/${editingScopeItem}`, {
        item_name: editScopeForm.item_name,
        quantity: parseFloat(editScopeForm.quantity) || 1,
        unit: editScopeForm.unit,
        unit_rate: parseFloat(editScopeForm.unit_rate) || 0,
        remarks: editScopeForm.remarks || null
      });
      toast.success('Scope item updated');
      setEditingScopeItem(null);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to update scope item');
    }
  };

  const cancelScopeEdit = () => {
    setEditingScopeItem(null);
    setEditScopeForm({ item_name: '', quantity: 1, unit: 'Nos', unit_rate: 0, remarks: '' });
  };

  // ==================== DELETE PROJECT HANDLER ====================
  const handleDeleteProject = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error("Please type 'DELETE' exactly in capital letters to confirm");
      return;
    }
    
    try {
      await axios.delete(`${API}/projects/${projectId}`);
      toast.success('Project deleted successfully');
      setDeleteProjectDialog(false);
      // Redirect to projects list
      window.location.href = '/projects';
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to delete project');
    }
  };

  // ==================== PAYMENT COLLECTION HANDLERS ====================
  const openCollectDialog = (stage) => {
    setSelectedStage(stage);
    setCollectForm({ 
      amount_received: stage.amount - (stage.amount_received || 0), 
      payment_mode: 'bank_transfer', 
      payment_reference: '', 
      remarks: '' 
    });
    setCollectPaymentDialog(true);
  };

  const handleCollectPayment = async () => {
    if (!selectedStage || !collectForm.amount_received) {
      toast.error('Please enter amount');
      return;
    }
    
    try {
      await axios.post(`${API}/payment-stages/${selectedStage.stage_id}/collect`, {
        amount_received: parseFloat(collectForm.amount_received),
        payment_mode: collectForm.payment_mode,
        payment_reference: collectForm.payment_reference || null,
        remarks: collectForm.remarks || null
      });
      toast.success('Payment collected successfully');
      setCollectPaymentDialog(false);
      fetchData(false);
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to collect payment');
    }
  };

  const getPaymentStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700' },
      partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-700' },
      paid: { label: 'Paid', color: 'bg-green-100 text-green-700' },
      collected: { label: 'Collected', color: 'bg-amber-50 text-amber-700' }
    };
    const c = config[status] || config.pending;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
  };

  const canDeleteProject = user?.role === 'super_admin' || 
    (user?.role === 'planning' && (
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.status?.toLowerCase()) ||
      ['in_planning', 'draft', 'pending', 'planning'].includes(projectData?.project?.project_stage?.toLowerCase())
    ));

  const formatCurrency = (amount) => {
    // Always show full INR value with comma grouping — no L/Cr abbreviations.
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  };

  const canManage = user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'accountant' || user?.role === 'planning' || user?.role === 'planning_person';
  const isSuperAdmin = user?.role === 'super_admin';
  const isPM = user?.role === 'project_manager';
  const canSeeFinancials = !isPM;

  if (loading && !projectData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-gray-600">Loading project...</div>
      </div>
    );
  }

  if (!projectData || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-lg font-semibold text-red-600">Failed to load project</div>
      </div>
    );
  }

  const { project, scope_items = [], payment_stages = [], additional_costs = [], deductions = [], summary, pre_construction = [] } = projectData || {};

  // Get draft items for verification
  const draftScopeItems = (scope_items || []).filter(s => s.workflow_status === 'draft');
  const draftPaymentItems = (payment_stages || []).filter(p => p.workflow_status === 'draft');
  const draftAdditions = (additional_costs || []).filter(a => a.workflow_status === 'draft');
  const draftDeductions = (deductions || []).filter(d => d.workflow_status === 'draft');
  
  // Get pending approval items
  const pendingApprovalScope = (scope_items || []).filter(s => s.workflow_status === 'pending_approval');
  const pendingApprovalPayment = (payment_stages || []).filter(p => p.workflow_status === 'pending_approval');
  const pendingApprovalAdditions = (additional_costs || []).filter(a => a.workflow_status === 'pending_approval');
  const pendingApprovalDeductions = (deductions || []).filter(d => d.workflow_status === 'pending_approval');

  // Planning-role users get the Planning module's tabbed header so navigation
  // is consistent across PlanningBoard and ProjectDetail. Other roles keep
  // the default AppHeader.
  const isPlanning = user?.role === 'planning';
  const planningNav = isPlanning ? [
    { label: 'Dashboard', value: 'dashboard', icon: 'Building2' },
    { label: 'Packages', value: 'packages', icon: 'Package' },
    { label: 'Material Vendors', value: 'material_vendors', icon: 'Truck' },
    { label: 'Labour Contractors', value: 'labour_contractors', icon: 'Users' },
    { label: 'RE Templates', value: 're_templates', icon: 'FileText' },
    { label: 'Live Map', value: 'live_map', icon: 'Radio' },
  ] : null;
  const handlePlanningNav = (tab) => {
    window.location.href = `/planning-board?tab=${tab}`;
  };

  // Shared top section for all 3 FE sub-tabs (Final Estimate / Additional / Deductions):
  //   1. Total card on top
  //   2. Sub-tab strip with FE Link icons docked to the right corner
  // Pass `current` to highlight which sub-tab is active.
  const renderFeTopSection = (current) => {
    const fe = project?.fe || {};
    const canSendToClient = (user?.role === 'cre' || user?.role === 'super_admin');
    const publicUrl = fe.public_token ? `${window.location.origin}/fe/${fe.public_token}` : '';
    const showLinkCorner = !!fe.public_token || canSendToClient;

    const feTotal = summary?.scope_total || 0;
    const addTotal = (additional_costs || []).reduce((s, a) => s + (a.estimated_amount || 0), 0);
    const dedTotal = (deductions || []).reduce((s, d) => s + (d.amount || 0), 0);
    const grand = feTotal + addTotal - dedTotal;
    const showTotal = scope_items.length > 0 || addTotal > 0 || dedTotal > 0;

    const tabBtn = (key, label) => (
      <button
        onClick={() => setActiveTab(key)}
        className={`px-3 py-2 text-sm font-medium border-b-2 ${
          current === key ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
        data-testid={`fe-subnav-${key}`}
      >
        {label}
      </button>
    );

    return (
      <>
        {showTotal && (
          <div className="mb-3 rounded-lg border-2 border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-3 sm:p-4" data-testid="fe-grand-total-card">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-2">Total Final Estimate Cost</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs mb-2">
              <div>
                <div className="text-gray-500">Final Estimate</div>
                <div className="font-semibold text-gray-900">₹{feTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-emerald-600">+ Additional</div>
                <div className="font-semibold text-emerald-700">₹{addTotal.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-red-600">− Deductions</div>
                <div className="font-semibold text-red-700">₹{dedTotal.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-end justify-between border-t border-amber-200 pt-2">
              <span className="text-xs text-gray-500">(FE + Additional) − Deductions</span>
              <span className="text-lg sm:text-2xl font-bold text-amber-800" data-testid="fe-grand-total-value">₹{grand.toLocaleString()}</span>
            </div>
          </div>
        )}
        {canSeeFinancials && (
          <div className="mb-4 flex items-center gap-1 border-b" data-testid={`fe-subnav-${current}-strip`}>
            {tabBtn('scope', 'Final Estimate')}
            {tabBtn('additions', 'Additional')}
            {tabBtn('deductions', 'Deductions')}
            {showLinkCorner && (
              <div className="ml-auto flex items-center gap-1 pb-1" data-testid="fe-link-corner">
                {fe.public_token && (
                  <>
                    <Badge className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0 h-5">FE Link</Badge>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                      title={`Copy: ${publicUrl}`}
                      onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('FE link copied'); }}
                      data-testid="fe-public-url-copy">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                      title={`Open: ${publicUrl}`}
                      onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                      data-testid="fe-public-url-open">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {canSendToClient && (
                  <Button type="button" size="sm" className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700"
                    onClick={async () => {
                      const isFirst = !fe.public_token;
                      const msg = isFirst
                        ? 'Generate a permanent client-facing link for this Final Estimate?'
                        : 'Re-send the existing client link? (Token stays the same; only the timestamp updates.)';
                      if (!window.confirm(msg)) return;
                      try {
                        await axios.post(`${API}/cre/final-estimates/${projectId}/send-to-client`);
                        toast.success(isFirst ? 'Public link generated' : 'Client link re-sent');
                        fetchProject();
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Failed to send to client');
                      }
                    }}
                    data-testid="fe-send-to-client-btn">
                    <Send className="h-3 w-3 mr-1" />
                    {fe.public_token ? 'Re-send' : 'Send to Client'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      {isPlanning ? (
        <AppHeader user={user} customNav={planningNav} activeCustomNav="" onCustomNavChange={handlePlanningNav} />
      ) : (
        <AppHeader user={user} />
      )}

      <div className="max-w-[1800px] mx-auto px-4 py-4 sm:px-6 sm:py-8">
        {/* Project Header */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // Role-aware back: CRE returns to CRE Board's All Projects tab,
                // Planning to its dashboard, everyone else falls back to /projects.
                let dest = '/projects';
                if (isPlanning) dest = '/planning-board';
                else if (user?.role === 'cre') dest = '/cre-board?tab=all_projects';
                else if (user?.role === 'super_admin') dest = '/projects';
                window.location.href = dest;
              }}
              className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              {headerEditing ? (
                <div className="space-y-3" data-testid="header-edit-form">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">Project Name</Label>
                      <Input data-testid="header-edit-name" value={headerForm.name} onChange={e => setHeaderForm(f => ({ ...f, name: e.target.value }))} placeholder="Project Name" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Client Name</Label>
                      <Input data-testid="header-edit-client" value={headerForm.client_name} onChange={e => setHeaderForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Client Name" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Phone</Label>
                      <Input data-testid="header-edit-phone" value={headerForm.client_phone} onChange={e => setHeaderForm(f => ({ ...f, client_phone: e.target.value }))} placeholder="Client Phone" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Email</Label>
                      <Input data-testid="header-edit-email" value={headerForm.client_email} onChange={e => setHeaderForm(f => ({ ...f, client_email: e.target.value }))} placeholder="Client Email" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Location</Label>
                      <Input data-testid="header-edit-location" value={headerForm.location} onChange={e => setHeaderForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Package</Label>
                      <Select value={headerForm.package_id || '__none__'} onValueChange={v => setHeaderForm(f => ({ ...f, package_id: v === '__none__' ? '' : v }))}>
                        <SelectTrigger data-testid="header-edit-package"><SelectValue placeholder="Select Package" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-- No Package --</SelectItem>
                          {allPackages.map(pkg => (
                            <SelectItem key={pkg.package_id} value={pkg.package_id}>{pkg.name}{pkg.tag ? ` (${pkg.tag})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={saveHeaderEdit} disabled={headerSaving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="header-edit-save">
                      <Save className="h-3.5 w-3.5 mr-1" />{headerSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHeaderEditing(false)} data-testid="header-edit-cancel">
                      <X className="h-3.5 w-3.5 mr-1" />Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 data-testid="project-detail-title" className="text-xl sm:text-3xl font-bold text-gray-900 truncate">
                      {project.name}
                    </h2>
                    {(user?.role === 'super_admin' || user?.role === 'cre' || user?.role === 'planning') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-indigo-600 shrink-0" onClick={startHeaderEdit} data-testid="header-edit-btn">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 mt-1 flex-wrap text-xs sm:text-sm">
                    {project.project_code && <span className="text-indigo-600 font-semibold" data-testid="project-code">{project.project_code}</span>}
                    <span className="text-gray-600"><strong>Client:</strong> {project.client_name}</span>
                    {['sales', 'pre_sales', 'cre', 'super_admin'].includes(user?.role) && project.client_phone && (
                      <span className="text-gray-600" data-testid="project-client-phone"><strong>Phone:</strong> {project.client_phone}</span>
                    )}
                    {['sales', 'pre_sales', 'cre', 'super_admin'].includes(user?.role) && project.client_email && (
                      <span className="text-gray-600 hidden sm:inline" data-testid="project-client-email"><strong>Email:</strong> {project.client_email}</span>
                    )}
                    <span className="text-gray-600 hidden sm:inline"><strong>Location:</strong> {project.location || '-'}</span>
                    {project.latitude && project.longitude && (
                      <span className="text-green-600 text-[10px] bg-green-50 px-1.5 py-0.5 rounded font-medium">GPS Set</span>
                    )}
                    {!project.latitude && ['super_admin', 'planning', 'project_manager'].includes(user?.role) && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] text-orange-600 hover:text-orange-700 p-0 px-1" onClick={() => setShowLocationSetup(true)} data-testid="set-gps-btn">
                        Set GPS
                      </Button>
                    )}
                    {project.latitude && ['super_admin', 'planning', 'project_manager'].includes(user?.role) && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] text-gray-500 hover:text-gray-700 p-0 px-1" onClick={() => setShowLocationSetup(true)} data-testid="update-gps-btn">
                        Update GPS
                      </Button>
                    )}
                    {project.package_id && (
                      <span className="text-gray-600"><strong>Package:</strong> {allPackages.find(p => p.package_id === project.package_id)?.name || project.package_id}</span>
                    )}
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>{project.status}</Badge>
                  </div>
                </>
              )}
            </div>
            {/* Delete Project Button - visible for super_admin or planning (for draft/in_planning projects) */}
            {!headerEditing && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Hand Over Button — moves project from "Current" → "Delivered".
                  Visible only when project is in active planning state and user can manage. */}
              {(user?.role === 'planning' || user?.role === 'super_admin') && (project?.planning_status === 'active') && (
                <Button
                  data-testid="hand-over-btn"
                  size="sm"
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={async () => {
                    if (!window.confirm(`Hand over "${project.name}" to the client?\n\nThis moves the project to Delivered Projects. You can revert from the Planning Board if needed.`)) return;
                    try {
                      await axios.patch(`${API}/planning/projects/${projectId}/planning-status`, { planning_status: 'delivered' });
                      toast.success('Project handed over — moved to Delivered');
                      fetchProject();
                    } catch (err) {
                      toast.error(err.response?.data?.detail || 'Failed to hand over project');
                    }
                  }}
                >
                  <Check className="h-4 w-4" />
                  <span className="hidden sm:inline">Hand Over</span>
                </Button>
              )}
              {/* Share as PDF Button */}
              <Button 
                data-testid="share-pdf-btn"
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Share as PDF</span>
              </Button>
              
              {canDeleteProject && (
                <Dialog open={deleteProjectDialog} onOpenChange={setDeleteProjectDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      data-testid="delete-project-btn"
                      variant="destructive" 
                      size="sm" 
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete Project</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Project
                      </DialogTitle>
                      <DialogDescription>
                        This action <strong>cannot be undone</strong>. This will permanently delete the project 
                        <strong> "{project.name}"</strong> and all related data including scope items, payment stages, 
                        additions, and deductions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                          Type <strong>DELETE</strong> to confirm:
                        </p>
                        <Input
                          data-testid="delete-confirm-input"
                          placeholder="Type DELETE to confirm"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setDeleteProjectDialog(false); setDeleteConfirmText(''); }}>
                      Cancel
                    </Button>
                    <Button 
                      data-testid="confirm-delete-project-btn"
                      variant="destructive" 
                      onClick={handleDeleteProject}
                      disabled={deleteConfirmText !== 'DELETE'}
                    >
                      Delete Project
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Summary Strip — redesigned dual-half layout */}
        {canSeeFinancials && (() => {
          const scopeTotal = summary.scope_total || summary.project_value || 0;
          const additionsTotal = summary.additions_total || 0;
          const deductionsTotal = summary.deductions_total || 0;
          const grandTotal = scopeTotal + additionsTotal - deductionsTotal;
          const totalIncome = summary.income_total || 0;
          const totalExpense = (summary.material_total || 0) + (summary.labour_total || 0) + (summary.vendor_total || 0) + (summary.expenses_total || 0);
          const receivableBalance = Math.max(0, grandTotal - totalIncome);
          const collectionPct = grandTotal > 0 ? (totalIncome / grandTotal) * 100 : 0;
          const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4 sm:mb-6" data-testid="project-summary-strip">
              {/* LEFT — Project Value Calculation */}
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50/60 to-violet-50/40">
                <CardContent className="p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-2">Project Value Calculation</p>
                  <div className="grid grid-cols-4 gap-2 items-stretch">
                    <div className="rounded-md bg-white/80 border border-blue-200 p-2.5">
                      <p className="text-[10px] text-gray-500 uppercase">Scope Value</p>
                      <p className="text-base font-bold text-blue-700 mt-0.5">{fmtINR(scopeTotal)}</p>
                    </div>
                    <div className="rounded-md bg-white/80 border border-cyan-200 p-2.5">
                      <p className="text-[10px] text-gray-500 uppercase">Additions</p>
                      <p className="text-base font-bold text-cyan-700 mt-0.5">{fmtINR(additionsTotal)}</p>
                    </div>
                    <div className="rounded-md bg-white/80 border border-orange-200 p-2.5">
                      <p className="text-[10px] text-gray-500 uppercase">Deductions</p>
                      <p className="text-base font-bold text-orange-700 mt-0.5">{fmtINR(deductionsTotal)}</p>
                    </div>
                    <div className="rounded-md bg-violet-600 text-white p-2.5">
                      <p className="text-[10px] uppercase opacity-90">Grand Total</p>
                      <p className="text-base font-extrabold mt-0.5">{fmtINR(grandTotal)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* RIGHT — Financial Performance */}
              <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-rose-50/40">
                <CardContent className="p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Financial Performance</p>
                  <div className="grid grid-cols-3 gap-2 items-stretch">
                    <div className="rounded-md bg-white/80 border border-emerald-200 p-2.5">
                      <p className="text-[10px] text-gray-500 uppercase">Total Income</p>
                      <p className="text-base font-bold text-emerald-700 mt-0.5">{fmtINR(totalIncome)}</p>
                      <p className="text-[9px] text-emerald-600 mt-0.5">{collectionPct.toFixed(1)}% of value</p>
                    </div>
                    <div className="rounded-md bg-white/80 border border-rose-200 p-2.5">
                      <p className="text-[10px] text-gray-500 uppercase">Total Expense</p>
                      <p className="text-base font-bold text-rose-600 mt-0.5">{fmtINR(totalExpense)}</p>
                      {totalIncome > 0 && <p className="text-[9px] text-rose-600 mt-0.5">{((totalExpense / totalIncome) * 100).toFixed(1)}% of income</p>}
                    </div>
                    <div className={`rounded-md p-2.5 ${receivableBalance > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'}`}>
                      <p className="text-[10px] uppercase opacity-90">Receivable</p>
                      <p className="text-base font-extrabold mt-0.5">{fmtINR(receivableBalance)}</p>
                      <p className="text-[9px] opacity-90 mt-0.5">Yet to receive</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* Main Tabs */}
        <Card>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="border-b p-3 sm:p-6">
              <TabsList className="bg-transparent border-0 p-0 h-auto gap-0 w-full justify-between overflow-x-auto flex-nowrap">
                {/* Order: Estimate → Final Estimate → Payment Schedule → Work Order → Materials →
                    Payment Summary → Team → Construction Stage (CRE) → Project Stages → Documents */}
                <TabsTrigger value="rough-estimate" className="data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Estimate
                </TabsTrigger>
                <TabsTrigger value="scope" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Final Estimate
                </TabsTrigger>
                {canSeeFinancials && <TabsTrigger value="payments" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Payment Schedule
                </TabsTrigger>}
                <TabsTrigger value="labours" className="data-[state=active]:border-b-2 data-[state=active]:border-teal-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-labours">
                  Work Order (Labour)
                </TabsTrigger>
                <TabsTrigger value="materials" className="data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-materials">
                  Materials
                </TabsTrigger>
                {canSeeFinancials && <TabsTrigger value="payment-summary" className="data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none px-4 py-3 text-[15px] font-medium bg-green-50 whitespace-nowrap flex-1 text-center">
                  Payment Summary
                </TabsTrigger>}
                <TabsTrigger value="team" className="data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-team">
                  Team
                </TabsTrigger>
                <TabsTrigger value="construction-stage" className="data-[state=active]:border-b-2 data-[state=active]:border-rose-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-construction-stage">
                  Construction Stage
                </TabsTrigger>
                <TabsTrigger value="project-stages" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center" data-testid="tab-project-stages">
                  Stages - Project Stages
                </TabsTrigger>
                {/* Cheques tab moved INSIDE Payment Summary as a sub-tab — kept as a hidden mount-point so /tab=cheques deep links still resolve */}
                <TabsTrigger value="documents" className="data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none px-4 py-3 text-[15px] font-medium whitespace-nowrap flex-1 text-center">
                  Documents
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* ==================== ROUGH ESTIMATE TAB ==================== */}
            <TabsContent value="rough-estimate" className="p-3 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    Rough Estimate Reference
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500">Original rough estimate from Planning department</p>
                </div>
                {reProject && (
                  <div className="flex gap-2">
                    {(projectData?.scope_items || []).some(s => s.remarks?.includes('From RE:')) ? (
                      <Button 
                        disabled
                        className="bg-gray-400 cursor-not-allowed"
                        data-testid="convert-to-scope-btn"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Already Converted
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleConvertToScope} 
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="convert-to-scope-btn"
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Convert to Scope
                      </Button>
                    )}
                    <Button 
                      onClick={handleGenerateREPDF} 
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="download-re-pdf"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                )}
              </div>
              
              {/* Revision Tabs */}
              {reRevisions.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap mb-4 border-b pb-3" data-testid="project-re-revision-tabs">
                  {reRevisions.map((rev) => {
                    const isActive = rev.re_project_id === reProject?.re_project_id;
                    const isApproved = ['client_approved', 're_approved'].includes(rev.status);
                    const isDimmed = !isActive && !isApproved;
                    return (
                      <button
                        key={rev.re_project_id}
                        data-testid={`project-re-tab-${rev.revision}`}
                        onClick={() => setReProject(rev)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                          isActive
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : isApproved
                              ? 'bg-green-100 text-green-800 border-green-300 ring-1 ring-green-400'
                              : isDimmed
                                ? 'bg-gray-50 text-gray-400 border-gray-200 opacity-60'
                                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <GitBranch className="inline h-3 w-3 mr-1" />
                        RE{rev.revision}
                        {isApproved && <CheckCircle2 className="inline h-3 w-3 ml-1 text-green-600" />}
                      </button>
                    );
                  })}
                  <span className="text-xs text-gray-400 ml-2">
                    {reRevisions.length} revision{reRevisions.length > 1 ? 's' : ''} — Approved version highlighted in green
                  </span>
                </div>
              )}
              
              {reProject ? (
                <div className="space-y-4">
                  {/* Revision Badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {reProject.re_number && (
                      <span className="font-mono text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">{reProject.re_number}</span>
                    )}
                    <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200">
                      <GitBranch className="h-3 w-3 mr-0.5" /> RE{reProject.revision || 0}
                    </Badge>
                    <Badge className={reProject.status === 'converted' ? 'bg-green-100 text-green-700' : reProject.status === 'client_approved' ? 'bg-emerald-100 text-emerald-700' : reProject.status === 're_approved' ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'}>
                      {reProject.status?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  
                  {/* RE Project Overview */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">RE Project Name</p>
                        <p className="font-semibold">{reProject.project_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Location</p>
                        <p className="font-medium">{reProject.location || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Area</p>
                        <p className="font-medium">{reProject.sqft?.toLocaleString()} sqft</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Building Type</p>
                        <p className="font-medium capitalize">{reProject.building_type}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-gray-500">Package</p>
                        <p className="font-medium">{reProject.package_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Estimated Total</p>
                        <p className="font-bold text-purple-700">₹{(reProject.estimated_total || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Handover Timeline</p>
                        <p className="font-medium">{reProject.handover_months || '-'} months</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* RE Scope Items */}
                  {/* Inner tabs: Scope of Work / Payment Schedule — each with its own Convert action */}
                  {((reProject.rough_scope_items || reProject.scope_items)?.length > 0 || (reProject.payment_schedule || []).length > 0) && (
                    <div className="border rounded-lg overflow-hidden" data-testid="re-inner-tabs">
                      <div className="flex border-b bg-gray-50">
                        <button
                          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${reInnerTab === 'scope' ? 'bg-white text-purple-700 border-b-2 border-purple-600' : 'text-gray-600 hover:bg-gray-100'}`}
                          onClick={() => setReInnerTab('scope')}
                          data-testid="re-tab-scope"
                        >
                          Scope of Work ({(reProject.rough_scope_items || reProject.scope_items || []).length})
                        </button>
                        <button
                          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${reInnerTab === 'payments' ? 'bg-white text-purple-700 border-b-2 border-purple-600' : 'text-gray-600 hover:bg-gray-100'}`}
                          onClick={() => setReInnerTab('payments')}
                          data-testid="re-tab-payments"
                        >
                          Payment Schedule ({(reProject.payment_schedule || []).length})
                        </button>
                      </div>
                      <div className="p-4">
                        {reInnerTab === 'scope' ? (
                          (reProject.rough_scope_items || reProject.scope_items)?.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border rounded-lg">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Item</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Unit</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600">Rate</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {(reProject.rough_scope_items || reProject.scope_items).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      <td className="px-3 py-2">{item.name || item.item_name}</td>
                                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                                      <td className="px-3 py-2">{item.unit}</td>
                                      <td className="px-3 py-2 text-right">₹{(item.rate || item.unit_rate || 0).toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right font-medium">₹{(item.total || 0).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="bg-purple-50">
                                  <tr>
                                    <td colSpan="4" className="px-3 py-2 text-right font-semibold">Estimated Total:</td>
                                    <td className="px-3 py-2 text-right font-bold text-purple-700">
                                      ₹{(reProject.rough_scope_items || reProject.scope_items).reduce((sum, i) => sum + (i.total || 0), 0).toLocaleString()}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          ) : (
                            <p className="text-center text-gray-400 py-6 text-sm">No scope items in this Rough Estimate.</p>
                          )
                        ) : (
                          (reProject.payment_schedule || []).length > 0 ? (
                            <>
                              <div className="flex justify-end mb-2">
                                {(projectData?.payment_stages || []).some(s => s.notes && String(s.notes).includes('From RE:')) ? (
                                  <Button disabled className="bg-gray-400 cursor-not-allowed" data-testid="convert-to-payments-btn">
                                    <Check className="h-4 w-4 mr-2" /> Already Converted
                                  </Button>
                                ) : (
                                  <Button onClick={handleConvertToPaymentSchedule} className="bg-green-600 hover:bg-green-700" data-testid="convert-to-payments-btn">
                                    <ArrowRight className="h-4 w-4 mr-2" /> Convert to Project Payment Schedule
                                  </Button>
                                )}
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border rounded-lg">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                                      <th className="px-3 py-2 text-left font-medium text-gray-600">Stage</th>
                                      <th className="px-3 py-2 text-right font-medium text-gray-600">%</th>
                                      <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                                      <th className="px-3 py-2 text-left font-medium text-gray-600">Due Date</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {reProject.payment_schedule.map((stage, idx) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                        <td className="px-3 py-2">{stage.stage_name}</td>
                                        <td className="px-3 py-2 text-right">{stage.percentage}%</td>
                                        <td className="px-3 py-2 text-right font-medium">₹{(stage.amount || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2">{stage.due_date ? new Date(stage.due_date).toLocaleDateString('en-IN') : '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-purple-50">
                                    <tr>
                                      <td colSpan="2" className="px-3 py-2 text-right font-semibold">Totals:</td>
                                      <td className="px-3 py-2 text-right font-bold text-purple-700">
                                        {reProject.payment_schedule.reduce((s, p) => s + (parseFloat(p.percentage) || 0), 0).toFixed(2)}%
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-purple-700">
                                        ₹{reProject.payment_schedule.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toLocaleString()}
                                      </td>
                                      <td></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </>
                          ) : (
                            <p className="text-center text-gray-400 py-6 text-sm">No payment schedule defined in this Rough Estimate. Planning can add stages from the RE Edit dialog.</p>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No Rough Estimate Available</p>
                  <p className="text-sm">This project was not created from a Rough Estimate</p>
                </div>
              )}
            </TabsContent>

            {/* ==================== FINAL ESTIMATE — SCOPE (sub-tab 1 of 3) ==================== */}
            <TabsContent value="scope" className="p-3 sm:p-6">
              {renderFeTopSection('scope')}
              {/* Final Estimate workflow status banner (visible once flow has started) */}
              {project?.fe?.status && project.fe.status !== 'draft' && (
                <div className={`mb-4 rounded-lg border p-3 ${
                  project.fe.status === 'approved' ? 'bg-green-50 border-green-200' :
                  project.fe.status === 'review_pending' ? 'bg-amber-50 border-amber-200' :
                  project.fe.status === 'pending_cre_review' ? 'bg-purple-50 border-purple-200' :
                  project.fe.status === 'pending_gm_review' ? 'bg-blue-50 border-blue-200' :
                  project.fe.status === 'rejected_by_gm' ? 'bg-red-50 border-red-200' :
                  'bg-gray-50 border-gray-200'
                }`} data-testid="fe-status-banner">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Final Estimate</span>
                        <Badge variant="outline" className="text-xs">
                          Rev {project.fe.revision || 0}
                        </Badge>
                        <Badge className={`text-xs ${
                          project.fe.status === 'approved' ? 'bg-green-100 text-green-700' :
                          project.fe.status === 'review_pending' ? 'bg-amber-100 text-amber-700' :
                          project.fe.status === 'pending_cre_review' ? 'bg-purple-100 text-purple-700' :
                          project.fe.status === 'pending_gm_review' ? 'bg-blue-100 text-blue-700' :
                          project.fe.status === 'rejected_by_gm' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {project.fe.status === 'pending_gm_review' ? 'Pending GM Approval' :
                           project.fe.status === 'rejected_by_gm' ? 'Rejected by GM — Action needed' :
                           project.fe.status === 'pending_cre_review' ? 'Sent to CRE' :
                           project.fe.status === 'review_pending' ? 'Review from CRE — Action needed' :
                           project.fe.status === 'approved' ? 'Approved by CRE' : project.fe.status}
                        </Badge>
                        {project?.fe?.sent_to_client_at && (
                          <span className="text-[10px] text-gray-400">Last client send: {new Date(project.fe.sent_to_client_at).toLocaleString()}</span>
                        )}
                      </div>
                      {project.fe.status === 'rejected_by_gm' && (project.fe.gm_rejections || []).length > 0 && (
                        <div className="mt-2 p-2 rounded bg-white border border-red-200" data-testid="fe-gm-rejection-reason">
                          <div className="text-[11px] font-semibold text-red-600 mb-0.5">GM Rejection Reason (Rev {project.fe.gm_rejections[project.fe.gm_rejections.length - 1].revision}):</div>
                          <div className="text-xs text-gray-700 whitespace-pre-wrap">{project.fe.gm_rejections[project.fe.gm_rejections.length - 1].reason}</div>
                          <div className="text-[10px] text-gray-400 mt-1">— {project.fe.gm_rejections[project.fe.gm_rejections.length - 1].by_name || 'GM'} · {new Date(project.fe.gm_rejections[project.fe.gm_rejections.length - 1].at).toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Review history list (Review 1, Review 2, ...) */}
                  {Array.isArray(project.fe.reviews) && project.fe.reviews.length > 0 && (
                    <div className="mt-3 space-y-2" data-testid="fe-reviews-list">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Reviews from CRE</p>
                      {project.fe.reviews.map((r, i) => (
                        <div key={i} className="rounded border border-amber-200 bg-white px-3 py-2" data-testid={`fe-review-item-${r.review_no}`}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className="bg-amber-200 text-amber-900 text-[10px]">Review #{r.review_no}</Badge>
                            <Badge variant="outline" className="text-[10px]">on Rev {r.revision}</Badge>
                            <span className="text-[10px] text-gray-500 ml-auto">{new Date(r.at).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-gray-800 italic">"{r.text}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Final Estimate</h3>
                  <p className="text-xs sm:text-sm text-gray-500">Define scope items - total becomes project value</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(user?.role === 'planning' || user?.role === 'planning_person' || user?.role === 'super_admin') &&
                    (!project?.fe?.status || project.fe.status === 'draft' || project.fe.status === 'review_pending' || project.fe.status === 'rejected_by_gm') && (
                    <Button
                      data-testid="fe-submit-to-gm-btn"
                      size="sm"
                      className="gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                      onClick={async () => {
                        const isResend = project.fe?.status === 'review_pending' || project.fe?.status === 'rejected_by_gm';
                        const msg = isResend
                          ? `Re-submit updated Final Estimate to GM? This will be marked as Rev ${(project.fe?.revision || 0) + 1}.`
                          : 'Submit this Final Estimate to GM for approval?\n\nFinal Estimate + Additional Costs − Deductions. Make sure totals are finalised.';
                        if (!window.confirm(msg)) return;
                        try {
                          await axios.post(`${API}/planning/projects/${projectId}/final-estimate/submit-to-gm`);
                          toast.success(isResend ? 'Updated Final Estimate sent to GM' : 'Final Estimate sent to GM for approval');
                          fetchProject();
                        } catch (err) {
                          const status = err.response?.status;
                          const msg2 = err.response?.data?.detail
                            || (status === 401 ? 'Your session expired. Please log in again.' : null)
                            || (status === 403 ? 'You do not have permission to submit Final Estimate.' : null)
                            || `Failed to submit (HTTP ${status || 'unknown'})`;
                          toast.error(msg2);
                        }
                      }}
                    >
                      <Send className="h-3 w-3 sm:h-4 sm:w-4" /> {(project.fe?.status === 'review_pending' || project.fe?.status === 'rejected_by_gm') ? 'Re-submit to GM' : 'Submit to GM'}
                    </Button>
                  )}
                  {selectedScopeIds.length > 0 && (
                    <Button 
                      data-testid="bulk-delete-scope-btn"
                      variant="destructive"
                      size="sm"
                      className="gap-1 sm:gap-2 text-xs sm:text-sm"
                      onClick={handleBulkDeleteScope}
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />Delete Selected ({selectedScopeIds.length})
                    </Button>
                  )}
                  {canManage && (
                    <Dialog open={bulkScopeDialog} onOpenChange={setBulkScopeDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-scope-btn" size="sm" className="gap-1 sm:gap-2 bg-secondary hover:bg-secondary/90 text-xs sm:text-sm">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" /><span className="hidden sm:inline">Add </span>Scope
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl max-h-[90vh] mx-4 sm:mx-auto">
                        <DialogHeader>
                          <DialogTitle>Add Multiple Scope Items</DialogTitle>
                          <DialogDescription>Add rows as needed. Use X to remove empty rows.</DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[70vh] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-1 py-2 w-8"></th>
                                <th className="px-2 py-2 text-left min-w-[180px]">Item Name *</th>
                                <th className="px-2 py-2 text-left w-20">Qty</th>
                                <th className="px-2 py-2 text-left w-32">Unit</th>
                                <th className="px-2 py-2 text-left w-32">Rate (₹) *</th>
                                <th className="px-2 py-2 text-left w-28">Total</th>
                                <th className="px-2 py-2 text-left min-w-[120px]">Remarks</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              <SortableList
                                items={bulkScopeRows.map((_, i) => `bulk-scope-${i}`)}
                                onReorder={(newIds) => {
                                  const newRows = newIds.map(id => bulkScopeRows[parseInt(id.split('-')[2])]);
                                  setBulkScopeRows(newRows);
                                }}
                              >
                              {bulkScopeRows.map((row, idx) => (
                                <SortableTableRow key={`bulk-scope-${idx}`} id={`bulk-scope-${idx}`} className="border-b hover:bg-gray-50">
                                  {({ listeners, attributes }) => (
                                    <>
                                  <td className="px-1 py-1"><DragHandle listeners={listeners} attributes={attributes} /></td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.item_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].item_name = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      placeholder="e.g., Foundation Work"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.quantity}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].quantity = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <UnitSelect 
                                      value={row.unit}
                                      onChange={(v) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit = v;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                      data-testid={`bulk-scope-unit-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.unit_rate}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].unit_rate = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-amber-600 font-medium">
                                    ₹{((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_rate) || 0)).toLocaleString()}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.remarks}
                                      onChange={(e) => {
                                        const newRows = [...bulkScopeRows];
                                        newRows[idx].remarks = e.target.value;
                                        setBulkScopeRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkScopeRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkScopeRows.filter((_, i) => i !== idx);
                                          setBulkScopeRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                    </>
                                  )}
                                </SortableTableRow>
                              ))}
                              </SortableList>
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, { item_name: '', quantity: '1', unit: 'Nos', unit_rate: '', remarks: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkScopeRows([...bulkScopeRows, ...createEmptyRows('scope', 6)])}
                            >
                              + Add 6 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkScopeDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-scope-btn" onClick={handleBulkAddScope}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {canManage && (
                        <th className="px-1 py-3 w-8"></th>
                      )}
                      {canManage && (
                        <th className="px-3 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                            checked={scope_items.length > 0 && selectedScopeIds.length === scope_items.length}
                            onChange={toggleAllScope}
                            data-testid="select-all-scope"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {scope_items.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 8} className="px-4 py-8 text-center text-gray-500">
                          No scope items defined yet. Click "Add Scope Items" to define project scope.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={scope_items.map(s => s.scope_id)}
                        onReorder={handleScopeReorder}
                      >
                      {scope_items.map((item, index) => {
                        const isEditing = editingScopeItem === item.scope_id;
                        
                        return (
                          <SortableTableRow key={item.scope_id} id={item.scope_id} className={`hover:bg-gray-50 ${selectedScopeIds.includes(item.scope_id) ? 'bg-blue-50' : ''}`}>
                            {({ listeners, attributes }) => (
                              <>
                            {canManage && (
                              <td className="px-1 py-3 text-center">
                                <DragHandle listeners={listeners} attributes={attributes} />
                              </td>
                            )}
                            {canManage && (
                              <td className="px-3 py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                                  checked={selectedScopeIds.includes(item.scope_id)}
                                  onChange={() => toggleScopeSelect(item.scope_id)}
                                  data-testid={`select-scope-${item.scope_id}`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-name-${item.scope_id}`}
                                  value={editScopeForm.item_name}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, item_name: e.target.value})}
                                  className="h-8 w-full min-w-[150px]"
                                />
                              ) : (
                                item.item_name
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <NumericInput
                                  data-testid={`edit-scope-qty-${item.scope_id}`}
                                  
                                  value={editScopeForm.quantity}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, quantity: e.target.value})}
                                  className="h-8 w-20 text-right"
                                />
                              ) : (
                                item.quantity
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isEditing ? (
                                <UnitSelect
                                  data-testid={`edit-scope-unit-${item.scope_id}`}
                                  value={editScopeForm.unit}
                                  onChange={(v) => setEditScopeForm({...editScopeForm, unit: v})}
                                  className="w-24"
                                />
                              ) : (
                                item.unit
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <NumericInput
                                  data-testid={`edit-scope-rate-${item.scope_id}`}
                                  
                                  value={editScopeForm.unit_rate}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, unit_rate: e.target.value})}
                                  className="h-8 w-24 text-right"
                                />
                              ) : (
                                `₹${item.unit_rate?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-600">
                              {isEditing ? (
                                `₹${((parseFloat(editScopeForm.quantity) || 0) * (parseFloat(editScopeForm.unit_rate) || 0)).toLocaleString()}`
                              ) : (
                                `₹${item.total_amount?.toLocaleString()}`
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={item.workflow_status || 'draft'} />
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {isEditing ? (
                                <Input
                                  data-testid={`edit-scope-remarks-${item.scope_id}`}
                                  value={editScopeForm.remarks}
                                  onChange={(e) => setEditScopeForm({...editScopeForm, remarks: e.target.value})}
                                  className="h-8 w-full"
                                  placeholder="Remarks"
                                />
                              ) : (
                                item.remarks || '-'
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button 
                                        data-testid={`save-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={handleUpdateScope}
                                        className="h-8 w-8"
                                      >
                                        <Save className="h-4 w-4 text-green-500" />
                                      </Button>
                                      <Button 
                                        data-testid={`cancel-scope-edit-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={cancelScopeEdit}
                                        className="h-8 w-8"
                                      >
                                        <X className="h-4 w-4 text-gray-500" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button 
                                        data-testid={`edit-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => openScopeEdit(item)}
                                        className="h-8 w-8"
                                      >
                                        <Edit className="h-4 w-4 text-amber-600" />
                                      </Button>
                                      <Button 
                                        data-testid={`delete-scope-${item.scope_id}`}
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleDeleteScope(item.scope_id)}
                                        className="h-8 w-8"
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        );
                      })}
                      </SortableList>
                    )}
                  </tbody>
                  {scope_items.length > 0 && (
                    <tfoot className="bg-amber-50 border-t-2">
                      <tr>
                        <td colSpan={canManage ? 8 : 5} className="px-4 py-3 text-right font-bold">Project Value (Scope Total):</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700">₹{summary.scope_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PROJECT STAGES TAB ==================== */}
            <TabsContent value="project-stages" className="p-3 sm:p-6">
              <div className="space-y-6" data-testid="project-stages-tab">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">Project Stages</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Track construction stages and milestones</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {projectStages.length > 0 && (
                      <div className="flex border rounded-lg overflow-hidden" data-testid="stages-view-toggle">
                        <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${stagesView === 'table' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} onClick={() => setStagesView('table')}>Table</button>
                        <button className={`px-3 py-1.5 text-xs font-medium transition-colors ${stagesView === 'gantt' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} onClick={() => setStagesView('gantt')} data-testid="gantt-view-btn">Gantt</button>
                      </div>
                    )}
                    {!showAddStages && canManage && (
                      <Button data-testid="add-stages-btn" className="gap-2 bg-secondary hover:bg-secondary/90" onClick={() => setShowAddStages(true)}>
                        <Plus className="h-4 w-4" /> Add Stages
                      </Button>
                    )}
                  </div>
                </div>

                {/* Template Selector */}
                {showAddStages && (
                  <Card className="border-2 border-blue-200 bg-blue-50/30">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <h4 className="font-semibold text-blue-800">Add Project Stages</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">Load Template:</span>
                          <select 
                            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
                            value={selectedTemplate}
                            onChange={(e) => handleLoadTemplate(e.target.value)}
                            data-testid="template-selector"
                          >
                            <option value="">-- Select Template --</option>
                            {stageTemplates.map(t => (
                              <option key={t.template_id || t.template_name} value={t.template_name}>{t.template_name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Stage Rows — same 9-column format as the saved Project Stages table */}
                      <div className="overflow-x-auto border rounded-lg bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Sl.No</th>
                              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Stage Name</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Planned Start</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Planned Finish</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Duration<br/><span className="text-[10px] normal-case text-gray-400">(days)</span></th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Actual Start</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Actual Finish</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Progress</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Depends On</th>
                              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Hindrances</th>
                              <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {newStages.map((stage, idx) => (
                              stage.is_section_header ? (
                                <tr key={idx} className="bg-slate-100" data-testid={`new-section-row-${idx}`}>
                                  <td colSpan={10} className="px-2 py-2">
                                    <input
                                      type="text"
                                      placeholder="SECTION TITLE (e.g. Foundation work)"
                                      className="w-full bg-transparent text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wide outline-none border-0"
                                      value={stage.section_title || stage.stage_name || ''}
                                      onChange={(e) => {
                                        updateNewStage(idx, 'section_title', e.target.value);
                                        updateNewStage(idx, 'stage_name', e.target.value);
                                      }}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeNewStageRow(idx)}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={idx} className="hover:bg-gray-50" data-testid={`new-stage-row-${idx}`}>
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      placeholder="PO1"
                                      className="w-16 border rounded px-2 py-1 text-xs"
                                      value={stage.sl_no || ''}
                                      onChange={(e) => updateNewStage(idx, 'sl_no', e.target.value)}
                                      data-testid={`stage-slno-input-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      placeholder="Stage name"
                                      className="w-full min-w-[160px] border rounded px-2 py-1 text-sm"
                                      value={stage.stage_name}
                                      onChange={(e) => updateNewStage(idx, 'stage_name', e.target.value)}
                                      data-testid={`stage-name-input-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="date"
                                      className="border rounded px-2 py-1 text-xs"
                                      value={stage.start_date || ''}
                                      onChange={(e) => updateNewStage(idx, 'start_date', e.target.value)}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="date"
                                      className="border rounded px-2 py-1 text-xs"
                                      value={stage.target_date || ''}
                                      onChange={(e) => updateNewStage(idx, 'target_date', e.target.value)}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder={String(daysBetween(stage.start_date, stage.target_date) || '')}
                                      className="w-16 border rounded px-2 py-1 text-xs text-center"
                                      value={stage.duration_days ?? ''}
                                      onChange={(e) => updateNewStage(idx, 'duration_days', e.target.value === '' ? '' : Number(e.target.value))}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="date"
                                      className="border rounded px-2 py-1 text-xs"
                                      value={stage.actual_start_date || ''}
                                      onChange={(e) => updateNewStage(idx, 'actual_start_date', e.target.value)}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="date"
                                      className="border rounded px-2 py-1 text-xs"
                                      value={stage.actual_finish_date || ''}
                                      onChange={(e) => updateNewStage(idx, 'actual_finish_date', e.target.value)}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <div className="flex items-center gap-1 justify-center">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="5"
                                        placeholder="0"
                                        className="w-14 border rounded px-2 py-1 text-xs text-center"
                                        value={stage.progress ?? ''}
                                        onChange={(e) => {
                                          const pct = e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value)));
                                          const auto_status = pct === '' ? stage.status : pct >= 100 ? 'finished' : pct > 0 ? 'started' : 'yet_to_start';
                                          updateNewStage(idx, 'progress', pct);
                                          updateNewStage(idx, 'status', auto_status);
                                        }}
                                      />
                                      <span className="text-[10px] text-gray-500">%</span>
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <select
                                      className="border rounded px-1.5 py-1 text-xs w-full max-w-[110px]"
                                      value={stage.depends_on || ''}
                                      onChange={(e) => updateNewStage(idx, 'depends_on', e.target.value)}
                                    >
                                      <option value="">—</option>
                                      {newStages
                                        .map((s, i) => ({ s, i }))
                                        .filter(({ s, i }) => !s.is_section_header && i !== idx && s.sl_no)
                                        .map(({ s, i }) => <option key={i} value={s.sl_no}>{s.sl_no}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <HindrancePicker
                                      value={stage}
                                      onChange={(patch) => {
                                        if (patch.hindrance_type !== undefined) updateNewStage(idx, 'hindrance_type', patch.hindrance_type);
                                        if (patch.hindrance_reason !== undefined) updateNewStage(idx, 'hindrance_reason', patch.hindrance_reason);
                                        if (patch.hindrances !== undefined) {
                                          updateNewStage(idx, 'hindrances', patch.hindrances);
                                          updateNewStage(idx, 'remarks', patch.hindrances);
                                        }
                                      }}
                                      compact
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeNewStageRow(idx)}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              )
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Add row + Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={addNewStageRow} data-testid="add-stage-row-btn">
                          <Plus className="h-3 w-3 mr-1" /> Add Stage Row
                        </Button>
                        <Button variant="outline" size="sm" className="border-slate-400 text-slate-700 hover:bg-slate-100" onClick={addNewTitleRow} data-testid="add-title-row-btn">
                          <Plus className="h-3 w-3 mr-1" /> Add Title Row
                        </Button>
                        <div className="flex-1" />
                        <Button variant="outline" size="sm" onClick={() => { setSaveTemplateDialog(true); }} data-testid="save-as-template-btn">
                          <Save className="h-3 w-3 mr-1" /> Save as Template
                        </Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleSaveStages} data-testid="save-stages-btn">
                          <Check className="h-3 w-3 mr-1" /> Save Stages
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowAddStages(false); setNewStages([{ stage_name: '', start_date: '', target_date: '', status: 'yet_to_start', remarks: '', hindrances: '', sl_no: '', section_title: '', is_section_header: false, actual_start_date: '', actual_finish_date: '', duration_days: '', progress: 0 }]); }}>
                          Cancel
                        </Button>
                      </div>

                      {/* Save as Template Dialog */}
                      {saveTemplateDialog && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm font-medium text-amber-800 mb-2">Save as Template (e.g., G+1, G+2)</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Template name (e.g., G+2)"
                              className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                              value={templateName}
                              onChange={(e) => setTemplateName(e.target.value)}
                              data-testid="template-name-input"
                            />
                            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={handleSaveAsTemplate} data-testid="confirm-save-template-btn">
                              Save Template
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setSaveTemplateDialog(false)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Existing Stages - Table or Gantt View */}
                {projectStages.length > 0 ? (
                  stagesView === 'gantt' ? (
                    <GanttChart stages={projectStages} />
                  ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-1 py-3 w-8"></th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">S.No</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Stage Name</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Planned Start</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Planned Finish</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Duration (days)</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Actual Start</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Actual Finish</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Progress</th>
                          <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Depends On</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Hindrances</th>
                          {canManage && <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        <SortableList
                          items={projectStages.map(s => s.stage_id)}
                          onReorder={handleStageReorder}
                        >
                        {projectStages.map((stage, idx) => (
                          <SortableTableRow key={stage.stage_id} id={stage.stage_id} className={stage.is_section_header ? 'bg-slate-100' : 'hover:bg-gray-50'}>
                            {({ listeners, attributes }) => stage.is_section_header ? (
                              <>
                                <td className="px-1 py-2 text-center">
                                  {canManage && <DragHandle listeners={listeners} attributes={attributes} />}
                                </td>
                                <td colSpan={canManage ? 11 : 10} className="px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wide">
                                      {stage.section_title || stage.stage_name}
                                    </span>
                                    {canManage && (
                                      <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDeleteStage(stage.stage_id)} title="Delete section header">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                            <td className="px-1 py-3 text-center">
                              {canManage && <DragHandle listeners={listeners} attributes={attributes} />}
                            </td>
                            <td className="px-3 py-3 text-sm font-medium whitespace-nowrap">{stage.sl_no || (idx + 1)}</td>
                            <td className="px-3 py-3">
                              {editingStageId === stage.stage_id ? (
                                <input className="border rounded px-2 py-1 text-sm w-full" value={editStageData.stage_name || ''} onChange={e => setEditStageData(d => ({...d, stage_name: e.target.value}))} />
                              ) : (
                                <span className="font-medium">{stage.stage_name}</span>
                              )}
                            </td>
                            {/* Planned Start */}
                            <td className="px-3 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.start_date || ''} onChange={e => { const v = e.target.value; setEditStageData(d => ({...d, start_date: v})); autoSaveStageField(stage.stage_id, { start_date: v || null }); }} />
                              ) : (
                                <span className="text-sm">{stage.start_date ? new Date(stage.start_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Planned Finish */}
                            <td className="px-3 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.target_date || ''} onChange={e => { const v = e.target.value; setEditStageData(d => ({...d, target_date: v})); autoSaveStageField(stage.stage_id, { target_date: v || null }); }} />
                              ) : (
                                <span className="text-sm">{stage.target_date ? new Date(stage.target_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Duration (days) — placeholder field, auto-computed from Planned Start/Finish but editable */}
                            <td className="px-3 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input
                                  type="number"
                                  min="0"
                                  className="border rounded px-2 py-1 text-sm w-20 text-center"
                                  placeholder={String(daysBetween(editStageData.start_date, editStageData.target_date) || '')}
                                  value={editStageData.duration_days ?? ''}
                                  onChange={e => setEditStageData(d => ({...d, duration_days: e.target.value === '' ? '' : Number(e.target.value)}))}
                                />
                              ) : (
                                <span className="text-sm text-gray-600">
                                  {stage.duration_days || daysBetween(stage.start_date, stage.target_date) || '-'}
                                </span>
                              )}
                            </td>
                            {/* Actual Start */}
                            <td className="px-3 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.actual_start_date || ''} onChange={e => { const v = e.target.value; setEditStageData(d => ({...d, actual_start_date: v})); autoSaveStageField(stage.stage_id, { actual_start_date: v || null }); }} />
                              ) : (
                                <span className="text-sm">{stage.actual_start_date ? new Date(stage.actual_start_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Actual Finish */}
                            <td className="px-3 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <input type="date" className="border rounded px-2 py-1 text-sm" value={editStageData.actual_finish_date || ''} onChange={e => { const v = e.target.value; setEditStageData(d => ({...d, actual_finish_date: v})); autoSaveStageField(stage.stage_id, { actual_finish_date: v || null }); }} />
                              ) : (
                                <span className="text-sm">{stage.actual_finish_date ? new Date(stage.actual_finish_date).toLocaleDateString('en-IN') : '-'}</span>
                              )}
                            </td>
                            {/* Progress (% complete) — also doubles as Status indicator */}
                            <td className="px-3 py-3 text-center">
                              {editingStageId === stage.stage_id ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="5"
                                    className="border rounded px-2 py-1 text-sm w-16 text-center"
                                    value={editStageData.progress ?? ''}
                                    onChange={e => {
                                      const pct = e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value)));
                                      const auto_status = pct === '' ? editStageData.status : pct >= 100 ? 'finished' : pct > 0 ? 'started' : 'yet_to_start';
                                      setEditStageData(d => ({...d, progress: pct, status: auto_status}));
                                    }}
                                  />
                                  <span className="text-xs text-gray-500">%</span>
                                </div>
                              ) : (() => {
                                const pct = Number(stage.progress ?? (stage.status === 'finished' ? 100 : stage.status === 'started' ? 50 : 0));
                                const tone = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-500' : 'bg-gray-300';
                                return (
                                  <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
                                    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[11px] text-gray-600">{pct}%</span>
                                  </div>
                                );
                              })()}
                            </td>
                            {/* Depends On (predecessor stage) */}
                            <td className="px-3 py-3 text-center text-xs">
                              {editingStageId === stage.stage_id ? (
                                <input
                                  type="text"
                                  className="border rounded px-2 py-1 text-xs w-24 text-center uppercase"
                                  placeholder="e.g. PO3"
                                  value={editStageData.depends_on || ''}
                                  onChange={e => setEditStageData(d => ({...d, depends_on: e.target.value}))}
                                  onBlur={e => autoSaveStageField(stage.stage_id, { depends_on: e.target.value || null })}
                                />
                              ) : (
                                (() => {
                                  if (!stage.depends_on) return <span className="text-gray-300">-</span>;
                                  const depUpper = String(stage.depends_on).trim().toUpperCase();
                                  const dep = projectStages.find(s =>
                                    s.stage_id === stage.depends_on
                                    || String(s.sl_no || '').toUpperCase() === depUpper
                                  );
                                  return <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5">{dep?.sl_no || dep?.stage_name || stage.depends_on}</span>;
                                })()
                              )}
                            </td>
                            {/* Hindrances */}
                            <td className="px-3 py-3 text-sm text-gray-600 max-w-[220px]">
                              {editingStageId === stage.stage_id ? (
                                <HindrancePicker
                                  value={editStageData}
                                  onChange={(patch) => setEditStageData(d => ({...d, ...patch, remarks: patch.hindrances ?? d.remarks}))}
                                  compact
                                />
                              ) : (
                                <HindranceBadge stage={stage} />
                              )}
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                {editingStageId === stage.stage_id ? (
                                  <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-green-600" onClick={() => handleUpdateStage(stage.stage_id)}><Check className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingStageId(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="flex justify-center gap-1">
                                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingStageId(stage.stage_id); setEditStageData({ stage_name: stage.stage_name, start_date: stage.start_date || '', target_date: stage.target_date || '', duration_days: stage.duration_days ?? '', actual_start_date: stage.actual_start_date || '', actual_finish_date: stage.actual_finish_date || '', progress: stage.progress ?? (stage.status === 'finished' ? 100 : stage.status === 'started' ? 50 : 0), status: stage.status, hindrances: stage.hindrances || stage.remarks || '', remarks: stage.hindrances || stage.remarks || '', depends_on: stage.depends_on || '', hindrance_type: stage.hindrance_type || '', hindrance_reason: stage.hindrance_reason || '' }); }}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-indigo-600 hover:bg-indigo-50"
                                      onClick={() => setTimelineStage(stage)}
                                      title="View edit timeline"
                                      data-testid={`timeline-stage-${stage.stage_id}`}
                                    >
                                      <Clock className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => handleDeleteStage(stage.stage_id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                    </div>
                                    {stage.updated_at && (
                                      <span
                                        className="text-[9px] text-gray-400 cursor-help"
                                        title={`Last edited ${new Date(stage.updated_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}${stage.updated_by_name ? ' by ' + stage.updated_by_name : ''}${stage.last_changed_fields?.length ? '\nFields: ' + stage.last_changed_fields.join(', ') : ''}`}
                                      >
                                        ✎ {new Date(stage.updated_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        ))}
                        </SortableList>
                      </tbody>
                    </table>
                  </div>
                  )
                ) : !showAddStages && (
                  <div className="text-center py-12 text-gray-500">
                    <Folder className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No project stages defined</p>
                    <p className="text-sm mt-1">Click "Add Stages" to create stages or load from a template</p>
                  </div>
                )}

                {/* Progress Summary */}
                {projectStages.length > 0 && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center border">
                      <p className="text-2xl font-bold text-gray-600">{projectStages.filter(s => s.status === 'yet_to_start').length}</p>
                      <p className="text-xs text-gray-500">Yet to Start</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                      <p className="text-2xl font-bold text-amber-600">{projectStages.filter(s => s.status === 'started').length}</p>
                      <p className="text-xs text-amber-600">In Progress</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{projectStages.filter(s => s.status === 'finished').length}</p>
                      <p className="text-xs text-green-600">Finished</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            {/* ==================== PAYMENTS TAB ==================== */}
            <TabsContent value="payments" className="p-6">
              {/* Balance Payment Info — 4 cards calculated from Payment Schedule rows only */}
              {(() => {
                const totalValue = payment_stages.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
                const scheduleIncome = payment_stages.reduce((sum, s) => sum + (Number(s.amount_received) || 0), 0);
                const totalPctAllocated = payment_stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
                const remainingPct = Math.round((100 - totalPctAllocated) * 100) / 100;
                const totalAmountAllocated = payment_stages.reduce((sum, s) => sum + (s.amount || 0), 0);
                const isPM = user?.role === 'project_manager';

                // ---- Real advance data ----
                // Sales/CRE collect the advance which lands in `project_income`.
                // We use the FIRST income entry (chronologically the very first
                // payment recorded against the project) as the project's "Advance".
                // If `payment_stages` already has an `is_advance` row, we prefer
                // its `received_amount` (more precise — it ties to a specific stage).
                const stageAdvance = payment_stages.find(s => s.is_advance || (s.stage_name || '').toLowerCase().startsWith('advance'));
                const sortedIncome = (projectIncomeEntries || []).slice().sort((a, b) => {
                  const da = new Date(a.received_date || a.created_at || 0).getTime();
                  const db = new Date(b.received_date || b.created_at || 0).getTime();
                  return da - db;
                });
                const firstIncome = sortedIncome[0];
                const advanceAmount = stageAdvance?.received_amount
                  ?? stageAdvance?.amount
                  ?? firstIncome?.amount
                  ?? 0;
                const advanceApproved = stageAdvance
                  ? ['approved', 'paid', 'received', 'completed', 'settled'].includes((stageAdvance.status || '').toLowerCase())
                  : ['approved', 'paid', 'received', 'completed', 'settled'].includes((firstIncome?.status || '').toLowerCase());
                // collected_by from either source — works for both flows
                const collectedBy = (stageAdvance?.collected_by
                  || stageAdvance?.received_by_role
                  || firstIncome?.collected_by
                  || firstIncome?.received_by_role
                  || firstIncome?.created_by_role
                  || '').toString();
                const collectedByCRE = /cre/i.test(collectedBy);
                const hasAdvance = advanceAmount > 0;

                // Remaining = Total − Advance received
                const remainingAfterAdvance = Math.max(0, totalValue - advanceAmount);
                const advancePct = totalValue > 0 ? (advanceAmount / totalValue * 100) : 0;
                const remPct = Math.max(0, 100 - advancePct);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="payment-balance-info">
                    {/* 1. PROJECT VALUE */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Project Value</p>
                      <p className="text-xl font-bold text-blue-700 mt-1">₹{totalValue.toLocaleString()}</p>
                    </div>
                    {/* 2. TOTAL INCOME — sum of RECEIVED across payment schedule rows */}
                    <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200" data-testid="total-income-card">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Total Income</p>
                      <p className="text-xl font-bold text-emerald-700 mt-1">₹{scheduleIncome.toLocaleString()}</p>
                      {totalValue > 0 && (
                        <p className="text-[10px] text-emerald-600 mt-0.5">{((scheduleIncome / totalValue) * 100).toFixed(1)}% of value</p>
                      )}
                    </div>
                    {/* 3. TOTAL EXPENDITURE — material + labour + vendor expenses */}
                    <div className="bg-rose-50 rounded-lg p-4 border border-rose-200" data-testid="total-expenditure-card">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Total Expenditure</p>
                      <p className="text-xl font-bold text-rose-700 mt-1">₹{(projectExpenseSummary.total_expenses || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-rose-600 mt-0.5">Paid: ₹{(projectExpenseSummary.total_paid || 0).toLocaleString()}</p>
                    </div>
                    {/* 4. YET TO RECEIVE — sum of Balance across schedule rows (Amount − Received) */}
                    {(() => {
                      const yetToReceive = Math.max(0, totalValue - scheduleIncome);
                      const remPct = totalValue > 0 ? (yetToReceive / totalValue * 100) : 0;
                      return (
                        <div className={`rounded-lg p-4 border ${yetToReceive > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`} data-testid="yet-to-receive-card">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Yet To Receive</p>
                          <div className="flex items-end justify-between mt-1">
                            <p className={`text-xl font-bold ${yetToReceive > 0 ? 'text-amber-700' : 'text-green-600'}`}>
                              {!isPM && `₹${yetToReceive.toLocaleString()}`}
                            </p>
                            <span className={`text-sm font-semibold ${yetToReceive > 0 ? 'text-amber-600' : 'text-green-600'}`}>{remPct.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-lg font-bold">Payment Schedule</h3>
                  <p className="text-sm text-gray-500">
                    Milestone payments as % of project value
                    {user?.role !== 'project_manager' && ` (₹${(summary?.scope_total || projectData?.project?.total_value || 0).toLocaleString()})`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedPaymentIds.length > 0 && (
                    <Button 
                      data-testid="bulk-delete-payment-btn"
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={handleBulkDeletePayment}
                    >
                      <Trash2 className="h-4 w-4" />Delete Selected ({selectedPaymentIds.length})
                    </Button>
                  )}
                  {/* Choose Template Dialog (still mounted — opened via Set Advance % flow) */}
                  <Dialog open={chooseTemplateDialog} onOpenChange={setChooseTemplateDialog}>
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Apply Payment Schedule Template</DialogTitle>
                        <DialogDescription>
                          Pick a saved template to populate the schedule. Rows will become editable after applying.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        {psTemplates.length === 0 ? (
                          <div className="text-center py-6 text-sm text-gray-500">
                            No templates yet.
                            <Button variant="link" size="sm" onClick={() => navigate('/payment-schedule-templates')}>Create one →</Button>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-72 overflow-y-auto">
                            {psTemplates.map(tpl => {
                              const total = (tpl.rows || []).reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
                              const isSelected = selectedTemplateId === tpl.template_id;
                              return (
                                <button
                                  key={tpl.template_id}
                                  type="button"
                                  onClick={() => setSelectedTemplateId(tpl.template_id)}
                                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${isSelected ? 'border-indigo-500 bg-indigo-50/60' : 'border-gray-200 hover:border-indigo-300'}`}
                                  data-testid={`pick-tpl-${tpl.template_id}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-gray-900">{tpl.template_name}</p>
                                      {tpl.description && <p className="text-[11px] text-gray-500 line-clamp-2">{tpl.description}</p>}
                                      <p className="text-[11px] text-gray-500 mt-1">{(tpl.rows || []).length} milestones · Total {total.toFixed(1)}%</p>
                                    </div>
                                    {isSelected && <Check className="h-5 w-5 text-indigo-600 shrink-0" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Mode picker */}
                        {selectedTemplateId && (
                          <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
                            <p className="text-xs font-semibold text-gray-700">How should this template be applied?</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button type="button" onClick={() => setTemplateApplyMode('append')} className={`p-2.5 rounded border-2 text-left ${templateApplyMode === 'append' ? 'border-emerald-500 bg-emerald-50/60' : 'border-gray-200'}`}>
                                <p className="text-xs font-semibold text-emerald-700">Append</p>
                                <p className="text-[11px] text-gray-600">Add template rows alongside existing ones</p>
                              </button>
                              <button type="button" onClick={() => setTemplateApplyMode('replace')} className={`p-2.5 rounded border-2 text-left ${templateApplyMode === 'replace' ? 'border-red-500 bg-red-50/60' : 'border-gray-200'}`}>
                                <p className="text-xs font-semibold text-red-700">Replace</p>
                                <p className="text-[11px] text-gray-600">Delete all pending rows (keeps collected ones), then apply template</p>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => navigate('/payment-schedule-templates')} className="mr-auto">Manage Templates</Button>
                        <Button variant="outline" onClick={() => setChooseTemplateDialog(false)}>Cancel</Button>
                        <Button onClick={applyPaymentTemplate} disabled={!selectedTemplateId || applyingTemplate} className="bg-indigo-600 hover:bg-indigo-700" data-testid="apply-template-btn">
                          {applyingTemplate ? 'Applying...' : `Apply (${templateApplyMode === 'replace' ? 'Replace' : 'Append'})`}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  {canManage && (
                    <Dialog open={bulkPaymentDialog} onOpenChange={setBulkPaymentDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-payment-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                          <Plus className="h-4 w-4" />Add Payments
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh]">
                        <DialogHeader>
                          <DialogTitle>Add Payment Stages</DialogTitle>
                          <DialogDescription>
                            {(() => {
                              const totalVal = summary?.scope_total || projectData?.project?.total_value || 0;
                              const allocPct = payment_stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
                              // Income already collected against this project but NOT yet tied to a payment stage
                              // is treated as a virtual "Advance Collection" — so its % must be subtracted
                              // from the remaining schedulable percentage. Mirrors the virtual row shown in the table.
                              const hasExplicitAdvance = (payment_stages || []).some(s => s.is_advance === true || s.linked_income_id);
                              const earliestIncome = (projectIncomeEntries || []).slice().sort((a, b) => {
                                const da = new Date(a.received_date || a.created_at || 0).getTime();
                                const db = new Date(b.received_date || b.created_at || 0).getTime();
                                return da - db;
                              })[0];
                              const virtualAdvanceAmt = (!hasExplicitAdvance && earliestIncome) ? (earliestIncome.amount || 0) : 0;
                              const virtualAdvancePct = totalVal > 0 ? (virtualAdvanceAmt / totalVal) * 100 : 0;
                              const remPct = Math.max(0, Math.round((100 - allocPct - virtualAdvancePct) * 100) / 100);
                              const remAmt = Math.max(0, totalVal - (totalVal * allocPct / 100) - virtualAdvanceAmt);
                              if (virtualAdvanceAmt > 0) {
                                return `Remaining: ${remPct}% (₹${Math.round(remAmt).toLocaleString('en-IN')}) — already collected ₹${Math.round(virtualAdvanceAmt).toLocaleString('en-IN')} (${virtualAdvancePct.toFixed(2)}%) as Token Advance (Sales).`;
                              }
                              return `Remaining: ${remPct}% of project value. Total stages cannot exceed 100%.`;
                            })()}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Stage Name *</th>
                                <th className="px-2 py-2 text-left w-20">%</th>
                                <th className="px-2 py-2 text-left w-28">Amount (₹) *</th>
                                <th className="px-2 py-2 text-left">Due Date</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkPaymentRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      value={row.stage_name}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].stage_name = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="e.g., Advance"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.percentage}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const pct = parseFloat(e.target.value) || 0;
                                        newRows[idx].percentage = e.target.value;
                                        // Auto-calculate amount: % is taken on the FULL project value, but
                                        // the user can never schedule more than (project_total - already_collected_advance).
                                        const totalVal = summary?.scope_total || projectData?.project?.total_value || 0;
                                        if (totalVal > 0 && pct > 0) {
                                          newRows[idx].amount = Math.round((totalVal * pct) / 100);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="%"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput 
                                      
                                      value={row.amount}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        const amt = parseFloat(e.target.value) || 0;
                                        newRows[idx].amount = e.target.value;
                                        // Reverse-calc: amount → % uses the full project value (not balance)
                                        // so the % column matches the "of project value" framing in the table.
                                        const totalVal = summary?.scope_total || projectData?.project?.total_value || 0;
                                        if (totalVal > 0 && amt > 0) {
                                          newRows[idx].percentage = ((amt / totalVal) * 100).toFixed(2);
                                        }
                                        setBulkPaymentRows(newRows);
                                      }}
                                      placeholder="₹"
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <Input 
                                      type="date"
                                      value={row.due_date}
                                      onChange={(e) => {
                                        const newRows = [...bulkPaymentRows];
                                        newRows[idx].due_date = e.target.value;
                                        setBulkPaymentRows(newRows);
                                      }}
                                      className="h-8"
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    {bulkPaymentRows.length > 1 && (
                                      <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                          const newRows = bulkPaymentRows.filter((_, i) => i !== idx);
                                          setBulkPaymentRows(newRows);
                                        }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, { stage_name: '', percentage: '', amount: '', due_date: '' }])}
                            >
                              <Plus className="h-4 w-4 mr-1" /> Add Row
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setBulkPaymentRows([...bulkPaymentRows, ...createEmptyRows('payment', 6)])}
                            >
                              + Add 6 Rows
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkPaymentDialog(false)}>Cancel</Button>
                            <Button data-testid="submit-bulk-payment-btn" onClick={handleBulkAddPayment}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              {/* Edit Payment Stage Dialog */}
              <Dialog open={editPaymentDialog} onOpenChange={setEditPaymentDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Payment Stage</DialogTitle>
                    <DialogDescription>
                      Update payment stage details. Enter percentage or amount - the other will auto-calculate.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-stage-name">Stage Name</Label>
                      <Input
                        id="edit-stage-name"
                        data-testid="edit-payment-stage-name"
                        value={editPaymentForm.stage_name}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, stage_name: e.target.value })}
                        placeholder="e.g., Foundation Payment"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-percentage">Percentage (%)</Label>
                        <NumericInput
                          id="edit-percentage"
                          data-testid="edit-payment-percentage"
                          
                          value={editPaymentForm.percentage}
                          onChange={(e) => {
                            const pct = parseFloat(e.target.value) || 0;
                            let newAmount = editPaymentForm.amount;
                            const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                            if (balance > 0 && pct > 0) {
                              newAmount = Math.round((balance * pct) / 100).toString();
                            }
                            setEditPaymentForm({ ...editPaymentForm, percentage: e.target.value, amount: newAmount });
                          }}
                          placeholder="e.g., 10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-amount">Amount (₹)</Label>
                        <NumericInput
                          id="edit-amount"
                          data-testid="edit-payment-amount"
                          
                          value={editPaymentForm.amount}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            let newPct = editPaymentForm.percentage;
                            const balance = (summary?.scope_total || projectData?.project?.total_value || 0) - (projectData?.project?.advance_amount || 0);
                            if (balance > 0 && amt > 0) {
                              newPct = ((amt / balance) * 100).toFixed(2);
                            }
                            setEditPaymentForm({ ...editPaymentForm, amount: e.target.value, percentage: newPct });
                          }}
                          placeholder="e.g., 100000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-due-date">Due Date</Label>
                      <Input
                        id="edit-due-date"
                        data-testid="edit-payment-due-date"
                        type="date"
                        value={editPaymentForm.due_date}
                        onChange={(e) => setEditPaymentForm({ ...editPaymentForm, due_date: e.target.value })}
                      />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                      <p>Project Total Value: <span className="font-semibold">₹{projectData?.summary?.total_value?.toLocaleString() || 0}</span></p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditPaymentDialog(false)}>Cancel</Button>
                    <Button data-testid="save-payment-edit-btn" onClick={handleSavePaymentEdit}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* "Set Advance % from RE" — converts the virtual Auto-collected (Sales) row
                  into the first real payment stage. Shows live math:
                    Total Advance @ X% of Final Estimate − Token Collected = Balance Pending */}
              <Dialog open={advanceDialog.open} onOpenChange={(o) => setAdvanceDialog((s) => ({ ...s, open: o }))}>
                <DialogContent className="max-w-xl w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{advanceDialog.editing_stage_id ? 'Edit Advance Payment' : 'Set Advance Payment %'}</DialogTitle>
                    <DialogDescription>
                      {advanceDialog.editing_stage_id
                        ? 'Update the stage name or %. The amount will recalculate from % × Total Project Value.'
                        : "Enter the advance % agreed in the Rough Estimate. We'll convert this auto-collected row into your first payment stage and show what's still pending from the client."}
                    </DialogDescription>
                  </DialogHeader>
                  {(() => {
                    // Advance % must use the SAME base as the "Total Project Value" card
                    // (summary.project_value = sum of scope_items). Anything else creates
                    // a mismatch like "2% saved but 1.9% shown".
                    const totalFE = Number(summary?.project_value || projectData?.project?.total_value || summary?.scope_total || 0);
                    const tokenCollected = Number(advanceDialog.income_amount || 0);
                    const pctNum = parseFloat(advanceDialog.percentage);
                    const validPct = isFinite(pctNum) && pctNum >= 0 && pctNum <= 100;
                    const totalAdvance = validPct ? Math.round((totalFE * pctNum) / 100) : 0;
                    const tokenPct = totalFE > 0 ? +((tokenCollected / totalFE) * 100).toFixed(2) : 0;
                    const balancePct = validPct ? Math.max(0, +(pctNum - tokenPct).toFixed(2)) : 0;
                    const balanceAmt = Math.max(0, totalAdvance - tokenCollected);
                    return (
                      <div className="space-y-3 py-2">
                        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs space-y-1">
                          <div className="flex justify-between"><span>Total Project Value</span><span className="font-semibold">₹{totalFE.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span>Token Advance Collected (Sales)</span><span className="font-semibold text-emerald-700">₹{tokenCollected.toLocaleString()} <span className="text-gray-500">({tokenPct}%)</span></span></div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="adv-stage-name">Stage Name</Label>
                          <Input
                            id="adv-stage-name"
                            data-testid="adv-dialog-stage-name"
                            value={advanceDialog.stage_name}
                            onChange={(e) => setAdvanceDialog((s) => ({ ...s, stage_name: e.target.value }))}
                            placeholder="Stage 01 Payment"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="adv-pct">Advance % (from Rough Estimate)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="adv-pct"
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              data-testid="adv-dialog-percentage"
                              autoFocus
                              value={advanceDialog.percentage}
                              onChange={(e) => setAdvanceDialog((s) => ({ ...s, percentage: e.target.value }))}
                              placeholder="e.g., 2"
                              className="w-32"
                            />
                            <span className="text-sm text-gray-500">% of Total Project Value</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="adv-date">Expected Month (for balance Req Payment)</Label>
                          <Input
                            id="adv-date"
                            type="month"
                            data-testid="adv-dialog-expected-month"
                            value={(advanceDialog.expected_payment_date || '').slice(0, 7)}
                            onChange={(e) => setAdvanceDialog((s) => ({ ...s, expected_payment_date: e.target.value ? `${e.target.value}-01` : '' }))}
                          />
                          <p className="text-[11px] text-gray-500">
                            Pick the month only. The exact day is chosen later from the Payment Schedule.
                          </p>
                        </div>
                        {validPct && (
                          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1">
                            <div className="flex justify-between">
                              <span>Total Advance @ {pctNum}%</span>
                              <span className="font-semibold">₹{totalAdvance.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>− Token Collected</span>
                              <span>− ₹{tokenCollected.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t border-emerald-200 pt-1 mt-1 text-emerald-700 font-semibold">
                              <span>Pending for {advanceDialog.stage_name || 'Stage 01'}</span>
                              <span>₹{balanceAmt.toLocaleString()} <span className="text-[10px] font-normal">({balancePct}%)</span></span>
                            </div>
                          </div>
                        )}
                        {/* Auto-schedule remaining (100 − %) using a saved Payment Schedule template */}
                        {!advanceDialog.editing_stage_id && (
                          <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
                            <label className="flex items-start gap-2 text-xs text-gray-700 select-none cursor-pointer" data-testid="adv-dialog-gen-rest-label">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 rounded border-gray-300"
                                checked={advanceDialog.generate_remaining}
                                onChange={(e) => setAdvanceDialog((s) => ({ ...s, generate_remaining: e.target.checked }))}
                                data-testid="adv-dialog-gen-rest"
                              />
                              <span>
                                Also schedule the remaining <strong>{validPct ? (100 - pctNum).toFixed(2) : '—'}%</strong> automatically
                                using a Payment Schedule template (the template's % values are scaled to fit the remaining balance).
                              </span>
                            </label>
                            {advanceDialog.generate_remaining && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={advanceDialog.remaining_template_id || ''}
                                    onValueChange={(v) => {
                                      const tpl = psTemplates.find(t => t.template_id === v);
                                      setAdvanceDialog((s) => ({
                                        ...s,
                                        remaining_template_id: v,
                                        editable_template_rows: tpl ? (tpl.rows || []).map(r => ({ ...r })) : [],
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs flex-1" data-testid="adv-dialog-template-select">
                                      <SelectValue placeholder={psTemplates.length ? 'Pick a template…' : 'No templates yet — create one'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {psTemplates.map((t) => (
                                        <SelectItem key={t.template_id} value={t.template_id}>
                                          {t.template_name} ({(t.rows || []).length} rows)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs gap-1 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => window.open('/payment-schedule-templates', '_blank')}
                                    data-testid="adv-dialog-new-template-btn"
                                    title="Open Templates Manager in a new tab"
                                  >
                                    <Plus className="h-3 w-3" /> New Template
                                  </Button>
                                </div>

                                {/* Editable preview of selected template's rows */}
                                {advanceDialog.remaining_template_id && Array.isArray(advanceDialog.editable_template_rows) && advanceDialog.editable_template_rows.length > 0 && (
                                  <div className="rounded-md border bg-white p-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[11px] font-semibold text-gray-700">Template Rows (edit before applying)</span>
                                      <span className="text-[10px] text-gray-500">
                                        Sum: {advanceDialog.editable_template_rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0).toFixed(2)}%
                                      </span>
                                    </div>
                                    <div className="max-h-44 overflow-y-auto">
                                      <table className="w-full text-[11px]">
                                        <thead className="bg-gray-50 border-b text-gray-500">
                                          <tr>
                                            <th className="px-1.5 py-1 text-left">#</th>
                                            <th className="px-1.5 py-1 text-left">Stage Name</th>
                                            <th className="px-1.5 py-1 text-right w-16">%</th>
                                            <th className="px-1.5 py-1 w-6"></th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {advanceDialog.editable_template_rows.map((r, i) => (
                                            <tr key={i}>
                                              <td className="px-1.5 py-1 text-gray-400">{i + 1}</td>
                                              <td className="px-1 py-0.5">
                                                <Input
                                                  value={r.stage_name || ''}
                                                  onChange={(e) => {
                                                    const rows = [...advanceDialog.editable_template_rows];
                                                    rows[i] = { ...rows[i], stage_name: e.target.value };
                                                    setAdvanceDialog(s => ({ ...s, editable_template_rows: rows }));
                                                  }}
                                                  className="h-6 text-[11px] px-1.5"
                                                />
                                              </td>
                                              <td className="px-1 py-0.5">
                                                <Input
                                                  type="number"
                                                  step="0.01"
                                                  min="0"
                                                  value={r.percentage ?? ''}
                                                  onChange={(e) => {
                                                    const rows = [...advanceDialog.editable_template_rows];
                                                    rows[i] = { ...rows[i], percentage: e.target.value };
                                                    setAdvanceDialog(s => ({ ...s, editable_template_rows: rows }));
                                                  }}
                                                  className="h-6 text-[11px] px-1.5 text-right"
                                                />
                                              </td>
                                              <td className="text-center">
                                                <button
                                                  type="button"
                                                  className="text-red-500 hover:text-red-700"
                                                  onClick={() => {
                                                    const rows = advanceDialog.editable_template_rows.filter((_, k) => k !== i);
                                                    setAdvanceDialog(s => ({ ...s, editable_template_rows: rows }));
                                                  }}
                                                  title="Remove row"
                                                >×</button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="mt-1 h-6 text-[11px] text-indigo-600 hover:bg-indigo-50"
                                      onClick={() => {
                                        const rows = [...(advanceDialog.editable_template_rows || []), { stage_name: '', percentage: '', notes: '' }];
                                        setAdvanceDialog(s => ({ ...s, editable_template_rows: rows }));
                                      }}
                                    >
                                      + Add Row
                                    </Button>
                                  </div>
                                )}

                                <p className="text-[10px] text-gray-500">
                                  Edits made here apply to <em>this</em> save only. To save changes back to the template, use{' '}
                                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => navigate('/payment-schedule-templates')}>Payment Templates</button>.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAdvanceDialog((s) => ({ ...s, open: false }))}>Cancel</Button>
                    <Button
                      data-testid="adv-dialog-save-btn"
                      disabled={advanceDialog.submitting || !(parseFloat(advanceDialog.percentage) > 0)}
                      onClick={async () => {
                        const pct = parseFloat(advanceDialog.percentage);
                        if (!isFinite(pct) || pct <= 0 || pct > 100) {
                          toast.error('Enter a valid % between 0 and 100');
                          return;
                        }
                        setAdvanceDialog((s) => ({ ...s, submitting: true }));
                        try {
                          if (advanceDialog.editing_stage_id) {
                            // EDIT existing real advance stage
                            await axios.patch(`${API}/payment-stages/${advanceDialog.editing_stage_id}`, {
                              stage_name: (advanceDialog.stage_name || 'Stage 01 Payment').trim() || 'Stage 01 Payment',
                              percentage: pct,
                              ...(advanceDialog.expected_payment_date ? { due_date: advanceDialog.expected_payment_date } : {}),
                            });
                            toast.success('Advance stage updated');
                          } else {
                            // CREATE from the virtual auto-collected row
                            const editedRows = Array.isArray(advanceDialog.editable_template_rows) && advanceDialog.editable_template_rows.length > 0
                              ? advanceDialog.editable_template_rows
                                  .filter(r => (r.stage_name || '').trim())
                                  .map(r => ({ stage_name: r.stage_name.trim(), percentage: Number(r.percentage) || 0, notes: r.notes || '' }))
                              : null;
                            const res = await axios.post(`${API}/projects/${projectId}/materialize-advance-stage`, {
                              percentage: pct,
                              stage_name: (advanceDialog.stage_name || 'Stage 01 Payment').trim() || 'Stage 01 Payment',
                              expected_payment_date: advanceDialog.expected_payment_date || null,
                              generate_remaining_schedule: !!advanceDialog.generate_remaining,
                              remaining_template_id: (advanceDialog.remaining_template_id && advanceDialog.remaining_template_id !== '') ? advanceDialog.remaining_template_id : null,
                              remaining_template_rows_override: editedRows,
                            });
                            const extras = (res.data?.generated_remaining_stages || []).length;
                            toast.success(extras ? `Stage 01 saved + ${extras} milestone rows scheduled` : 'Advance stage created');
                          }
                          setAdvanceDialog({ open: false, editing_stage_id: null, income_amount: 0, stage_name: 'Stage 01 Payment', percentage: '', expected_payment_date: '', generate_remaining: true, remaining_template_id: '', submitting: false });
                          fetchData(false);
                        } catch (e) {
                          toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to save advance');
                          setAdvanceDialog((s) => ({ ...s, submitting: false }));
                        }
                      }}
                    >
                      {advanceDialog.submitting ? 'Saving…' : (advanceDialog.editing_stage_id ? 'Save Changes' : 'Save & Generate Req')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Month/Year filter — filters by expected_payment_date */}
              {(() => {
                // Build set of YYYY-MM values present in payment_stages
                const monthSet = new Set();
                (payment_stages || []).forEach(s => {
                  if (s.expected_payment_date) {
                    monthSet.add((s.expected_payment_date || '').slice(0, 7));
                  }
                });
                const months = Array.from(monthSet).sort();
                if (months.length === 0) return null;
                const fmtMonth = (ym) => {
                  if (!ym) return '';
                  const [y, m] = ym.split('-');
                  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
                };
                return (
                  <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="payment-schedule-month-filter">
                    <span className="text-[11px] uppercase font-semibold tracking-wide text-gray-500">Filter by month:</span>
                    <button
                      onClick={() => setPsMonthFilter('')}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        !psMonthFilter ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                      data-testid="ps-month-all"
                    >
                      All
                    </button>
                    {months.map(m => (
                      <button
                        key={m}
                        onClick={() => setPsMonthFilter(m)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          psMonthFilter === m ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                        data-testid={`ps-month-${m}`}
                      >
                        {fmtMonth(m)}
                      </button>
                    ))}
                  </div>
                );
              })()}

              <SortableList
                items={(payment_stages || []).filter(s => s && s.stage_id).map(s => s.stage_id)}
                onReorder={handlePaymentScheduleReorder}
              >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {canManage && !psMonthFilter && <th className="px-2 py-3 w-8"></th>}
                      {canManage && (
                        <th className="px-3 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                            checked={payment_stages.length > 0 && selectedPaymentIds.length === payment_stages.length}
                            onChange={toggleAllPayment}
                            data-testid="select-all-payment"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">%</th>
                      {user?.role !== 'project_manager' && (
                        <>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Received</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(() => {
                      // ---- AUTO-INJECT Advance row from income ----
                      // If no advance payment_stage exists yet, but the project has
                      // received income, surface the FIRST income entry as a virtual
                      // "Advance Collection" row at the top of the schedule. This way
                      // the user always sees their advance as the first row even before
                      // the formal payment_stages are entered.
                      const stages = (payment_stages || []);
                      // A row is treated as an EXPLICIT advance only if it has actually
                      // received money or is linked to an income record. Template-seeded
                      // rows merely *named* "Advance ..." should NOT suppress the virtual
                      // "Auto-collected (Sales)" row.
                      const hasExplicitAdvance = stages.some(s =>
                        (s.is_advance === true && (Number(s.amount_received) || 0) > 0)
                        || (s.linked_income_id && s.linked_income_id !== '' && s.linked_income_id !== null)
                      );
                      const totalValueForRow = summary?.scope_total || projectData?.project?.total_value || 0;
                      const earliestIncome = (projectIncomeEntries || []).slice().sort((a, b) => {
                        const da = new Date(a.received_date || a.created_at || 0).getTime();
                        const db = new Date(b.received_date || b.created_at || 0).getTime();
                        return da - db;
                      })[0];
                      const virtualAdvance = (!hasExplicitAdvance && earliestIncome) ? {
                        stage_id: '__virtual_advance__',
                        stage_name: 'Auto-collected (Sales)',
                        stage_label: 'ADV',
                        amount: earliestIncome.amount || 0,
                        percentage: totalValueForRow > 0 ? Math.round((earliestIncome.amount / totalValueForRow) * 10000) / 100 : 0,
                        amount_received: earliestIncome.amount || 0,
                        expected_payment_date: earliestIncome.received_date || earliestIncome.created_at,
                        actual_payment_date: earliestIncome.received_date || earliestIncome.created_at,
                        workflow_status: 'paid',
                        status: earliestIncome.status || 'received',
                        is_advance: true,
                        _virtual: true,
                        _source_label: 'Auto-added from collected income',
                      } : null;
                      const stagesWithAdvance = virtualAdvance ? [virtualAdvance, ...stages] : stages;
                      const filteredStages = psMonthFilter
                        ? stagesWithAdvance.filter(s => (s.expected_payment_date || '').slice(0, 7) === psMonthFilter)
                        : stagesWithAdvance;
                      if (filteredStages.length === 0) {
                        return (
                          <tr>
                            <td colSpan={(canManage ? 10 : 8) + (canManage && !psMonthFilter ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                              {psMonthFilter ? 'No payments scheduled for this month.' : 'No payment stages defined yet. Click "Add Payments" to define milestones.'}
                            </td>
                          </tr>
                        );
                      }
                      return filteredStages.map((stage, index) => {
                        const balance = stage.amount - (stage.amount_received || 0);
                        const isPaid = balance <= 0;
                        const isRequested = stage.workflow_status === 'requested' || stage.workflow_status === 'pending_collection';
                        const isPartial = stage.amount_received > 0 && balance > 0;
                        const isCRERejected = stage.workflow_status === 'cre_rejected' || (!!stage.cre_rejection_reason && stage.workflow_status !== 'requested' && stage.workflow_status !== 'collected');
                        const isAccRejected = !!stage.accountant_rejection_reason && stage.workflow_status === 'requested' && (stage.amount_received || 0) === 0;

                        // Determine status badge
                        let statusBadge;
                        if (isCRERejected) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300 whitespace-nowrap">🔴 CRE Rejected</span>;
                        } else if (isAccRejected) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300 whitespace-nowrap">🔴 Accountant Rejected</span>;
                        } else if (isPaid) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Collected</span>;
                        } else if (isPartial) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Partially Collected</span>;
                        } else if (isRequested) {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Requested</span>;
                        } else {
                          statusBadge = <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Pending</span>;
                        }
                        
                        const isVirtual = stage._virtual || stage.stage_id === '__virtual_advance__';
                        const canDrag = canManage && !psMonthFilter && !isVirtual;
                        return (
                          <React.Fragment key={stage.stage_id}>
                          <SortableTableRow
                            id={stage.stage_id}
                            className={`hover:bg-gray-50 ${isPaid ? 'bg-green-50' : ''} ${selectedPaymentIds.includes(stage.stage_id) ? 'bg-blue-50' : ''}`}
                          >
                            {({ listeners, attributes }) => (
                              <>
                            {canManage && !psMonthFilter && (
                              <td className="px-2 py-3 text-center">
                                {canDrag ? <DragHandle listeners={listeners} attributes={attributes} /> : null}
                              </td>
                            )}
                            {canManage && (
                              <td className="px-3 py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 h-4 w-4 cursor-pointer"
                                  checked={selectedPaymentIds.includes(stage.stage_id)}
                                  onChange={() => togglePaymentSelect(stage.stage_id)}
                                  data-testid={`select-payment-${stage.stage_id}`}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{stage.stage_name}</p>
                              {stage.due_date && (
                                <p className="text-xs text-gray-500">Due: {new Date(stage.due_date).toLocaleDateString('en-IN')}</p>
                              )}
                              {stage.expected_payment_date && (
                                <p className="text-[11px] text-amber-600 mt-0.5">
                                  📅 Expected: {new Date(stage.expected_payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                              )}
                              {/* "Set Advance %" CTA — appears only on the virtual auto-collected row.
                                  Opens a popup so Planning can enter the agreed advance % from the
                                  Rough Estimate and convert this row into a real Stage 01. */}
                              {isVirtual && canManage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 h-7 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50"
                                  data-testid="set-advance-pct-btn"
                                  onClick={() => setAdvanceDialog({
                                    open: true,
                                    editing_stage_id: null,
                                    income_amount: stage.amount_received || 0,
                                    stage_name: 'Stage 01 Payment',
                                    percentage: '',
                                    expected_payment_date: '',
                                    generate_remaining: true,
                                    submitting: false,
                                  })}
                                >
                                  + Set Advance % from RE
                                </Button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isVirtual && canManage ? (
                                <InlineEditRate
                                  initial={stage.percentage}
                                  onSave={async (newPct) => {
                                    try {
                                      await axios.post(`${API}/projects/${projectId}/materialize-advance-stage`, { percentage: newPct });
                                      toast.success(`Rate set to ${newPct}%`);
                                      fetchData(false);
                                    } catch (e) {
                                      toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to update rate');
                                    }
                                  }}
                                />
                              ) : (canManage && stage.is_advance) ? (
                                <div className="flex items-center justify-end gap-1">
                                  <InlineEditRate
                                    initial={stage.percentage}
                                    onSave={async (newPct) => {
                                      try {
                                        await axios.patch(`${API}/payment-stages/${stage.stage_id}`, { percentage: newPct });
                                        toast.success(`Rate set to ${newPct}%`);
                                        fetchData(false);
                                      } catch (e) {
                                        toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to update rate');
                                      }
                                    }}
                                  />
                                  {(() => {
                                    // Drift check: stored amount vs. % × Total Project Value (summary.project_value).
                                    // Must use the same base as the Advance card / dialog so the math reconciles.
                                    const totalValProj = Number(summary?.project_value || projectData?.project?.total_value || 0);
                                    const expectedAmt = Math.round((totalValProj * (stage.percentage || 0)) / 100);
                                    const drift = Math.abs((stage.amount || 0) - expectedAmt);
                                    if (totalValProj > 0 && drift > 100) {
                                      return (
                                        <button
                                          type="button"
                                          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition"
                                          title={`Recompute amount from %: ${stage.percentage}% × ₹${totalValProj.toLocaleString()} = ₹${expectedAmt.toLocaleString()}`}
                                          data-testid={`recompute-amt-${stage.stage_id}`}
                                          onClick={async () => {
                                            try {
                                              await axios.patch(`${API}/payment-stages/${stage.stage_id}`, { percentage: stage.percentage });
                                              toast.success(`Recomputed: ₹${expectedAmt.toLocaleString()}`);
                                              fetchData(false);
                                            } catch (e) {
                                              toast.error('Failed to recompute');
                                            }
                                          }}
                                        >
                                          ↻ Fix
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              ) : (
                                <span>{stage.percentage}%</span>
                              )}
                            </td>
                            {user?.role !== 'project_manager' && (
                              <>
                                <td className="px-4 py-3 text-right font-semibold">
                                  {isVirtual && canManage ? (
                                    <InlineEditRate
                                      mode="amount"
                                      initial={stage.amount}
                                      onSave={async (newAmt) => {
                                        try {
                                          await axios.post(`${API}/projects/${projectId}/materialize-advance-stage`, { amount: newAmt });
                                          toast.success(`Amount set to ₹${newAmt.toLocaleString()}`);
                                          fetchData(false);
                                        } catch (e) {
                                          toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to update amount');
                                        }
                                      }}
                                    />
                                  ) : (canManage && stage.is_advance) ? (
                                    <InlineEditRate
                                      mode="amount"
                                      initial={stage.amount}
                                      onSave={async (newAmt) => {
                                        try {
                                          await axios.patch(`${API}/payment-stages/${stage.stage_id}`, { amount: newAmt });
                                          toast.success(`Amount set to ₹${newAmt.toLocaleString()}`);
                                          fetchData(false);
                                        } catch (e) {
                                          toast.error(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Failed to update amount');
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span>₹{stage.amount?.toLocaleString()}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-green-600 font-semibold">₹{(stage.amount_received || 0).toLocaleString()}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                                    ₹{balance.toLocaleString()}
                                  </span>
                                </td>
                              </>
                            )}
                            <td className="px-4 py-3 text-center">
                              {statusBadge}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Request Payment - for partial stages always, or pending stages not yet requested */}
                                {canManage && balance > 0 && !isPaid && (isPartial || (!isRequested)) && (
                                  <Button
                                    data-testid={`req-payment-${stage.stage_id}`}
                                    variant="outline"
                                    size="sm"
                                    className="text-amber-600 border-blue-300 hover:bg-amber-50"
                                    onClick={() => setReqPayDialog({ open: true, stage, date: '', submitting: false })}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    Req Payment
                                  </Button>
                                )}
                                {/* Edit Advance button — opens the same "Set Advance %" popup
                                    pre-filled with the current stage's name and percentage so
                                    Planning can adjust without deleting/recreating the row. */}
                                {canManage && stage.is_advance && !isVirtual && (
                                  <Button
                                    data-testid={`edit-advance-${stage.stage_id}`}
                                    variant="ghost"
                                    size="icon"
                                    title="Edit advance stage name / %"
                                    onClick={() => setAdvanceDialog({
                                      open: true,
                                      editing_stage_id: stage.stage_id,
                                      income_amount: stage.amount_received || 0,
                                      stage_name: stage.stage_name || 'Stage 01 Payment',
                                      percentage: String(stage.percentage ?? ''),
                                      expected_payment_date: stage.expected_payment_date || stage.due_date || '',
                                      generate_remaining: false,
                                      submitting: false,
                                    })}
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                  </Button>
                                )}
                                {/* Edit button - only for stages with no collection yet */}
                                {canManage && !isPaid && !isPartial && !stage.is_advance && (
                                  <Button
                                    data-testid={`edit-payment-${stage.stage_id}`}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditPaymentDialog(stage)}
                                    title="Edit payment stage"
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                  </Button>
                                )}
                                {/* Delete button - only for stages with no collection yet */}
                                {canManage && !isPaid && !isPartial && (
                                  <Button 
                                    data-testid={`delete-payment-${stage.stage_id}`}
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeletePayment(stage.stage_id)}
                                    title="Delete payment stage"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                                {/* Done badge */}
                                {isPaid && (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                )}
                              </div>
                            </td>
                              </>
                            )}
                          </SortableTableRow>
                          {(isCRERejected || isAccRejected) && (
                            <tr className="bg-red-50/50" data-testid={`reject-detail-row-${stage.stage_id}`}>
                              <td colSpan={99} className="px-4 py-1.5 border-t border-red-200">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <p className="text-xs text-red-800 flex-1 min-w-[260px] truncate">
                                    <span className="font-bold">{isCRERejected ? '🔴 Rejected by CRE:' : '🔴 Rejected by Accountant:'}</span>{' '}
                                    <span className="font-medium">
                                      {(isCRERejected ? stage.cre_rejection_reason : stage.accountant_rejection_reason) || 'No reason given'}
                                    </span>
                                    <span className="text-[11px] text-red-600 italic ml-2">
                                      — by {(isCRERejected ? stage.cre_rejected_by_name : stage.accountant_rejected_by_name) || 'Unknown'}
                                      {(isCRERejected ? stage.cre_rejected_at : stage.accountant_rejected_at) && (
                                        <> on {new Date(isCRERejected ? stage.cre_rejected_at : stage.accountant_rejected_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                                      )}
                                    </span>
                                  </p>
                                  {canManage && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700 shrink-0"
                                      data-testid={`planning-resubmit-${stage.stage_id}`}
                                      onClick={() => setPsResubmitDialog({
                                        open: true,
                                        stage,
                                        mode: isCRERejected ? 'cre' : 'accountant',
                                        amount: String(stage.amount || ''),
                                        remarks: '',
                                        submitting: false,
                                      })}
                                    >
                                      <RefreshCw className="h-3 w-3 mr-1" /> Edit & Resubmit
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                  {payment_stages.length > 0 && (
                    <tfoot className="bg-green-50 border-t-2">
                      <tr>
                        <td colSpan={canManage && !psMonthFilter ? 4 : 3} className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">
                          {payment_stages.reduce((s, p) => s + (parseFloat(p.percentage) || 0), 0).toFixed(2)}%
                        </td>
                        {user?.role !== 'project_manager' && (
                          <>
                            <td className="px-4 py-3 text-right font-bold">₹{(summary.payment_schedule_total || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-600">₹{(summary.payment_received || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold text-red-600">₹{((summary.payment_schedule_total || 0) - (summary.payment_received || 0)).toLocaleString()}</td>
                          </>
                        )}
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              </SortableList>
            </TabsContent>

            {/* ==================== ADDITIONS TAB ==================== */}
            <TabsContent value="additions" className="p-6">
              {renderFeTopSection('additions')}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Additional Work</h3>
                  <p className="text-sm text-gray-500">Track extra work and variations</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Dialog open={bulkAdditionDialog} onOpenChange={setBulkAdditionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-addition-btn" className="gap-2 bg-secondary hover:bg-secondary/90">
                          <Plus className="h-4 w-4" />Add Additions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Additional Work</DialogTitle>
                          <DialogDescription>Enter Name, Qty and Amount for each row.</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Name *</th>
                                <th className="px-2 py-2 text-left w-24">Qty</th>
                                <th className="px-2 py-2 text-right w-32">Amount (₹) *</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkAdditionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input
                                      value={row.item_name}
                                      onChange={(e) => { const r = [...bulkAdditionRows]; r[idx].item_name = e.target.value; setBulkAdditionRows(r); }}
                                      placeholder="e.g., Underground sump"
                                      className="h-8"
                                      data-testid={`addition-item-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput
                                      value={row.quantity}
                                      onChange={(e) => { const r = [...bulkAdditionRows]; r[idx].quantity = e.target.value; setBulkAdditionRows(r); }}
                                      className="h-8"
                                      data-testid={`addition-qty-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput
                                      value={row.amount}
                                      onChange={(e) => { const r = [...bulkAdditionRows]; r[idx].amount = e.target.value; setBulkAdditionRows(r); }}
                                      className="h-8 text-right font-semibold"
                                      placeholder="0"
                                      data-testid={`addition-amount-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {bulkAdditionRows.length > 1 && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setBulkAdditionRows(bulkAdditionRows.filter((_, i) => i !== idx))}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-emerald-50 border-t-2">
                              <tr>
                                <td colSpan={3} className="px-2 py-2 text-right font-bold">Grand Total:</td>
                                <td className="px-2 py-2 text-right font-bold text-emerald-700" data-testid="addition-grand-total">
                                  ₹{bulkAdditionRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString()}
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkAdditionRows([...bulkAdditionRows, ...createEmptyRows('addition', 6)])}>
                            + Add 6 Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkAdditionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddAddition}>Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-1 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Work Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Income</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {additional_costs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                          No additions recorded yet. Click "Add Additions" for extra work.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={additional_costs.map(c => c.cost_id)}
                        onReorder={handleAdditionalCostReorder}
                      >
                      {additional_costs.map((cost, index) => {
                        const balance = cost.estimated_amount - (cost.income_received || 0);
                        const isEditing = editingAddition === cost.cost_id;
                        
                        return (
                          <SortableTableRow key={cost.cost_id} id={cost.cost_id} className="hover:bg-gray-50">
                            {({ listeners, attributes }) => (
                              <>
                            <td className="px-1 py-3 text-center"><DragHandle listeners={listeners} attributes={attributes} /></td>
                            <td className="px-4 py-3 text-sm">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{cost.description}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{cost.estimated_amount?.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <NumericInput
                                  
                                  className="w-28 text-right"
                                  defaultValue={cost.income_received}
                                  onBlur={(e) => handleUpdateAddition(cost.cost_id, { income_received: parseFloat(e.target.value) || 0 })}
                                  autoFocus
                                />
                              ) : (
                                <span className="text-green-600">₹{(cost.income_received || 0).toLocaleString()}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <WorkflowBadge status={cost.workflow_status || 'draft'} />
                            </td>
                            {canManage && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {balance > 0 && !cost.payment_requested && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 border-green-500 text-green-700 hover:bg-green-50 text-xs"
                                      onClick={() => setReqPayDialog({
                                        open: true,
                                        // Reuse the same dialog — `mode: 'addition'` tells the submit
                                        // handler to call the additional-costs endpoint instead of payment-stages
                                        mode: 'addition',
                                        stage: { stage_id: cost.cost_id, stage_name: cost.description || cost.name || 'Additional Work', amount: balance, amount_received: 0 },
                                        date: '',
                                        submitting: false,
                                      })}
                                      data-testid={`req-payment-addition-${cost.cost_id}`}
                                    >
                                      <Send className="h-3 w-3" /> Req Payment
                                    </Button>
                                  )}
                                  {cost.payment_requested && balance > 0 && !cost.client_approved && !cost.client_rejected && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">Awaiting Client</span>
                                  )}
                                  {cost.client_rejected && balance > 0 && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium" title={cost.client_rejection_reason || ''}>
                                      Client Rejected
                                    </span>
                                  )}
                                  {cost.client_approved && !cost.cre_approved && balance > 0 && (
                                    <>
                                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">Client Approved</span>
                                      {(user?.role === 'cre' || user?.role === 'super_admin') && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 gap-1 border-blue-500 text-blue-700 hover:bg-blue-50 text-xs"
                                          onClick={() => handleCREApproveAddition(cost.cost_id)}
                                          data-testid={`cre-approve-addition-${cost.cost_id}`}
                                        >
                                          <CheckCircle2 className="h-3 w-3" /> CRE Approve
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  {cost.cre_approved && balance > 0 && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Approved · With Accountant</span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditItemDialog('addition', cost)}
                                    data-testid={`edit-addition-${cost.cost_id}`}
                                    title="Edit name / qty / amount"
                                  >
                                    <Edit className="h-4 w-4 text-amber-600" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(cost.cost_id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </td>
                            )}
                              </>
                            )}
                          </SortableTableRow>
                        );
                      })}
                      </SortableList>
                    )}
                  </tbody>
                  {additional_costs.length > 0 && (
                    <tfoot className="bg-cyan-50 border-t-2">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-right font-bold">Totals:</td>
                        <td className="px-4 py-3 text-right font-bold">₹{summary.additions_total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">₹{summary.additions_received?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">₹{(summary.additions_total - summary.additions_received)?.toLocaleString()}</td>
                        <td colSpan={canManage ? 2 : 1}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== DEDUCTIONS TAB ==================== */}
            <TabsContent value="deductions" className="p-6">
              {renderFeTopSection('deductions')}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold">Deductions</h3>
                  <p className="text-sm text-gray-500">Track penalties, discounts, and adjustments</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <Dialog open={bulkDeductionDialog} onOpenChange={setBulkDeductionDialog}>
                      <DialogTrigger asChild>
                        <Button data-testid="add-deduction-btn" className="gap-2 bg-orange-600 hover:bg-orange-700">
                          <MinusCircle className="h-4 w-4" />Add Deductions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Add Deductions</DialogTitle>
                          <DialogDescription>Enter Name, Qty and Amount for each row.</DialogDescription>
                        </DialogHeader>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Name *</th>
                                <th className="px-2 py-2 text-left w-24">Qty</th>
                                <th className="px-2 py-2 text-right w-32">Amount (₹) *</th>
                                <th className="px-2 py-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bulkDeductionRows.map((row, idx) => (
                                <tr key={idx} className="border-b">
                                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                  <td className="px-2 py-1">
                                    <Input
                                      value={row.item_name}
                                      onChange={(e) => { const r = [...bulkDeductionRows]; r[idx].item_name = e.target.value; setBulkDeductionRows(r); }}
                                      placeholder="e.g., Penalty"
                                      className="h-8"
                                      data-testid={`deduction-item-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput
                                      value={row.quantity}
                                      onChange={(e) => { const r = [...bulkDeductionRows]; r[idx].quantity = e.target.value; setBulkDeductionRows(r); }}
                                      className="h-8"
                                      data-testid={`deduction-qty-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1">
                                    <NumericInput
                                      value={row.amount}
                                      onChange={(e) => { const r = [...bulkDeductionRows]; r[idx].amount = e.target.value; setBulkDeductionRows(r); }}
                                      className="h-8 text-right font-semibold"
                                      placeholder="0"
                                      data-testid={`deduction-amount-${idx}`}
                                    />
                                  </td>
                                  <td className="px-2 py-1 text-center">
                                    {bulkDeductionRows.length > 1 && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setBulkDeductionRows(bulkDeductionRows.filter((_, i) => i !== idx))}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-red-50 border-t-2">
                              <tr>
                                <td colSpan={3} className="px-2 py-2 text-right font-bold">Grand Deduction:</td>
                                <td className="px-2 py-2 text-right font-bold text-red-700" data-testid="deduction-grand-total">
                                  ₹{bulkDeductionRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0).toLocaleString()}
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="outline" onClick={() => setBulkDeductionRows([...bulkDeductionRows, ...createEmptyRows('deduction', 6)])}>
                            + Add 6 Rows
                          </Button>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setBulkDeductionDialog(false)}>Cancel</Button>
                            <Button onClick={handleBulkAddDeduction} className="bg-orange-600 hover:bg-orange-700">Submit All</Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-1 py-3 w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">S.No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                      {canManage && <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deductions.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                          No deductions recorded yet. Click "Add Deductions" for penalties or adjustments.
                        </td>
                      </tr>
                    ) : (
                      <SortableList
                        items={deductions.map(d => d.deduction_id)}
                        onReorder={handleDeductionReorder}
                      >
                      {deductions.map((d, index) => (
                        <SortableTableRow key={d.deduction_id} id={d.deduction_id} className="hover:bg-gray-50">
                          {({ listeners, attributes }) => (
                            <>
                          <td className="px-1 py-3 text-center"><DragHandle listeners={listeners} attributes={attributes} /></td>
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 font-medium">{d.description}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-600">-₹{d.amount?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <WorkflowBadge status={d.workflow_status || 'draft'} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{d.remarks || '-'}</td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditItemDialog('deduction', d)} data-testid={`edit-deduction-${d.deduction_id}`} title="Edit name / qty / amount">
                                  <Edit className="h-4 w-4 text-amber-600" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteDeduction(d.deduction_id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          )}
                            </>
                          )}
                        </SortableTableRow>
                      ))}
                      </SortableList>
                    )}
                  </tbody>
                  {deductions.length > 0 && (
                    <tfoot className="bg-orange-50 border-t-2">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-right font-bold">Total Deductions:</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-700">-₹{summary.deductions_total?.toLocaleString()}</td>
                        <td colSpan={canManage ? 3 : 2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* ==================== PAYMENT SUMMARY TAB ==================== */}
            <TabsContent value="payment-summary" className="p-3 sm:p-6">
              {user?.role === 'planning_person' ? (
                /* Planning Person doesn't see the Cashflow Engine (project-finance internals).
                   They land directly on the Cheques sub-view instead. */
                <ChequeListView scope="project" projectId={projectId} userRole={user?.role} />
              ) : (
                <Tabs defaultValue="cashflow" className="w-full">
                  <TabsList className="mb-4" data-testid="payment-summary-subtabs">
                    <TabsTrigger value="cashflow" data-testid="ps-subtab-cashflow"><Wallet className="h-4 w-4 mr-1.5" />Cashflow Engine</TabsTrigger>
                    <TabsTrigger value="cheques" data-testid="ps-subtab-cheques"><CreditCard className="h-4 w-4 mr-1.5" />Cheques</TabsTrigger>
                  </TabsList>
                  <TabsContent value="cashflow">
                    <ProjectCashflowTab projectId={projectId} isAdmin={['super_admin'].includes(user?.role)} />
                  </TabsContent>
                  <TabsContent value="cheques">
                    {projectId && <ChequeListView scope="project" projectId={projectId} userRole={user?.role} />}
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>



            {/* ==================== TEAM TAB ==================== */}
            <TabsContent value="team" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-600" />Project Team
                  </h3>
                  {(user?.role === 'super_admin' || user?.role === 'project_manager' || user?.role === 'planning') && (
                    <Button size="sm" onClick={openTeamEditDialog} className="bg-indigo-600 hover:bg-indigo-700" data-testid="edit-team-btn">
                      <Edit className="h-3.5 w-3.5 mr-1" />Edit Team
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEAM_ROLES.map(role => {
                    const member = teamData[role.key];
                    const bgMap = { purple: 'bg-purple-50 border-purple-200', indigo: 'bg-indigo-50 border-indigo-200', amber: 'bg-amber-50 border-amber-200', green: 'bg-green-50 border-green-200', blue: 'bg-blue-50 border-blue-200', rose: 'bg-rose-50 border-rose-200', orange: 'bg-orange-50 border-orange-200' };
                    const avatarMap = { purple: 'bg-purple-600', indigo: 'bg-indigo-600', amber: 'bg-amber-600', green: 'bg-green-600', blue: 'bg-blue-600', rose: 'bg-rose-600', orange: 'bg-orange-600' };
                    return (
                      <div key={role.key} className={`p-3 rounded-lg border ${member ? bgMap[role.color] : 'bg-gray-50 border-gray-200 border-dashed'}`} data-testid={`team-role-${role.key}`}>
                        <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">{role.label}</p>
                        {member ? (
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-full ${avatarMap[role.color]} text-white flex items-center justify-center text-sm font-bold shrink-0`}>
                              {member.name?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{member.name}</p>
                              <p className="text-xs text-gray-500 truncate">{member.phone || member.email || '-'}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Not assigned</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Edit Dialog */}
              <Dialog open={teamEditDialog} onOpenChange={setTeamEditDialog}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Assign Team Members</DialogTitle><DialogDescription>Select a person for each role from the dropdown</DialogDescription></DialogHeader>
                  <div className="py-3 space-y-4">
                    {TEAM_ROLES.map(role => {
                      const users = teamRoleUsers[role.key] || [];
                      const dotMap = { purple: 'bg-purple-500', indigo: 'bg-indigo-500', amber: 'bg-amber-500', green: 'bg-green-500', blue: 'bg-blue-500', rose: 'bg-rose-500', orange: 'bg-orange-500' };
                      return (
                        <div key={role.key}>
                          <Label className="text-sm font-medium flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${dotMap[role.color]}`} />{role.label}
                          </Label>
                          <Select value={teamDraft[role.key] || ''} onValueChange={v => setTeamDraft(prev => ({ ...prev, [role.key]: v }))}>
                            <SelectTrigger className="mt-1" data-testid={`team-select-${role.key}`}>
                              <SelectValue placeholder={`Select ${role.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">-- None --</SelectItem>
                              {users.map(u => (
                                <SelectItem key={u.user_id} value={u.user_id}>{u.name}{u.phone ? ` (${u.phone})` : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTeamEditDialog(false)}>Cancel</Button>
                    <Button onClick={handleTeamSave} disabled={teamSaving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="confirm-team-assign">
                      {teamSaving ? 'Saving...' : 'Save Team'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* ==================== MATERIALS TAB ==================== */}
            <TabsContent value="materials" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Package className="h-5 w-5 text-orange-600" />Materials in Project
                  </h3>
                </div>

                {/* Sub-tabs */}
                <Tabs value={materialSubTab} onValueChange={setMaterialSubTab}>
                  <TabsList className="grid grid-cols-5 w-full">
                    <TabsTrigger value="materials" data-testid="subtab-materials">Materials</TabsTrigger>
                    <TabsTrigger value="vendors" data-testid="subtab-vendors">Vendors</TabsTrigger>
                    <TabsTrigger value="orders" data-testid="subtab-orders">Orders</TabsTrigger>
                    <TabsTrigger value="payments" data-testid="subtab-payments">Payments</TabsTrigger>
                    <TabsTrigger value="inventory" data-testid="subtab-inventory">Inventory</TabsTrigger>
                  </TabsList>

                  {/* MATERIALS SUB-TAB */}
                  <TabsContent value="materials" className="mt-4">
                    {/* === Materials List === */}
                    <div className="border rounded-lg p-4 mb-4" data-testid="pkg-materials-section">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h4 className="text-sm font-bold flex items-center gap-2">
                          <Package className="h-4 w-4 text-amber-600" />
                          Materials List
                        </h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Package Dropdown */}
                          <Select value={selectedMatPackage || '__none__'} onValueChange={v => handleLoadPackageMaterials(v === '__none__' ? '' : v)}>
                            <SelectTrigger className="h-8 w-44 text-xs" data-testid="mat-package-select"><SelectValue placeholder="Select Package" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">-- Select Package --</SelectItem>
                              {allPackages.map(pkg => <SelectItem key={pkg.package_id} value={pkg.package_id}>{pkg.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {!editingMaterials ? (
                            <Button size="sm" variant="outline" onClick={() => { setEditingMaterials(true); if (projMaterialNames.length === 0) axios.get(`${API}/material-names`).then(r => setProjMaterialNames(r.data || [])).catch(() => {}); }} data-testid="edit-materials-btn">
                              <Edit className="h-3 w-3 mr-1" />Edit
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={addProjectMaterial} data-testid="add-project-material">
                                <Plus className="h-3 w-3 mr-1" />Add
                              </Button>
                              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveMaterials} data-testid="save-project-materials">
                                <Save className="h-3 w-3 mr-1" />Save
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {!projectMaterialsLoaded ? (
                        <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
                      ) : projectMaterials.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No materials. Select a package or click "Edit" then "Add" to start.</p>
                      ) : !editingMaterials ? (
                        /* ---- READ-ONLY VIEW ---- */
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm" data-testid="materials-readonly-table">
                            <thead className="bg-gray-50 border-y">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material Name</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {projectMaterials.map((m, idx) => (
                                <tr key={idx} className="hover:bg-gray-50" data-testid={`proj-mat-view-${idx}`}>
                                  <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                                  <td className="px-3 py-2.5 font-medium">{m.name || '-'}</td>
                                  <td className="px-3 py-2.5">{m.brand ? <Badge variant="outline" className="text-xs">{m.brand}</Badge> : <span className="text-gray-400">-</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                          <div className="space-y-3 mt-2">
                            {projectMaterials.map((m, idx) => (
                              <div key={idx} className="border border-dashed rounded-lg p-3 space-y-2" data-testid={`proj-mat-row-${idx}`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-gray-400 w-6 shrink-0">#{idx + 1}</span>
                                  {/* Material Name Dropdown */}
                                  <div className="flex-1">
                                    {projAddingMatFor === idx ? (
                                      <div className="flex items-center gap-1">
                                        <Input placeholder="New material name..." value={projNewMatName} onChange={e => setProjNewMatName(e.target.value)} className="h-9 text-sm flex-1" data-testid={`proj-new-mat-input-${idx}`} onKeyDown={e => { if (e.key === 'Enter') handleProjCreateMaterial(idx); }} autoFocus />
                                        <Button size="sm" className="h-9 px-2 bg-green-600 hover:bg-green-700" onClick={() => handleProjCreateMaterial(idx)}><Check className="h-3.5 w-3.5" /></Button>
                                        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setProjAddingMatFor(null)}><X className="h-3.5 w-3.5" /></Button>
                                      </div>
                                    ) : (
                                      <Select value={m.name || '__pick__'} onValueChange={v => { if (v === '__create__') { setProjAddingMatFor(idx); setProjNewMatName(''); } else if (v !== '__pick__') { updateProjectMaterial(idx, 'name', v); } }}>
                                        <SelectTrigger className="h-9" data-testid={`proj-mat-name-${idx}`}><SelectValue placeholder="Select Material" /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__pick__" disabled>Select Material</SelectItem>
                                          {projMaterialNames.map(mn => <SelectItem key={mn.material_name_id} value={mn.name}>{mn.name}</SelectItem>)}
                                          <SelectItem value="__create__" className="text-blue-600 font-medium">+ Create New Material</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                  {/* Brand Dropdown */}
                                  <div className="flex-1">
                                    {projAddingBrandFor === idx ? (
                                      <div className="flex items-center gap-1">
                                        <Input placeholder="New brand name..." value={projNewBrandName} onChange={e => setProjNewBrandName(e.target.value)} className="h-9 text-sm flex-1" data-testid={`proj-new-brand-input-${idx}`} onKeyDown={e => { if (e.key === 'Enter') handleProjCreateBrand(idx); }} autoFocus />
                                        <Button size="sm" className="h-9 px-2 bg-green-600 hover:bg-green-700" onClick={() => handleProjCreateBrand(idx)}><Check className="h-3.5 w-3.5" /></Button>
                                        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setProjAddingBrandFor(null)}><X className="h-3.5 w-3.5" /></Button>
                                      </div>
                                    ) : (
                                      <Select value={m.brand || '__pick__'} onValueChange={v => { if (v === '__create__') { setProjAddingBrandFor(idx); setProjNewBrandName(''); } else if (v !== '__pick__') { updateProjectMaterial(idx, 'brand', v); } }} disabled={!m.name}>
                                        <SelectTrigger className="h-9" data-testid={`proj-mat-brand-${idx}`}><SelectValue placeholder={m.name ? 'Select Brand' : 'Pick material first'} /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__pick__" disabled>Select Brand</SelectItem>
                                          {(projBrandsByMat[m.name] || []).map(b => <SelectItem key={b.brand_id} value={b.name}>{b.name}</SelectItem>)}
                                          <SelectItem value="__create__" className="text-blue-600 font-medium">+ Create New Brand</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-400 hover:text-red-600 shrink-0" onClick={() => removeProjectMaterial(idx)} data-testid={`proj-mat-delete-${idx}`}><X className="h-4 w-4" /></Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    {/* Material Requests Table (existing) */}
                    {(materialsData?.materials || []).length > 0 ? (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm" data-testid="materials-table">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Stage</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                              {!isPM && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(materialsData?.materials || []).map(m => (
                              <tr key={m.request_id} className="hover:bg-gray-50" data-testid={`mat-row-${m.request_id}`}>
                                <td className="px-3 py-2.5">
                                  <p className="font-medium">{m.material_name}</p>
                                  {m.remarks && <p className="text-xs text-gray-400 truncate max-w-[200px]">{m.remarks}</p>}
                                </td>
                                <td className="px-3 py-2.5 text-center">{m.quantity} {m.unit || ''}</td>
                                <td className="px-3 py-2.5 text-center text-xs">{m.stage || '-'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    m.status === 'requested' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                    ['delivered','received','received_partial'].includes(m.status) ? 'border-green-300 text-green-700 bg-green-50' :
                                    ['accounts_approved','payment_approved'].includes(m.status) ? 'border-blue-300 text-blue-700 bg-blue-50' :
                                    'border-gray-300'
                                  }`}>{(m.status || '').replace(/_/g, ' ')}</Badge>
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                  {m.vendor_name || m.assigned_vendor_name || '-'}
                                  {m.po_id && <Badge variant="secondary" className="ml-1 text-[9px] bg-blue-50 text-blue-600">PO</Badge>}
                                  {m.auto_po_generated && !m.vendor_name && m.assigned_vendor_name && <Badge variant="secondary" className="ml-1 text-[9px] bg-green-50 text-green-600">Auto</Badge>}
                                </td>
                                <td className="px-3 py-2.5 text-xs">{m.site_engineer_name || '-'}</td>
                                {!isPM && <td className="px-3 py-2.5 text-right font-medium">{m.total_amount ? formatCurrency(m.total_amount) : '-'}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No material requests for this project</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* VENDORS SUB-TAB */}
                  <TabsContent value="vendors" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">{vendorAssignments.length} vendor assignments</p>
                      {['super_admin','planning','procurement'].includes(user?.role) && (
                        <Button size="sm" data-testid="assign-vendor-btn" onClick={() => setAssignVendorDialog(true)}>
                          <Plus className="h-4 w-4 mr-1" /> Assign Vendor
                        </Button>
                      )}
                    </div>
                    {vendorAssignments.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm" data-testid="vendor-assignments-table">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {vendorAssignments.map(a => (
                              <tr key={a.assignment_id || a.category} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{a.category}</td>
                                <td className="px-3 py-2.5">{a.vendor_name}</td>
                                <td className="px-3 py-2.5">{a.brand || '-'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {['super_admin','planning','procurement'].includes(user?.role) && (
                                    <Button variant="ghost" size="sm" className="text-red-500 h-7" onClick={() => handleRemoveAssignment(a.category)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No vendors assigned to this project yet</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* ORDERS STATUS SUB-TAB */}
                  <TabsContent value="orders" className="mt-4">
                    {purchaseOrders.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">PO ID</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {purchaseOrders.map(po => (
                              <tr key={po.po_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-mono text-xs">
                                  {po.po_id}
                                  {po.auto_generated && <Badge variant="secondary" className="ml-1 text-[9px] bg-blue-50 text-blue-600">Auto</Badge>}
                                </td>
                                <td className="px-3 py-2.5">{po.vendor_name || '-'}</td>
                                <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(po.total_amount || 0)}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    po.status === 'delivered' ? 'border-green-300 text-green-700 bg-green-50' :
                                    po.status === 'approved' ? 'border-blue-300 text-blue-700 bg-blue-50' :
                                    po.status === 'cancelled' ? 'border-red-300 text-red-700 bg-red-50' :
                                    'border-amber-300 text-amber-700 bg-amber-50'
                                  }`}>{po.status}</Badge>
                                </td>
                                <td className="px-3 py-2.5 text-xs">{po.created_at?.split('T')[0]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No purchase orders for this project</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* PAYMENT STATUS SUB-TAB */}
                  <TabsContent value="payments" className="mt-4">
                    {purchaseOrders.length > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
                            <p className="text-xl font-bold text-blue-700">{formatCurrency(purchaseOrders.reduce((s, po) => s + (po.total_amount || 0), 0))}</p>
                            <p className="text-xs text-gray-500">Total Order Value</p>
                          </div>
                          <div className="rounded-lg p-3 text-center border bg-green-50 border-green-200">
                            <p className="text-xl font-bold text-green-700">{formatCurrency(purchaseOrders.reduce((s, po) => s + (po.paid_amount || 0), 0))}</p>
                            <p className="text-xs text-gray-500">Paid</p>
                          </div>
                          <div className="rounded-lg p-3 text-center border bg-red-50 border-red-200">
                            <p className="text-xl font-bold text-red-700">{formatCurrency(purchaseOrders.reduce((s, po) => s + ((po.total_amount || 0) - (po.paid_amount || 0)), 0))}</p>
                            <p className="text-xs text-gray-500">Pending</p>
                          </div>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Order Amount</th>
                                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
                                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Payment Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {purchaseOrders.map(po => (
                                <tr key={po.po_id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2.5 font-medium">{po.vendor_name || '-'}</td>
                                  <td className="px-3 py-2.5 text-right">{formatCurrency(po.total_amount || 0)}</td>
                                  <td className="px-3 py-2.5 text-right text-green-600">{formatCurrency(po.paid_amount || 0)}</td>
                                  <td className="px-3 py-2.5 text-right text-red-600">{formatCurrency((po.total_amount || 0) - (po.paid_amount || 0))}</td>
                                  <td className="px-3 py-2.5 text-center">
                                    <Badge variant="outline" className={`text-xs capitalize ${
                                      po.payment_status === 'paid' ? 'border-green-300 text-green-700 bg-green-50' :
                                      po.payment_status === 'partial' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                      'border-red-300 text-red-700 bg-red-50'
                                    }`}>{po.payment_status || 'unpaid'}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No payment data for this project</p>
                      </div>
                    )}
                  </TabsContent>
                  {/* INVENTORY SUB-TAB */}
                  <TabsContent value="inventory" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">Daily Opening & Closing Stock</p>
                      {['super_admin','planning','site_engineer'].includes(user?.role) && (
                        <Button size="sm" data-testid="add-inventory-btn" onClick={() => {
                          setInvForm({ material_name: '', unit: '', date: new Date().toISOString().split('T')[0], opening_stock: 0, received: 0, used: 0, notes: '' });
                          setShowInventoryForm(true);
                        }}>
                          <Plus className="h-4 w-4 mr-1" /> Stock Entry
                        </Button>
                      )}
                    </div>

                    {/* Current Stock Dashboard */}
                    {invDashboard && invDashboard.materials?.length > 0 && (
                      <div className="mb-4" data-testid="inv-dashboard-pd">
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-amber-600 font-medium">Materials</p>
                            <p className="text-lg font-bold text-amber-800">{invDashboard.total_materials}</p>
                          </div>
                          <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-green-600 font-medium">In Stock</p>
                            <p className="text-lg font-bold text-green-800">{(invDashboard.total_materials || 0) - (invDashboard.low_stock_count || 0)}</p>
                          </div>
                          <div className={`border rounded-lg p-2.5 text-center ${invDashboard.low_stock_count > 0 ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                            <p className={`text-[10px] font-medium ${invDashboard.low_stock_count > 0 ? 'text-red-600' : 'text-gray-500'}`}>Low Stock</p>
                            <p className={`text-lg font-bold ${invDashboard.low_stock_count > 0 ? 'text-red-700' : 'text-gray-400'}`}>{invDashboard.low_stock_count}</p>
                          </div>
                        </div>

                        <div className="border rounded-lg overflow-hidden mb-4" data-testid="inv-current-stock">
                          <div className="bg-gray-800 text-white px-3 py-2 text-xs font-semibold">Current Stock Levels</div>
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-600">Material</th>
                                <th className="px-2 py-2 text-center font-medium text-gray-600">Unit</th>
                                <th className="px-2 py-2 text-center font-medium text-blue-700">Current Stock</th>
                                <th className="px-2 py-2 text-center font-medium text-green-700">Total Received</th>
                                <th className="px-2 py-2 text-center font-medium text-red-700">Total Used</th>
                                <th className="px-2 py-2 text-center font-medium text-amber-700">Threshold</th>
                                <th className="px-2 py-2 text-center font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {invDashboard.materials.map((m, i) => (
                                <tr key={m.material_name} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${m.is_low_stock ? 'bg-red-50' : ''}`}>
                                  <td className="px-3 py-2 font-medium">{m.material_name}</td>
                                  <td className="px-2 py-2 text-center text-gray-500">{m.unit}</td>
                                  <td className={`px-2 py-2 text-center font-bold ${m.is_low_stock ? 'text-red-700' : 'text-blue-700'}`}>{m.current_stock}</td>
                                  <td className="px-2 py-2 text-center text-green-700">{m.total_received}</td>
                                  <td className="px-2 py-2 text-center text-red-600">{m.total_used}</td>
                                  <td className="px-2 py-2 text-center text-amber-700">{m.min_threshold || '-'}</td>
                                  <td className="px-2 py-2 text-center">
                                    {m.is_low_stock ? (
                                      <Badge className="bg-red-100 text-red-700 text-[10px]">LOW</Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-700 text-[10px]">OK</Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* History table */}
                    <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Entry History</h4>
                    {materialInventory.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Opening</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Received</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Used</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Closing</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {materialInventory.map(inv => (
                              <tr key={inv.inventory_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{inv.date}</td>
                                <td className="px-3 py-2.5">{inv.material_name} {inv.unit && <span className="text-gray-400">({inv.unit})</span>}</td>
                                <td className="px-3 py-2.5 text-center">{inv.opening_stock}</td>
                                <td className="px-3 py-2.5 text-center text-green-600">+{inv.received}</td>
                                <td className="px-3 py-2.5 text-center text-red-600">-{inv.used}</td>
                                <td className="px-3 py-2.5 text-center font-bold">{inv.closing_stock}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-500">{inv.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="text-center py-8 text-gray-400"><Package className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No inventory entries</p></div>}
                  </TabsContent>
                </Tabs>

                {/* Inventory Entry Dialog */}
                <Dialog open={showInventoryForm} onOpenChange={setShowInventoryForm}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Stock Entry</DialogTitle>
                      <DialogDescription>Record daily opening and closing stock.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Material Name *</Label>
                        <Input data-testid="inv-material" value={invForm.material_name} onChange={e => setInvForm({ ...invForm, material_name: e.target.value })} placeholder="e.g. Cement" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Unit</Label><Input value={invForm.unit} onChange={e => setInvForm({ ...invForm, unit: e.target.value })} placeholder="e.g. bags" /></div>
                        <div><Label>Date</Label><Input type="date" value={invForm.date} onChange={e => setInvForm({ ...invForm, date: e.target.value })} /></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div><Label>Opening Stock</Label><Input type="number" value={invForm.opening_stock} onChange={e => setInvForm({ ...invForm, opening_stock: parseFloat(e.target.value) || 0 })} /></div>
                        <div><Label>Received</Label><Input type="number" value={invForm.received} onChange={e => setInvForm({ ...invForm, received: parseFloat(e.target.value) || 0 })} /></div>
                        <div><Label>Used</Label><Input type="number" value={invForm.used} onChange={e => setInvForm({ ...invForm, used: parseFloat(e.target.value) || 0 })} /></div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Closing Stock</p>
                        <p className="text-2xl font-bold">{invForm.opening_stock + invForm.received - invForm.used}</p>
                      </div>
                      <div><Label>Notes</Label><Input value={invForm.notes} onChange={e => setInvForm({ ...invForm, notes: e.target.value })} /></div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowInventoryForm(false)}>Cancel</Button>
                        <Button data-testid="save-inventory-btn" onClick={handleSubmitInventory}>Save</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Assign Vendor Dialog */}
                <Dialog open={assignVendorDialog} onOpenChange={setAssignVendorDialog}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Assign Vendor to Project</DialogTitle>
                      <DialogDescription>Select a category, vendor, and optional brand.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Material Category *</Label>
                        <Select value={assignForm.category} onValueChange={v => setAssignForm({ ...assignForm, category: v })}>
                          <SelectTrigger data-testid="assign-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {vendorCategories.map(c => (
                              <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Vendor *</Label>
                        <Select value={assignForm.vendor_id} onValueChange={v => {
                          setAssignForm({ ...assignForm, vendor_id: v, brand: '' });
                        }}>
                          <SelectTrigger data-testid="assign-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                          <SelectContent>
                            {allVendors.filter(v => !assignForm.category || v.vendor_type === assignForm.category || v.brands?.some(b => b.category === assignForm.category))
                              .map(v => <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>)}
                            {allVendors.filter(v => !assignForm.category || v.vendor_type === assignForm.category || v.brands?.some(b => b.category === assignForm.category)).length === 0 && (
                              allVendors.map(v => <SelectItem key={v.vendor_id} value={v.vendor_id}>{v.name}</SelectItem>)
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {assignForm.vendor_id && (() => {
                        const vendor = allVendors.find(v => v.vendor_id === assignForm.vendor_id);
                        const brands = vendor?.brands?.find(b => b.category === assignForm.category)?.brand_names || [];
                        return brands.length > 0 ? (
                          <div>
                            <Label>Brand</Label>
                            <Select value={assignForm.brand} onValueChange={v => setAssignForm({ ...assignForm, brand: v })}>
                              <SelectTrigger data-testid="assign-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                              <SelectContent>
                                {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null;
                      })()}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setAssignVendorDialog(false)}>Cancel</Button>
                        <Button data-testid="confirm-assign-btn" onClick={handleAssignVendor}>Assign</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </TabsContent>


            {/* ==================== WORK ORDERS TAB ==================== */}
            {/* Hidden: Work Orders top-level tab is removed, but the Dialogs inside (Create WO, Freeze) are still wired
                via openWoDialog() from inside the Labours sub-tab. Keep this hidden so Dialog (which uses a Portal)
                stays mounted and can open from anywhere. */}
            <div className="hidden">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-violet-600" />Work Orders ({workOrders.length})
                  </h3>
                  {(user?.role === 'super_admin' || user?.role === 'planning' || user?.role === 'planning_person' || user?.role === 'project_manager' || user?.role === 'cre') && (
                    <Button size="sm" onClick={() => openWoDialog()} className="bg-violet-600 hover:bg-violet-700" data-testid="create-wo-btn">
                      <Plus className="h-3.5 w-3.5 mr-1" />Create Work Order
                    </Button>
                  )}
                </div>

                {workOrders.length === 0 ? (
                  <p className="text-gray-400 text-center py-8 text-sm" data-testid="wo-empty">No work orders yet.</p>
                ) : woViewId ? (
                  /* ---- DETAIL VIEW ---- */
                  (() => {
                    const wo = workOrders.find(w => w.work_order_id === woViewId);
                    if (!wo) return null;
                    return (
                      <div data-testid="wo-detail-view">
                        <Button variant="ghost" size="sm" onClick={() => setWoViewId(null)} className="mb-3"><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to List</Button>
                        <div className="border rounded-lg overflow-hidden">
                          <div className={`p-4 border-b flex items-center justify-between ${wo.status === 'frozen' ? 'bg-red-50' : wo.reassigned_from ? 'bg-emerald-50' : 'bg-violet-50'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm">{wo.contractor_name}</p>
                                <Badge variant="outline" className="text-[10px] bg-white">{wo.contractor_type}</Badge>
                                {wo.status === 'frozen' && <Badge className="bg-red-600 text-white text-[10px]">Frozen</Badge>}
                                {wo.reassigned_from && <Badge className="bg-emerald-600 text-white text-[10px]">Reassigned from {wo.reassigned_contractor || wo.reassigned_from}</Badge>}
                              </div>
                              {wo.paid_amount > 0 && <p className="text-[11px] text-green-700 font-medium mt-1">Paid: {formatCurrency(wo.paid_amount)}</p>}
                              {wo.frozen_reason && <p className="text-xs text-red-600 mt-1">Reason: {wo.frozen_reason}</p>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {/* Big highlighted Total Contract Amount */}
                              <div className="text-right rounded-lg bg-white border-2 border-violet-300 px-3 py-1.5 shadow-sm" data-testid="wo-total-contract">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-600">Total Contract</p>
                                <p className="text-xl sm:text-2xl font-extrabold text-violet-800 leading-tight">{formatCurrency(wo.total_value)}</p>
                              </div>
                              <div className="flex gap-1">
                              {wo.status !== 'frozen' && ['planning', 'super_admin'].includes(user?.role) && (
                                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => startFreeze(wo.work_order_id)} data-testid="wo-freeze-btn">
                                  <Lock className="h-3 w-3 mr-1" />Freeze
                                </Button>
                              )}
                              {wo.status !== 'frozen' && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => openWoDialog(wo)} data-testid="wo-edit-btn"><Edit className="h-3 w-3 mr-1" />Edit</Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleDeleteWo(wo)} data-testid="wo-delete-btn"><Trash2 className="h-3 w-3" /></Button>
                                </>
                              )}
                              </div>
                            </div>
                          </div>
                          <Tabs defaultValue="scope" className="w-full">
                            <TabsList className="w-full rounded-none border-b bg-white">
                              <TabsTrigger value="scope" className="flex-1 text-xs">Scope ({wo.scope_items?.length || 0})</TabsTrigger>
                              <TabsTrigger value="stages" className="flex-1 text-xs">Stages ({wo.stages?.length || 0})</TabsTrigger>
                              <TabsTrigger value="additional" className="flex-1 text-xs">Additional ({wo.additional_work?.length || 0})</TabsTrigger>
                              <TabsTrigger value="dlr" className="flex-1 text-xs" data-testid="wo-dlr-tab">DLR</TabsTrigger>
                            </TabsList>
                            <TabsContent value="scope" className="p-3">
                              {wo.scope_items?.length > 0 ? (
                                <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead>
                                <tbody className="divide-y">{(wo.scope_items || []).map((s, i) => (<tr key={i}><td className="px-3 py-2 text-xs text-gray-400">{i+1}</td><td className="px-3 py-2 font-medium">{s.name}</td><td className="px-3 py-2">{s.unit}</td><td className="px-3 py-2 text-right">{s.quantity}</td><td className="px-3 py-2 text-right">{formatCurrency(s.unit_rate)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(s.total)}</td></tr>))}</tbody>
                                <tfoot className="border-t"><tr><td colSpan="5" className="px-3 py-2 text-right font-bold text-xs">Scope Total:</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(wo.scope_total)}</td></tr></tfoot></table>
                              ) : <p className="text-gray-400 text-center py-4 text-sm">No scope items</p>}
                            </TabsContent>
                            <TabsContent value="stages" className="p-3">
                              {wo.stages?.length > 0 ? (
                                <div className="space-y-2">
                                  {wo.stages.map((st, i) => {
                                    const cfg = getStageStatusConfig(st.status, st.is_open);
                                    const showApprove = canApproveStage(st);
                                    const isExpanded = expandedWoStages[st.stage_id];
                                    const isStageOpen = st.is_open === true;
                                    return (
                                      <div key={st.stage_id || i} className={`border rounded-lg overflow-hidden ${!isStageOpen && st.status === 'pending' ? 'opacity-70' : ''}`} data-testid={`wo-stage-${st.stage_id}`}>
                                        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition"
                                          onClick={() => setExpandedWoStages(prev => ({ ...prev, [st.stage_id]: !prev[st.stage_id] }))}
                                          data-testid={`wo-stage-toggle-${st.stage_id}`}>
                                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                            <span className="font-medium text-sm">{i+1}. {st.name}</span>
                                            <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>{cfg.label}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{st.type === 'percentage' ? `${st.value}%` : 'Fixed'}</Badge>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-sm font-medium text-gray-600">{formatCurrency(st.amount)}</span>
                                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                          </div>
                                        </div>
                                        {isExpanded && (
                                          <div className="border-t bg-gray-50/50 p-3 space-y-3">
                                            <div className="flex flex-wrap gap-3 text-xs">
                                              <span className="text-gray-500">Amount: <strong>{formatCurrency(st.amount)}</strong></span>
                                              {st.approved_amount > 0 && <span className="text-green-600">Paid: <strong>{formatCurrency(st.approved_amount)}</strong></span>}
                                            </div>
                                            {st.status !== 'pending' && (
                                              <div className="flex flex-wrap gap-1">
                                                {st.requested_at && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">SE Requested</span>}
                                                {st.pm_approved_at && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">PM OK</span>}
                                                {st.planning_approved_at && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">Planning OK</span>}
                                                {st.accountant_approved_at && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">Paid</span>}
                                                {st.rejection_reason && <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{st.rejection_reason}</span>}
                                              </div>
                                            )}
                                            {isStageOpen && st.opened_by_name && (
                                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">Opened by {st.opened_by_name}</span>
                                            )}
                                            <div className="flex gap-1 flex-wrap pt-1">
                                              {/* Planning: Open Stage button for locked stages */}
                                              {st.status === 'pending' && !isStageOpen && ['planning', 'super_admin'].includes(user?.role) && (
                                                <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" data-testid={`wo-stage-open-${st.stage_id}`}
                                                  onClick={(e) => { e.stopPropagation(); handleOpenStage(wo.work_order_id, st.stage_id); }}>
                                                  Open Stage
                                                </Button>
                                              )}
                                              {showApprove && (
                                                <>
                                                  {user?.role === 'accountant' ? (
                                                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" data-testid={`wo-stage-approve-${st.stage_id}`}
                                                      onClick={(e) => { e.stopPropagation(); handleWoStageApprove(wo.work_order_id, st.stage_id, 'approve', { approved_amount: st.amount }); }}>
                                                      Process Payment
                                                    </Button>
                                                  ) : (
                                                    <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" data-testid={`wo-stage-approve-${st.stage_id}`}
                                                      onClick={(e) => { e.stopPropagation(); handleWoStageApprove(wo.work_order_id, st.stage_id, 'approve'); }}>
                                                      Approve
                                                    </Button>
                                                  )}
                                                  <Button size="sm" variant="destructive" className="h-7 text-xs" data-testid={`wo-stage-reject-${st.stage_id}`}
                                                    onClick={(e) => { e.stopPropagation(); handleWoStageApprove(wo.work_order_id, st.stage_id, 'reject', { notes: 'Rejected' }); }}>
                                                    Reject
                                                  </Button>
                                                </>
                                              )}
                                              {/* SE: Request Payment only if stage is opened by Planning */}
                                              {st.status === 'pending' && isStageOpen && ['site_engineer', 'sr_site_engineer'].includes(user?.role) && (
                                                <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" data-testid={`wo-stage-request-${st.stage_id}`}
                                                  onClick={(e) => { e.stopPropagation(); handleWoStageRequestPayment(wo.work_order_id, st.stage_id); }}>
                                                  Request Payment
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {/* Total summary */}
                                  <div className="flex justify-between items-center px-3 pt-2 border-t">
                                    <span className="text-xs font-bold text-gray-500">Stage Total</span>
                                    <span className="text-sm font-bold">{formatCurrency(wo.stages.reduce((sum, s) => sum + (s.amount || 0), 0))}</span>
                                  </div>
                                </div>
                              ) : <p className="text-gray-400 text-center py-4 text-sm">No stages</p>}
                            </TabsContent>
                            <TabsContent value="additional" className="p-3">
                              {wo.additional_work?.length > 0 ? (
                                <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead>
                                <tbody className="divide-y">{(wo.additional_work || []).map((a, i) => (<tr key={i}><td className="px-3 py-2 text-xs text-gray-400">{i+1}</td><td className="px-3 py-2 font-medium">{a.description}</td><td className="px-3 py-2">{a.unit}</td><td className="px-3 py-2 text-right">{a.quantity}</td><td className="px-3 py-2 text-right">{formatCurrency(a.unit_rate)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(a.total)}</td></tr>))}</tbody>
                                <tfoot className="border-t"><tr><td colSpan="5" className="px-3 py-2 text-right font-bold text-xs">Additional Total:</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(wo.additional_total)}</td></tr></tfoot></table>
                              ) : <p className="text-gray-400 text-center py-4 text-sm">No additional work</p>}
                            </TabsContent>
                            <TabsContent value="dlr" className="p-3">
                              <DLRPanel
                                projectId={projectId}
                                workOrderId={wo.work_order_id}
                                labourRates={wo.labour_rates}
                                canRecord={['site_engineer', 'sr_site_engineer', 'super_admin'].includes(user?.role)}
                              />
                            </TabsContent>
                          </Tabs>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* ---- LIST VIEW ---- */
                  <div className="space-y-3" data-testid="wo-list">
                    {workOrders.map(wo => {
                      const paidStages = (wo.stages || []).filter(s => s.status === 'approved').length;
                      const totalStages = (wo.stages || []).length;
                      const pendingRequests = (wo.stages || []).filter(s => ['requested','pm_approved','planning_approved'].includes(s.status)).length;
                      return (
                      <div key={wo.work_order_id} className={`border rounded-lg p-4 hover:border-violet-300 cursor-pointer transition ${wo.status === 'frozen' ? 'border-red-200 bg-red-50/30 opacity-75' : wo.reassigned_from ? 'border-emerald-300 bg-emerald-50/30' : ''}`} onClick={() => setWoViewId(wo.work_order_id)} data-testid={`wo-card-${wo.work_order_id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="font-semibold text-sm">{wo.contractor_name}</h4>
                              <Badge variant="outline" className="text-[10px]">{wo.contractor_type}</Badge>
                              {wo.paid_amount > 0 && <Badge className="bg-green-100 text-green-700 text-[10px]">Paid: {formatCurrency(wo.paid_amount)}</Badge>}
                              {pendingRequests > 0 && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{pendingRequests} pending approval</Badge>}
                              {wo.status === 'frozen' && <Badge className="bg-red-600 text-white text-[10px]"><Snowflake className="h-2.5 w-2.5 mr-0.5" />Frozen</Badge>}
                              {wo.reassigned_from && <Badge className="bg-emerald-600 text-white text-[10px]">Reassigned</Badge>}
                            </div>
                            <div className="flex gap-4 text-xs text-gray-500">
                              <span>{wo.scope_items?.length || 0} scope items</span>
                              <span>{paidStages}/{totalStages} stages paid</span>
                              <span>{wo.additional_work?.length || 0} additional</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                            <div className="text-right rounded-lg bg-violet-50 border-2 border-violet-300 px-3 py-1.5 shadow-sm">
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-600">Total Contract</p>
                              <p className="text-lg sm:text-xl font-extrabold text-violet-800 leading-tight">{formatCurrency(wo.total_value)}</p>
                            </div>
                            <div className="flex gap-1">
                            {wo.status !== 'frozen' && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openWoDialog(wo)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteWo(wo)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            {wo.status === 'frozen' && <Lock className="h-4 w-4 text-red-400" />}
                            </div>
                          </div>
                        </div>
                      </div>);
                    })}
                  </div>
                )}
              </div>

              {/* Work Order Create/Edit Dialog */}
              <Dialog open={woDialog} onOpenChange={setWoDialog}>
                <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingWo ? 'Edit Work Order' : 'Create New Work Order'}</DialogTitle>
                    <DialogDescription>Select a contractor and define scope, additions, deductions, and payment stages.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {/* Contractor Selection — searchable dropdowns.
                        Contractor list is filtered by the selected type so picking
                        "Civil contractor" only shows civil contractors, etc. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Contractor Type</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between font-normal h-9 mt-1"
                              data-testid="wo-type-select"
                            >
                              <span className="truncate text-left">
                                {woSelectedType || <span className="text-gray-400">All Types</span>}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search type…" className="h-9" />
                              <CommandEmpty>No type found.</CommandEmpty>
                              <CommandList className="max-h-64">
                                <CommandItem
                                  value="all-types"
                                  onSelect={() => { setWoSelectedType(''); setWoForm(f => ({ ...f, contractor_id: '' })); }}
                                  data-testid="wo-type-option-all"
                                >
                                  <Check className={`mr-2 h-4 w-4 ${!woSelectedType ? 'opacity-100' : 'opacity-0'}`} />
                                  All Types
                                </CommandItem>
                                {contractorTypes.map(t => {
                                  // Endpoint returns either string[] (legacy) or [{ type_id, name }] (new)
                                  const name = typeof t === 'string' ? t : (t?.name || '');
                                  const id = typeof t === 'string' ? t : (t?.type_id || name);
                                  if (!name) return null;
                                  return (
                                    <CommandItem
                                      key={id}
                                      value={name}
                                      onSelect={() => { setWoSelectedType(name); setWoForm(f => ({ ...f, contractor_id: '' })); }}
                                      data-testid={`wo-type-option-${name.replace(/\s+/g, '-').toLowerCase()}`}
                                    >
                                      <Check className={`mr-2 h-4 w-4 ${woSelectedType === name ? 'opacity-100' : 'opacity-0'}`} />
                                      {name}
                                    </CommandItem>
                                  );
                                })}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label className="text-xs">Contractor <span className="text-red-500">*</span></Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between font-normal h-9 mt-1"
                              data-testid="wo-contractor-select"
                            >
                              <span className="truncate text-left">
                                {(() => {
                                  const sel = filteredWoContractors.find(c => c.contractor_id === woForm.contractor_id)
                                          || allContractors.find(c => c.contractor_id === woForm.contractor_id);
                                  return sel
                                    ? sel.name
                                    : <span className="text-gray-400">{woSelectedType ? `Select ${woSelectedType}…` : 'Select Contractor'}</span>;
                                })()}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search contractor…" className="h-9" />
                              <CommandEmpty>
                                {woSelectedType
                                  ? `No ${woSelectedType} contractors yet.`
                                  : 'No contractor found.'}
                              </CommandEmpty>
                              <CommandList className="max-h-72">
                                {filteredWoContractors.map(c => {
                                  const types = c.work_types || (c.contractor_type ? [c.contractor_type] : []);
                                  return (
                                    <CommandItem
                                      key={c.contractor_id}
                                      value={`${c.name} ${types.join(' ')}`}
                                      onSelect={() => {
                                        // Auto-fetch labour day rates from the contractor profile —
                                        // user can still edit them on this WO without affecting
                                        // the master record (only contractor_id is persisted).
                                        const rates = {
                                          skilled: Number(c.daily_rate_skilled) || 0,
                                          semi_skilled: Number(c.daily_rate_semi_skilled) || 0,
                                          unskilled: Number(c.daily_rate_unskilled) || 0,
                                        };
                                        setWoForm(f => ({
                                          ...f,
                                          contractor_id: c.contractor_id,
                                          // Only auto-fill rates when the user hasn't typed
                                          // a value yet, OR when this is a fresh dialog.
                                          labour_rates: (
                                            (f.labour_rates?.skilled || 0) === 0 &&
                                            (f.labour_rates?.semi_skilled || 0) === 0 &&
                                            (f.labour_rates?.unskilled || 0) === 0
                                          ) ? rates : f.labour_rates,
                                        }));
                                      }}
                                      data-testid={`wo-contractor-option-${c.contractor_id}`}
                                    >
                                      <Check className={`mr-2 h-4 w-4 ${woForm.contractor_id === c.contractor_id ? 'opacity-100' : 'opacity-0'}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="truncate">{c.name}</div>
                                        {types.length > 0 && (
                                          <div className="text-[10px] text-gray-500 truncate">{types.join(', ')}</div>
                                        )}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div><Label className="text-xs">Notes</Label><Textarea value={woForm.notes} onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))} placeholder="Work order notes..." rows={2} data-testid="wo-notes" /></div>

                    {/* Labour Rates */}
                    <div className="border rounded-lg p-3 bg-teal-50/30">
                      <Label className="text-xs font-semibold text-teal-700 mb-2 block">Labour Day Rates (INR) - Used for DLR</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-[11px] text-gray-500">Skilled</Label>
                          <Input type="number" min="0" placeholder="e.g. 800" value={woForm.labour_rates?.skilled || ''} onChange={e => setWoForm(f => ({ ...f, labour_rates: { ...f.labour_rates, skilled: Number(e.target.value) || 0 } }))} className="h-8 text-xs mt-0.5" data-testid="wo-rate-skilled" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-500">Semi-Skilled</Label>
                          <Input type="number" min="0" placeholder="e.g. 600" value={woForm.labour_rates?.semi_skilled || ''} onChange={e => setWoForm(f => ({ ...f, labour_rates: { ...f.labour_rates, semi_skilled: Number(e.target.value) || 0 } }))} className="h-8 text-xs mt-0.5" data-testid="wo-rate-semi-skilled" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-500">Unskilled</Label>
                          <Input type="number" min="0" placeholder="e.g. 400" value={woForm.labour_rates?.unskilled || ''} onChange={e => setWoForm(f => ({ ...f, labour_rates: { ...f.labour_rates, unskilled: Number(e.target.value) || 0 } }))} className="h-8 text-xs mt-0.5" data-testid="wo-rate-unskilled" />
                        </div>
                      </div>
                    </div>

                    {/* ===== TOP-LEVEL TABS: Work Order vs Payment Stages ===== */}
                    <Tabs value={woMainTab} onValueChange={setWoMainTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-2" data-testid="wo-main-tabs">
                        <TabsTrigger value="work_order" data-testid="wo-main-tab-work">Work Order</TabsTrigger>
                        <TabsTrigger value="payment_stages" data-testid="wo-main-tab-stages">Payment Stages ({woForm.stages.length})</TabsTrigger>
                      </TabsList>

                      {/* ===== WORK ORDER (Scope / Additional / Deductions) ===== */}
                      <TabsContent value="work_order" className="mt-3 space-y-3">
                        {/* Always-visible summary card placed ABOVE the sub-tabs.
                            Shows Scope + Additional − Deductions = Grand Total. */}
                        {(() => {
                          const scopeTotal = woForm.scope_items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const addTotal = woForm.additional_work.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const dedTotal = (woForm.deductions || []).reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const grand = scopeTotal + addTotal - dedTotal;
                          return (
                            <div className="rounded-lg border-2 border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-3" data-testid="wo-summary-card">
                              <div className="flex items-end justify-between gap-3 flex-wrap">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">Work Order Total</div>
                                  <div className="grid grid-cols-3 gap-3 text-[11px]">
                                    <div><div className="text-gray-500">Scope</div><div className="font-semibold text-gray-900">{formatCurrency(scopeTotal)}</div></div>
                                    <div><div className="text-emerald-600">+ Additional</div><div className="font-semibold text-emerald-700">{formatCurrency(addTotal)}</div></div>
                                    <div><div className="text-red-600">− Deductions</div><div className="font-semibold text-red-700">{formatCurrency(dedTotal)}</div></div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-gray-500">(Scope + Additional) − Deductions</div>
                                  <div className="text-xl sm:text-2xl font-bold text-violet-800" data-testid="wo-grand-total">{formatCurrency(grand)}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <Tabs value={woSubTab} onValueChange={setWoSubTab}>
                          <TabsList className="w-full">
                            <TabsTrigger value="scope" className="flex-1 text-xs" data-testid="wo-tab-scope">Scope ({woForm.scope_items.length})</TabsTrigger>
                            <TabsTrigger value="additional" className="flex-1 text-xs" data-testid="wo-tab-additional">Additional ({woForm.additional_work.length})</TabsTrigger>
                            <TabsTrigger value="deductions" className="flex-1 text-xs" data-testid="wo-tab-deductions">Deductions ({(woForm.deductions || []).length})</TabsTrigger>
                          </TabsList>

                          {/* SCOPE ITEMS */}
                          <TabsContent value="scope" className="mt-3">
                            <div className="flex justify-end mb-2"><Button size="sm" variant="outline" onClick={() => setWoForm(f => ({ ...f, scope_items: [...f.scope_items, { name: '', unit: 'nos', quantity: 1, unit_rate: 0 }] }))} data-testid="wo-add-scope"><Plus className="h-3 w-3 mr-1" />Add Scope Item</Button></div>
                            {woForm.scope_items.length === 0 ? <p className="text-xs text-gray-400 text-center py-3">No scope items</p> : (
                              <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-gray-400 uppercase px-1"><div className="col-span-3">Name</div><div className="col-span-2">Unit</div><div className="col-span-2">Qty</div><div className="col-span-2">Rate</div><div className="col-span-2">Total</div><div className="col-span-1"></div></div>
                                {woForm.scope_items.map((item, idx) => {
                                  const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0);
                                  return (
                                  <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                                    <div className="col-span-3"><Input placeholder="Name" value={item.name} onChange={e => { const s = [...woForm.scope_items]; s[idx] = { ...s[idx], name: e.target.value }; setWoForm(f => ({ ...f, scope_items: s })); }} className="h-8 text-xs" data-testid={`wo-scope-name-${idx}`} /></div>
                                    <div className="col-span-2">
                                      <UnitCombobox value={item.unit} onChange={(v) => { const s = [...woForm.scope_items]; s[idx] = { ...s[idx], unit: v }; setWoForm(f => ({ ...f, scope_items: s })); }} units={WO_UNITS} testId={`wo-scope-unit-${idx}`} />
                                    </div>
                                    <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => { const s = [...woForm.scope_items]; s[idx] = { ...s[idx], quantity: e.target.value }; setWoForm(f => ({ ...f, scope_items: s })); }} className="h-8 text-xs" /></div>
                                    <div className="col-span-2"><Input type="number" value={item.unit_rate} onChange={e => { const s = [...woForm.scope_items]; s[idx] = { ...s[idx], unit_rate: e.target.value }; setWoForm(f => ({ ...f, scope_items: s })); }} className="h-8 text-xs" /></div>
                                    <div className="col-span-2"><span className="text-xs font-medium pl-1">{formatCurrency(total)}</span></div>
                                    <div className="col-span-1 flex justify-center"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setWoForm(f => ({ ...f, scope_items: f.scope_items.filter((_, i) => i !== idx) }))}><X className="h-3 w-3" /></Button></div>
                                  </div>);
                                })}
                              </div>
                            )}
                          </TabsContent>

                          {/* ADDITIONAL WORK */}
                          <TabsContent value="additional" className="mt-3">
                            <div className="flex justify-end mb-2"><Button size="sm" variant="outline" onClick={() => setWoForm(f => ({ ...f, additional_work: [...f.additional_work, { description: '', unit: 'nos', quantity: 1, unit_rate: 0 }] }))} data-testid="wo-add-additional"><Plus className="h-3 w-3 mr-1" />Add Item</Button></div>
                            {woForm.additional_work.length === 0 ? <p className="text-xs text-gray-400 text-center py-3">No additional work</p> : (
                              <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-gray-400 uppercase px-1"><div className="col-span-3">Description</div><div className="col-span-2">Unit</div><div className="col-span-2">Qty</div><div className="col-span-2">Rate</div><div className="col-span-2">Total</div><div className="col-span-1"></div></div>
                                {woForm.additional_work.map((item, idx) => {
                                  const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0);
                                  return (
                                  <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                                    <div className="col-span-3"><Input placeholder="Description" value={item.description} onChange={e => { const a = [...woForm.additional_work]; a[idx] = { ...a[idx], description: e.target.value }; setWoForm(f => ({ ...f, additional_work: a })); }} className="h-8 text-xs" data-testid={`wo-add-desc-${idx}`} /></div>
                                    <div className="col-span-2">
                                      <UnitCombobox value={item.unit} onChange={(v) => { const a = [...woForm.additional_work]; a[idx] = { ...a[idx], unit: v }; setWoForm(f => ({ ...f, additional_work: a })); }} units={WO_UNITS} testId={`wo-add-unit-${idx}`} />
                                    </div>
                                    <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => { const a = [...woForm.additional_work]; a[idx] = { ...a[idx], quantity: e.target.value }; setWoForm(f => ({ ...f, additional_work: a })); }} className="h-8 text-xs" /></div>
                                    <div className="col-span-2"><Input type="number" value={item.unit_rate} onChange={e => { const a = [...woForm.additional_work]; a[idx] = { ...a[idx], unit_rate: e.target.value }; setWoForm(f => ({ ...f, additional_work: a })); }} className="h-8 text-xs" /></div>
                                    <div className="col-span-2"><span className="text-xs font-medium pl-1">{formatCurrency(total)}</span></div>
                                    <div className="col-span-1 flex justify-center"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setWoForm(f => ({ ...f, additional_work: f.additional_work.filter((_, i) => i !== idx) }))}><X className="h-3 w-3" /></Button></div>
                                  </div>);
                                })}
                              </div>
                            )}
                          </TabsContent>

                          {/* DEDUCTIONS */}
                          <TabsContent value="deductions" className="mt-3">
                            <div className="flex justify-end mb-2"><Button size="sm" variant="outline" onClick={() => setWoForm(f => ({ ...f, deductions: [...(f.deductions || []), { description: '', unit: 'nos', quantity: 1, unit_rate: 0 }] }))} data-testid="wo-add-deduction"><Plus className="h-3 w-3 mr-1" />Add Deduction</Button></div>
                            {(woForm.deductions || []).length === 0 ? <p className="text-xs text-gray-400 text-center py-3">No deductions</p> : (
                              <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-gray-400 uppercase px-1"><div className="col-span-3">Description</div><div className="col-span-2">Unit</div><div className="col-span-2">Qty</div><div className="col-span-2">Rate</div><div className="col-span-2">Total</div><div className="col-span-1"></div></div>
                                {(woForm.deductions || []).map((item, idx) => {
                                  const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_rate) || 0);
                                  return (
                                  <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                                    <div className="col-span-3"><Input placeholder="Description" value={item.description} onChange={e => { const d = [...(woForm.deductions || [])]; d[idx] = { ...d[idx], description: e.target.value }; setWoForm(f => ({ ...f, deductions: d })); }} className="h-8 text-xs" data-testid={`wo-ded-desc-${idx}`} /></div>
                                    <div className="col-span-2">
                                      <UnitCombobox value={item.unit} onChange={(v) => { const d = [...(woForm.deductions || [])]; d[idx] = { ...d[idx], unit: v }; setWoForm(f => ({ ...f, deductions: d })); }} units={WO_UNITS} testId={`wo-ded-unit-${idx}`} />
                                    </div>
                                    <div className="col-span-2"><Input type="number" value={item.quantity} onChange={e => { const d = [...(woForm.deductions || [])]; d[idx] = { ...d[idx], quantity: e.target.value }; setWoForm(f => ({ ...f, deductions: d })); }} className="h-8 text-xs" /></div>
                                    <div className="col-span-2"><Input type="number" value={item.unit_rate} onChange={e => { const d = [...(woForm.deductions || [])]; d[idx] = { ...d[idx], unit_rate: e.target.value }; setWoForm(f => ({ ...f, deductions: d })); }} className="h-8 text-xs" /></div>
                                    <div className="col-span-2"><span className="text-xs font-medium pl-1 text-red-600">−{formatCurrency(total)}</span></div>
                                    <div className="col-span-1 flex justify-center"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setWoForm(f => ({ ...f, deductions: (f.deductions || []).filter((_, i) => i !== idx) }))}><X className="h-3 w-3" /></Button></div>
                                  </div>);
                                })}
                              </div>
                            )}
                          </TabsContent>

                          {/* SUMMARY tab removed — now shown as a static card above the sub-tabs. */}
                        </Tabs>
                      </TabsContent>

                      {/* ===== PAYMENT STAGES (formerly Stages tab) ===== */}
                      <TabsContent value="payment_stages" className="mt-3 space-y-3">
                        {/* Same Work Order Total card + live "Allocated vs Total" tracker so the
                            user can see immediately whether their stages add up to the WO total.
                            Rules:
                              • Each Additional row auto-becomes a fixed-amount stage (locked).
                              • Percentage stages (Stage 01, 02 …) compute on SCOPE only (not Scope+Additional). */}
                        {(() => {
                          const scopeTotal = woForm.scope_items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const addTotal = woForm.additional_work.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const dedTotal = (woForm.deductions || []).reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const grand = scopeTotal + addTotal - dedTotal;
                          // Auto stages = sum of Additional rows; User % stages compute on scope (not grand).
                          const userAllocated = (woForm.stages || []).reduce((sum, st) => sum + (st.type === 'percentage'
                            ? scopeTotal * (parseFloat(st.value) || 0) / 100
                            : (parseFloat(st.value) || 0)), 0);
                          const allocated = addTotal + userAllocated;
                          const allocatedPct = grand > 0 ? (allocated / grand * 100) : 0;
                          const remaining = grand - allocated;
                          const matches = Math.abs(remaining) < 0.5;
                          const overrun = remaining < -0.5;
                          return (
                            <div className="rounded-lg border-2 border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-3" data-testid="wo-payment-summary-card">
                              <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">Work Order Total</div>
                                  <div className="grid grid-cols-3 gap-3 text-[11px]">
                                    <div><div className="text-gray-500">Scope</div><div className="font-semibold text-gray-900">{formatCurrency(scopeTotal)}</div><div className="text-[9px] text-gray-400">% stages base</div></div>
                                    <div><div className="text-emerald-600">+ Additional</div><div className="font-semibold text-emerald-700">{formatCurrency(addTotal)}</div><div className="text-[9px] text-emerald-500">→ auto-stages</div></div>
                                    <div><div className="text-red-600">− Deductions</div><div className="font-semibold text-red-700">{formatCurrency(dedTotal)}</div></div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-gray-500">(Scope + Additional) − Deductions</div>
                                  <div className="text-xl sm:text-2xl font-bold text-violet-800">{formatCurrency(grand)}</div>
                                </div>
                              </div>
                              {/* Live allocation tracker */}
                              <div className="border-t border-violet-200 pt-2 grid grid-cols-3 gap-3 text-[11px]">
                                <div>
                                  <div className="text-gray-500">Total Allocated</div>
                                  <div className="font-semibold text-gray-900" data-testid="wo-allocated-amount">{formatCurrency(allocated)}</div>
                                  <div className="text-[10px] text-gray-400">{allocatedPct.toFixed(1)}% of total</div>
                                </div>
                                <div>
                                  <div className={overrun ? 'text-red-600' : 'text-amber-600'}>{overrun ? 'Over-allocated by' : 'Remaining'}</div>
                                  <div className={`font-semibold ${overrun ? 'text-red-700' : 'text-amber-700'}`} data-testid="wo-remaining-amount">{formatCurrency(Math.abs(remaining))}</div>
                                  <div className="text-[10px] text-gray-400">{grand > 0 ? `${(Math.abs(remaining) / grand * 100).toFixed(1)}%` : '0%'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500">Match</div>
                                  <div className={`font-semibold ${matches ? 'text-green-700' : (overrun ? 'text-red-700' : 'text-amber-700')}`} data-testid="wo-allocation-match">
                                    {matches ? '✓ Balanced' : (overrun ? '⚠ Exceeds total' : '⚠ Under-allocated')}
                                  </div>
                                  <div className="text-[10px] text-gray-400">vs. {formatCurrency(grand)}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex justify-end mb-2"><Button size="sm" variant="outline" onClick={() => setWoForm(f => ({ ...f, stages: [...f.stages, { name: '', type: 'percentage', value: 0 }] }))} data-testid="wo-add-stage"><Plus className="h-3 w-3 mr-1" />Add Payment Stage</Button></div>
                        {(() => {
                          // Auto-derive one locked stage per Additional row (display-only;
                          // saved on submit via handleSaveWo).
                          const autoAdditional = (woForm.additional_work || [])
                            .map((a, i) => ({
                              name: `Additional Cost ${i + 1}${a.description ? ` - ${a.description}` : ''}`,
                              amount: (parseFloat(a.quantity) || 0) * (parseFloat(a.unit_rate) || 0),
                            }))
                            .filter(s => s.amount > 0);
                          const _scope = woForm.scope_items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_rate) || 0), 0);
                          const hasAny = autoAdditional.length > 0 || woForm.stages.length > 0;
                          if (!hasAny) return <p className="text-xs text-gray-400 text-center py-3">No payment stages</p>;
                          return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-gray-400 uppercase px-1">
                              <div className="col-span-4">Stage Name</div>
                              <div className="col-span-2">Type</div>
                              <div className="col-span-2">Value</div>
                              <div className="col-span-3 text-right">Amount</div>
                              <div className="col-span-1"></div>
                            </div>
                            {/* User-defined stages first — % base = Scope only */}
                            {woForm.stages.map((st, idx) => {
                              const v = parseFloat(st.value) || 0;
                              const resolved = st.type === 'percentage' ? (_scope * v / 100) : v;
                              return (
                              <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                                <div className="col-span-4"><Input placeholder="Stage name" value={st.name} onChange={e => { const s = [...woForm.stages]; s[idx] = { ...s[idx], name: e.target.value }; setWoForm(f => ({ ...f, stages: s })); }} className="h-8 text-xs" data-testid={`wo-stage-name-${idx}`} /></div>
                                <div className="col-span-2">
                                  <Select value={st.type} onValueChange={v => { const s = [...woForm.stages]; s[idx] = { ...s[idx], type: v }; setWoForm(f => ({ ...f, stages: s })); }}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="percentage">%</SelectItem><SelectItem value="amount">₹</SelectItem></SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-2"><Input type="number" placeholder={st.type === 'percentage' ? '%' : 'Amount'} value={st.value} onChange={e => { const s = [...woForm.stages]; s[idx] = { ...s[idx], value: e.target.value }; setWoForm(f => ({ ...f, stages: s })); }} className="h-8 text-xs" /></div>
                                <div className="col-span-3 text-right pr-1">
                                  <span className="text-xs font-semibold text-violet-700" data-testid={`wo-stage-amount-${idx}`}>{formatCurrency(resolved)}</span>
                                  {st.type === 'percentage' && _scope > 0 && (
                                    <div className="text-[9px] text-gray-400">= {v}% of Scope {formatCurrency(_scope)}</div>
                                  )}
                                </div>
                                <div className="col-span-1 flex justify-center"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setWoForm(f => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }))}><X className="h-3 w-3" /></Button></div>
                              </div>);
                            })}
                            {/* Auto-derived additional cost stages — appear LAST, locked, one per Additional row */}
                            {autoAdditional.map((auto, idx) => (
                              <div key={`auto-${idx}`} className="grid grid-cols-12 gap-1 items-center bg-emerald-50/60 border border-emerald-200 rounded px-1 py-1" data-testid={`wo-auto-stage-${idx}`}>
                                <div className="col-span-4 flex items-center gap-1">
                                  <Lock className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span className="text-xs font-medium text-emerald-900 truncate">{auto.name}</span>
                                </div>
                                <div className="col-span-2 text-[10px] text-emerald-700 font-semibold">Auto · ₹</div>
                                <div className="col-span-2 text-[11px] text-emerald-700">{formatCurrency(auto.amount)}</div>
                                <div className="col-span-3 text-right pr-1">
                                  <span className="text-xs font-semibold text-emerald-700">{formatCurrency(auto.amount)}</span>
                                  <div className="text-[9px] text-emerald-500">from Additional</div>
                                </div>
                                <div className="col-span-1"></div>
                              </div>
                            ))}
                          </div>
                          );
                        })()}
                      </TabsContent>
                    </Tabs>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setWoDialog(false)}>Cancel</Button>
                    <Button onClick={handleSaveWo} className="bg-violet-600 hover:bg-violet-700" data-testid="wo-save-btn">{editingWo ? 'Update Work Order' : 'Create Work Order'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ======= EDIT ADDITION / DEDUCTION DIALOG ======= */}
              <Dialog open={editItemDialog.open} onOpenChange={(o) => !o && setEditItemDialog({ open: false, type: null, id: null })}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit {editItemDialog.type === 'deduction' ? 'Deduction' : 'Addition'}</DialogTitle>
                    <DialogDescription>Update name, qty, and amount for this {editItemDialog.type === 'deduction' ? 'deduction' : 'addition'}.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div>
                      <Label className="text-xs">Name *</Label>
                      <Input
                        className="h-9 mt-1"
                        value={editItemForm.name}
                        onChange={(e) => setEditItemForm({ ...editItemForm, name: e.target.value })}
                        placeholder="e.g., Underground sump"
                        data-testid="edit-item-name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <NumericInput
                          className="h-9 mt-1"
                          value={editItemForm.qty}
                          onChange={(e) => setEditItemForm({ ...editItemForm, qty: e.target.value })}
                          data-testid="edit-item-qty"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Amount (₹) *</Label>
                        <NumericInput
                          className="h-9 mt-1 text-right font-semibold"
                          value={editItemForm.amount}
                          onChange={(e) => setEditItemForm({ ...editItemForm, amount: e.target.value })}
                          placeholder="0"
                          data-testid="edit-item-amount"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditItemDialog({ open: false, type: null, id: null })}>Cancel</Button>
                    <Button onClick={handleSaveEditItem} className="bg-emerald-600 hover:bg-emerald-700" data-testid="edit-item-save">Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ======= FREEZE OTP DIALOG ======= */}
              <Dialog open={freezeStep === 'otp'} onOpenChange={(open) => { if (!open) setFreezeStep(null); }}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-red-500" />Freeze Work Order</DialogTitle>
                    <DialogDescription>An OTP has been sent to your email. Enter it below to authorize the freeze.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <Mail className="h-4 w-4" /><span>Check your email for the 6-digit code</span>
                    </div>
                    <div className="flex justify-center">
                      <Input
                        className="text-center text-2xl tracking-[0.5em] font-bold w-56 h-14"
                        maxLength={6} placeholder="000000" value={freezeOtp}
                        onChange={e => setFreezeOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        data-testid="freeze-otp-input"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <Button variant="ghost" size="sm" className="text-xs" disabled={freezeOtpSending}
                        onClick={() => startFreeze(freezeWoId)}>
                        Resend OTP
                      </Button>
                      <Button onClick={verifyFreezeOtp} disabled={freezeOtp.length !== 6} data-testid="freeze-otp-verify-btn">
                        Verify & Continue
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* ======= FREEZE REASSIGN DIALOG ======= */}
              <Dialog open={freezeStep === 'reassign'} onOpenChange={(open) => { if (!open) setFreezeStep(null); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Snowflake className="h-4 w-4 text-blue-500" />Reassign Work Order
                    </DialogTitle>
                    <DialogDescription>
                      The current work order will be frozen. Select a new contractor and review the balance items below.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {/* Frozen WO info */}
                    {(() => {
                      const frozenWo = workOrders.find(w => w.work_order_id === freezeWoId);
                      if (!frozenWo) return null;
                      const paidCount = (frozenWo.stages || []).filter(s => s.status === 'approved').length;
                      const balanceCount = (frozenWo.stages || []).length - paidCount;
                      return (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                          <p className="font-medium text-red-800">Freezing: {frozenWo.contractor_name} ({frozenWo.contractor_type})</p>
                          <p className="text-xs text-red-600 mt-1">
                            {paidCount} stages paid | {balanceCount} balance stages will be carried to new work order
                          </p>
                        </div>
                      );
                    })()}

                    {/* New Contractor Selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Contractor Type</Label>
                        <Select value={freezeNewType} onValueChange={v => { setFreezeNewType(v); setFreezeForm(f => ({...f, new_contractor_id: ''})); }}>
                          <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                          <SelectContent>{contractorTypes.map(t => {
                            const name = typeof t === 'string' ? t : (t?.name || '');
                            const id = typeof t === 'string' ? t : (t?.type_id || name);
                            return name ? <SelectItem key={id} value={name}>{name}</SelectItem> : null;
                          })}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">New Contractor *</Label>
                        <Select value={freezeForm.new_contractor_id} onValueChange={v => setFreezeForm(f => ({...f, new_contractor_id: v}))}>
                          <SelectTrigger data-testid="freeze-new-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                          <SelectContent>{filteredFreezeContractors.map(c => <SelectItem key={c.contractor_id} value={c.contractor_id}>{c.name} ({c.contractor_type})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Balance Scope Items */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold">Scope Items ({freezeForm.scope_items.length})</Label>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setFreezeForm(f => ({...f, scope_items: [...f.scope_items, {name:'', unit:'nos', quantity:1, unit_rate:0}]}))}>
                          <Plus className="h-2.5 w-2.5 mr-0.5" />Add
                        </Button>
                      </div>
                      {freezeForm.scope_items.length > 0 && (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-gray-400 uppercase px-1">
                            <div className="col-span-3">Name</div><div className="col-span-2">Unit</div><div className="col-span-2">Qty</div><div className="col-span-2">Rate</div><div className="col-span-2">Total</div><div className="col-span-1"></div>
                          </div>
                          {freezeForm.scope_items.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                              <div className="col-span-3"><Input className="h-7 text-xs" value={item.name} onChange={e => { const s=[...freezeForm.scope_items]; s[idx]={...s[idx],name:e.target.value}; setFreezeForm(f=>({...f,scope_items:s})); }} /></div>
                              <div className="col-span-2"><Input className="h-7 text-xs" value={item.unit} onChange={e => { const s=[...freezeForm.scope_items]; s[idx]={...s[idx],unit:e.target.value}; setFreezeForm(f=>({...f,scope_items:s})); }} /></div>
                              <div className="col-span-2"><Input className="h-7 text-xs" type="number" value={item.quantity} onChange={e => { const s=[...freezeForm.scope_items]; s[idx]={...s[idx],quantity:parseFloat(e.target.value)||0}; setFreezeForm(f=>({...f,scope_items:s})); }} /></div>
                              <div className="col-span-2"><Input className="h-7 text-xs" type="number" value={item.unit_rate} onChange={e => { const s=[...freezeForm.scope_items]; s[idx]={...s[idx],unit_rate:parseFloat(e.target.value)||0}; setFreezeForm(f=>({...f,scope_items:s})); }} /></div>
                              <div className="col-span-2"><span className="text-[11px] font-medium">{formatCurrency((parseFloat(item.quantity)||0)*(parseFloat(item.unit_rate)||0))}</span></div>
                              <div className="col-span-1"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setFreezeForm(f=>({...f,scope_items:f.scope_items.filter((_,i)=>i!==idx)}))}><X className="h-3 w-3" /></Button></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Balance Stages */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold">Balance Stages ({freezeForm.stages.length})</Label>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setFreezeForm(f => ({...f, stages: [...f.stages, {name:`Stage ${f.stages.length+1}`, type:'percentage', value:0}]}))}>
                          <Plus className="h-2.5 w-2.5 mr-0.5" />Add
                        </Button>
                      </div>
                      {freezeForm.stages.length > 0 && (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {freezeForm.stages.map((st, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-amber-50 rounded p-2">
                              <Input className="h-7 text-xs flex-1" value={st.name} onChange={e => { const s=[...freezeForm.stages]; s[idx]={...s[idx],name:e.target.value}; setFreezeForm(f=>({...f,stages:s})); }} />
                              <Select value={st.type} onValueChange={v => { const s=[...freezeForm.stages]; s[idx]={...s[idx],type:v}; setFreezeForm(f=>({...f,stages:s})); }}>
                                <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="percentage">%</SelectItem><SelectItem value="amount">Fixed</SelectItem></SelectContent>
                              </Select>
                              <Input className="h-7 w-20 text-xs" type="number" value={st.value} onChange={e => { const s=[...freezeForm.stages]; s[idx]={...s[idx],value:parseFloat(e.target.value)||0}; setFreezeForm(f=>({...f,stages:s})); }} />
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setFreezeForm(f=>({...f,stages:f.stages.filter((_,i)=>i!==idx)}))}><X className="h-3 w-3" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Additional Work */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold">Additional Work ({freezeForm.additional_work.length})</Label>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setFreezeForm(f => ({...f, additional_work: [...f.additional_work, {description:'', unit:'nos', quantity:1, unit_rate:0}]}))}>
                          <Plus className="h-2.5 w-2.5 mr-0.5" />Add
                        </Button>
                      </div>
                      {freezeForm.additional_work.length > 0 && (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {freezeForm.additional_work.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                              <div className="col-span-4"><Input className="h-7 text-xs" placeholder="Description" value={item.description} onChange={e => { const a=[...freezeForm.additional_work]; a[idx]={...a[idx],description:e.target.value}; setFreezeForm(f=>({...f,additional_work:a})); }} /></div>
                              <div className="col-span-2"><Input className="h-7 text-xs" value={item.unit} onChange={e => { const a=[...freezeForm.additional_work]; a[idx]={...a[idx],unit:e.target.value}; setFreezeForm(f=>({...f,additional_work:a})); }} /></div>
                              <div className="col-span-2"><Input className="h-7 text-xs" type="number" value={item.quantity} onChange={e => { const a=[...freezeForm.additional_work]; a[idx]={...a[idx],quantity:parseFloat(e.target.value)||0}; setFreezeForm(f=>({...f,additional_work:a})); }} /></div>
                              <div className="col-span-2"><Input className="h-7 text-xs" type="number" value={item.unit_rate} onChange={e => { const a=[...freezeForm.additional_work]; a[idx]={...a[idx],unit_rate:parseFloat(e.target.value)||0}; setFreezeForm(f=>({...f,additional_work:a})); }} /></div>
                              <div className="col-span-1"><Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => setFreezeForm(f=>({...f,additional_work:f.additional_work.filter((_,i)=>i!==idx)}))}><X className="h-3 w-3" /></Button></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <Label className="text-xs">Reason / Notes</Label>
                      <Input className="h-8 text-sm" placeholder="Why is this contractor being replaced?" value={freezeForm.notes} onChange={e => setFreezeForm(f => ({...f, notes: e.target.value}))} data-testid="freeze-reason" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setFreezeStep(null)}>Cancel</Button>
                    <Button className="bg-red-600 hover:bg-red-700" onClick={submitFreezeReassign} data-testid="freeze-reassign-btn">
                      <Snowflake className="h-3.5 w-3.5 mr-1" />Freeze & Reassign
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <TabsContent value="labours" className="p-3 sm:p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-teal-600" />Labour & Work Orders
                  </h3>
                </div>

                <Tabs value={labourSubTab} onValueChange={setLabourSubTab}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="workorders" data-testid="subtab-workorders">Work Orders</TabsTrigger>
                    <TabsTrigger value="attendance" data-testid="subtab-attendance">Attendance</TabsTrigger>
                  </TabsList>

                  {/* LABOUR REQUESTS SUB-TAB */}
                  <TabsContent value="requests" className="mt-4">
                    <div className="flex items-center justify-end mb-3">
                      {(user?.role === 'super_admin' || user?.role === 'planning' || user?.role === 'planning_person' || user?.role === 'project_manager' || user?.role === 'cre') && (
                        <Button
                          size="sm"
                          onClick={() => { setLabourSubTab('workorders'); setTimeout(() => openWoDialog(), 0); }}
                          className="bg-violet-600 hover:bg-violet-700"
                          data-testid="requests-create-wo-btn"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />Create Work Order
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4" data-testid="labours-summary">
                      <div className="rounded-lg p-3 text-center border bg-gray-50">
                        <p className="text-xl font-bold">{laboursData?.summary?.total || 0}</p>
                        <p className="text-xs text-gray-500">Total Requests</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-amber-50 border-amber-200">
                        <p className="text-xl font-bold text-amber-700">{laboursData?.summary?.requested || 0}</p>
                        <p className="text-xs text-gray-500">Pending</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-green-50 border-green-200">
                        <p className="text-xl font-bold text-green-700">{laboursData?.summary?.approved || 0}</p>
                        <p className="text-xs text-gray-500">Approved</p>
                      </div>
                      <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
                        <p className="text-xl font-bold text-blue-700">{laboursData?.summary?.total_workers || 0}</p>
                        <p className="text-xs text-gray-500">Total Workers</p>
                      </div>
                      {!isPM && laboursData?.summary?.total_cost !== undefined && (
                        <div className="rounded-lg p-3 text-center border bg-purple-50 border-purple-200">
                          <p className="text-xl font-bold text-purple-700">{formatCurrency(laboursData?.summary?.total_cost || 0)}</p>
                          <p className="text-xs text-gray-500">Total Cost</p>
                        </div>
                      )}
                    </div>
                    {(laboursData?.labours || []).length > 0 ? (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm" data-testid="labours-table">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Contractor</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Workers</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
                              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                              {!isPM && <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(laboursData?.labours || []).map(l => (
                              <tr key={l.labour_expense_id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium">{l.description || l.labour_type || '-'}</td>
                                <td className="px-3 py-2.5 text-xs">{l.contractor_name || '-'}</td>
                                <td className="px-3 py-2.5 text-center">{l.num_workers || '-'}</td>
                                <td className="px-3 py-2.5 text-center">{l.num_days || '-'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    l.status === 'requested' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                                    ['accounts_approved','payment_approved','pm_approved'].includes(l.status) ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-300'
                                  }`}>{(l.status || '').replace(/_/g, ' ')}</Badge>
                                </td>
                                {!isPM && <td className="px-3 py-2.5 text-right font-medium">{l.total_amount ? formatCurrency(l.total_amount) : '-'}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="text-center py-8 text-gray-400"><HardHat className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No labour requests</p></div>}
                  </TabsContent>

                  {/* WORK ORDERS SUB-TAB */}
                  <TabsContent value="workorders" className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-500">{workOrders.length} work orders</p>
                      {(user?.role === 'super_admin' || user?.role === 'planning' || user?.role === 'planning_person' || user?.role === 'project_manager' || user?.role === 'cre') && (
                        <Button size="sm" onClick={() => openWoDialog()} className="bg-violet-600 hover:bg-violet-700" data-testid="labour-create-wo-btn">
                          <Plus className="h-3.5 w-3.5 mr-1" />Create Work Order
                        </Button>
                      )}
                    </div>

                    {workOrders.length === 0 ? (
                      <div className="text-center py-8 text-gray-400"><FileText className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No work orders yet</p></div>
                    ) : labourWoViewId ? (
                      (() => {
                        const wo = workOrders.find(w => w.work_order_id === labourWoViewId);
                        if (!wo) return null;
                        return (
                          <div data-testid="labour-wo-detail-view">
                            <Button variant="ghost" size="sm" onClick={() => setLabourWoViewId(null)} className="mb-3"><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to List</Button>
                            <div className="border rounded-lg overflow-hidden">
                              <div className={`p-4 border-b flex items-center justify-between ${wo.status === 'frozen' ? 'bg-red-50' : wo.reassigned_from ? 'bg-emerald-50' : 'bg-violet-50'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-bold text-sm">{wo.contractor_name}</p>
                                    <Badge variant="outline" className="text-[10px] bg-white">{wo.contractor_type}</Badge>
                                    {wo.status === 'frozen' && <Badge className="bg-red-600 text-white text-[10px]">Frozen</Badge>}
                                    {wo.reassigned_from && <Badge className="bg-emerald-600 text-white text-[10px]">Reassigned from {wo.reassigned_contractor || wo.reassigned_from}</Badge>}
                                  </div>
                                  {wo.paid_amount > 0 && <p className="text-[11px] text-green-700 font-medium mt-1">Paid: {formatCurrency(wo.paid_amount)}</p>}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right rounded-lg bg-white border-2 border-violet-300 px-3 py-1.5 shadow-sm" data-testid="labour-wo-total-contract">
                                    <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-600">Total Contract</p>
                                    <p className="text-xl sm:text-2xl font-extrabold text-violet-800 leading-tight">{formatCurrency(wo.total_value)}</p>
                                  </div>
                                  <div className="flex gap-1">
                                  {wo.status !== 'frozen' && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => openWoDialog(wo)} data-testid="labour-wo-edit-btn"><Edit className="h-3 w-3 mr-1" />Edit</Button>
                                      <Button size="sm" variant="destructive" onClick={() => handleDeleteWo(wo)} data-testid="labour-wo-delete-btn"><Trash2 className="h-3 w-3" /></Button>
                                    </>
                                  )}
                                  </div>
                                </div>
                              </div>
                              <Tabs defaultValue="scope" className="w-full">
                                <TabsList className="w-full rounded-none border-b bg-white">
                                  <TabsTrigger value="scope" className="flex-1 text-xs">Scope ({wo.scope_items?.length || 0})</TabsTrigger>
                                  <TabsTrigger value="stages" className="flex-1 text-xs">Stages ({wo.stages?.length || 0})</TabsTrigger>
                                  <TabsTrigger value="additional" className="flex-1 text-xs">Additional ({wo.additional_work?.length || 0})</TabsTrigger>
                                  <TabsTrigger value="dlr" className="flex-1 text-xs" data-testid="labour-wo-dlr-tab">DLR</TabsTrigger>
                                </TabsList>
                                <TabsContent value="scope" className="p-3">
                                  {wo.scope_items?.length > 0 ? (
                                    <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead>
                                    <tbody className="divide-y">{(wo.scope_items || []).map((s, i) => (<tr key={i}><td className="px-3 py-2 text-xs text-gray-400">{i+1}</td><td className="px-3 py-2 font-medium">{s.name}</td><td className="px-3 py-2">{s.unit}</td><td className="px-3 py-2 text-right">{s.quantity}</td><td className="px-3 py-2 text-right">{formatCurrency(s.unit_rate)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(s.total)}</td></tr>))}</tbody>
                                    <tfoot className="border-t"><tr><td colSpan="5" className="px-3 py-2 text-right font-bold text-xs">Scope Total:</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(wo.scope_total)}</td></tr></tfoot></table>
                                  ) : <p className="text-gray-400 text-center py-4 text-sm">No scope items</p>}
                                </TabsContent>
                                <TabsContent value="stages" className="p-3">
                                  {wo.stages?.length > 0 ? (
                                    <div className="space-y-2">
                                      {wo.stages.map((st, i) => {
                                        const cfg = getStageStatusConfig(st.status, st.is_open);
                                        const showApprove = canApproveStage(st);
                                        const isExp = expandedWoStages[`l_${st.stage_id}`];
                                        return (
                                          <div key={st.stage_id || i} className="border rounded-lg overflow-hidden" data-testid={`labour-wo-stage-${st.stage_id}`}>
                                            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition"
                                              onClick={() => setExpandedWoStages(prev => ({ ...prev, [`l_${st.stage_id}`]: !prev[`l_${st.stage_id}`] }))}>
                                              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                                <span className="font-medium text-sm">{i+1}. {st.name}</span>
                                                <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>{cfg.label}</Badge>
                                                <Badge variant="outline" className="text-[10px]">{st.type === 'percentage' ? `${st.value}%` : 'Fixed'}</Badge>
                                              </div>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-sm font-medium text-gray-600">{formatCurrency(st.amount)}</span>
                                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                                              </div>
                                            </div>
                                            {isExp && (
                                              <div className="border-t bg-gray-50/50 p-3 space-y-3">
                                                <div className="flex flex-wrap gap-3 text-xs">
                                                  <span className="text-gray-500">Amount: <strong>{formatCurrency(st.amount)}</strong></span>
                                                  {st.approved_amount > 0 && <span className="text-green-600">Paid: <strong>{formatCurrency(st.approved_amount)}</strong></span>}
                                                </div>
                                                {/* Labour Advance Summary (Planning → PM → GM → Accountant) */}
                                                {(st.advance_approved_total > 0 || st.advance_pending_total > 0) && (
                                                  <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid={`labour-advance-summary-${st.stage_id}`}>
                                                    <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">Contract <strong>{formatCurrency(st.amount)}</strong></span>
                                                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Advance Approved <strong>{formatCurrency(st.advance_approved_total || 0)}</strong></span>
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Balance <strong>{formatCurrency(st.advance_balance ?? (st.amount - (st.advance_approved_total || 0)))}</strong></span>
                                                    {st.advance_pending_total > 0 && (
                                                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">In Approval <strong>{formatCurrency(st.advance_pending_total)}</strong></span>
                                                    )}
                                                    {st.auto_closed_by_advance && (
                                                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">Auto-Closed</span>
                                                    )}
                                                  </div>
                                                )}
                                                {st.status !== 'pending' && (
                                                  <div className="flex flex-wrap gap-1">
                                                    {st.requested_at && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">SE Requested</span>}
                                                    {st.pm_approved_at && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">PM OK</span>}
                                                    {st.planning_approved_at && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">Planning OK</span>}
                                                    {st.accountant_approved_at && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">Paid</span>}
                                                    {st.rejection_reason && <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{st.rejection_reason}</span>}
                                                  </div>
                                                )}
                                                <div className="flex gap-1 flex-wrap pt-1">
                                                  {/* Planning / Super-Admin: Lock Open toggle — controls SE visibility of this stage */}
                                                  {['planning', 'super_admin'].includes(user?.role) && st.status !== 'approved' && (
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className={`h-7 text-xs gap-1 ${st.is_open ? 'border-emerald-400 text-emerald-700 hover:bg-emerald-50' : 'border-amber-400 text-amber-700 hover:bg-amber-50'}`}
                                                      data-testid={`labour-wo-stage-lock-toggle-${st.stage_id}`}
                                                      onClick={async (e) => {
                                                        e.stopPropagation();
                                                        try {
                                                          if (st.is_open) {
                                                            await axios.patch(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${st.stage_id}/lock`);
                                                            toast.success('Stage locked — Site Engineer view removed');
                                                          } else {
                                                            await axios.patch(`${API}/projects/${projectId}/work-orders/${wo.work_order_id}/stages/${st.stage_id}/open`);
                                                            toast.success('Stage unlocked — visible to Site Engineer');
                                                          }
                                                          fetchWorkOrders();
                                                        } catch (err) {
                                                          toast.error(err.response?.data?.detail || 'Failed to toggle lock');
                                                        }
                                                      }}
                                                    >
                                                      {st.is_open ? '🔓 Lock' : '🔒 Lock Open'}
                                                    </Button>
                                                  )}
                                                  {showApprove && (
                                                    <>
                                                      {user?.role === 'accountant' ? (
                                                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" data-testid={`labour-wo-stage-approve-${st.stage_id}`}
                                                          onClick={(e) => { e.stopPropagation(); handleWoStageApprove(wo.work_order_id, st.stage_id, 'approve', { approved_amount: st.amount }); }}>
                                                          Process Payment
                                                        </Button>
                                                      ) : (
                                                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" data-testid={`labour-wo-stage-approve-${st.stage_id}`}
                                                          onClick={(e) => { e.stopPropagation(); handleWoStageApprove(wo.work_order_id, st.stage_id, 'approve'); }}>
                                                          Approve
                                                        </Button>
                                                      )}
                                                      <Button size="sm" variant="destructive" className="h-7 text-xs" data-testid={`labour-wo-stage-reject-${st.stage_id}`}
                                                        onClick={(e) => { e.stopPropagation(); handleWoStageApprove(wo.work_order_id, st.stage_id, 'reject', { notes: 'Rejected' }); }}>
                                                        Reject
                                                      </Button>
                                                    </>
                                                  )}
                                                  {st.status === 'pending' && ['site_engineer', 'sr_site_engineer'].includes(user?.role) && (
                                                    <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" data-testid={`labour-wo-stage-request-${st.stage_id}`}
                                                      onClick={(e) => { e.stopPropagation(); handleWoStageRequest(wo.work_order_id, st.stage_id); }}>
                                                      Request Payment
                                                    </Button>
                                                  )}
                                                  {/* Planning / Super-Admin: Request Advance (Planning → PM → GM → Accountant) */}
                                                  {['planning', 'super_admin'].includes(user?.role) && (
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                      data-testid={`labour-wo-stage-request-advance-${st.stage_id}`}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLabourAdvanceDialog({
                                                          open: true,
                                                          stage: st,
                                                          workOrder: wo,
                                                          amount: st.amount ? String(st.amount) : '',
                                                          date: new Date().toISOString().split('T')[0],
                                                          reason: '',
                                                        });
                                                      }}
                                                    >
                                                      <ArrowRight className="h-3 w-3" /> Request Advance
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      <div className="flex justify-between items-center px-3 pt-2 border-t">
                                        <span className="text-xs font-bold text-gray-500">Stage Total</span>
                                        <span className="text-sm font-bold">{formatCurrency(wo.stages.reduce((sum, s) => sum + (s.amount || 0), 0))}</span>
                                      </div>
                                    </div>
                                  ) : <p className="text-gray-400 text-center py-4 text-sm">No stages</p>}
                                </TabsContent>
                                <TabsContent value="additional" className="p-3">
                                  {wo.additional_work?.length > 0 ? (
                                    <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th><th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th><th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th></tr></thead>
                                    <tbody className="divide-y">{(wo.additional_work || []).map((a, i) => (<tr key={i}><td className="px-3 py-2 text-xs text-gray-400">{i+1}</td><td className="px-3 py-2 font-medium">{a.description}</td><td className="px-3 py-2">{a.unit}</td><td className="px-3 py-2 text-right">{a.quantity}</td><td className="px-3 py-2 text-right">{formatCurrency(a.unit_rate)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(a.total)}</td></tr>))}</tbody>
                                    <tfoot className="border-t"><tr><td colSpan="5" className="px-3 py-2 text-right font-bold text-xs">Additional Total:</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(wo.additional_total)}</td></tr></tfoot></table>
                                  ) : <p className="text-gray-400 text-center py-4 text-sm">No additional work</p>}
                                </TabsContent>
                                <TabsContent value="dlr" className="p-3">
                                  <DLRPanel
                                    projectId={projectId}
                                    workOrderId={wo.work_order_id}
                                    labourRates={wo.labour_rates}
                                    canRecord={['site_engineer', 'sr_site_engineer', 'super_admin'].includes(user?.role)}
                                  />
                                </TabsContent>
                              </Tabs>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-3" data-testid="labour-wo-list">
                        {workOrders.map(wo => {
                          const paidStages = (wo.stages || []).filter(s => s.status === 'approved').length;
                          const totalStages = (wo.stages || []).length;
                          const pendingRequests = (wo.stages || []).filter(s => ['requested','pm_approved','planning_approved'].includes(s.status)).length;
                          return (
                          <div key={wo.work_order_id} className={`border rounded-lg p-4 hover:border-violet-300 cursor-pointer transition ${wo.status === 'frozen' ? 'border-red-200 bg-red-50/30 opacity-75' : ''}`} onClick={() => setLabourWoViewId(wo.work_order_id)} data-testid={`labour-wo-card-${wo.work_order_id}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h4 className="font-semibold text-sm">{wo.contractor_name}</h4>
                                  <Badge variant="outline" className="text-[10px]">{wo.contractor_type}</Badge>
                                  <Badge className="bg-violet-100 text-violet-700 text-[10px]">{formatCurrency(wo.total_value)}</Badge>
                                  {wo.paid_amount > 0 && <Badge className="bg-green-100 text-green-700 text-[10px]">Paid: {formatCurrency(wo.paid_amount)}</Badge>}
                                  {pendingRequests > 0 && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{pendingRequests} pending approval</Badge>}
                                  {wo.status === 'frozen' && <Badge className="bg-red-600 text-white text-[10px]">Frozen</Badge>}
                                </div>
                                <div className="flex gap-4 text-xs text-gray-500">
                                  <span>{wo.scope_items?.length || 0} scope items</span>
                                  <span>{paidStages}/{totalStages} stages paid</span>
                                  <span>{wo.additional_work?.length || 0} additional</span>
                                </div>
                                {wo.notes && (
                                  <div className="mt-1.5 text-xs text-gray-600" data-testid={`labour-wo-notes-${wo.work_order_id}`}>
                                    <span className="font-semibold text-gray-500">Notes:</span> <span className="italic">{wo.notes}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                {wo.status !== 'frozen' && (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openWoDialog(wo)}><Edit className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteWo(wo)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>);
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* ATTENDANCE SUB-TAB — reflects project-wide DLR (Daily Labour Report) data with summary cards */}
                  <TabsContent value="attendance" className="mt-4">
                    <ProjectAttendanceDLR
                      projectId={projectId}
                      user={user}
                      labourAttendance={labourAttendance}
                      formatCurrency={formatCurrency}
                      onAddDailyEntry={() => {
                        setAttForm({ contractor_id: '', work_order_id: '', stage_id: '', date: new Date().toISOString().split('T')[0], entries: [] });
                        setShowAttendanceForm(true);
                      }}
                    />
                  </TabsContent>
                </Tabs>

                {/* Create Work Order Dialog */}
                <Dialog open={showWOForm} onOpenChange={setShowWOForm}>
                  <DialogContent className="max-w-lg max-h-[90vh]">
                    <DialogHeader>
                      <DialogTitle>Create Work Order</DialogTitle>
                      <DialogDescription>Assign a contractor and define payment stages.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Contractor *</Label>
                        <Select value={woForm.contractor_id} onValueChange={v => setWoForm({ ...woForm, contractor_id: v })}>
                          <SelectTrigger data-testid="wo-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                          <SelectContent>
                            {allContractors.map(c => <SelectItem key={c.contractor_id} value={c.contractor_id}>{c.name} ({c.contractor_type || 'General'})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={woForm.description} onChange={e => setWoForm({ ...woForm, description: e.target.value })} rows={2} />
                      </div>
                      <div>
                        <Label>Total Amount *</Label>
                        <Input type="number" data-testid="wo-amount" value={woForm.total_amount} onChange={e => setWoForm({ ...woForm, total_amount: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label className="flex justify-between"><span>Payment Stages</span>
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setWoForm({ ...woForm, payment_stages: [...(woForm.payment_stages || []), { stage_name: `Stage ${(woForm.payment_stages || []).length + 1}`, amount: 0, percentage: 0 }] })}>+ Add Stage</Button>
                        </Label>
                        <div className="space-y-2 mt-2">
                          {(woForm.payment_stages || []).map((s, i) => (
                            <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                              <Input className="h-8 flex-1" value={s.stage_name} onChange={e => { const stages = [...woForm.payment_stages]; stages[i].stage_name = e.target.value; setWoForm({ ...woForm, payment_stages: stages }); }} />
                              <Input className="h-8 w-28" type="number" placeholder="Amount" value={s.amount} onChange={e => { const stages = [...woForm.payment_stages]; stages[i].amount = parseFloat(e.target.value) || 0; setWoForm({ ...woForm, payment_stages: stages }); }} />
                              <Button variant="ghost" size="sm" className="h-8 text-red-500" onClick={() => setWoForm({ ...woForm, payment_stages: (woForm.payment_stages || []).filter((_, j) => j !== i) })}><X className="h-3 w-3" /></Button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowWOForm(false)}>Cancel</Button>
                        <Button data-testid="save-wo-btn" onClick={handleCreateWO}>Create</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Attendance Entry Dialog */}
                <Dialog open={showAttendanceForm} onOpenChange={setShowAttendanceForm}>
                  <DialogContent className="max-w-lg max-h-[90vh]">
                    <DialogHeader>
                      <DialogTitle>Daily Labour Entry</DialogTitle>
                      <DialogDescription>Enter attendance for each labour type.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label>Contractor *</Label>
                        <Select value={attForm.contractor_id} onValueChange={v => {
                          const contractor = allContractors.find(c => c.contractor_id === v);
                          const entries = (contractor?.labour_types || []).map(lt => ({
                            type: lt.type, label: lt.label, count: 0, per_day_cost: lt.per_day_cost
                          }));
                          setAttForm({ ...attForm, contractor_id: v, entries });
                        }}>
                          <SelectTrigger data-testid="att-contractor"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                          <SelectContent>
                            {allContractors.map(c => <SelectItem key={c.contractor_id} value={c.contractor_id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Work Order</Label>
                        <Select value={attForm.work_order_id} onValueChange={v => setAttForm({ ...attForm, work_order_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select work order (optional)" /></SelectTrigger>
                          <SelectContent>
                            {workOrders.filter(wo => wo.contractor_id === attForm.contractor_id).map(wo => (
                              <SelectItem key={wo.work_order_id} value={wo.work_order_id}>{wo.description || wo.work_order_id} ({formatCurrency(wo.total_amount)})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {attForm.work_order_id && (() => {
                        const wo = workOrders.find(w => w.work_order_id === attForm.work_order_id);
                        const openStages = wo?.payment_stages?.filter(s => s.status === 'pending') || [];
                        return openStages.length > 0 ? (
                          <div>
                            <Label>Stage</Label>
                            <Select value={attForm.stage_id} onValueChange={v => setAttForm({ ...attForm, stage_id: v })}>
                              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                              <SelectContent>
                                {openStages.map(s => <SelectItem key={s.stage_id} value={s.stage_id}>{s.stage_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null;
                      })()}
                      <div>
                        <Label>Date</Label>
                        <Input type="date" value={attForm.date} onChange={e => setAttForm({ ...attForm, date: e.target.value })} />
                      </div>
                      {attForm.entries.length > 0 && (
                        <div className="space-y-3">
                          <Label>Labour Count</Label>
                          {attForm.entries.map((e, i) => (
                            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                              <span className="flex-1 text-sm font-medium">{e.label}</span>
                              <Input className="w-20 h-8 text-center" type="number" min="0" value={e.count} onChange={ev => {
                                const entries = [...attForm.entries];
                                entries[i].count = parseInt(ev.target.value) || 0;
                                setAttForm({ ...attForm, entries });
                              }} />
                              <span className="text-xs text-gray-500 w-20 text-right">{e.per_day_cost}/day</span>
                              <span className="text-sm font-bold w-24 text-right">{((e.count || 0) * (e.per_day_cost || 0)).toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center bg-blue-50 rounded-lg p-3">
                            <span className="font-semibold">Total</span>
                            <div className="text-right">
                              <span className="text-sm mr-4">{attForm.entries.reduce((s, e) => s + (e.count || 0), 0)} workers</span>
                              <span className="font-bold">{attForm.entries.reduce((s, e) => s + (e.count || 0) * (e.per_day_cost || 0), 0).toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowAttendanceForm(false)}>Cancel</Button>
                        <Button data-testid="save-attendance-btn" onClick={handleSubmitAttendance}>Submit</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </TabsContent>

            {/* Cheques TabsContent removed — moved as a sub-tab under Payment Summary. */}

            {/* ==================== CONSTRUCTION STAGE (from CRE Pre-Construction) ==================== */}
            <TabsContent value="construction-stage" className="p-3 sm:p-6">
              <div className="space-y-4" data-testid="construction-stage-tab-content">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-rose-600" />
                      Pre-Construction Stages
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Captured by the CRE team. Status updates live from the CRE → Pre-Construction board.
                    </p>
                  </div>
                  {(() => {
                    const done = pre_construction.filter(s => s.status === 'completed').length;
                    const total = pre_construction.length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-rose-600">{done}<span className="text-sm text-gray-500"> / {total}</span></div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Completed ({pct}%)</div>
                      </div>
                    );
                  })()}
                </div>
                {pre_construction.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-gray-400 text-sm">No pre-construction stages tracked yet.</CardContent></Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pre_construction.map((s) => {
                      const isDone = s.status === 'completed';
                      const isScheduled = s.status === 'scheduled';
                      const tone = isDone
                        ? { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', badge: 'bg-green-100 text-green-700' }
                        : isScheduled
                        ? { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' }
                        : { bg: 'bg-gray-50',  border: 'border-gray-200',  text: 'text-gray-600',  badge: 'bg-gray-100 text-gray-600' };
                      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                      return (
                        <Card key={s.key} className={`${tone.bg} border ${tone.border}`} data-testid={`pc-stage-${s.key}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <p className={`font-semibold text-sm ${tone.text}`}>{s.label}</p>
                              <Badge className={`text-[10px] capitalize ${tone.badge}`}>{(s.status || 'pending').replace('_', ' ')}</Badge>
                            </div>
                            <div className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                              <div className="flex justify-between"><span>Scheduled</span><span className="font-medium">{fmtDate(s.scheduled_at)}</span></div>
                              <div className="flex justify-between"><span>Completed</span><span className="font-medium">{fmtDate(s.completed_at)}</span></div>
                              {s.notes && (
                                <div className="pt-1 text-gray-500 italic line-clamp-2" title={s.notes}>{s.notes}</div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 text-right">
                  Read-only view. Updates must be made by the CRE team from the CRE → Pre-Construction board.
                </p>
              </div>
            </TabsContent>

            {/* ==================== DOCUMENTS TAB ==================== */}
            <TabsContent value="documents" className="p-3 sm:p-6">
              <div className="space-y-6">

                {/* Architect Design Data - FIRST */}
                {(designData.site_plans.length > 0 || designData.design_files.length > 0) && (
                  <div className="space-y-4">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Layers className="h-5 w-5 text-indigo-600" />
                      Architect Designs
                    </h3>

                    {/* Site Plans */}
                    {(designData?.site_plans || []).length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Site Plans ({(designData?.site_plans || []).length})</p>
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Floor</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Drive Link</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(designData?.site_plans || []).map(plan => (
                                <tr key={plan.plan_id} className="hover:bg-gray-50" data-testid={`doc-site-plan-${plan.plan_id}`}>
                                  <td className="px-3 py-2 font-medium">{plan.floor_name}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                      plan.status === 'approved' ? 'bg-green-100 text-green-700 border-green-300' :
                                      plan.status === 'approval_waiting' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                      plan.status === 'design' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                      'bg-gray-100 text-gray-700 border-gray-300'
                                    }`}>
                                      {plan.status === 'yet_to_start' ? 'Yet to Start' : plan.status === 'approval_waiting' ? 'Approval Waiting' : plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {plan.drive_link ? <a href={plan.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Open</a> : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-500">{plan.remarks || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Design Files (3D + Elevations) */}
                    {(designData?.design_files || []).length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">3D Photos & Elevations ({(designData?.design_files || []).length})</p>
                        <div className="grid gap-2">
                          {(designData?.design_files || []).map(file => (
                            <div key={file.file_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border" data-testid={`doc-design-file-${file.file_id}`}>
                              <div>
                                <p className="font-medium text-sm">{file.file_name}</p>
                                <p className="text-xs text-gray-400">{file.file_type === '3d_photo' ? '3D Photo' : 'Elevation'} {file.remarks ? `- ${file.remarks}` : ''}</p>
                              </div>
                              {file.drive_link && (
                                <a href={file.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs border border-blue-200 rounded px-2 py-1">
                                  Open Drive
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Project Documents - compact with upload button */}
                <div className={designData.site_plans.length > 0 || designData.design_files.length > 0 ? 'pt-4 border-t' : ''}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <Folder className="h-5 w-5 text-amber-600" />
                      Project Documents
                      <Badge variant="outline" className="ml-1">{projectFiles.length}</Badge>
                    </h3>
                    <FileUpload
                      projectId={projectId}
                      category="project-documents"
                      onUploadComplete={fetchProjectFiles}
                      compact
                    />
                  </div>

                  <FileList
                    files={projectFiles}
                    onDelete={fetchProjectFiles}
                    canDelete={user && ['super_admin', 'planning', 'project_manager'].includes(user.role)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Verification Dialog */}
      <Dialog open={verifyDialog.open} onOpenChange={(open) => !open && setVerifyDialog({ open: false, type: '', ids: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Verify Items
            </DialogTitle>
            <DialogDescription>
              You are about to verify {verifyDialog.ids.length} {verifyDialog.type} item(s) and send them for Super Admin approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Please review all items carefully before verification. 
                Once verified, items will be sent to the Super Admin for final approval.
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">
                Type <span className="font-bold text-amber-600">VERIFY</span> to confirm
              </Label>
              <Input
                data-testid="verify-code-input"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Type VERIFY"
                className="mt-2"
              />
              {verifyCode && verifyCode !== 'VERIFY' && (
                <p className="text-xs text-red-500 mt-1">Please type 'VERIFY' exactly in capital letters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog({ open: false, type: '', ids: [] })}>
              Cancel
            </Button>
            <Button 
              data-testid="confirm-verify-btn"
              onClick={handleVerify}
              disabled={verifyCode !== 'VERIFY'}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify & Send for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collect Payment Dialog */}
      <Dialog open={collectPaymentDialog} onOpenChange={setCollectPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-green-600" />
              Collect Payment
            </DialogTitle>
            <DialogDescription>
              {selectedStage?.stage_label} - {selectedStage?.stage_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Stage Amount</p>
                <p className="font-semibold">{formatCurrency(selectedStage?.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Already Received</p>
                <p className="font-semibold text-green-600">{formatCurrency(selectedStage?.amount_received || 0)}</p>
              </div>
            </div>
            
            <div>
              <Label>Amount to Collect *</Label>
              <NumericInput
                
                value={collectForm.amount_received}
                onChange={(e) => setCollectForm({...collectForm, amount_received: e.target.value})}
                placeholder="Enter amount"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Payment Mode *</Label>
              <select
                value={collectForm.payment_mode}
                onChange={(e) => setCollectForm({...collectForm, payment_mode: e.target.value})}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="savings_account">Savings A/c</option>
                <option value="escrow">Escrow</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            
            <div>
              <Label>Reference / Transaction ID</Label>
              <Input
                value={collectForm.payment_reference}
                onChange={(e) => setCollectForm({...collectForm, payment_reference: e.target.value})}
                placeholder="Transaction ID or Cheque No."
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Remarks</Label>
              <Input
                value={collectForm.remarks}
                onChange={(e) => setCollectForm({...collectForm, remarks: e.target.value})}
                placeholder="Optional remarks"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectPaymentDialog(false)}>Cancel</Button>
            <Button onClick={handleCollectPayment} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MobileBottomNav user={user} />

      {/* Req Payment Dialog — asks for expected payment month/date before submitting */}
      <Dialog
        open={reqPayDialog.open}
        onOpenChange={(o) => !o && !reqPayDialog.submitting && setReqPayDialog({ open: false, stage: null, date: '', submitting: false, mode: null })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-amber-600" />Request {reqPayDialog.mode === 'addition' ? 'Additional Payment' : 'Payment'}</DialogTitle>
            <DialogDescription>
              {reqPayDialog.mode === 'addition'
                ? 'Pick the month/date this additional charge should be collected. It will appear in the project Payment Schedule and CRE\'s month filter.'
                : 'Choose the month and date when you expect this payment to be collected. CRE can then prioritize and filter requests by month.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-amber-50 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">Stage</p>
                  <p className="font-medium text-gray-900 truncate">{reqPayDialog.stage?.stage_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500 mb-0.5">Amount</p>
                  <p className="font-bold text-amber-700">
                    ₹{(reqPayDialog.stage ? (reqPayDialog.stage.amount - (reqPayDialog.stage.amount_received || 0)) : 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Expected Payment Month <span className="text-red-500">*</span></label>
              <Input
                type="month"
                value={(reqPayDialog.date || '').slice(0, 7)}
                onChange={(e) => setReqPayDialog((d) => ({ ...d, date: e.target.value ? `${e.target.value}-01` : '' }))}
                disabled={reqPayDialog.submitting}
                data-testid="req-pay-month-input"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Pick the month you expect this payment. The exact day can be set later from the Payment Schedule view.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReqPayDialog({ open: false, stage: null, date: '', submitting: false, mode: null })}
              disabled={reqPayDialog.submitting}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={async () => {
                if (!reqPayDialog.date) {
                  toast.error('Please pick the expected payment date');
                  return;
                }
                setReqPayDialog((d) => ({ ...d, submitting: true }));
                try {
                  if (reqPayDialog.mode === 'addition') {
                    await handleRequestAdditionPayment(reqPayDialog.stage.stage_id, reqPayDialog.date);
                  } else {
                    await handleRequestPayment(reqPayDialog.stage.stage_id, reqPayDialog.date);
                  }
                  setReqPayDialog({ open: false, stage: null, date: '', submitting: false, mode: null });
                } catch {
                  setReqPayDialog((d) => ({ ...d, submitting: false }));
                }
              }}
              disabled={reqPayDialog.submitting}
              data-testid="req-pay-submit"
            >
              <Send className="h-4 w-4 mr-1" /> Req
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Schedule Resubmit Dialog — Planning corrects amount/remarks
          and resubmits a CRE-rejected stage back to CRE for collection. */}
      <Dialog
        open={psResubmitDialog.open}
        onOpenChange={(o) => !o && !psResubmitDialog.submitting && setPsResubmitDialog({ open: false, stage: null, mode: null, amount: '', remarks: '', submitting: false })}
      >
        <DialogContent className="max-w-md" data-testid="ps-resubmit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              {psResubmitDialog.mode === 'cre' ? 'Resubmit to CRE' : 'Re-request Payment'}
            </DialogTitle>
            <DialogDescription>
              {psResubmitDialog.mode === 'cre'
                ? 'Correct the amount (if needed) and resubmit. CRE will be notified to collect again.'
                : 'Update the amount and the stage will be re-requested for CRE collection.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-red-50 px-3 py-2.5 text-sm">
              <p className="text-xs text-red-700 font-semibold mb-1">
                {psResubmitDialog.mode === 'cre' ? '🔴 Rejected by CRE' : '🔴 Rejected by Accountant'}
              </p>
              <p className="text-xs text-red-800">
                {(psResubmitDialog.mode === 'cre'
                  ? psResubmitDialog.stage?.cre_rejection_reason
                  : psResubmitDialog.stage?.accountant_rejection_reason) || 'No reason given'}
              </p>
            </div>
            <div>
              <Label className="text-xs">Stage</Label>
              <p className="font-medium text-sm">{psResubmitDialog.stage?.stage_name}</p>
            </div>
            <div>
              <Label className="text-xs">Corrected Amount (₹)</Label>
              <NumericInput
                value={psResubmitDialog.amount}
                onChange={(e) => setPsResubmitDialog((d) => ({ ...d, amount: e.target.value }))}
                placeholder="0"
                className="mt-1"
                data-testid="ps-resubmit-amount"
              />
              <p className="text-[11px] text-gray-500 mt-1">Original: ₹{(psResubmitDialog.stage?.amount || 0).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <Label className="text-xs">Remarks (optional)</Label>
              <Textarea
                value={psResubmitDialog.remarks}
                onChange={(e) => setPsResubmitDialog((d) => ({ ...d, remarks: e.target.value }))}
                rows={2}
                placeholder="What was corrected?"
                className="mt-1 text-sm"
                data-testid="ps-resubmit-remarks"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPsResubmitDialog({ open: false, stage: null, mode: null, amount: '', remarks: '', submitting: false })}
              disabled={psResubmitDialog.submitting}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="ps-resubmit-submit"
              onClick={async () => {
                const stage = psResubmitDialog.stage;
                if (!stage) return;
                setPsResubmitDialog((d) => ({ ...d, submitting: true }));
                try {
                  const body = {};
                  const parsedAmt = parseFloat(psResubmitDialog.amount);
                  if (!isNaN(parsedAmt) && parsedAmt > 0) body.amount = parsedAmt;
                  if (psResubmitDialog.remarks) body.remarks = psResubmitDialog.remarks;
                  if (psResubmitDialog.mode === 'cre') {
                    await axios.post(`${API}/payment-stages/${stage.stage_id}/planning-resubmit`, body);
                  } else {
                    // Accountant-rejected — stage is already at workflow_status='requested'.
                    // Update amount if Planning corrected it. CRE re-collects via existing flow.
                    if (body.amount) {
                      await axios.patch(`${API}/payment-stages/${stage.stage_id}`, { amount: body.amount });
                    }
                  }
                  toast.success('Resubmitted. CRE has been notified.');
                  setPsResubmitDialog({ open: false, stage: null, mode: null, amount: '', remarks: '', submitting: false });
                  await fetchData(false);
                } catch (err) {
                  toast.error(err.response?.data?.detail || 'Resubmit failed');
                  setPsResubmitDialog((d) => ({ ...d, submitting: false }));
                }
              }}
              disabled={psResubmitDialog.submitting}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Resubmit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Location Setup Dialog */}
      <Dialog open={showLocationSetup} onOpenChange={setShowLocationSetup}>
        <DialogContent className="max-w-md" data-testid="location-setup-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-orange-600" /> Set Project GPS Location
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold">Paste Google Maps URL</Label>
              <Input
                value={locationUrl}
                onChange={e => setLocationUrl(e.target.value)}
                placeholder="https://www.google.com/maps/place/.../@13.08,80.27,17z"
                className="mt-1 text-xs"
                data-testid="gps-url-input"
              />
              <p className="text-[10px] text-gray-400 mt-1">Open Google Maps → Find the location → Copy the URL from address bar → Paste here</p>
            </div>
            {project.latitude && project.longitude && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs">
                <p className="font-semibold text-green-700">Current GPS</p>
                <p className="text-gray-600">{project.latitude?.toFixed(6)}, {project.longitude?.toFixed(6)}</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-2.5 text-[11px] text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">Supported URL formats:</p>
              <p>maps.google.com/?q=13.08,80.27</p>
              <p>google.com/maps/place/.../@13.08,80.27,17z</p>
              <p>google.com/maps/@13.08,80.27,15z</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocationSetup(false)}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={locationSaving || !locationUrl.trim()}
              data-testid="gps-save-btn"
              onClick={async () => {
                setLocationSaving(true);
                try {
                  const res = await axios.patch(`${API}/projects/${projectId}/set-location`, { google_maps_url: locationUrl });
                  toast.success(`Location set: ${res.data.latitude?.toFixed(4)}, ${res.data.longitude?.toFixed(4)}`);
                  setShowLocationSetup(false);
                  setLocationUrl('');
                  fetchData();
                } catch (e) {
                  toast.error(e.response?.data?.detail || 'Failed to set location');
                }
                setLocationSaving(false);
              }}
            >
              {locationSaving ? 'Saving...' : 'Save Location'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage Timeline Dialog — shows the full edit history for one Project Stage */}
      <Dialog open={!!timelineStage} onOpenChange={(o) => !o && setTimelineStage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="stage-timeline-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" /> Timeline — {timelineStage?.sl_no ? `${timelineStage.sl_no} · ` : ''}{timelineStage?.stage_name}
            </DialogTitle>
            <DialogDescription>Every edit to this stage, newest first.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const history = (timelineStage?.edit_history || []).slice().reverse();
              if (!history.length) {
                return (
                  <div className="text-xs text-gray-400 py-6 text-center bg-gray-50 rounded">
                    No edits recorded yet. This stage hasn&apos;t been modified since it was created.
                  </div>
                );
              }
              const fmt = (v) => {
                if (v === null || v === undefined || v === '') return <span className="text-gray-300 italic">empty</span>;
                if (typeof v === 'boolean') return v ? 'Yes' : 'No';
                return String(v);
              };
              return history.map((h, i) => (
                <div key={i} className="border-l-2 border-indigo-200 pl-3 py-2 bg-white rounded-r-md" data-testid={`timeline-entry-${i}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{h.by_name || h.by || 'Unknown user'}</span>
                    <span className="text-xs text-gray-500">{h.at ? new Date(h.at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}</span>
                  </div>
                  {h.changes && h.changes.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {h.changes.map((c, ci) => (
                        <li key={ci} className="text-xs flex gap-2 items-baseline">
                          <span className="font-medium text-gray-700 min-w-[110px]">{c.label || c.field}</span>
                          <span className="text-gray-400">{fmt(c.from)}</span>
                          <span className="text-indigo-500">→</span>
                          <span className="text-emerald-700 font-medium">{fmt(c.to)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">No field-level details captured.</p>
                  )}
                </div>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimelineStage(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Planning → PM → GM → Accountant: Labour Advance Request */}
      <Dialog open={labourAdvanceDialog.open} onOpenChange={(o) => !o && setLabourAdvanceDialog({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' })}>
        <DialogContent className="max-w-md" data-testid="labour-advance-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowRight className="h-5 w-5 text-emerald-600" /> Request Labour Advance</DialogTitle>
            <DialogDescription>
              {labourAdvanceDialog.stage?.name ? <>Stage: <b>{labourAdvanceDialog.stage.name}</b> • Contractor: <b>{labourAdvanceDialog.workOrder?.contractor_name || '—'}</b></> : 'Routes to PM → GM → Accountant.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Amount (₹) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                value={labourAdvanceDialog.amount}
                onChange={(e) => setLabourAdvanceDialog(d => ({ ...d, amount: e.target.value }))}
                placeholder="e.g. 25000"
                data-testid="labour-advance-amount"
              />
            </div>
            <div>
              <Label className="text-xs">Request Date</Label>
              <Input
                type="date"
                value={labourAdvanceDialog.date}
                onChange={(e) => setLabourAdvanceDialog(d => ({ ...d, date: e.target.value }))}
                data-testid="labour-advance-date"
              />
            </div>
            <div>
              <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
              <Textarea
                rows={3}
                value={labourAdvanceDialog.reason}
                onChange={(e) => setLabourAdvanceDialog(d => ({ ...d, reason: e.target.value }))}
                placeholder="Why is this advance needed?"
                data-testid="labour-advance-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabourAdvanceDialog({ open: false, stage: null, workOrder: null, amount: '', date: '', reason: '' })} disabled={labourAdvanceSaving}>Cancel</Button>
            <Button onClick={submitLabourAdvanceRequest} disabled={labourAdvanceSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="labour-advance-submit">
              {labourAdvanceSaving ? 'Submitting…' : (<><ArrowRight className="h-4 w-4 mr-1" /> Submit Request</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
